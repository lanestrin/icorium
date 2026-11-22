import { groupTextCells, type PlacedCell, type PlacedText } from './layout';
import { ConvertError } from './table';

// Reading text from images with Tesseract (tesseract.js), in a Web Worker so the page stays responsive.
// The worker script and the WebAssembly core are served from this site (Vite assets); only the English
// language data (~10 MB) is downloaded from Tesseract's default CDN, the first time, and cached by
// tesseract.js in the browser. Partner files never leave the browser.

/** What a reader reports while it works: getting OCR ready, reading an image, or which page it is reading. */
export type ReadProgress = { stage: 'preparing' } | { stage: 'reading' } | { stage: 'page'; page: number; pages: number };

export const OCR_DOWNLOAD_FAILED = "The text-reading data couldn't be downloaded. Check your connection and try again.";
/** Largest image read by OCR, in megapixels (a 300 DPI A4 scan is about 9). */
export const IMAGE_MAX_MEGAPIXELS = 50;
const NOT_AN_IMAGE = "It couldn't be read as an image.";

/** Where the read happened, for the "no text" message. */
const noText = (page?: number) => (page === undefined ? 'No text was found in the image.' : `No text was found on page ${page}.`);

/** Something Tesseract can read: an image file, or a canvas holding a rendered PDF page. */
export type OcrImage = Blob | HTMLCanvasElement;

/** One OCR worker for a conversion job. ready() and read() start it on first use; close() always ends it. */
export interface OcrReader {
  /** Resolves once the worker and its language data are loaded, so the caller can say what it reads next. */
  ready(): Promise<void>;
  /**
   * Rows of positioned cells found in the image, each with its lowest word confidence. page names the PDF page,
   * for messages; coordinates are divided by scale (a rendered PDF page's scale), so they are in PDF points.
   */
  read(image: OcrImage, page?: number, scale?: number): Promise<PlacedCell[][]>;
  close(): Promise<void>;
}

/**
 * The core build for this browser, as Tesseract itself would choose it (relaxed SIMD, SIMD or neither),
 * always the LSTM-only engine. Each build is a ~4 MB asset of this site; only the chosen one is downloaded.
 */
async function coreUrl() {
  const [{ relaxedSimd, simd }, relaxed, withSimd, plain] = await Promise.all([
    import('wasm-feature-detect'),
    import('tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url'),
    import('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'),
    import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
  ]);
  if (await relaxedSimd()) return relaxed.default;
  if (await simd()) return withSimd.default;
  return plain.default;
}

/** An asset URL as an absolute URL, which the worker needs to load it. */
const absolute = (url: string) => new URL(url, document.baseURI).href;

/**
 * Waits for work, or rejects with the signal's reason as soon as the job is cancelled. tesseract.js 7 never
 * settles a job its worker was terminated in the middle of, so every OCR wait goes through this: Cancel
 * then settles the read at once and the callers' clean-up runs.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * Records the Web Workers created until stop() is called, by wrapping the browser's Worker constructor for
 * that time only. stop() puts the original back.
 */
function spawnedWorkers() {
  const workers: Worker[] = [];
  const Original = globalThis.Worker;
  if (typeof Original !== 'function') return { workers, stop: () => {} }; // no Web Workers here (tests)
  globalThis.Worker = class extends Original {
    constructor(...args: ConstructorParameters<typeof Worker>) {
      super(...args);
      workers.push(this);
    }
  };
  return { workers, stop: () => { globalThis.Worker = Original; } };
}

/**
 * Starts an OCR reader for one conversion job. Tesseract is imported when the first image is read.
 * Aborting the signal settles any wait at once and terminates the worker, including one that finishes
 * starting afterwards; onPreparing is called while the worker and the language data load.
 */
export function createOcrReader(signal: AbortSignal, onPreparing?: () => void): OcrReader {
  let worker: Promise<import('tesseract.js').Worker> | undefined;
  const terminate = (started = worker) => { void started?.then((w) => w.terminate()).catch(() => {}); };
  const stop = () => terminate();
  signal.addEventListener('abort', stop);

  async function start() {
    onPreparing?.();
    const [Tesseract, { default: workerPath }, corePath] = await Promise.all([
      import('tesseract.js'),
      import('tesseract.js/dist/worker.min.js?url'),
      coreUrl(),
    ]);
    signal.throwIfAborted();

    // tesseract.js 7 never settles createWorker when the language data fails to load: it only calls
    // errorHandler. So that call fails the start, raced with createWorker.
    let loadFailed!: (error: unknown) => void;
    const failure = new Promise<never>((_, reject) => { loadFailed = reject; });
    failure.catch(() => {}); // later errorHandler calls (a failed recognize) are handled by their own job
    // It also hands back its Web Worker only once loading succeeds. It creates that worker synchronously
    // inside createWorker, so keep a handle on it here, to end it if loading fails or is cancelled.
    const spawned = spawnedWorkers();
    let creating: Promise<import('tesseract.js').Worker>;
    try {
      creating = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
        workerPath: absolute(workerPath),
        corePath: absolute(corePath),
        workerBlobURL: false,
        errorHandler: (error: unknown) => loadFailed(error),
      });
    } finally {
      spawned.stop();
    }
    try {
      return await untilAborted(Promise.race([creating, failure]), signal);
    } catch (error) {
      for (const w of spawned.workers) w.terminate();
      void creating.then((w) => w.terminate()).catch(() => {}); // in case it still arrives
      signal.throwIfAborted();
      throw new ConvertError(OCR_DOWNLOAD_FAILED, { cause: error });
    }
  }

  /** The started worker; a wait for it ends at once on Cancel, and the stop handler ends the worker itself. */
  function started() {
    worker ??= start();
    return untilAborted(worker, signal);
  }

  return {
    async ready() {
      await started();
    },
    async read(image, page, scale = 1) {
      const ocr = await started();
      let result: Awaited<ReturnType<typeof ocr.recognize>>;
      try {
        result = await untilAborted(ocr.recognize(image, {}, { blocks: true }), signal);
      } catch (error) {
        signal.throwIfAborted();
        throw new ConvertError(page === undefined ? NOT_AN_IMAGE : `Page ${page} couldn't be read.`, { cause: error });
      }
      const words: PlacedText[] = [];
      for (const block of result.data.blocks ?? [])
        for (const paragraph of block.paragraphs)
          for (const line of paragraph.lines)
            for (const word of line.words) {
              const { x0, y0, x1, y1 } = word.bbox;
              // Image y points down; PlacedText's y points up, with the word's bottom as its baseline.
              words.push({ text: word.text, x: x0 / scale, y: -y1 / scale, width: (x1 - x0) / scale, height: (y1 - y0) / scale, confidence: word.confidence });
            }
      const rows = groupTextCells(words);
      if (rows.length === 0) throw new ConvertError(noText(page));
      return rows;
    },
    async close() {
      signal.removeEventListener('abort', stop);
      const last = worker;
      worker = undefined;
      terminate(last);
    },
  };
}

/**
 * The image's size in pixels from its header, without decoding it into memory: the browser loads an image
 * element's dimensions before it decodes the pixels. A file that isn't a readable image is refused.
 */
async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ConvertError(NOT_AN_IMAGE));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new ConvertError(NOT_AN_IMAGE);
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Releases a canvas's pixels straight away, rather than when it is garbage collected. */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Reads a .png or .jpg image of a table into rows of positioned cells with OCR. An image over IMAGE_MAX_MEGAPIXELS
 * is refused before it is decoded; otherwise the file itself goes to Tesseract, which decodes it in its
 * worker. onProgress hears "preparing" while OCR loads, then "reading". The worker is ended when the read
 * ends, however it ends.
 */
export async function readImage(file: File, signal: AbortSignal, onProgress?: (progress: ReadProgress) => void): Promise<PlacedCell[][]> {
  const { width, height } = await imageSize(file);
  if (width * height > IMAGE_MAX_MEGAPIXELS * 1_000_000) {
    const n = (x: number) => x.toLocaleString('en-US');
    throw new ConvertError(`It is ${n(width)} × ${n(height)} pixels; the image limit is ${IMAGE_MAX_MEGAPIXELS} megapixels.`);
  }
  signal.throwIfAborted();
  const ocr = createOcrReader(signal, () => onProgress?.({ stage: 'preparing' }));
  try {
    await ocr.ready();
    onProgress?.({ stage: 'reading' });
    return await ocr.read(file);
  } finally {
    await ocr.close();
  }
}

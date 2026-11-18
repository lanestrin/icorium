import { groupTextItems, type PlacedText } from './layout';
import { ConvertError } from './table';

// Reading text from images with Tesseract (tesseract.js), in a Web Worker so the page stays responsive.
// The worker script and the WebAssembly core are served from this site (Vite assets); only the English
// language data (~10 MB) is downloaded from Tesseract's default CDN, the first time, and cached by
// tesseract.js in the browser. Partner files never leave the browser.

/** What a reader reports while it works: getting OCR ready, or which page it is reading. */
export type ReadProgress = { stage: 'preparing' } | { stage: 'page'; page: number; pages: number };

export const OCR_DOWNLOAD_FAILED = "The text-reading data couldn't be downloaded. Check your connection and try again.";

/** Where the read happened, for the "no text" message. */
const noText = (page?: number) => (page === undefined ? 'No text was found in the image.' : `No text was found on page ${page}.`);

/** Something Tesseract can read: a canvas holding the decoded image or rendered page. */
export type OcrImage = HTMLCanvasElement;

/** One OCR worker for a conversion job. read() starts it on first use; close() always ends it. */
export interface OcrReader {
  /** Rows of cell text found in the image. page names the PDF page, for messages. */
  read(image: OcrImage, page?: number): Promise<string[][]>;
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
 * Starts an OCR reader for one conversion job. Tesseract is imported when the first image is read.
 * Aborting the signal terminates the worker, so a read in progress stops; onPreparing is called while
 * the worker and the language data load.
 */
export function createOcrReader(signal: AbortSignal, onPreparing?: () => void): OcrReader {
  let worker: Promise<import('tesseract.js').Worker> | undefined;
  const stop = () => { void worker?.then((w) => w.terminate()).catch(() => {}); };
  signal.addEventListener('abort', stop);

  async function start() {
    onPreparing?.();
    const [Tesseract, { default: workerPath }, corePath] = await Promise.all([
      import('tesseract.js'),
      import('tesseract.js/dist/worker.min.js?url'),
      coreUrl(),
    ]);
    signal.throwIfAborted();
    try {
      return await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
        workerPath: absolute(workerPath),
        corePath: absolute(corePath),
        workerBlobURL: false,
      });
    } catch (error) {
      signal.throwIfAborted();
      throw new ConvertError(OCR_DOWNLOAD_FAILED, { cause: error });
    }
  }

  return {
    async read(image, page) {
      signal.throwIfAborted();
      worker ??= start();
      const ocr = await worker;
      signal.throwIfAborted();
      let result: Awaited<ReturnType<typeof ocr.recognize>>;
      try {
        result = await ocr.recognize(image, {}, { blocks: true });
      } catch (error) {
        signal.throwIfAborted();
        throw new ConvertError(page === undefined ? "The image couldn't be read." : `Page ${page} couldn't be read.`, { cause: error });
      }
      signal.throwIfAborted();
      const words: PlacedText[] = [];
      for (const block of result.data.blocks ?? [])
        for (const paragraph of block.paragraphs)
          for (const line of paragraph.lines)
            for (const word of line.words) {
              const { x0, y0, x1, y1 } = word.bbox;
              // Image y points down; PlacedText's y points up, with the word's bottom as its baseline.
              words.push({ text: word.text, x: x0, y: -y1, width: x1 - x0, height: y1 - y0 });
            }
      const rows = groupTextItems(words);
      if (rows.length === 0) throw new ConvertError(noText(page));
      return rows;
    },
    async close() {
      signal.removeEventListener('abort', stop);
      const started = worker;
      worker = undefined;
      await started?.then((w) => w.terminate()).catch(() => {});
    },
  };
}

/** Decodes an image file into a canvas Tesseract can read; a file that isn't an image is refused. */
async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new ConvertError("It couldn't be read as an image.", { cause: error });
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/** Releases a canvas's pixels straight away, rather than when it is garbage collected. */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Reads a .png or .jpg image of a table into rows of cell text with OCR. The worker is ended when the
 * read ends, however it ends.
 */
export async function readImage(file: File, signal: AbortSignal, onProgress?: (progress: ReadProgress) => void): Promise<string[][]> {
  const canvas = await imageCanvas(file);
  const ocr = createOcrReader(signal, () => onProgress?.({ stage: 'preparing' }));
  try {
    signal.throwIfAborted();
    return await ocr.read(canvas);
  } finally {
    releaseCanvas(canvas);
    await ocr.close();
  }
}

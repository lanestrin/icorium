import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOcrReader, IMAGE_MAX_MEGAPIXELS, OCR_DOWNLOAD_FAILED, readImage, type ReadProgress } from './ocr';
import { ConvertError } from './table';

// Real OCR needs WebAssembly, which jsdom lacks, so tesseract.js is mocked to behave as version 7 does:
// createWorker can be held back (the language data loading), and a recognize job its worker was terminated
// in the middle of never settles. These tests check what the reader does with Tesseract's words, where it
// loads Tesseract from, what it reports, and that Cancel always settles the read and ends the worker.
const tesseract = vi.hoisted(() => ({ OEM: { LSTM_ONLY: 1 }, createWorker: vi.fn() }));
const features = vi.hoisted(() => ({ relaxedSimd: vi.fn(), simd: vi.fn() }));
vi.mock('tesseract.js', () => tesseract);
vi.mock('wasm-feature-detect', () => features);
vi.mock('tesseract.js/dist/worker.min.js?url', () => ({ default: '/assets/worker.min.js' }));
vi.mock('tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url', () => ({ default: '/assets/core-relaxedsimd-lstm.wasm.js' }));
vi.mock('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url', () => ({ default: '/assets/core-simd-lstm.wasm.js' }));
vi.mock('tesseract.js-core/tesseract-core-lstm.wasm.js?url', () => ({ default: '/assets/core-lstm.wasm.js' }));

/** A recognized word at a box in image pixels (y down). */
const word = (text: string, x0: number, y0: number, x1 = x0 + 40, y1 = y0 + 12, confidence = 95) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
/** The text of each cell, row by row. */
const texts = (rows: { text: string }[][]) => rows.map((row) => row.map((cell) => cell.text));
/** Tesseract's blocks output holding these lines of words. */
const blocks = (...lines: ReturnType<typeof word>[][]) => ({ data: { blocks: [{ paragraphs: [{ lines: lines.map((words) => ({ words })) }] }] } });
/** A promise that never settles, as tesseract.js 7 leaves a job whose worker was terminated. */
const never = () => new Promise<never>(() => {});

let worker: { recognize: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };
const canvas = () => document.createElement('canvas');

beforeEach(() => {
  vi.resetAllMocks();
  worker = { recognize: vi.fn(), terminate: vi.fn().mockResolvedValue(undefined) };
  tesseract.createWorker.mockResolvedValue(worker);
  features.relaxedSimd.mockResolvedValue(false);
  features.simd.mockResolvedValue(true);
});

describe('createOcrReader', () => {
  it('groups the words into rows and cells, top to bottom and left to right', async () => {
    worker.recognize.mockResolvedValue(blocks(
      [word('batch_id', 10, 10), word('feed_mass_kg', 200, 11)],
      [word('A-1', 10, 40), word('100', 200, 41)],
    ));
    const ocr = createOcrReader(new AbortController().signal);
    expect(texts(await ocr.read(canvas()))).toEqual([['batch_id', 'feed_mass_kg'], ['A-1', '100']]);
    expect(worker.recognize).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), {}, { blocks: true });
    await ocr.close();
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1));
  });

  it("keeps each cell's edges and lowest word confidence, divided by the scale it was rendered at", async () => {
    worker.recognize.mockResolvedValue(blocks([word('Mass', 100, 200, 140, 224, 91), word('kg', 145, 200, 165, 224, 62)], [word('12.5', 100, 260, 160, 284, 88)]));
    const ocr = createOcrReader(new AbortController().signal);
    const rows = await ocr.read(canvas(), 1, 2);
    expect(rows).toEqual([
      [{ text: 'Mass kg', x: 50, right: 82.5, confidence: 62 }],
      [{ text: '12.5', x: 50, right: 80, confidence: 88 }],
    ]);
    await ocr.close();
  });

  it('loads the worker and the core from this site, picking the core build this browser supports', async () => {
    worker.recognize.mockResolvedValue(blocks([word('x', 0, 0)]));
    const ocr = createOcrReader(new AbortController().signal);
    await ocr.read(canvas());
    await ocr.close();
    const [lang, oem, options] = tesseract.createWorker.mock.calls[0];
    expect([lang, oem]).toEqual(['eng', tesseract.OEM.LSTM_ONLY]);
    expect(options).toEqual({
      workerPath: `${location.origin}/assets/worker.min.js`, corePath: `${location.origin}/assets/core-simd-lstm.wasm.js`, workerBlobURL: false,
      errorHandler: expect.any(Function),
    });
    expect(JSON.stringify(options)).not.toMatch(/jsdelivr|unpkg|cdn/);
  });

  it.each([
    [true, true, 'core-relaxedsimd-lstm'],
    [false, true, 'core-simd-lstm'],
    [false, false, 'core-lstm'],
  ])('uses the %s relaxed-SIMD / %s SIMD build %s', async (relaxed, simd, build) => {
    features.relaxedSimd.mockResolvedValue(relaxed);
    features.simd.mockResolvedValue(simd);
    worker.recognize.mockResolvedValue(blocks([word('x', 0, 0)]));
    const ocr = createOcrReader(new AbortController().signal);
    await ocr.read(canvas());
    await ocr.close();
    expect(tesseract.createWorker.mock.calls[0][2].corePath).toBe(`${location.origin}/assets/${build}.wasm.js`);
  });

  it('starts one worker for several pages, says when it is getting ready, and ready() waits for it', async () => {
    let loaded!: (value: typeof worker) => void;
    tesseract.createWorker.mockReturnValue(new Promise((resolve) => { loaded = resolve; }));
    worker.recognize.mockResolvedValue(blocks([word('x', 0, 0)]));
    const preparing = vi.fn();
    const ocr = createOcrReader(new AbortController().signal, preparing);
    let isReady = false;
    const ready = ocr.ready().then(() => { isReady = true; });
    await vi.waitFor(() => expect(tesseract.createWorker).toHaveBeenCalled());
    expect(preparing).toHaveBeenCalledTimes(1);
    expect(isReady).toBe(false); // still loading the language data
    loaded(worker);
    await ready;
    await ocr.read(canvas(), 1);
    await ocr.read(canvas(), 2);
    await ocr.close();
    expect(tesseract.createWorker).toHaveBeenCalledTimes(1);
    expect(preparing).toHaveBeenCalledTimes(1);
  });

  it('says when no text was found, naming the page', async () => {
    worker.recognize.mockResolvedValue({ data: { blocks: [] } });
    const ocr = createOcrReader(new AbortController().signal);
    await expect(ocr.read(canvas(), 3)).rejects.toThrow(new ConvertError('No text was found on page 3.'));
    await expect(ocr.read(canvas())).rejects.toThrow(new ConvertError('No text was found in the image.'));
    await ocr.close();
  });

  describe('when loading fails, as tesseract.js 7 does it', () => {
    /** The Web Workers created, as the browser's Worker would make them. */
    let spawned: { url: string; terminate: ReturnType<typeof vi.fn> }[];
    beforeEach(() => {
      spawned = [];
      vi.stubGlobal('Worker', class {
        terminate = vi.fn();
        constructor(public url: string) { spawned.push(this); }
      });
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    /**
     * createWorker as tesseract.js 7 runs it: it creates its Web Worker straight away; when the language data
     * fails to load it only calls errorHandler, and its promise never settles.
     */
    const languageDataFails = () => tesseract.createWorker.mockImplementation((_lang, _oem, options: { workerPath: string; errorHandler: (e: unknown) => void }) => {
      new Worker(options.workerPath);
      queueMicrotask(() => options.errorHandler('Network error while fetching eng.traineddata'));
      return never();
    });

    it('says the language data could not be downloaded, and ends the Web Worker tesseract.js started', async () => {
      languageDataFails();
      const browserWorker = globalThis.Worker; // the constructor before OCR starts
      const ocr = createOcrReader(new AbortController().signal);
      await expect(ocr.ready()).rejects.toThrow(new ConvertError(OCR_DOWNLOAD_FAILED));
      expect(OCR_DOWNLOAD_FAILED).toBe("The text-reading data couldn't be downloaded. Check your connection and try again.");
      expect(spawned).toHaveLength(1);
      expect(spawned[0].url).toBe(`${location.origin}/assets/worker.min.js`);
      expect(spawned[0].terminate).toHaveBeenCalledTimes(1);
      expect(globalThis.Worker).toBe(browserWorker); // exactly the browser's Worker is put back after the start
      await ocr.close();
    });

    it('ends the Web Worker when cancelled while the language data loads', async () => {
      tesseract.createWorker.mockImplementation((_lang, _oem, options: { workerPath: string }) => {
        new Worker(options.workerPath);
        return never();
      });
      const job = new AbortController();
      const ocr = createOcrReader(job.signal);
      const ready = ocr.ready();
      await vi.waitFor(() => expect(spawned).toHaveLength(1));
      job.abort();
      await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => expect(spawned[0].terminate).toHaveBeenCalledTimes(1));
      await ocr.close();
    });

    it('says the same when the core itself fails to load (createWorker rejects)', async () => {
      tesseract.createWorker.mockRejectedValue('Failed to load TesseractCore');
      const ocr = createOcrReader(new AbortController().signal);
      await expect(ocr.ready()).rejects.toThrow(new ConvertError(OCR_DOWNLOAD_FAILED));
      await ocr.close();
    });

    it('ignores errorHandler calls after a successful start (a failed recognize has its own error)', async () => {
      let errorHandler!: (e: unknown) => void;
      tesseract.createWorker.mockImplementation(async (_lang, _oem, options: { errorHandler: (e: unknown) => void }) => {
        errorHandler = options.errorHandler;
        return worker;
      });
      worker.recognize.mockRejectedValue('bad image');
      const ocr = createOcrReader(new AbortController().signal);
      await ocr.ready();
      errorHandler('bad image'); // tesseract.js reports the failed job here too
      await expect(ocr.read(canvas(), 1)).rejects.toThrow(new ConvertError("Page 1 couldn't be read."));
      expect(worker.terminate).not.toHaveBeenCalled();
      await ocr.close();
    });
  });

  it('settles at once when the job is cancelled during recognition, which tesseract.js never settles itself', async () => {
    worker.recognize.mockImplementation(never);
    const job = new AbortController();
    const ocr = createOcrReader(job.signal);
    const reading = ocr.read(canvas());
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalled());
    job.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalled());
    await ocr.close();
  });

  it('settles at once when cancelled while the worker loads, and ends that worker when it arrives', async () => {
    let loaded!: (value: typeof worker) => void;
    tesseract.createWorker.mockReturnValue(new Promise((resolve) => { loaded = resolve; }));
    const job = new AbortController();
    const ocr = createOcrReader(job.signal);
    const ready = ocr.ready();
    await vi.waitFor(() => expect(tesseract.createWorker).toHaveBeenCalled());
    job.abort();
    await expect(ready).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).not.toHaveBeenCalled();
    loaded(worker); // the language data finishes after Cancel
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1));
    await ocr.close();
  });
});

describe('readImage', () => {
  /** Stands in for the browser's image loading: an image element with these dimensions, or one that fails. */
  function images(size: { width: number; height: number } | 'broken') {
    vi.stubGlobal('Image', class {
      naturalWidth = size === 'broken' ? 0 : size.width;
      naturalHeight = size === 'broken' ? 0 : size.height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) { queueMicrotask(() => (size === 'broken' ? this.onerror?.() : this.onload?.())); }
    });
  }
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:image'), revokeObjectURL: vi.fn() });
    images({ width: 2480, height: 3508 });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  const png = () => new File(['png bytes'], 'scan.png', { type: 'image/png' });

  it('reads the image file itself with OCR, reporting "preparing" then "reading", and ends the worker', async () => {
    let loaded!: (value: typeof worker) => void;
    tesseract.createWorker.mockReturnValue(new Promise((resolve) => { loaded = resolve; }));
    worker.recognize.mockResolvedValue(blocks([word('lot_number', 0, 0)], [word('B-001', 0, 30)]));
    const progress: ReadProgress[] = [];
    const file = png();
    const reading = readImage(file, new AbortController().signal, (p) => progress.push(p));
    await vi.waitFor(() => expect(tesseract.createWorker).toHaveBeenCalled());
    expect(progress).toEqual([{ stage: 'preparing' }]); // only "getting ready" while the worker loads
    loaded(worker);
    expect(texts(await reading)).toEqual([['lot_number'], ['B-001']]);
    expect(progress).toEqual([{ stage: 'preparing' }, { stage: 'reading' }]);
    expect(worker.recognize.mock.calls[0][0]).toBe(file); // no full-size canvas: Tesseract decodes the file
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image');
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1));
  });

  it('refuses an image over the megapixel limit before reading it', async () => {
    images({ width: 10_000, height: 6_000 });
    await expect(readImage(png(), new AbortController().signal)).rejects.toThrow(new ConvertError(`It is 10,000 × 6,000 pixels; the image limit is ${IMAGE_MAX_MEGAPIXELS} megapixels.`));
    expect(IMAGE_MAX_MEGAPIXELS).toBe(50);
    expect(tesseract.createWorker).not.toHaveBeenCalled();
  });

  it('refuses a file the browser cannot load as an image, without starting OCR', async () => {
    images('broken');
    await expect(readImage(png(), new AbortController().signal)).rejects.toThrow(new ConvertError("It couldn't be read as an image."));
    expect(tesseract.createWorker).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image');
  });

  it('says the image could not be read when Tesseract fails on it, and ends the worker', async () => {
    worker.recognize.mockRejectedValue(new Error('Error attempting to read image.'));
    await expect(readImage(png(), new AbortController().signal)).rejects.toThrow(new ConvertError("It couldn't be read as an image."));
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalledTimes(1));
  });

  it('settles and ends the worker when cancelled during recognition', async () => {
    worker.recognize.mockImplementation(never);
    const job = new AbortController();
    const reading = readImage(png(), job.signal);
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalled());
    job.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalled());
  });
});

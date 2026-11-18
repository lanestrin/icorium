import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOcrReader, OCR_DOWNLOAD_FAILED, readImage } from './ocr';
import { ConvertError } from './table';

// Real OCR needs WebAssembly and a canvas, which jsdom lacks, so tesseract.js is mocked: these tests check
// what the reader does with Tesseract's words, where it loads Tesseract from, and that it always ends it.
const tesseract = vi.hoisted(() => ({ OEM: { LSTM_ONLY: 1 }, createWorker: vi.fn() }));
const features = vi.hoisted(() => ({ relaxedSimd: vi.fn(), simd: vi.fn() }));
vi.mock('tesseract.js', () => tesseract);
vi.mock('wasm-feature-detect', () => features);
vi.mock('tesseract.js/dist/worker.min.js?url', () => ({ default: '/assets/worker.min.js' }));
vi.mock('tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js?url', () => ({ default: '/assets/core-relaxedsimd-lstm.wasm.js' }));
vi.mock('tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url', () => ({ default: '/assets/core-simd-lstm.wasm.js' }));
vi.mock('tesseract.js-core/tesseract-core-lstm.wasm.js?url', () => ({ default: '/assets/core-lstm.wasm.js' }));

/** A recognized word at a box in image pixels (y down). */
const word = (text: string, x0: number, y0: number, x1 = x0 + 40, y1 = y0 + 12) => ({ text, bbox: { x0, y0, x1, y1 } });
/** Tesseract's blocks output holding these lines of words. */
const blocks = (...lines: ReturnType<typeof word>[][]) => ({ data: { blocks: [{ paragraphs: [{ lines: lines.map((words) => ({ words })) }] }] } });

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
    expect(await ocr.read(canvas())).toEqual([['batch_id', 'feed_mass_kg'], ['A-1', '100']]);
    expect(worker.recognize).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), {}, { blocks: true });
    await ocr.close();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('loads the worker and the core from this site, picking the core build this browser supports', async () => {
    worker.recognize.mockResolvedValue(blocks([word('x', 0, 0)]));
    const ocr = createOcrReader(new AbortController().signal);
    await ocr.read(canvas());
    await ocr.close();
    const [lang, oem, options] = tesseract.createWorker.mock.calls[0];
    expect([lang, oem]).toEqual(['eng', tesseract.OEM.LSTM_ONLY]);
    expect(options).toEqual({ workerPath: `${location.origin}/assets/worker.min.js`, corePath: `${location.origin}/assets/core-simd-lstm.wasm.js`, workerBlobURL: false });
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

  it('starts one worker for several pages, and says when it is getting ready', async () => {
    worker.recognize.mockResolvedValue(blocks([word('x', 0, 0)]));
    const preparing = vi.fn();
    const ocr = createOcrReader(new AbortController().signal, preparing);
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

  it('says when the language data could not be downloaded', async () => {
    tesseract.createWorker.mockRejectedValue(new Error('network error'));
    const ocr = createOcrReader(new AbortController().signal);
    await expect(ocr.read(canvas())).rejects.toThrow(new ConvertError(OCR_DOWNLOAD_FAILED));
    expect(OCR_DOWNLOAD_FAILED).toBe("The text-reading data couldn't be downloaded. Check your connection and try again.");
    await ocr.close();
  });

  it('terminates the worker when the job is cancelled, and the read stops', async () => {
    let finish!: (value: unknown) => void;
    worker.recognize.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const job = new AbortController();
    const ocr = createOcrReader(job.signal);
    const reading = ocr.read(canvas());
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalled());
    job.abort();
    await vi.waitFor(() => expect(worker.terminate).toHaveBeenCalled());
    finish(blocks([word('late', 0, 0)])); // a result that arrives after Cancel is not returned
    await expect(reading).rejects.toThrow(/abort/i);
    await ocr.close();
  });
});

describe('readImage', () => {
  const drawImage = vi.fn();
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const png = () => new File(['png bytes'], 'scan.png', { type: 'image/png' });

  it('reads the image with OCR, reporting that it is getting ready, and ends the worker', async () => {
    worker.recognize.mockResolvedValue(blocks([word('lot_number', 0, 0)], [word('B-001', 0, 30)]));
    const progress = vi.fn();
    expect(await readImage(png(), new AbortController().signal, progress)).toEqual([['lot_number'], ['B-001']]);
    expect(progress).toHaveBeenCalledWith({ stage: 'preparing' });
    const drawn = worker.recognize.mock.calls[0][0] as HTMLCanvasElement;
    expect(drawImage).toHaveBeenCalled();
    expect([drawn.width, drawn.height]).toEqual([0, 0]); // the canvas is released after the read
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('ends the worker when the read fails', async () => {
    worker.recognize.mockRejectedValue(new Error('bad image data'));
    await expect(readImage(png(), new AbortController().signal)).rejects.toThrow(new ConvertError("The image couldn't be read."));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not an image, without starting OCR', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new DOMException('decode failed', 'InvalidStateError'));
    await expect(readImage(png(), new AbortController().signal)).rejects.toThrow(new ConvertError("It couldn't be read as an image."));
    expect(tesseract.createWorker).not.toHaveBeenCalled();
  });
});

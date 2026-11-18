import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOcrReader } from './ocr';
import type { PlacedText } from './layout';
import { OCR_RENDER_SCALE, PDF_MAX_PAGES, readPdf } from './pdf';
import { ConvertError } from './table';

// Real PDF reading can't run in jsdom, so pdf.js is replaced by a fake that serves pages of text items.
const pdfjs = vi.hoisted(() => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => pdfjs);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.min.mjs' }));
// OCR is tested on its own (ocr.test.ts); here a fake reader stands in for Tesseract.
vi.mock('./ocr', async (original) => ({ ...(await original<typeof import('./ocr')>()), createOcrReader: vi.fn() }));

/** A text item at (x, y), 10 units high, as wide as its text at 5 units a character. */
const at = (text: string, x: number, y: number, height = 10): PlacedText => ({ text, x, y, width: text.length * 5, height });

/** A fake loaded document whose pages hold these text items, and the task getDocument returns for it. */
function fakePdf(pages: PlacedText[][], numPages = pages.length) {
  const destroy = vi.fn(() => Promise.resolve());
  const cleanup = vi.fn();
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const getPage = vi.fn(async (n: number) => ({
    getTextContent: async () => ({
      items: [{ type: 'beginMarkedContent' }, ...pages[n - 1].map((i) => ({ str: i.text, transform: [1, 0, 0, 1, i.x, i.y], width: i.width, height: i.height }))],
    }),
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render,
    cleanup,
  }));
  const task = { promise: Promise.resolve({ numPages, getPage }), destroy };
  pdfjs.getDocument.mockReturnValue(task);
  return { task, getPage, destroy, cleanup, render };
}

const file = () => new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });

/**
 * A fake OCR reader for scanned pages: read() answers with these rows (or a pending promise). Like the real
 * one, ready() calls the "getting ready" callback the first time, and resolves when ready (now, or when the
 * test calls loaded()).
 */
function fakeOcr(read: (canvas: HTMLCanvasElement | Blob, page?: number) => Promise<string[][]>, { held = false } = {}) {
  let loaded!: () => void;
  const loading = held ? new Promise<void>((resolve) => { loaded = resolve; }) : Promise.resolve();
  let started = false;
  const ocr = {
    ready: vi.fn(async () => {
      if (!started) { started = true; vi.mocked(createOcrReader).mock.calls.at(-1)![1]?.(); }
      await loading;
    }),
    read: vi.fn(read),
    close: vi.fn(() => Promise.resolve()),
  };
  vi.mocked(createOcrReader).mockReturnValue(ocr);
  return { ...ocr, loaded: () => loaded() };
}

describe('readPdf', () => {
  beforeEach(() => { pdfjs.getDocument.mockReset(); vi.mocked(createOcrReader).mockReset(); });

  it('reads every page in order, so a table continues across pages, and releases the document', async () => {
    const { destroy, cleanup } = fakePdf([[at('batch_id', 0, 700), at('X-1', 0, 680)], [at('X-2', 0, 700)]]);
    const progress = vi.fn();
    expect(await readPdf(file(), undefined, progress)).toEqual({ rows: [['batch_id'], ['X-1'], ['X-2']], ocrPages: [] });
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/pdf.worker.min.mjs');
    expect(progress.mock.calls.map(([p]) => p)).toEqual([{ stage: 'page', page: 1, pages: 2 }, { stage: 'page', page: 2, pages: 2 }]);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(createOcrReader).not.toHaveBeenCalled(); // text pages never start OCR
    expect(destroy).toHaveBeenCalled();
  });

  it('reads a scanned page with OCR at 300 DPI, keeping page order, and releases the canvas and the worker', async () => {
    const { destroy, cleanup, render } = fakePdf([[at('batch_id', 0, 700), at('X-1', 0, 680)], [at(' ', 0, 700)], [at('X-3', 0, 700)]]);
    const ocr = fakeOcr(async () => [['X-2']]);
    const progress = vi.fn();
    expect(await readPdf(file(), undefined, progress)).toEqual({ rows: [['batch_id'], ['X-1'], ['X-2'], ['X-3']], ocrPages: [2] });
    expect(ocr.read).toHaveBeenCalledTimes(1);
    const [canvas, page] = ocr.read.mock.calls[0] as [HTMLCanvasElement, number];
    expect(page).toBe(2);
    expect(render).toHaveBeenCalledWith({ canvas, viewport: { width: 612 * OCR_RENDER_SCALE, height: 792 * OCR_RENDER_SCALE } });
    expect(OCR_RENDER_SCALE).toBeCloseTo(300 / 72);
    expect([canvas.width, canvas.height]).toEqual([0, 0]); // released after the read
    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(ocr.close).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalled();
  });

  it('reports the scanned page only once OCR is ready, so the status never stays on "getting ready" while it reads', async () => {
    fakePdf([[at('batch_id', 0, 700)], [at(' ', 0, 700)]]);
    const ocr = fakeOcr(async () => [['X-2']], { held: true });
    const progress: unknown[] = [];
    const reading = readPdf(file(), undefined, (p) => progress.push(p));
    await vi.waitFor(() => expect(ocr.ready).toHaveBeenCalled());
    expect(progress).toEqual([{ stage: 'page', page: 1, pages: 2 }, { stage: 'page', page: 2, pages: 2 }, { stage: 'preparing' }]);
    expect(ocr.read).not.toHaveBeenCalled(); // nothing is read while OCR loads
    ocr.loaded();
    await reading;
    expect(progress.at(-1)).toEqual({ stage: 'page', page: 2, pages: 2 }); // back to the page once ready
    expect(progress).toHaveLength(4);
  });

  it('passes on an OCR failure, still releasing the worker and the document', async () => {
    const { destroy } = fakePdf([[at(' ', 0, 700)]]);
    const ocr = fakeOcr(async () => { throw new ConvertError('No text was found on page 1.'); });
    await expect(readPdf(file())).rejects.toThrow(new ConvertError('No text was found on page 1.'));
    expect(ocr.close).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalled();
  });

  it('stops reading when the signal is aborted during OCR, releasing everything', async () => {
    const { destroy } = fakePdf([[at(' ', 0, 700)], [at('never read', 0, 700)]]);
    const controller = new AbortController();
    const ocr = fakeOcr(() => new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason))));
    const reading = readPdf(file(), controller.signal);
    await vi.waitFor(() => expect(ocr.read).toHaveBeenCalled());
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(ocr.close).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalled();
    expect(ocr.read).toHaveBeenCalledTimes(1);
  });

  it('refuses a PDF over the page limit before reading any page', async () => {
    const { getPage, destroy } = fakePdf([], PDF_MAX_PAGES + 14);
    await expect(readPdf(file())).rejects.toThrow(new ConvertError('It has 34 pages; the PDF limit is 20 pages.'));
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('says a file pdf.js cannot open could not be read as a PDF', async () => {
    const destroy = vi.fn(() => Promise.resolve());
    pdfjs.getDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF structure.')), destroy });
    await expect(readPdf(file())).rejects.toThrow(new ConvertError("It couldn't be read as a PDF file."));
    expect(destroy).toHaveBeenCalled();
  });

  it('stops and releases the document when the signal is aborted while loading', async () => {
    let fail!: (error: Error) => void;
    const destroy = vi.fn(() => { fail(new Error('Worker was destroyed')); return Promise.resolve(); });
    pdfjs.getDocument.mockReturnValue({ promise: new Promise((_, reject) => { fail = reject; }), destroy });
    const controller = new AbortController();
    const reading = readPdf(file(), controller.signal);
    await vi.waitFor(() => expect(pdfjs.getDocument).toHaveBeenCalled());
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(destroy).toHaveBeenCalled();
  });

  it('does not open the document when the signal is already aborted', async () => {
    fakePdf([[at('a', 0, 700)]]);
    const controller = new AbortController();
    controller.abort();
    await expect(readPdf(file(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });
});

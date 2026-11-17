import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupTextItems, PDF_MAX_PAGES, readPdf, type PlacedText } from './pdf';
import { ConvertError } from './table';

// Real PDF reading can't run in jsdom, so pdf.js is replaced by a fake that serves pages of text items.
const pdfjs = vi.hoisted(() => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => pdfjs);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.min.mjs' }));

/** A text item at (x, y), 10 units high, as wide as its text at 5 units a character. */
const at = (text: string, x: number, y: number, height = 10): PlacedText => ({ text, x, y, width: text.length * 5, height });

describe('groupTextItems', () => {
  it('groups items into rows by y, top to bottom, and cells by x gaps', () => {
    const items = [at('X-1', 0, 680), at('2026-09-01', 60, 680), at('batch_id', 0, 700), at('sample_date', 60, 700)];
    expect(groupTextItems(items)).toEqual([['batch_id', 'sample_date'], ['X-1', '2026-09-01']]);
  });

  it('keeps items on one row when their baselines differ by up to half the text height', () => {
    expect(groupTextItems([at('a', 0, 700), at('b', 50, 695)])).toEqual([['a', 'b']]);
    expect(groupTextItems([at('a', 0, 700), at('b', 50, 694)])).toEqual([['a'], ['b']]);
  });

  it('joins a word gap with a space, touching items with none, and splits a column gap', () => {
    // "R-32" ends at 20; a 4-unit gap is a word space, 0 touches, and 6 (over half of 10) is a new cell.
    expect(groupTextItems([at('R-32', 0, 700), at('blend', 24, 700)])).toEqual([['R-32 blend']]);
    expect(groupTextItems([at('R-3', 0, 700), at('2', 15, 700)])).toEqual([['R-32']]);
    expect(groupTextItems([at('R-32', 0, 700), at('12.5', 26, 700)])).toEqual([['R-32', '12.5']]);
  });

  it('orders cells by x whatever order the items come in', () => {
    expect(groupTextItems([at('c', 200, 700), at('a', 0, 700), at('b', 100, 700)])).toEqual([['a', 'b', 'c']]);
  });

  it('skips blank items and gives zero-height items the typical height', () => {
    const items = [at('a', 0, 700), at('   ', 20, 700), { ...at('b', 100, 698), height: 0 }, at('c', 0, 680)];
    expect(groupTextItems(items)).toEqual([['a', 'b'], ['c']]);
    expect(groupTextItems([at(' ', 0, 700)])).toEqual([]);
  });

  it('leaves a row with a missing cell shorter, for findTable to flag', () => {
    const items = [at('a', 0, 700), at('b', 100, 700), at('c', 200, 700), at('x', 0, 680), at('z', 200, 680)];
    expect(groupTextItems(items)).toEqual([['a', 'b', 'c'], ['x', 'z']]);
  });
});

/** A fake loaded document whose pages hold these text items, and the task getDocument returns for it. */
function fakePdf(pages: PlacedText[][], numPages = pages.length) {
  const destroy = vi.fn(() => Promise.resolve());
  const getPage = vi.fn(async (n: number) => ({
    getTextContent: async () => ({
      items: [{ type: 'beginMarkedContent' }, ...pages[n - 1].map((i) => ({ str: i.text, transform: [1, 0, 0, 1, i.x, i.y], width: i.width, height: i.height }))],
    }),
  }));
  const task = { promise: Promise.resolve({ numPages, getPage }), destroy };
  pdfjs.getDocument.mockReturnValue(task);
  return { task, getPage, destroy };
}

const file = () => new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });

describe('readPdf', () => {
  beforeEach(() => pdfjs.getDocument.mockReset());

  it('reads every page in order, so a table continues across pages, and releases the document', async () => {
    const { destroy } = fakePdf([[at('batch_id', 0, 700), at('X-1', 0, 680)], [at('X-2', 0, 700)]]);
    expect(await readPdf(file())).toEqual([['batch_id'], ['X-1'], ['X-2']]);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/pdf.worker.min.mjs');
    expect(destroy).toHaveBeenCalled();
  });

  it('refuses a PDF over the page limit before reading any page', async () => {
    const { getPage, destroy } = fakePdf([], PDF_MAX_PAGES + 14);
    await expect(readPdf(file())).rejects.toThrow(new ConvertError('It has 34 pages; the PDF limit is 20 pages.'));
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('refuses a PDF with a page that has no text, naming the page', async () => {
    const { destroy } = fakePdf([[at('batch_id', 0, 700)], [at(' ', 0, 700)]]);
    await expect(readPdf(file())).rejects.toThrow(new ConvertError("Page 2 is a scanned image with no text to read. Scanned PDFs can't be converted yet."));
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

import { ConvertError } from './table';

/** Largest PDF the browser will read, in pages. */
export const PDF_MAX_PAGES = 20;
/** Items whose baselines are within this share of the text height are on the same row. */
export const ROW_TOLERANCE = 0.5;
/** A horizontal gap wider than this share of the text height starts a new cell. */
export const CELL_GAP = 0.5;

/** One piece of text on a page, positioned by its left edge and baseline (PDF y points up). */
export interface PlacedText { text: string; x: number; y: number; width: number; height: number }

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/**
 * Turns one page's text into rows of cell text. Items are taken top to bottom: an item joins the current
 * row when its baseline is within ROW_TOLERANCE of the row's text height, otherwise it starts a new row.
 * Within a row, items are taken left to right: a gap wider than CELL_GAP of the text height starts a new
 * cell, and a smaller gap joins the item to the cell with a space (none when the items touch). A missing
 * cell can't be seen from the gaps, so that row simply has fewer cells and findTable flags it.
 */
export function groupTextItems(items: PlacedText[]): string[][] {
  const visible = items.filter((item) => item.text.trim() !== '');
  const typicalHeight = median(visible.map((item) => item.height).filter((h) => h > 0)) || 1;
  const sized = visible.map((item) => ({ ...item, height: item.height > 0 ? item.height : typicalHeight }));

  const rows: (typeof sized)[] = [];
  for (const item of [...sized].sort((a, b) => b.y - a.y)) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= row[0].height * ROW_TOLERANCE) row.push(item);
    else rows.push([item]);
  }

  return rows.map((row) => {
    const cells: string[] = [];
    let end = -Infinity;
    for (const item of [...row].sort((a, b) => a.x - b.x)) {
      const gap = item.x - end;
      if (cells.length === 0 || gap > item.height * CELL_GAP) cells.push(item.text.trim());
      else cells[cells.length - 1] += (gap > 0 ? ' ' : '') + item.text.trim();
      end = Math.max(end, item.x + item.width);
    }
    return cells;
  });
}

/**
 * Reads a text PDF into rows of cell text, page after page, so a table can continue across pages. pdf.js
 * is imported here, when a PDF is chosen, and parses in its own worker. A PDF over PDF_MAX_PAGES, or with
 * a page that has no text (a scanned image), is refused. Aborting the signal stops the read, and the
 * document is always released when the read ends.
 */
export async function readPdf(file: File, signal?: AbortSignal): Promise<string[][]> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  signal?.throwIfAborted();

  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const task = pdfjs.getDocument({ data });
  const stop = () => { void task.destroy(); };
  signal?.addEventListener('abort', stop);
  try {
    let pdf: Awaited<typeof task.promise>;
    try {
      pdf = await task.promise;
    } catch (error) {
      signal?.throwIfAborted();
      throw new ConvertError("It couldn't be read as a PDF file.", { cause: error });
    }
    if (pdf.numPages > PDF_MAX_PAGES) throw new ConvertError(`It has ${pdf.numPages} pages; the PDF limit is ${PDF_MAX_PAGES} pages.`);

    const rows: string[][] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted();
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items: PlacedText[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue; // marked-content markers carry no text
        items.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height });
      }
      const pageRows = groupTextItems(items);
      if (pageRows.length === 0) throw new ConvertError(`Page ${number} is a scanned image with no text to read. Scanned PDFs can't be converted yet.`);
      rows.push(...pageRows);
    }
    return rows;
  } finally {
    signal?.removeEventListener('abort', stop);
    await task.destroy();
  }
}

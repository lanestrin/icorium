import type { PDFPageProxy } from 'pdfjs-dist';
import { createOcrReader, releaseCanvas, type OcrReader, type ReadProgress } from './ocr';
import { groupTextCells, type PlacedCell, type PlacedText } from './layout';
import { ConvertError } from './table';

/** Largest PDF the browser will read, in pages. */
export const PDF_MAX_PAGES = 20;
/** Scanned pages are rendered at this resolution for OCR: 300 DPI, as PDF units are 1/72 inch. */
export const OCR_RENDER_SCALE = 300 / 72;
/**
 * Largest canvas a scanned page is drawn on, in pixels: under mobile Safari's limit (about 16.7 million),
 * which a large page at 300 DPI (A3 is about 17.4 million) would pass. Such a page is drawn smaller.
 */
export const OCR_MAX_CANVAS_PIXELS = 16_000_000;

/** One PDF page (1-based): its rows of positioned cells, and whether it was a scanned image read by OCR. */
export interface PdfPage { page: number; ocr: boolean; rows: PlacedCell[][] }

/** A PDF's pages, in order. */
export interface PdfText { pages: PdfPage[] }

/**
 * Reads a PDF into pages of positioned cells, so a table can continue across pages and each row keeps its page. pdf.js is
 * imported here, when a PDF is chosen, and parses in its own worker. A page with a text layer is read
 * from it; a page without one (a scanned image) is rendered at 300 DPI and read by OCR (ocr.ts), so a
 * file can mix both. A PDF over PDF_MAX_PAGES is refused. onProgress hears each page as it starts, and
 * when OCR is getting ready. Aborting the signal stops the read; the document, each page, each rendered
 * canvas and the OCR worker are always released.
 */
export async function readPdf(file: File, signal: AbortSignal = new AbortController().signal, onProgress?: (progress: ReadProgress) => void): Promise<PdfText> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  signal.throwIfAborted();

  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const task = pdfjs.getDocument({ data });
  const stop = () => { void task.destroy(); };
  signal.addEventListener('abort', stop);
  let ocr: OcrReader | undefined;
  try {
    let pdf: Awaited<typeof task.promise>;
    try {
      pdf = await task.promise;
    } catch (error) {
      signal.throwIfAborted();
      throw new ConvertError("It couldn't be read as a PDF file.", { cause: error });
    }
    if (pdf.numPages > PDF_MAX_PAGES) throw new ConvertError(`It has ${pdf.numPages} pages; the PDF limit is ${PDF_MAX_PAGES} pages.`);

    const pages: PdfPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      onProgress?.({ stage: 'page', page: number, pages: pdf.numPages });
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const items: PlacedText[] = [];
        for (const item of content.items) {
          if (!('str' in item)) continue; // marked-content markers carry no text
          items.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height });
        }
        let pageRows = groupTextCells(items);
        let ocrRead = false;
        if (pageRows.length === 0) {
          // No text layer: a scanned page. Render it and read it with OCR.
          ocr ??= createOcrReader(signal, () => onProgress?.({ stage: 'preparing' }));
          await ocr.ready(); // the first time, this is "getting OCR ready"
          onProgress?.({ stage: 'page', page: number, pages: pdf.numPages }); // ready: back to this page
          const { canvas, scale } = await renderPage(page, signal);
          try {
            pageRows = await ocr.read(canvas, number, scale);
          } finally {
            releaseCanvas(canvas);
          }
          ocrRead = true;
        }
        pages.push({ page: number, ocr: ocrRead, rows: pageRows });
      } finally {
        page.cleanup();
      }
    }
    return { pages };
  } finally {
    signal.removeEventListener('abort', stop);
    await ocr?.close();
    await task.destroy();
  }
}

/** Draws one page onto a new canvas at OCR_RENDER_SCALE, or smaller to stay within OCR_MAX_CANVAS_PIXELS, and says which scale was used; aborting cancels the render. */
async function renderPage(page: PDFPageProxy, signal: AbortSignal): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const size = page.getViewport({ scale: 1 });
  const scale = Math.min(OCR_RENDER_SCALE, Math.sqrt(OCR_MAX_CANVAS_PIXELS / (size.width * size.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const render = page.render({ canvas, viewport });
  const stop = () => render.cancel();
  signal.addEventListener('abort', stop);
  try {
    await render.promise;
    return { canvas, scale };
  } catch (error) {
    releaseCanvas(canvas);
    signal.throwIfAborted();
    throw new ConvertError("A scanned page couldn't be drawn for reading.", { cause: error });
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

import type { PDFPageProxy } from 'pdfjs-dist';
import { createOcrReader, releaseCanvas, type OcrReader, type ReadProgress } from './ocr';
import { groupTextItems, type PlacedText } from './layout';
import { ConvertError } from './table';

/** Largest PDF the browser will read, in pages. */
export const PDF_MAX_PAGES = 20;
/** Scanned pages are rendered at this resolution for OCR: 300 DPI, as PDF units are 1/72 inch. */
export const OCR_RENDER_SCALE = 300 / 72;

/** A PDF's rows of cell text, and which pages (1-based) were scanned images read by OCR. */
export interface PdfText { rows: string[][]; ocrPages: number[] }

/**
 * Reads a PDF into rows of cell text, page after page, so a table can continue across pages. pdf.js is
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

    const rows: string[][] = [];
    const ocrPages: number[] = [];
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
        let pageRows = groupTextItems(items);
        if (pageRows.length === 0) {
          // No text layer: a scanned page. Render it and read it with OCR.
          ocr ??= createOcrReader(signal, () => onProgress?.({ stage: 'preparing' }));
          const canvas = await renderPage(page, signal);
          try {
            onProgress?.({ stage: 'page', page: number, pages: pdf.numPages }); // back from "getting ready"
            pageRows = await ocr.read(canvas, number);
          } finally {
            releaseCanvas(canvas);
          }
          ocrPages.push(number);
        }
        rows.push(...pageRows);
      } finally {
        page.cleanup();
      }
    }
    return { rows, ocrPages };
  } finally {
    signal.removeEventListener('abort', stop);
    await ocr?.close();
    await task.destroy();
  }
}

/** Draws one page onto a new canvas at OCR_RENDER_SCALE; aborting cancels the render. */
async function renderPage(page: PDFPageProxy, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const render = page.render({ canvas, viewport });
  const stop = () => render.cancel();
  signal.addEventListener('abort', stop);
  try {
    await render.promise;
    return canvas;
  } catch (error) {
    releaseCanvas(canvas);
    signal.throwIfAborted();
    throw new ConvertError("A scanned page couldn't be drawn for reading.", { cause: error });
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

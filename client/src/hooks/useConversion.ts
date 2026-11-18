import { useCallback, useEffect, useRef, useState } from 'react';
import { readExcel } from '../lib/convert/excel';
import { readImage, type ReadProgress } from '../lib/convert/ocr';
import { readPdf } from '../lib/convert/pdf';
import { fileKind, findTable, toCsvFile, type FileKind, type FoundTable } from '../lib/convert/table';

/** What was read by OCR: the whole image, or these PDF pages (1-based). Absent when nothing was. */
export type ReadByOcr = 'image' | number[];

/** What the review dialog shows: the source file's name, the table found in it, and what OCR read. */
export interface Review { name: string; table: FoundTable; ocr?: ReadByOcr }

/** A file kind that needs reading before upload. */
type ReadableKind = Exclude<FileKind, 'csv'>;

/** A reader's rows of cell text, and what of them OCR read. */
export interface ReadOutcome { rows: string[][]; ocr?: ReadByOcr }

/**
 * Reads a source file into rows of cell text. signal stops a reader that supports it (pdf.js, Tesseract);
 * onProgress hears which page is being read, or that OCR is getting ready.
 */
export type ReadSource = (file: File, kind: ReadableKind, signal: AbortSignal, onProgress: (progress: ReadProgress) => void) => Promise<ReadOutcome>;

const readSource: ReadSource = async (file, kind, signal, onProgress) => {
  if (kind === 'excel') return { rows: await readExcel(file) };
  if (kind === 'image') return { rows: await readImage(file, signal, onProgress), ocr: 'image' };
  const { rows, ocrPages } = await readPdf(file, signal, onProgress);
  return ocrPages.length ? { rows, ocr: ocrPages } : { rows };
};

/** Where findTable looked, for its "no header row" message. */
const searchedPlace = (kind: ReadableKind) => (kind === 'pdf' ? 'the PDF' : kind === 'image' ? 'the image' : 'the first sheet');

/** The status line while a file is read: "Reading report.pdf: page 2 of 5…", or OCR getting ready. */
export function readingStatus(name: string, progress?: ReadProgress) {
  if (progress?.stage === 'preparing') return 'Getting OCR ready (the first time downloads about 10 MB)…';
  if (progress?.stage === 'page') return `Reading ${name}: page ${progress.page} of ${progress.pages}…`;
  return `Reading ${name}…`;
}

/**
 * The one conversion in progress: its number, how to stop its reader, and how to hand its outcome back to
 * the upload loop.
 */
interface Job { id: number; reader: AbortController; finish: (file: File | null) => void }

/**
 * Turns non-CSV uploads into CSVs in the browser, one file at a time, with a review before anything is
 * sent. prepare(file) is the upload loop's per-file step: a CSV passes through; an Excel, PDF or image file
 * is read, its partner table found and shown for review, and the promise resolves to the CSV to upload when
 * the person chooses Import as CSV, or to null when they cancel. It rejects with a ConvertError (a message
 * ready to show) for a file it can't convert. reading is the status line while a file is read.
 *
 * Only one job is active. Cancel (while reading or in the review), closing the dialog, starting another file
 * or unmounting ends it: it resolves null, its reader is told to stop (pdf.js releases the document and
 * Tesseract's worker is terminated), and a result that arrives later is ignored, so a cancelled file is
 * never uploaded and never holds up the next one. Once Import as CSV is chosen the upload is submitted;
 * cancelling no longer applies, and a stored upload is not undone.
 */
export function useConversion(read: ReadSource = readSource) {
  const [review, setReview] = useState<Review | null>(null);
  const [reading, setReading] = useState<string | null>(null); // the status line while a file is read
  const job = useRef<Job | null>(null);
  const lastId = useRef(0);

  /** Ends the active job without uploading it; any later result from its reader is ignored. */
  const cancel = useCallback(() => {
    const active = job.current;
    job.current = null;
    setReview(null);
    setReading(null);
    active?.reader.abort();
    active?.finish(null);
  }, []);

  useEffect(() => cancel, [cancel]); // unmounting cancels the job in progress

  const prepare = useCallback((file: File): Promise<File | null> => {
    const kind = fileKind(file);
    if (kind === 'csv') return Promise.resolve(file);
    cancel(); // only one conversion at a time
    const id = ++lastId.current;
    return new Promise<File | null>((resolve, reject) => {
      const reader = new AbortController();
      job.current = { id, reader, finish: resolve };
      setReading(readingStatus(file.name));
      const onProgress = (progress: ReadProgress) => {
        if (job.current?.id === id) setReading(readingStatus(file.name, progress));
      };
      read(file, kind, reader.signal, onProgress)
        .then(({ rows, ocr }) => {
          if (job.current?.id !== id) return; // cancelled while reading
          setReading(null);
          setReview({ name: file.name, table: findTable(rows, searchedPlace(kind)), ...(ocr ? { ocr } : {}) });
        })
        .catch((error: unknown) => {
          if (job.current?.id !== id) return;
          job.current = null;
          setReading(null);
          reject(error);
        });
    });
  }, [cancel, read]);

  /** Import as CSV: hands the reviewed table to the upload loop as a CSV file. */
  const importReviewed = useCallback(() => {
    const active = job.current;
    if (!active || !review) return;
    job.current = null;
    setReview(null);
    active.finish(toCsvFile(review.table, review.name));
  }, [review]);

  return { prepare, review, reading, cancel, importReviewed };
}

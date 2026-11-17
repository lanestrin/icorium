import { useCallback, useEffect, useRef, useState } from 'react';
import { readExcel } from '../lib/convert/excel';
import { fileKind, findTable, toCsvFile, type FoundTable } from '../lib/convert/table';

/** What the review dialog shows: the source file's name and the table found in it. */
export interface Review { name: string; table: FoundTable }

/** The one conversion in progress: its number, and how to hand its outcome back to the upload loop. */
interface Job { id: number; finish: (file: File | null) => void }

/**
 * Turns non-CSV uploads into CSVs in the browser, one file at a time, with a review before anything is
 * sent. prepare(file) is the upload loop's per-file step: a CSV passes through; an Excel file is read,
 * its partner table found and shown for review, and the promise resolves to the CSV to upload when the
 * person chooses Import as CSV, or to null when they cancel. It rejects with a ConvertError (a message
 * ready to show) for a file it can't convert.
 *
 * Only one job is active. Cancel, closing the dialog or unmounting ends it: it resolves null, and a
 * reader result that arrives later is ignored, so a cancelled file is never uploaded and never holds up
 * the next one. Once Import as CSV is chosen the upload is submitted; cancelling no longer applies, and
 * a stored upload is not undone.
 */
export function useConversion(read = readExcel) {
  const [review, setReview] = useState<Review | null>(null);
  const [reading, setReading] = useState<string | null>(null); // the file being read, for a status line
  const job = useRef<Job | null>(null);
  const lastId = useRef(0);

  /** Ends the active job without uploading it; any later result from its reader is ignored. */
  const cancel = useCallback(() => {
    const active = job.current;
    job.current = null;
    setReview(null);
    setReading(null);
    active?.finish(null);
  }, []);

  useEffect(() => cancel, [cancel]); // unmounting cancels the job in progress

  const prepare = useCallback((file: File): Promise<File | null> => {
    if (fileKind(file) === 'csv') return Promise.resolve(file);
    cancel(); // only one conversion at a time
    const id = ++lastId.current;
    return new Promise<File | null>((resolve, reject) => {
      job.current = { id, finish: resolve };
      setReading(file.name);
      read(file)
        .then((cells) => {
          if (job.current?.id !== id) return; // cancelled while reading
          setReading(null);
          setReview({ name: file.name, table: findTable(cells) });
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

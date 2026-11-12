import { useEffect, useRef, useState } from 'react';
import { Download, TriangleAlert } from 'lucide-react';
import { PROCESSORS, type FileMeta, type FileRows, type ProblemList } from '../../../../shared/types';
import { api } from '../../lib/api';
import { classNames } from '../../lib/class-names';
import { importedLineage } from '../../lib/file-status';
import { errorMessage, rowsWord } from '../../lib/format';
import { Modal } from './Modal';
import styles from './modals.module.css';

const PAGE = 100; // rows loaded per "Show more"

// Invalid rows in current results, and the ERROR text older exports wrote, stand out in the preview.
const isErrorCell = (header: string, value: string) => (header === 'processing_status' && value === 'Invalid') || value === 'ERROR';

/** "File ID 101010-M · Mass result · 25 rows · 9 columns · generated columns highlighted · Imported…". */
function previewSubtitle(file: FileMeta) {
  const processor = PROCESSORS.find((p) => p.id === file.processor)?.label ?? '';
  const shape = file.status === 'Processed'
    ? `${processor} result · ${file.rows} rows · ${file.columns} columns · generated columns highlighted`
    : `${file.rows} rows · ${file.columns} columns`;
  const lineage = file.imported ? ` · ${importedLineage(file).short}` : '';
  return `File ID ${file.id} · ${shape}${lineage}`;
}

/** "Row 8 · A-008: mass missing", one per problem row. */
function ProblemRows({ list }: { list: ProblemList }) {
  const hidden = list.total - list.items.length;
  return (
    <section aria-label="Rows with problems" className={styles.problems}>
      <h3 className={styles.problemsTitle}>
        <TriangleAlert className="h-4 w-4" /> {rowsWord(list.total)} with problems in this file
      </h3>
      <ul className={styles.problemList}>
        {list.items.map((p) => (
          <li key={p.row}>
            <span className="font-semibold">Row {p.row}</span>
            {p.batchId && <span> · {p.batchId}</span>}: {p.message}
          </li>
        ))}
        {hidden > 0 && <li className="opacity-75">…and {rowsWord(hidden)} more</li>}
      </ul>
    </section>
  );
}

/** The loaded rows: generated columns tinted blue, problem rows amber with a marker, invalid values red. */
function RowsTable({ data }: { data: FileRows }) {
  const generated = new Set(data.generatedColumns);
  const problemByRow = new Map(data.problems.items.map((p) => [p.row, p.message]));

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0">
        <tr>
          <th className={styles.rowNumberHead}>#</th>
          {data.headers.map((h) => (
            <th key={h} className={classNames(styles.columnHead, generated.has(h) && styles.generatedHead)}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, i) => {
          const rowNumber = i + 1;
          const isFlagged = problemByRow.has(rowNumber);
          return (
            <tr key={i} title={problemByRow.get(rowNumber)} className={classNames(styles.row, isFlagged && styles.flaggedRow)}>
              <td className={classNames(styles.rowNumber, isFlagged && styles.rowNumberFlagged)}>
                {isFlagged && <TriangleAlert className="mr-1 inline h-3.5 w-3.5" aria-label="Problem row" />}
                {rowNumber}
              </td>
              {data.headers.map((h) => (
                <td key={h} className={classNames(styles.cell, generated.has(h) && styles.generatedCell, isErrorCell(h, row[h]) && styles.errorCell)}>
                  {row[h]}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A file's rows, loaded a page at a time, with its problems listed above and a Download button. */
export function PreviewModal({ file, onClose }: { file: FileMeta; onClose: () => void }) {
  const [data, setData] = useState<FileRows>();
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  // The file currently shown. A response for any other file (or after closing) is ignored.
  const shown = useRef(file.id);

  useEffect(() => {
    shown.current = file.id;
    setData(undefined);
    setError(undefined);
    api.rows(file.id, 0, PAGE)
      .then((d) => { if (shown.current === file.id) setData(d); })
      .catch((e) => { if (shown.current === file.id) setError(errorMessage(e)); });
    return () => { shown.current = ''; };
  }, [file.id]);

  async function showMore() {
    if (!data) return;
    const id = file.id;
    setLoadingMore(true);
    try {
      const next = await api.rows(id, data.rows.length, PAGE);
      if (shown.current === id) setData({ ...next, rows: [...data.rows, ...next.rows] });
    } catch (e) {
      if (shown.current === id) setError(errorMessage(e));
    } finally {
      if (shown.current === id) setLoadingMore(false);
    }
  }

  const remaining = data ? data.totalRows - data.rows.length : 0;
  const downloadButton = (
    <a href={api.downloadUrl(file.id)} className={styles.downloadLink}>
      <Download className="h-4 w-4" /> Download CSV
    </a>
  );

  return (
    <Modal title={file.name} subtitle={previewSubtitle(file)} onClose={onClose} actions={downloadButton}>
      {error && <p className="pt-6 text-red-600">{error}</p>}
      {!data && !error && <p className="pt-6 text-slate-500">Loading…</p>}
      {data && data.problems.total > 0 && <ProblemRows list={data.problems} />}
      {data && <RowsTable data={data} />}
      {data && (
        <div className={styles.footer}>
          <span>Showing {data.rows.length.toLocaleString()} of {data.totalRows.toLocaleString()} rows</span>
          {remaining > 0 && (
            <button onClick={showMore} disabled={loadingMore} className={styles.showMore}>
              {loadingMore ? 'Loading…' : `Show ${Math.min(PAGE, remaining)} more`}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

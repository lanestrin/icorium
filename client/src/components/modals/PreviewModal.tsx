import { useEffect, useRef, useState } from 'react';
import { Download, TriangleAlert } from 'lucide-react';
import { PROCESSORS, type FileMeta, type FileRows, type ProblemList } from '../../../../shared/types';
import { api } from '../../lib/api';
import { classNames } from '../../lib/class-names';
import { importedLineage } from '../../lib/file-status';
import { errorMessage, rowsWord } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from './Modal';
import styles from './modals.module.scss';

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
    <section aria-label="Rows with problems" className={classNames(styles.problems, styles.pinned)}>
      <h3 className={styles.problemsTitle}>
        <TriangleAlert aria-hidden /> {rowsWord(list.total)} with problems in this file
      </h3>
      <ul className={styles.problemList}>
        {list.items.map((p) => (
          <li key={p.row}>
            <span className={styles.problemRow}>Row {p.row}</span>
            {p.batchId && <span> · {p.batchId}</span>}: {p.message}
          </li>
        ))}
        {hidden > 0 && <li className={styles.moreProblems}>…and {rowsWord(hidden)} more</li>}
      </ul>
    </section>
  );
}

/** The loaded rows: generated columns tinted blue, problem rows amber with a marker, invalid values red. */
function RowsTable({ data }: { data: FileRows }) {
  const generated = new Set(data.generatedColumns);
  const problemByRow = new Map(data.problems.items.map((p) => [p.row, p.message]));

  return (
    <table className={styles.table}>
      <thead className={styles.tableHead}>
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
                {isFlagged && <TriangleAlert className={styles.problemIcon} aria-label="Problem row" />}
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
    <button type="button" className={styles.downloadLink} onClick={() => api.download(file.id).catch((e) => setError(errorMessage(e)))}>
      <Download aria-hidden /> Download CSV
    </button>
  );

  return (
    <Modal title={file.name} subtitle={previewSubtitle(file)} onClose={onClose} actions={downloadButton}>
      {error && <p className={classNames(styles.message, styles.error)}>{error}</p>}
      {!data && !error && <p className={classNames(styles.message, styles.loading)}>Loading…</p>}
      {data && data.problems.total > 0 && <ProblemRows list={data.problems} />}
      {data && <RowsTable data={data} />}
      {data && (
        <div className={classNames(styles.footer, styles.pinned)}>
          <span>Showing {data.rows.length.toLocaleString()} of {data.totalRows.toLocaleString()} rows</span>
          {remaining > 0 && (
            <Button variant="secondary" size="sm" onClick={showMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Show ${Math.min(PAGE, remaining)} more`}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

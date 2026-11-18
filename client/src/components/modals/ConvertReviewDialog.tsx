import { TriangleAlert } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import type { FoundTable } from '../../lib/convert/table';
import type { ReadByOcr } from '../../hooks/useConversion';
import { rowsWord } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from './Modal';
import styles from './modals.module.scss';

/** Rows shown in the review; the import always takes every row. */
export const REVIEW_ROWS = 100;

/** "2", "2 and 3", "1, 2 and 4". */
const pageList = (pages: number[]) => (pages.length === 1 ? String(pages[0]) : `${pages.slice(0, -1).join(', ')} and ${pages.at(-1)}`);

/** What OCR read, for the warning: the whole image, or which PDF pages. */
function ocrDetail(ocr: ReadByOcr) {
  const where = ocr === 'image' ? 'This image was' : `Text on ${ocr.length === 1 ? 'page' : 'pages'} ${pageList(ocr)} was`;
  return `${where} read by OCR, so digits and decimal points may be wrong. Compare them with the original before importing.`;
}

/**
 * Shows a converted file's table before it is uploaded: which partner's columns were found and where,
 * the first rows, and the rows that need checking. When any of it was read by OCR (ocr), a warning says so
 * and asks the person to check the numbers. Cell text is rendered as text only. Cancel, Escape or closing
 * the dialog uploads nothing.
 */
export function ConvertReviewDialog({ name, table, ocr, onCancel, onImport }: {
  name: string; table: FoundTable; ocr?: ReadByOcr; onCancel: () => void; onImport: () => void;
}) {
  const reasons = new Map<number, string[]>();
  for (const flag of table.flags) reasons.set(flag.row, [...(reasons.get(flag.row) ?? []), flag.reason]);
  const shown = table.rows.slice(0, REVIEW_ROWS);

  return (
    <Modal title={`Review ${name}`} subtitle={`${table.partner} · header on row ${table.headerRow} · ${rowsWord(table.rows.length)}`} onClose={onCancel}>
      {ocr && (
        <section aria-label="Read by OCR" className={classNames(styles.problems, styles.pinned)}>
          <h3 className={styles.problemsTitle}><TriangleAlert aria-hidden /> Read by OCR: check the numbers</h3>
          <p>{ocrDetail(ocr)}</p>
        </section>
      )}
      {reasons.size > 0 && (
        <section aria-label="Rows to check" className={classNames(styles.problems, styles.pinned)}>
          <h3 className={styles.problemsTitle}>
            <TriangleAlert aria-hidden /> {rowsWord(reasons.size)} need checking
          </h3>
          <ul className={styles.problemList}>
            {[...reasons].map(([row, why]) => (
              <li key={row}><span className={styles.problemRow}>Row {row}</span>: {why.join('; ')}</li>
            ))}
          </ul>
        </section>
      )}
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={styles.rowNumberHead}>#</th>
            {table.headers.map((h, i) => <th key={i} className={styles.columnHead}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const why = reasons.get(row.sourceRow);
            return (
              <tr key={row.sourceRow} title={why?.join('; ')} className={classNames(styles.row, why && styles.flaggedRow)}>
                <td className={classNames(styles.rowNumber, why && styles.rowNumberFlagged)}>
                  {why && <TriangleAlert className={styles.problemIcon} aria-label="Row to check" />}
                  {row.sourceRow}
                </td>
                {row.cells.map((cell, i) => <td key={i} className={styles.cell}>{cell}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={classNames(styles.footer, styles.pinned)}>
        <span>Showing {shown.length.toLocaleString()} of {rowsWord(table.rows.length)}</span>
      </div>
      <div className={classNames(styles.confirmButtons, styles.pinned)}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="success" onClick={onImport}>Import as CSV</Button>
      </div>
    </Modal>
  );
}

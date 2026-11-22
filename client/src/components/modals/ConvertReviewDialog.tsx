import { TriangleAlert } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import type { Decision } from '../../lib/convert/pages';
import type { FoundTable, ValueCheck } from '../../lib/convert/table';
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

const tableTitle = (t: FoundTable) => t.partner || 'Columns to map';

/** Where a table is: its sheet and range (Excel), or its page (PDF), and its header row. */
const tableWhere = (t: FoundTable) =>
  t.sheet ? `${t.sheet} ${t.range} · header on row ${t.headerRow}` : t.headerPage !== undefined ? `header on page ${t.headerPage}, row ${t.headerRow}` : `header on row ${t.headerRow}`;

/** A row's place in its source: "Page 2, row 5" for a PDF, "Row 5" otherwise (a sheet or an image). */
const placeOf = (at: { page?: number; pageRow?: number; row: number }) => (at.page === undefined ? `Row ${at.row}` : `Page ${at.page}, row ${at.pageRow}`);

/**
 * Shows a converted file's table before it is uploaded: which partner's columns were found and where,
 * the first rows, and the rows that need checking. A file with several tables (Excel) lists them, and
 * Import as CSV waits until the person chooses one; only the chosen table is uploaded. When any of it was
 * read by OCR (ocr), a warning says so and asks the person to check the numbers. Each value read from a PDF
 * or image that may be wrong is listed (checks) with its page and row, and Import as CSV waits until every
 * one is kept as read or left blank (decisions). Cell text is rendered as text only. Cancel, Escape or
 * closing the dialog uploads nothing.
 */
export function ConvertReviewDialog({ name, tables, chosen, ocr, decisions, onChoose, onDecide, onCancel, onImport }: {
  name: string; tables: FoundTable[]; chosen: number | null; ocr?: ReadByOcr; decisions: Record<string, Decision>;
  onChoose: (index: number) => void; onDecide: (id: string, decision: Decision) => void; onCancel: () => void; onImport: () => void;
}) {
  const table = chosen === null ? undefined : tables[chosen];
  const reasons = new Map<number, string[]>();
  const places = new Map<number, string>();
  for (const flag of table?.flags ?? []) {
    reasons.set(flag.row, [...(reasons.get(flag.row) ?? []), flag.reason]);
    places.set(flag.row, placeOf(flag));
  }
  const checks = table?.checks ?? [];
  const checkAt = new Map(checks.map((c) => [c.id, c]));
  const decided = checks.filter((c) => decisions[c.id] !== undefined).length;
  const waiting = checks.length - decided;
  const paged = table?.rows[0]?.page !== undefined;
  const shown = table?.rows.slice(0, REVIEW_ROWS) ?? [];

  return (
    <Modal title={`Review ${name}`} subtitle={table ? `${tableTitle(table)} · ${tableWhere(table)} · ${rowsWord(table.rows.length)}` : `${tables.length} tables found`} onClose={onCancel}>
      {tables.length > 1 && (
        <fieldset className={classNames(styles.tableChoice, styles.pinned)}>
          <legend>Choose a table</legend>
          {tables.map((t, i) => (
            <label key={i} className={styles.tableOption}>
              <input type="radio" name="table" checked={chosen === i} onChange={() => onChoose(i)} />
              <span>{t.sheet} {t.range} · {tableTitle(t)} · {rowsWord(t.rows.length)}</span>
            </label>
          ))}
        </fieldset>
      )}
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
              <li key={row}><span className={styles.problemRow}>{places.get(row)}</span>: {why.join('; ')}</li>
            ))}
          </ul>
        </section>
      )}
      {checks.length > 0 && (
        <section aria-label="Values to confirm" className={classNames(styles.problems, styles.pinned)}>
          <h3 className={styles.problemsTitle}><TriangleAlert aria-hidden /> Values to confirm</h3>
          <p>These values may have been misread. Compare each with the original, then keep it as read or leave it blank. Nothing is corrected for you.</p>
          <p role="status">{decided} of {checks.length} decided</p>
          <ul className={styles.checkList}>
            {checks.map((check) => <CheckItem key={check.id} check={check} header={table?.headers[check.column] ?? ''} decision={decisions[check.id]} onDecide={onDecide} />)}
          </ul>
        </section>
      )}
      {table && <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            {paged ? <><th className={styles.rowNumberHead}>Page</th><th className={styles.rowNumberHead}>Row</th></> : <th className={styles.rowNumberHead}>#</th>}
            {table.headers.map((h, i) => <th key={i} className={styles.columnHead}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const why = reasons.get(row.sourceRow);
            return (
              <tr key={row.sourceRow} title={why?.join('; ')} className={classNames(styles.row, why && styles.flaggedRow)}>
                {paged && <td className={styles.rowNumber}>{row.page}</td>}
                <td className={classNames(styles.rowNumber, why && styles.rowNumberFlagged)}>
                  {why && <TriangleAlert className={styles.problemIcon} aria-label="Row to check" />}
                  {paged ? row.pageRow : row.sourceRow}
                </td>
                {row.cells.map((cell, i) => {
                  const check = checkAt.get(`${row.sourceRow}:${i}`);
                  const blanked = check !== undefined && decisions[check.id] === 'blank';
                  return (
                    <td key={i} className={classNames(styles.cell, check && styles.confirmCell)} title={check?.reasons.join('; ')}>
                      {blanked ? <span className={styles.blankNote}>left blank</span> : cell}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>}
      {table && (
        <div className={classNames(styles.footer, styles.pinned)}>
          <span>Showing {shown.length.toLocaleString()} of {rowsWord(table.rows.length)}</span>
        </div>
      )}
      {waiting > 0 && <p id="convert-waiting" className={classNames(styles.waiting, styles.pinned)}>Decide {waiting === 1 ? 'the value' : `all ${waiting} values`} to confirm to import.</p>}
      <div className={classNames(styles.confirmButtons, styles.pinned)}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="success" disabled={!table || waiting > 0} aria-describedby={waiting > 0 ? 'convert-waiting' : undefined} onClick={onImport}>Import as CSV</Button>
      </div>
    </Modal>
  );
}

/** One value to confirm: where it is, what was read, why it is doubtful, and the choice to keep it or leave it blank. */
function CheckItem({ check, header, decision, onDecide }: { check: ValueCheck; header: string; decision?: Decision; onDecide: (id: string, decision: Decision) => void }) {
  const name = `check-${check.id}`;
  return (
    <li>
      <fieldset className={styles.check}>
        <legend>{placeOf({ ...check, row: check.sourceRow })} · {header}: <span className={styles.problemRow}>{check.value}</span></legend>
        <p>{check.reasons.join('; ')}</p>
        <div className={styles.checkChoices}>
          <label><input type="radio" name={name} checked={decision === 'keep'} onChange={() => onDecide(check.id, 'keep')} /> Keep as read</label>
          <label><input type="radio" name={name} checked={decision === 'blank'} onChange={() => onDecide(check.id, 'blank')} /> Leave blank</label>
        </div>
      </fieldset>
    </li>
  );
}

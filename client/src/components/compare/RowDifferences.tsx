import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { differsFromRef, fmtValue, metricLabel } from '../../lib/compare-view';
import { FILE_COLORS } from './fileColors';
import styles from './compare.module.css';

/** The Row differences tab: each row's value in every file, highlighting values that differ from the reference. */
export function RowDifferences({ col, result, labels, refIndex, onlyDiffering, setOnlyDiffering }: {
  col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number;
  onlyDiffering: boolean; setOnlyDiffering: (on: boolean) => void;
}) {
  const { files, rows } = result;
  const isNumeric = col.kind === 'numeric';
  const isMissing = (r: number, k: number) => rows[r].rowNumbers[k] === null;
  const rowDiffers = (r: number) => files.some((_, k) => differsFromRef(col, r, k, refIndex)) || rows[r].rowNumbers.some((n) => n === null);
  const shownRows = rows.map((_, r) => r).filter((r) => !onlyDiffering || rowDiffers(r));

  /** What one cell shows: "not in file", the formatted value, or a dash for a blank. */
  function cellText(r: number, k: number) {
    if (isMissing(r, k)) return 'not in file';
    const value = col.values[r][k];
    if (typeof value === 'number') return fmtValue(value, col.unit);
    return value === null || value === '' ? '—' : value;
  }

  return (
    <section aria-label="Row differences" className={classNames(styles.panel, 'mt-4')}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className={styles.panelTitle}>{metricLabel(col.name)}: row differences</h3>
        <p className={styles.muted}>
          {col.rowsDiffering} of {col.rowsCompared} rows differ between files. Highlighted cells differ from the reference file.
        </p>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={onlyDiffering} onChange={(e) => setOnlyDiffering(e.target.checked)} className={styles.checkbox} />
          Only rows that differ
        </label>
      </div>
      <div className={styles.rowTable}>
        <table className="w-full text-sm">
          <thead>
            <tr className={styles.stickyHead}>
              <th>{result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row'}</th>
              {files.map((file, k) => (
                <th key={file.id} className={isNumeric ? 'text-right' : ''}>
                  <span className={styles.headerDot} style={{ background: FILE_COLORS[k] }} aria-hidden />
                  {labels[k]}{k === refIndex && ' (ref)'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={rows[r].key} className={styles.rowBodyRow}>
                <th scope="row" className={styles.rowLabel}>{rows[r].label}</th>
                {files.map((file, k) => {
                  const differs = differsFromRef(col, r, k, refIndex);
                  return (
                    <td key={file.id} data-differs={differs || undefined}
                      className={classNames(isNumeric && styles.numberCell, differs && styles.differs, isMissing(r, k) && styles.notInFile)}>
                      {cellText(r, k)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!shownRows.length && (
              <tr><td colSpan={files.length + 1} className={styles.emptyRow}>No rows differ for this metric.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

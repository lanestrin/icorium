import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { deltas, deltaUnit, differsFromRef, fmtDelta, fmtValue } from '../../lib/compare-view';
import { Card } from '../ui/Card';
import { Dot } from './fileColors';
import tables from '../../styles/tables.module.scss';
import styles from './compare.module.scss';

/** A file's flagged-row count: red when there are any, green when there are none. */
function FlaggedCount({ count }: { count: number }) {
  return <span className={classNames(styles.flaggedCount, count ? styles.flaggedSome : styles.flaggedNone)}>{count}</span>;
}

/** Each file's total or mean (or rows differing), its change from the reference file, and its flagged rows. */
export function SummaryByFile({ col, result, labels, refIndex }: { col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number }) {
  const { files, rows } = result;
  const isNumeric = col.kind === 'numeric';
  const summary = col.summary ?? [];
  const delta = deltas(summary, refIndex);
  const valueHeader = `${col.measure === 'total' ? 'Total' : 'Mean'}${col.unit ? ` (${col.unit})` : ''}`;
  const rowsDiffering = files.map((_, k) => rows.filter((_, r) => differsFromRef(col, r, k, refIndex)).length);
  // Percentages show without a unit in the value column; the header already says (%).
  const valueUnit = col.unit === '%' ? undefined : col.unit;

  return (
    <Card className={styles.cardContent}>
      <h3 className={classNames(styles.panelTitle, styles.panelTitleSpaced)}>Summary by file</h3>
      <div className={styles.tableScroll}>
        <table aria-label="Summary by file" className={tables.table}>
          <thead>
            <tr className={tables.headRow}>
              <th>File</th>
              {isNumeric
                ? <><th className={tables.numeric}>{valueHeader}</th><th className={tables.numeric}>Δ vs ref.</th></>
                : <th className={tables.numeric}>Rows differing from ref.</th>}
              <th className={tables.numeric}>Flagged rows</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, k) => (
              <tr key={file.id} className={classNames(tables.row, k === refIndex && styles.referenceRow)}>
                <td className={styles.labelCell}>
                  <span className={styles.fileCell} title={file.name}>
                    <Dot k={k} />{labels[k]}{k === refIndex && <span className={styles.refTag}>(ref)</span>}
                  </span>
                </td>
                {isNumeric
                  ? <><td className={tables.numeric}>{fmtValue(summary[k], valueUnit)}</td><td className={tables.numeric}>{fmtDelta(delta[k], deltaUnit(col))}</td></>
                  : <td className={tables.numeric}>{k === refIndex ? '—' : rowsDiffering[k]}</td>}
                <td className={tables.numeric}><FlaggedCount count={file.problems.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isNumeric && col.unit === '%' && <p className={styles.footnote}>Δ is measured against the reference file. pp = percentage points.</p>}
    </Card>
  );
}

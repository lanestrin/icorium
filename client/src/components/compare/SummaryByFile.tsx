import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { deltas, deltaUnit, differsFromRef, fmtDelta, fmtValue } from '../../lib/compare-view';
import { Dot } from './fileColors';
import styles from './compare.module.css';

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
    <div className={styles.panel}>
      <h3 className={classNames(styles.panelTitle, 'mb-3')}>Summary by file</h3>
      <div className="overflow-x-auto">
        <table aria-label="Summary by file" className="w-full text-sm">
          <thead>
            <tr className="table-head-row">
              <th>File</th>
              {isNumeric
                ? <><th className="text-right">{valueHeader}</th><th className="text-right">Δ vs ref.</th></>
                : <th className="text-right">Rows differing from ref.</th>}
              <th className="text-right">Flagged rows</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, k) => (
              <tr key={file.id} className={classNames('table-row', k === refIndex && styles.referenceRow)}>
                <td className="font-medium">
                  <span className="flex items-center gap-2" title={file.name}>
                    <Dot k={k} />{labels[k]}{k === refIndex && <span className="font-normal text-slate-500">(ref)</span>}
                  </span>
                </td>
                {isNumeric
                  ? <><td className="text-right">{fmtValue(summary[k], valueUnit)}</td><td className="text-right">{fmtDelta(delta[k], deltaUnit(col))}</td></>
                  : <td className="text-right">{k === refIndex ? '—' : rowsDiffering[k]}</td>}
                <td className="text-right"><FlaggedCount count={file.problems.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isNumeric && col.unit === '%' && <p className={styles.footnote}>Δ is measured against the reference file. pp = percentage points.</p>}
    </div>
  );
}

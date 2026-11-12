import type { ReactNode } from 'react';
import { ArrowLeftRight, ChevronRight, Layers, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { metricLabel, topDifferences, type TopDifference } from '../../lib/compare-view';
import { CategoryChart } from './CategoryChart';
import { Dot } from './fileColors';
import { RowChart } from './RowChart';
import { SummaryByFile } from './SummaryByFile';
import styles from './compare.module.css';

/** One figure in "Comparison at a glance": an icon and label above its value. */
function Stat({ icon: Icon, iconColor, tone, label, children }: {
  icon: LucideIcon; iconColor: string; tone: string; label: string; children: ReactNode;
}) {
  return (
    <div className={classNames(styles.stat, tone)}>
      <dt className={styles.statLabel}><Icon className={`h-4 w-4 ${iconColor}`} aria-hidden /> {label}</dt>
      {children}
    </div>
  );
}

/** The rows that differ most from the reference file, with the files that differ. */
function TopDifferencesTable({ top, labels, byBatchId }: { top: TopDifference[]; labels: string[]; byBatchId: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Top differences" className="w-full text-sm">
        <thead>
          <tr className="table-head-row"><th>{byBatchId ? 'Batch ID' : 'Row'}</th><th>Key difference</th><th>Files affected</th></tr>
        </thead>
        <tbody>
          {top.map((difference) => (
            <tr key={difference.key} className="table-row">
              <td className="whitespace-nowrap font-medium">{difference.label}</td>
              <td><span className={styles.differenceText}>{difference.text}</span></td>
              <td>
                <span className={styles.affectedFiles}>
                  {difference.files.map((k) => <span key={k} className={styles.affectedFile}><Dot k={k} />{labels[k]}</span>)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The Overview tab: the metric's chart and summary by file, then the comparison at a glance and its top differences. */
export function Overview({ col, result, labels, refIndex, deviation, setDeviation, showRows }: {
  col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number; deviation: boolean;
  setDeviation?: (on: boolean) => void; showRows: () => void;
}) {
  const { files, rows } = result;
  const top = topDifferences(result, col, refIndex);
  const flaggedFiles = files.filter((f) => f.problems.total > 0).length;
  const percentDiffering = col.rowsCompared ? Math.round((col.rowsDiffering / col.rowsCompared) * 100) : 0;

  return (
    <section aria-label="Overview" className={styles.overview}>
      <div className={styles.chartAndSummary}>
        <div className={styles.panel}>
          {col.kind === 'numeric'
            ? <RowChart col={col} result={result} labels={labels} deviation={deviation} setDeviation={setDeviation} />
            : <CategoryChart col={col} files={files} labels={labels} />}
        </div>
        <SummaryByFile col={col} result={result} labels={labels} refIndex={refIndex} />
      </div>

      <div className={classNames(styles.panel, styles.glance)}>
        <div>
          <h3 className={classNames(styles.panelTitle, 'mb-3')}>Comparison at a glance</h3>
          <dl className={styles.stats}>
            <Stat icon={Layers} iconColor="text-blue-600" tone={styles.statReference} label="Reference file">
              <dd className={classNames(styles.statValue, 'truncate')} title={files[refIndex].name}>{labels[refIndex]}</dd>
            </Stat>
            <Stat icon={ArrowLeftRight} iconColor="text-green-600" tone={styles.statDiffering} label="Rows differing">
              <dd className={styles.statValue}>
                {col.rowsDiffering} / {col.rowsCompared} <span className="text-sm font-normal text-slate-500">({percentDiffering}%)</span>
              </dd>
            </Stat>
            <Stat icon={TriangleAlert} iconColor="text-red-500" tone={styles.statFlagged} label="Flagged files">
              <dd className={classNames(styles.statValue, 'text-red-700')}>{flaggedFiles} / {files.length}</dd>
            </Stat>
          </dl>
        </div>

        <div className="min-w-0">
          <div className={styles.topDifferencesHeader}>
            <h3 className={styles.panelTitle}>
              Top differences <span className="text-sm font-normal text-slate-500">({top.length} {top.length === 1 ? 'row' : 'rows'})</span>
            </h3>
            <button onClick={showRows} className={styles.viewAllButton}>
              View all row details <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {top.length
            ? <TopDifferencesTable top={top} labels={labels} byBatchId={result.rowMatch === 'batch_id'} />
            : <p className={styles.muted}>No row differs from the reference file for {metricLabel(col.name).toLowerCase()}.</p>}
          <p className={styles.footnote}>Rows compared: {rows.length}.</p>
        </div>
      </div>
    </section>
  );
}

import type { CompareColumn, CompareFile } from '../../../../shared/types';
import { metricLabel } from '../../lib/compare-view';
import { classNames } from '../../lib/class-names';
import styles from './compare.module.scss';

export type CompareView = 'overview' | 'rows';

const VIEW_LABELS: Record<CompareView, string> = { overview: 'Overview', rows: 'Row differences' };

/** A rounded toggle button; the pressed one is filled blue. */
function PillButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button aria-pressed={pressed} onClick={onClick} className={classNames(styles.pill, pressed && styles.pillActive)}>
      {children}
    </button>
  );
}

/** The comparison controls: which file is the reference, which metric to compare, and Overview or Row differences. */
export function CompareToolbar({ files, labels, columns, refIndex, onRefChange, metric, onMetricChange, view, onViewChange }: {
  files: CompareFile[];
  labels: string[];
  columns: CompareColumn[];
  refIndex: number;
  onRefChange: (index: number) => void;
  metric: number;
  onMetricChange: (index: number) => void;
  view: CompareView;
  onViewChange: (view: CompareView) => void;
}) {
  return (
    <div className={styles.toolbar}>
      <label className={styles.referenceLabel}>
        <span className={styles.toolbarLabel}>Reference file</span>
        <select value={refIndex} onChange={(e) => onRefChange(Number(e.target.value))} className={styles.referenceSelect}>
          {files.map((file, k) => <option key={file.id} value={k}>{`${labels[k]} · ${file.id}`}</option>)}
        </select>
      </label>

      <div role="group" aria-label="Metric" className={styles.metricGroup}>
        <span className={classNames(styles.toolbarLabel, styles.metricLabel)} aria-hidden>Metric</span>
        {columns.map((column, k) => (
          <PillButton key={column.name} pressed={k === metric} onClick={() => onMetricChange(k)}>
            {metricLabel(column.name)}
          </PillButton>
        ))}
      </div>

      <div role="group" aria-label="View" className={styles.viewSwitch}>
        {(Object.keys(VIEW_LABELS) as CompareView[]).map((v) => (
          <PillButton key={v} pressed={view === v} onClick={() => onViewChange(v)}>{VIEW_LABELS[v]}</PillButton>
        ))}
      </div>
    </div>
  );
}

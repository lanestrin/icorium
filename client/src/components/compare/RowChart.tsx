import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { fmtDelta, fmtValue, metricLabel, yDomain } from '../../lib/compare-view';
import { FILE_COLORS } from './fileColors';
import styles from './compare.module.css';

/** Line chart of a numeric metric across rows, one line per file, optionally as the deviation from 100%. */
export function RowChart({ col, result, labels, deviation, setDeviation }: {
  col: CompareColumn; result: CompareResult; labels: string[]; deviation: boolean; setDeviation?: (on: boolean) => void;
}) {
  const { files, rows } = result;
  const shown = (value: number | string | null) => (deviation && typeof value === 'number' ? value - 100 : value);
  // One chart point per row: its label, then each file's value as f0, f1, ...
  const data = rows.map((row, i) => Object.fromEntries([['label', row.label.replace(/^#/, '')], ...col.values[i].map((value, k) => [`f${k}`, shown(value)])]));
  const domain = yDomain(col.values.flat().map(shown));
  const unit = deviation ? 'pp' : col.unit;
  const xAxisLabel = result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row #';
  const formatTick = (value: number) => (unit === '%' ? `${value}%` : String(value));
  const formatTooltip = (value: unknown) => (deviation ? fmtDelta(Number(value), 'pp') : fmtValue(Number(value), col.unit));

  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h3 className={styles.panelTitle}>{metricLabel(col.name)} by row{deviation && ', deviation from 100%'}</h3>
          <p className={styles.muted}>All {files.length} files across {rows.length} rows. Gaps are blank values or rows a file lacks.</p>
        </div>
        {setDeviation && (
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={deviation} onChange={(e) => setDeviation(e.target.checked)} className={styles.checkbox} />
            Show deviation from 100%
          </label>
        )}
      </div>
      <div className="mt-2 h-72">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd"
              label={{ value: xAxisLabel, position: 'insideBottom', offset: -5, fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11 }} domain={domain ?? ['auto', 'auto']} allowDataOverflow={false} tickFormatter={formatTick} />
            {deviation && <ReferenceLine y={0} stroke="#94a3b8" />}
            <Tooltip formatter={formatTooltip} />
            <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 12 }} />
            {files.map((file, k) => (
              <Line key={file.id} dataKey={`f${k}`} name={labels[k]} stroke={FILE_COLORS[k]} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

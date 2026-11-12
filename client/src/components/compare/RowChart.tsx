import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompareColumn, CompareResult } from '../../../../shared/types';
import { fmtDelta, fmtValue, metricLabel, yDomain } from '../../lib/compare-view';
import { FILE_COLORS } from './styles';

/** Line chart of a numeric metric across rows, one line per file, optionally as the deviation from 100%. */
export function RowChart({ col, result, labels, deviation, setDeviation }: {
  col: CompareColumn; result: CompareResult; labels: string[]; deviation: boolean; setDeviation?: (on: boolean) => void;
}) {
  const { files, rows } = result;
  const shown = (v: number | string | null) => (deviation && typeof v === 'number' ? v - 100 : v);
  const data = rows.map((r, i) => Object.fromEntries([['label', r.label.replace(/^#/, '')], ...col.values[i].map((v, k) => [`f${k}`, shown(v)])]));
  const domain = yDomain(col.values.flat().map(shown));
  const unit = deviation ? 'pp' : col.unit;
  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h3 className="text-lg font-semibold">{metricLabel(col.name)} by row{deviation && ', deviation from 100%'}</h3>
          <p className="text-sm text-slate-500">All {files.length} files across {rows.length} rows. Gaps are blank values or rows a file lacks.</p>
        </div>
        {setDeviation && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deviation} onChange={(e) => setDeviation(e.target.checked)} className="h-4 w-4 accent-blue-600" />
            Show deviation from 100%
          </label>
        )}
      </div>
      <div className="mt-2 h-72">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd"
              label={{ value: result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row #', position: 'insideBottom', offset: -5, fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11 }} domain={domain ?? ['auto', 'auto']} allowDataOverflow={false}
              tickFormatter={(v) => (unit === '%' ? `${v}%` : String(v))} />
            {deviation && <ReferenceLine y={0} stroke="#94a3b8" />}
            <Tooltip formatter={(v) => (deviation ? fmtDelta(Number(v), 'pp') : fmtValue(Number(v), col.unit))} />
            <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 12 }} />
            {files.map((f, k) => <Line key={f.id} dataKey={`f${k}`} name={labels[k]} stroke={FILE_COLORS[k]} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

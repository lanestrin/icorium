import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompareColumn, CompareFile } from '../../../../shared/types';
import { metricLabel } from '../../lib/compare-view';
import { FILE_COLORS } from './styles';

/** Bar chart and table of how many rows in each file fall in each category. */
export function CategoryChart({ col, files, labels }: { col: CompareColumn; files: CompareFile[]; labels: string[] }) {
  const cats = col.categories ?? [];
  const data = cats.map((c) => Object.fromEntries([['label', c.label], ...c.counts.map((n, k) => [`f${k}`, n])]));
  return (
    <>
      <h3 className="text-lg font-semibold">{metricLabel(col.name)}: rows per category</h3>
      <p className="text-sm text-slate-500">How many rows in each file fall in each category.</p>
      <div style={{ height: Math.max(220, cats.length * files.length * 16 + 80) }}>
        <ResponsiveContainer>
          {/* Horizontal bars: long category names stay readable. */}
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => `${v} rows`} />
            <Legend verticalAlign="bottom" />
            {files.map((f, k) => <Bar key={f.id} dataKey={`f${k}`} name={labels[k]} fill={FILE_COLORS[k]} radius={[0, 4, 4, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table aria-label="Rows per category" className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>Category</th>
              {files.map((f, k) => <th key={f.id} className="text-right">{labels[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.label} className="border-t border-slate-100 [&>td]:px-3 [&>td]:py-2">
                <td className="font-medium">{c.label}</td>
                {c.counts.map((n, k) => <td key={files[k].id} className="text-right">{n}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompareColumn, CompareFile } from '../../../../shared/types';
import { metricLabel } from '../../lib/compare-view';
import { FILE_COLORS } from './fileColors';
import styles from './compare.module.css';

/** Bar chart and table of how many rows in each file fall in each category. */
export function CategoryChart({ col, files, labels }: { col: CompareColumn; files: CompareFile[]; labels: string[] }) {
  const categories = col.categories ?? [];
  // One bar group per category: its label, then each file's count as f0, f1, ...
  const data = categories.map((c) => Object.fromEntries([['label', c.label], ...c.counts.map((count, k) => [`f${k}`, count])]));
  const chartHeight = Math.max(220, categories.length * files.length * 16 + 80);

  return (
    <>
      <h3 className={styles.panelTitle}>{metricLabel(col.name)}: rows per category</h3>
      <p className={styles.muted}>How many rows in each file fall in each category.</p>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer>
          {/* Horizontal bars: long category names stay readable. */}
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => `${value} rows`} />
            <Legend verticalAlign="bottom" />
            {files.map((file, k) => <Bar key={file.id} dataKey={`f${k}`} name={labels[k]} fill={FILE_COLORS[k]} radius={[0, 4, 4, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table aria-label="Rows per category" className="w-full text-sm">
          <thead>
            <tr className="table-head-row">
              <th>Category</th>
              {files.map((file, k) => <th key={file.id} className="text-right">{labels[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.label} className="table-row">
                <td className="font-medium">{c.label}</td>
                {c.counts.map((count, k) => <td key={files[k].id} className="text-right">{count}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompareColumn, CompareFile } from '../../../../shared/types';
import { metricLabel } from '../../lib/compare-view';
import { FILE_COLORS } from './fileColors';
import tables from '../../styles/tables.module.scss';
import styles from './compare.module.scss';

/** The same min-width as the sm breakpoint in styles/_mixins.scss (media queries can't share it with TypeScript). */
const SM_UP = '(min-width: 40rem)';
const SHORT_LABEL = 16;

/**
 * The category axis: 180px of labels from sm up; on phones 110px, with long labels shortened so the bars keep
 * room. The tooltip still shows the full label.
 */
export function categoryAxis(wide: boolean) {
  if (wide) return { width: 180, tickFormatter: (label: string) => label };
  return { width: 110, tickFormatter: (label: string) => (label.length > SHORT_LABEL ? `${label.slice(0, SHORT_LABEL - 1)}…` : label) };
}

/** Bar chart and table of how many rows in each file fall in each category. */
export function CategoryChart({ col, files, labels }: { col: CompareColumn; files: CompareFile[]; labels: string[] }) {
  const categories = col.categories ?? [];
  // One bar group per category: its label, then each file's count as f0, f1, ...
  const data = categories.map((c) => Object.fromEntries([['label', c.label], ...c.counts.map((count, k) => [`f${k}`, count])]));
  const chartHeight = Math.max(220, categories.length * files.length * 16 + 80);
  const axis = categoryAxis(window.matchMedia(SM_UP).matches);

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
            <YAxis type="category" dataKey="label" width={axis.width} tickFormatter={axis.tickFormatter} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => `${value} rows`} />
            <Legend verticalAlign="bottom" />
            {files.map((file, k) => <Bar key={file.id} dataKey={`f${k}`} name={labels[k]} fill={FILE_COLORS[k]} radius={[0, 4, 4, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.tableScroll}>
        <table aria-label="Rows per category" className={tables.table}>
          <thead>
            <tr className={tables.headRow}>
              <th>Category</th>
              {files.map((file, k) => <th key={file.id} className={tables.numeric}>{labels[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.label} className={tables.row}>
                <td className={styles.labelCell}>{c.label}</td>
                {c.counts.map((count, k) => <td key={files[k].id} className={tables.numeric}>{count}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { useId, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COMPARE_MAX, COMPARE_MIN, PROCESSORS, type CompareColumn, type CompareFile, type CompareResult, type FileMeta } from '../../../shared/types';
import { Modal } from './Modals';

/** One colour per compared file, in order. A file keeps its colour in every card, chart and table. */
export const FILE_COLORS = ['#2563eb', '#f59e0b', '#14b8a6', '#a855f7', '#ef4444'];

/** Why the selected files can't be compared, or undefined when they can. */
export function compareBlocker(selected: FileMeta[]): string | undefined {
  if (selected.some((f) => f.status !== 'Processed')) return 'Comparison uses result files only. Unselect input files to compare.';
  if (selected.length < COMPARE_MIN) return `Select at least ${COMPARE_MIN} results to compare.`;
  if (selected.length > COMPARE_MAX) return `Compare up to ${COMPARE_MAX} results at a time.`;
  if (new Set(selected.map((f) => f.processor)).size > 1) return 'Pick results from the same function.';
  return undefined;
}

/** "composition_total_pct" -> "Composition total (%)", "r32_mass_kg" -> "R32 mass (kg)". */
export function metricLabel(name: string) {
  const unit = name.endsWith('_pct') ? ' (%)' : name.endsWith('_kg') ? ' (kg)' : '';
  const words = name.replace(/_(pct|kg)$/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1) + unit;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Short labels such as "Partner A · Baseline": the partner, then what is left of the result name
 * once "result_", the partner and the function are removed. Falls back to the file name when two
 * files would otherwise share a label (e.g. a renamed copy).
 */
export function fileLabels(files: Pick<CompareFile, 'name' | 'source'>[], processor: string) {
  const labels = files.map((f) => {
    const base = f.name.replace(/^result_/i, '').replace(new RegExp(`_${processor}\\.csv$`, 'i'), '').replace(/\.csv$/i, '');
    if (!f.source) return base;
    const slug = `${f.source.toLowerCase().replace(/\s+/g, '_')}_`;
    const rest = base.toLowerCase().startsWith(slug) ? base.slice(slug.length) : base;
    return `${f.source} · ${capitalize(rest.replace(/_/g, ' '))}`;
  });
  return labels.map((l, k) => (labels.indexOf(l) !== labels.lastIndexOf(l) ? files[k].name : l));
}

/** Each file's summary minus the reference file's; null for the reference itself or a missing value. */
export function deltas(summary: (number | null)[], ref: number) {
  return summary.map((v, k) => (k === ref || v === null || summary[ref] === null ? null : v - summary[ref]!));
}

/** Percentages differ in percentage points; masses in kg. */
export const deltaUnit = (col: Pick<CompareColumn, 'unit'>) => (col.unit === '%' ? 'pp' : col.unit ?? '');

const num = (v: number, digits = 2) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** "100.00%", "123.45 kg", or a plain number. */
export const fmtValue = (v: number | null | undefined, unit?: string) =>
  v == null ? '—' : unit === '%' ? `${num(v)}%` : unit ? `${num(v)} ${unit}` : num(v);
/** "+1.27 pp", "-0.50 pp", "—". */
export const fmtDelta = (v: number | null, unit: string) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${num(v)}${unit ? ` ${unit}` : ''}`;

/** Composition totals read better as distance from 100%, since most rows are exactly 100. */
const canShowDeviation = (col: CompareColumn) => col.kind === 'numeric' && col.unit === '%' && col.name.includes('total');
const processorLabel = (id: string) => PROCESSORS.find((p) => p.id === id)?.label ?? id;

type View = 'overview' | 'rows';

export function CompareWorkspace({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const { files, rows, columns } = result;
  const labels = useMemo(() => fileLabels(files, result.processor), [files, result.processor]);
  const [metric, setMetric] = useState(0);
  const [view, setView] = useState<View>('overview');
  const [ref, setRef] = useState(0);
  const [deviation, setDeviation] = useState(false);
  const [onlyDiffering, setOnlyDiffering] = useState(false);
  const metricName = useId();
  const col = columns[metric];

  const counts = [...new Set(files.map((f) => f.rows))];
  const rowsText = counts.length === 1 ? `${counts[0]} rows each` : `${Math.min(...counts)}–${Math.max(...counts)} rows`;
  const matched = result.rowMatch === 'batch_id'
    ? 'Rows matched by batch ID.'
    : 'Rows matched by position: these files share no batch IDs, so row 1 is compared with row 1, and so on.';

  return (
    <Modal
      full
      title="Compare Files"
      subtitle={`${processorLabel(result.processor)} · ${files.length} files · ${rowsText}`}
      actions={<span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{files.length} files</span>}
      onClose={onClose}
    >
      <ul aria-label="Compared files" className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-5">
        {files.map((f, k) => (
          <li key={f.id} className="min-w-0 rounded-xl border border-slate-200 px-4 py-3" title={f.name}>
            <p className="flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FILE_COLORS[k] }} aria-hidden />
              <span className="truncate">{labels[k]}</span>
            </p>
            <p className="truncate text-xs text-slate-500">{f.name}</p>
            <p className={`mt-1 text-sm ${f.problems.total ? 'text-amber-700' : 'text-green-700'}`}>{f.problems.total} flagged</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-500">{matched}</p>

      <fieldset className="mt-5">
        <legend className="mb-2 font-semibold">Compare metric</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {columns.map((c, k) => (
            <label key={c.name} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name={metricName} checked={k === metric} onChange={() => { setMetric(k); setDeviation(false); }} className="h-4 w-4 accent-blue-600" />
              {metricLabel(c.name)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <div role="group" aria-label="View" className="flex rounded-lg bg-slate-100 p-1">
          {(['overview', 'rows'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${view === v ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
              {v === 'overview' ? 'Overview' : 'Row details'}
            </button>
          ))}
        </div>
        {view === 'rows' && col && canShowDeviation(col) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deviation} onChange={(e) => setDeviation(e.target.checked)} className="h-4 w-4 accent-blue-600" />
            Show deviation from 100%
          </label>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-slate-600">Reference</span>
          <select value={ref} onChange={(e) => setRef(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            {files.map((f, k) => <option key={f.id} value={k}>{labels[k]}</option>)}
          </select>
        </label>
      </div>

      {col && view === 'overview' && <Overview col={col} files={files} labels={labels} refIndex={ref} rowsCompared={rows.length} />}
      {col && view === 'rows' && (
        <RowDetails col={col} result={result} labels={labels} refIndex={ref} deviation={deviation && canShowDeviation(col)}
          onlyDiffering={onlyDiffering} setOnlyDiffering={setOnlyDiffering} />
      )}
    </Modal>
  );
}

function Overview({ col, files, labels, refIndex, rowsCompared }: { col: CompareColumn; files: CompareFile[]; labels: string[]; refIndex: number; rowsCompared: number }) {
  const name = metricLabel(col.name);

  if (col.kind === 'category') {
    const cats = col.categories ?? [];
    const data = cats.map((c) => Object.fromEntries([['label', c.label], ...c.counts.map((n, k) => [`f${k}`, n])]));
    return (
      <section aria-label="Overview" className="mt-5">
        <h3 className="font-semibold">{name}: rows per category</h3>
        <p className="text-sm text-slate-500">How many rows in each file fall in each category.</p>
        <div style={{ height: Math.max(220, cats.length * files.length * 16 + 80) }}>
          <ResponsiveContainer>
            {/* Horizontal bars: long category names stay readable. */}
            <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v} rows`} />
              <Legend verticalAlign="top" />
              {files.map((f, k) => <Bar key={f.id} dataKey={`f${k}`} name={labels[k]} fill={FILE_COLORS[k]} radius={[0, 4, 4, 0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <h3 className="mt-6 mb-2 font-semibold">File summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
      </section>
    );
  }

  const summary = col.summary ?? [];
  const delta = deltas(summary, refIndex);
  const measure = col.measure === 'total' ? 'Total' : 'Mean';
  const data = files.map((f, k) => ({ label: labels[k], value: summary[k] }));
  return (
    <section aria-label="Overview" className="mt-5">
      <h3 className="font-semibold">{col.measure === 'total' ? 'Total' : 'Average'} {name.charAt(0).toLowerCase() + name.slice(1)}</h3>
      <p className="text-sm text-slate-500">{measure} of each file's values across up to {rowsCompared} matched rows.</p>
      <div className="h-72">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: col.unit ?? '', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }} />
            <Tooltip formatter={(v) => fmtValue(Number(v), col.unit)} />
            <Bar dataKey="value" name={measure} radius={[6, 6, 0, 0]}>
              {files.map((f, k) => <Cell key={f.id} fill={FILE_COLORS[k]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h3 className="mt-6 mb-2 font-semibold">File summary</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>File</th><th className="text-right">{measure}</th><th className="text-right">Δ vs ref.</th><th className="text-right">Errors</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, k) => (
              <tr key={f.id} className="border-t border-slate-100 [&>td]:px-3 [&>td]:py-2">
                <td className="font-medium">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: FILE_COLORS[k] }} aria-hidden />
                  {labels[k]}{k === refIndex && ' *'}
                </td>
                <td className="text-right">{fmtValue(summary[k], col.unit)}</td>
                <td className="text-right">{fmtDelta(delta[k], deltaUnit(col))}</td>
                <td className="text-right">{f.problems.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        * Reference file. Δ is measured against the selected reference.{col.unit === '%' && ' pp = percentage points.'}
      </p>
    </section>
  );
}

function RowDetails({ col, result, labels, refIndex, deviation, onlyDiffering, setOnlyDiffering }: {
  col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number; deviation: boolean;
  onlyDiffering: boolean; setOnlyDiffering: (on: boolean) => void;
}) {
  const { files, rows } = result;
  const numeric = col.kind === 'numeric';
  const shown = (v: number | string | null) => (deviation && typeof v === 'number' ? v - 100 : v);
  const differs = (r: number, k: number) => k !== refIndex && col.values[r][k] !== col.values[r][refIndex];
  const rowDiffers = (r: number) => files.some((_, k) => differs(r, k)) || rows[r].rowNumbers.some((n) => n === null);
  const indexes = rows.map((_, r) => r).filter((r) => !onlyDiffering || rowDiffers(r));
  const unit = deviation ? 'pp' : col.unit;
  const data = rows.map((r, i) => Object.fromEntries([['label', r.key], ...col.values[i].map((v, k) => [`f${k}`, shown(v)])]));
  const keyHeader = result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row';

  const cell = (r: number, k: number) => {
    if (rows[r].rowNumbers[k] === null) return 'not in file';
    const v = shown(col.values[r][k]);
    if (typeof v === 'number') return deviation ? fmtDelta(v, 'pp') : fmtValue(v, col.unit);
    return v === null || v === '' ? '—' : v;
  };

  return (
    <section aria-label="Row details" className="mt-5">
      {numeric && (
        <>
          <h3 className="font-semibold">{metricLabel(col.name)} per row{deviation && ', deviation from 100%'}</h3>
          <p className="text-sm text-slate-500">One line per file. Gaps are blank values or rows a file does not have.</p>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} label={{ value: unit ?? '', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }} />
                {deviation && <ReferenceLine y={0} stroke="#94a3b8" />}
                <Tooltip formatter={(v) => (deviation ? fmtDelta(Number(v), 'pp') : fmtValue(Number(v), col.unit))} />
                <Legend verticalAlign="top" />
                {files.map((f, k) => <Line key={f.id} dataKey={`f${k}`} name={labels[k]} stroke={FILE_COLORS[k]} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Rows</h3>
        <p className="text-sm text-slate-500">
          {col.rowsDiffering} of {col.rowsCompared} rows differ between files. Highlighted cells differ from the reference file.
        </p>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyDiffering} onChange={(e) => setOnlyDiffering(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Only rows that differ
        </label>
      </div>
      <div className="mt-2 max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left [&>th]:sticky [&>th]:top-0 [&>th]:whitespace-nowrap [&>th]:bg-slate-50 [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>{keyHeader}</th>
              {files.map((f, k) => (
                <th key={f.id} className={numeric ? 'text-right' : ''}>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: FILE_COLORS[k] }} aria-hidden />
                  {labels[k]}{k === refIndex && ' *'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indexes.map((r) => (
              <tr key={rows[r].key} className="border-t border-slate-100 [&>td]:px-3 [&>td]:py-1.5">
                <th scope="row" className="whitespace-nowrap px-3 text-left font-medium">{rows[r].key}</th>
                {files.map((f, k) => (
                  <td key={f.id} data-differs={differs(r, k) || undefined}
                    className={`${numeric ? 'text-right' : ''} ${differs(r, k) ? 'bg-amber-50 text-amber-900' : ''} ${rows[r].rowNumbers[k] === null ? 'italic text-slate-400' : ''}`}>
                    {cell(r, k)}
                  </td>
                ))}
              </tr>
            ))}
            {!indexes.length && (
              <tr><td colSpan={files.length + 1} className="py-8 text-center text-slate-500">No rows differ for this metric.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

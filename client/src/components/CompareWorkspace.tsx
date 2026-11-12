import { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronRight, CircleCheck, Layers, TriangleAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PROCESSORS, type CompareColumn, type CompareFile, type CompareResult } from '../../../shared/types';
import { deltas, deltaUnit, differsFromRef, fileLabels, fmtDelta, fmtValue, metricLabel, topDifferences, yDomain } from '../lib/compare-view';
import { Modal } from './Modals';

/** One colour per compared file, in order. A file keeps its colour in every chip, chart and table. */
const FILE_COLORS = ['#2563eb', '#f59e0b', '#16a34a', '#9333ea', '#ec4899'];

const canShowDeviation = (col: CompareColumn) => col.kind === 'numeric' && col.unit === '%' && col.name.includes('total');
const processorLabel = (id: string) => PROCESSORS.find((p) => p.id === id)?.label ?? id;
const Dot = ({ k, size = 'h-2.5 w-2.5' }: { k: number; size?: string }) =>
  <span className={`inline-block shrink-0 rounded-full ${size}`} style={{ background: FILE_COLORS[k] }} aria-hidden />;

const CARD = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';
const PILL = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-medium transition ${on ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;

type View = 'overview' | 'rows';

export function CompareWorkspace({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const { files, rows, columns } = result;
  const labels = useMemo(() => fileLabels(files, result.processor), [files, result.processor]);
  const [metric, setMetric] = useState(0);
  const [view, setView] = useState<View>('overview');
  const [ref, setRef] = useState(0);
  const [deviation, setDeviation] = useState(false);
  const [onlyDiffering, setOnlyDiffering] = useState(true);
  const col = columns[metric];
  const matched = result.rowMatch === 'batch_id'
    ? 'Rows matched by batch ID.'
    : 'Rows matched by position: these files share no batch IDs, so row 1 is compared with row 1, and so on.';

  return (
    <Modal full title="Compare Files" subtitle={`${files.length} files · ${processorLabel(result.processor)}`} onClose={onClose}>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3">
        <h3 className="mr-2 font-semibold">Selected files ({files.length})</h3>
        <ul aria-label="Compared files" className="flex flex-wrap gap-2">
          {files.map((f, k) => (
            <li key={f.id} title={f.name} className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm">
              <Dot k={k} />
              <span className="truncate">{labels[k]}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{f.id}</span>
              {f.problems.total
                ? <TriangleAlert className="h-4 w-4 shrink-0 text-red-500" aria-label={`${f.problems.total} flagged`} />
                : <CircleCheck className="h-4 w-4 shrink-0 text-green-600" aria-label="0 flagged" />}
            </li>
          ))}
        </ul>
        <p className="w-full text-sm text-slate-500">{matched}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-3">
          <span className="font-semibold">Reference file</span>
          <select value={ref} onChange={(e) => setRef(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
            {files.map((f, k) => <option key={f.id} value={k}>{`${labels[k]} · ${f.id}`}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Metric" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-semibold" aria-hidden>Metric</span>
          {columns.map((c, k) => (
            <button key={c.name} aria-pressed={k === metric} onClick={() => { setMetric(k); setDeviation(false); }} className={PILL(k === metric)}>
              {metricLabel(c.name)}
            </button>
          ))}
        </div>
        <div role="group" aria-label="View" className="flex gap-1 rounded-full bg-slate-100 p-1 lg:ml-auto">
          {(['overview', 'rows'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={PILL(view === v)}>
              {v === 'overview' ? 'Overview' : 'Row differences'}
            </button>
          ))}
        </div>
      </div>

      {col && view === 'overview' && (
        <Overview col={col} result={result} labels={labels} refIndex={ref} deviation={deviation && canShowDeviation(col)}
          setDeviation={canShowDeviation(col) ? setDeviation : undefined} showRows={() => setView('rows')} />
      )}
      {col && view === 'rows' && (
        <RowDifferences col={col} result={result} labels={labels} refIndex={ref} onlyDiffering={onlyDiffering} setOnlyDiffering={setOnlyDiffering} />
      )}
    </Modal>
  );
}

function Overview({ col, result, labels, refIndex, deviation, setDeviation, showRows }: {
  col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number; deviation: boolean;
  setDeviation?: (on: boolean) => void; showRows: () => void;
}) {
  const { files, rows } = result;
  const name = metricLabel(col.name);
  const top = topDifferences(result, col, refIndex);
  const flaggedFiles = files.filter((f) => f.problems.total > 0).length;
  const pct = col.rowsCompared ? Math.round((col.rowsDiffering / col.rowsCompared) * 100) : 0;

  return (
    <section aria-label="Overview" className="mt-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className={CARD}>
          {col.kind === 'numeric'
            ? <RowChart col={col} result={result} labels={labels} deviation={deviation} setDeviation={setDeviation} />
            : <CategoryChart col={col} files={files} labels={labels} />}
        </div>
        <SummaryByFile col={col} result={result} labels={labels} refIndex={refIndex} />
      </div>

      <div className={`${CARD} grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]`}>
        <div>
          <h3 className="mb-3 text-lg font-semibold">Comparison at a glance</h3>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600"><Layers className="h-4 w-4 text-blue-600" aria-hidden /> Reference file</dt>
              <dd className="mt-1 truncate font-semibold" title={files[refIndex].name}>{labels[refIndex]}</dd>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50 p-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600"><ArrowLeftRight className="h-4 w-4 text-green-600" aria-hidden /> Rows differing</dt>
              <dd className="mt-1 font-semibold">{col.rowsDiffering} / {col.rowsCompared} <span className="text-sm font-normal text-slate-500">({pct}%)</span></dd>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <dt className="flex items-center gap-2 text-sm text-slate-600"><TriangleAlert className="h-4 w-4 text-red-500" aria-hidden /> Flagged files</dt>
              <dd className="mt-1 font-semibold text-red-700">{flaggedFiles} / {files.length}</dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold">Top differences <span className="text-sm font-normal text-slate-500">({top.length} {top.length === 1 ? 'row' : 'rows'})</span></h3>
            <button onClick={showRows} className="ml-auto flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
              View all row details <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {top.length ? (
            <div className="overflow-x-auto">
              <table aria-label="Top differences" className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                    <th>{result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row'}</th><th>Key difference</th><th>Files affected</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((d) => (
                    <tr key={d.key} className="border-t border-slate-100 [&>td]:px-3 [&>td]:py-2">
                      <td className="whitespace-nowrap font-medium">{d.label}</td>
                      <td><span className="rounded-md bg-red-50 px-2 py-0.5 text-red-700">{d.text}</span></td>
                      <td>
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {d.files.map((k) => <span key={k} className="flex items-center gap-1.5 whitespace-nowrap"><Dot k={k} />{labels[k]}</span>)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No row differs from the reference file for {name.toLowerCase()}.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Rows compared: {rows.length}.</p>
        </div>
      </div>
    </section>
  );
}

function RowChart({ col, result, labels, deviation, setDeviation }: {
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

function CategoryChart({ col, files, labels }: { col: CompareColumn; files: CompareFile[]; labels: string[] }) {
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

function SummaryByFile({ col, result, labels, refIndex }: { col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number }) {
  const { files, rows } = result;
  const numeric = col.kind === 'numeric';
  const summary = col.summary ?? [];
  const delta = deltas(summary, refIndex);
  const valueHeader = `${col.measure === 'total' ? 'Total' : 'Mean'}${col.unit ? ` (${col.unit})` : ''}`;
  const differing = files.map((_, k) => rows.filter((_, r) => differsFromRef(col, r, k, refIndex)).length);
  const flagged = (n: number) => (
    <span className={`inline-block min-w-7 rounded-md px-2 py-0.5 text-center font-medium ${n ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{n}</span>
  );
  return (
    <div className={CARD}>
      <h3 className="mb-3 text-lg font-semibold">Summary by file</h3>
      <div className="overflow-x-auto">
        <table aria-label="Summary by file" className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>File</th>
              {numeric ? <><th className="text-right">{valueHeader}</th><th className="text-right">Δ vs ref.</th></> : <th className="text-right">Rows differing from ref.</th>}
              <th className="text-right">Flagged rows</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, k) => (
              <tr key={f.id} className={`border-t border-slate-100 [&>td]:px-3 [&>td]:py-2 ${k === refIndex ? 'bg-blue-50/60' : ''}`}>
                <td className="font-medium">
                  <span className="flex items-center gap-2" title={f.name}>
                    <Dot k={k} />{labels[k]}{k === refIndex && <span className="font-normal text-slate-500">(ref)</span>}
                  </span>
                </td>
                {numeric
                  ? <><td className="text-right">{fmtValue(summary[k], col.unit === '%' ? undefined : col.unit)}</td><td className="text-right">{fmtDelta(delta[k], deltaUnit(col))}</td></>
                  : <td className="text-right">{k === refIndex ? '—' : differing[k]}</td>}
                <td className="text-right">{flagged(f.problems.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {numeric && col.unit === '%' && <p className="mt-2 text-xs text-slate-500">Δ is measured against the reference file. pp = percentage points.</p>}
    </div>
  );
}

function RowDifferences({ col, result, labels, refIndex, onlyDiffering, setOnlyDiffering }: {
  col: CompareColumn; result: CompareResult; labels: string[]; refIndex: number;
  onlyDiffering: boolean; setOnlyDiffering: (on: boolean) => void;
}) {
  const { files, rows } = result;
  const numeric = col.kind === 'numeric';
  const rowDiffers = (r: number) => files.some((_, k) => differsFromRef(col, r, k, refIndex)) || rows[r].rowNumbers.some((n) => n === null);
  const indexes = rows.map((_, r) => r).filter((r) => !onlyDiffering || rowDiffers(r));

  const cell = (r: number, k: number) => {
    if (rows[r].rowNumbers[k] === null) return 'not in file';
    const v = col.values[r][k];
    if (typeof v === 'number') return fmtValue(v, col.unit);
    return v === null || v === '' ? '—' : v;
  };

  return (
    <section aria-label="Row differences" className={`${CARD} mt-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold">{metricLabel(col.name)}: row differences</h3>
        <p className="text-sm text-slate-500">
          {col.rowsDiffering} of {col.rowsCompared} rows differ between files. Highlighted cells differ from the reference file.
        </p>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyDiffering} onChange={(e) => setOnlyDiffering(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Only rows that differ
        </label>
      </div>
      <div className="mt-3 max-h-[32rem] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left [&>th]:sticky [&>th]:top-0 [&>th]:whitespace-nowrap [&>th]:bg-slate-50 [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>{result.rowMatch === 'batch_id' ? 'Batch ID' : 'Row'}</th>
              {files.map((f, k) => (
                <th key={f.id} className={numeric ? 'text-right' : ''}>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: FILE_COLORS[k] }} aria-hidden />
                  {labels[k]}{k === refIndex && ' (ref)'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indexes.map((r) => (
              <tr key={rows[r].key} className="border-t border-slate-100 [&>td]:px-3 [&>td]:py-1.5">
                <th scope="row" className="whitespace-nowrap px-3 text-left font-medium">{rows[r].label}</th>
                {files.map((f, k) => {
                  const differs = differsFromRef(col, r, k, refIndex);
                  return (
                    <td key={f.id} data-differs={differs || undefined}
                      className={`${numeric ? 'text-right' : ''} ${differs ? 'bg-amber-50 text-amber-900' : ''} ${rows[r].rowNumbers[k] === null ? 'italic text-slate-400' : ''}`}>
                      {cell(r, k)}
                    </td>
                  );
                })}
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

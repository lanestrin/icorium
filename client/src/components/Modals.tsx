import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Download, TriangleAlert, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PROCESSORS, type CompareColumn, type CompareResult, type FileMeta, type FileRows, type ProblemList, type ProcessorId } from '../../../shared/types';
import { api } from '../api';
import type { QualityWarning } from './FileTable';

/** "1 row", "3 rows", or with a qualifier "1 valid row". */
const rowsWord = (n: number, kind?: string) => `${n.toLocaleString()} ${kind ? `${kind} ` : ''}${n === 1 ? 'row' : 'rows'}`;

/** "Row 8 · A-008: mass missing", one per problem row. */
function ProblemItems({ list }: { list: ProblemList }) {
  return (
    <ul className="max-h-32 space-y-1 overflow-auto text-sm">
      {list.items.map((p) => (
        <li key={p.row}>
          <span className="font-semibold">Row {p.row}</span>
          {p.batchId && <span> · {p.batchId}</span>}: {p.message}
        </li>
      ))}
      {list.total > list.items.length && <li className="opacity-75">…and {rowsWord(list.total - list.items.length)} more</li>}
    </ul>
  );
}

/** One file's problem rows in the comparison, marked with that file's chart colour. */
function ProblemCard({ side, name, list, color }: { side: string; name: string; list: ProblemList; color: string }) {
  return (
    <section aria-label={`Problems in ${side} · ${name}`} className="min-w-0 rounded-xl border border-slate-200 px-4 py-3">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <span className="truncate">{side} · {name}</span>
        {list.total ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800">
            <TriangleAlert className="h-3.5 w-3.5" /> {rowsWord(list.total)} flagged
          </span>
        ) : (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs text-green-700">
            <CircleCheck className="h-3.5 w-3.5" /> No problems
          </span>
        )}
      </h3>
      {list.total > 0 && <div className="text-amber-900"><ProblemItems list={list} /></div>}
    </section>
  );
}

const processorLabel = (id?: string) => PROCESSORS.find((p) => p.id === id)?.label ?? '';
const fmt = (v?: number | null) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));
const withUnit = (c: CompareColumn) => (c.unit ? ` (${c.unit})` : '');
const measureLabel = (c: CompareColumn) =>
  c.measure === 'count' ? 'Rows per category (see chart)' : `${c.measure === 'total' ? 'Total' : 'Mean'} across rows${withUnit(c)}`;

const FOCUSABLE = 'a[href],button:not([disabled]),select,input,[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus moves in on open, Tab stays inside, Escape closes, focus returns on close. */
function Modal({ title, subtitle, actions, narrow, onClose, children }: { title: string; subtitle?: string; actions?: ReactNode; narrow?: boolean; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[88vh] w-full ${narrow ? 'max-w-lg' : 'max-w-6xl'} flex-col rounded-2xl bg-white shadow-2xl outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions}
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

/** Asks before Mass or Classification calculates only the valid rows of files with invalid rows. */
export function QualityWarningModal({ warning, processor, onCancel, onConfirm }: {
  warning: QualityWarning; processor: ProcessorId; onCancel: () => void; onConfirm: () => void;
}) {
  const others = warning.cleanCount;
  return (
    <Modal title="Data Quality Warning" subtitle={processorLabel(processor)} narrow onClose={onCancel}>
      <div className="flex items-start gap-3 pt-5 text-amber-900">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p>Valid rows will be calculated. Invalid rows will remain in the output with error details and no calculated values.</p>
      </div>
      <ul aria-label="Files with invalid rows" className="mt-4 max-h-60 space-y-2 overflow-auto">
        {warning.affected.map((f) => (
          <li key={f.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
            <span className="block break-all font-semibold text-slate-900">{f.name}</span>
            <span className="text-slate-700">{rowsWord(f.valid, 'valid')} · </span>
            <span className="font-medium text-amber-800">{rowsWord(f.invalid, 'invalid')}</span>
          </li>
        ))}
      </ul>
      {others > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          {others} other selected {others === 1 ? 'file has' : 'files have'} no invalid rows and will be processed normally.
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        <button onClick={onConfirm} className="rounded-xl bg-green-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-green-700">Process Valid Rows</button>
      </div>
    </Modal>
  );
}

const PAGE = 100; // rows loaded per "Show more"

export function PreviewModal({ file, onClose }: { file: FileMeta; onClose: () => void }) {
  const [data, setData] = useState<FileRows>();
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { api.rows(file.id, 0, PAGE).then(setData).catch((e) => setError(e.message)); }, [file.id]);
  const gen = new Set(data?.generatedColumns);
  const remaining = data ? data.totalRows - data.rows.length : 0;
  const flagged = new Map(data?.problems.items.map((p) => [p.row, p.message])); // row number -> problem

  async function showMore() {
    if (!data) return;
    setLoadingMore(true);
    try {
      const next = await api.rows(file.id, data.rows.length, PAGE);
      setData({ ...next, rows: [...data.rows, ...next.rows] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Modal
      title={file.name}
      subtitle={file.status === 'Processed'
        ? `${processorLabel(file.processor)} result · ${file.rows} rows · generated columns highlighted`
        : `${file.rows} rows · ${file.columns} columns`}
      onClose={onClose}
      actions={
        <a href={api.downloadUrl(file.id)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
          <Download className="h-4 w-4" /> Download CSV
        </a>
      }
    >
      {error && <p className="pt-6 text-red-600">{error}</p>}
      {!data && !error && <p className="pt-6 text-slate-500">Loading…</p>}
      {data && data.problems.total > 0 && (
        <section aria-label="Rows with problems" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <h3 className="mb-1 flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4" /> {rowsWord(data.problems.total)} with problems in this file
          </h3>
          <ProblemItems list={data.problems} />
        </section>
      )}
      {data && (
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr>
              <th className="bg-white px-3 py-2 pt-6 text-right font-semibold text-slate-400">#</th>
              {data.headers.map((h) => (
                <th key={h} className={`whitespace-nowrap px-3 py-2 pt-6 text-left font-semibold ${gen.has(h) ? 'bg-blue-50 text-blue-800' : 'bg-white'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr
                key={i}
                title={flagged.get(i + 1)}
                className={`border-t border-slate-100 ${flagged.has(i + 1) ? 'bg-amber-50 [&>td]:bg-transparent' : ''}`}
              >
                <td className={`px-3 py-1.5 text-right tabular-nums ${flagged.has(i + 1) ? 'font-semibold text-amber-800' : 'text-slate-400'}`}>
                  {flagged.has(i + 1) && <TriangleAlert className="mr-1 inline h-3.5 w-3.5" aria-label="Problem row" />}
                  {i + 1}
                </td>
                {data.headers.map((h) => (
                  <td key={h} className={`whitespace-nowrap px-3 py-1.5 ${gen.has(h) ? 'bg-blue-50/50' : ''} ${r[h] === 'ERROR' ? 'font-semibold text-red-600' : ''}`}>{r[h]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && (
        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-500">
          <span>Showing {data.rows.length.toLocaleString()} of {data.totalRows.toLocaleString()} rows</span>
          {remaining > 0 && (
            <button onClick={showMore} disabled={loadingMore} className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {loadingMore ? 'Loading…' : `Show ${Math.min(PAGE, remaining)} more`}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

// One letter and colour per compared file, in order. A file keeps its colour in the chart and the cards.
const SIDES = ['A', 'B', 'C', 'D', 'E'];
const COLORS = ['#2563eb', '#f59e0b', '#14b8a6', '#a855f7', '#ef4444'];

export function CompareModal({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const [i, setI] = useState(0);
  const col = result.columns[i];
  const isCat = col?.kind === 'category';
  const { files } = result;
  const two = files.length === 2;
  const matched = result.rowMatch === 'batch_id' ? 'Rows matched by batch ID' : 'Rows matched by position';
  const chartData = !col ? [] : isCat
    ? (col.categories ?? []).map((c) => Object.fromEntries([['label', c.label], ...c.counts.map((n, k) => [`f${k}`, n])]))
    : result.rows.map((r, row) => Object.fromEntries([['label', r.key], ...col.values[row].map((v, k) => [`f${k}`, v])]));

  return (
    <Modal title={files.map((f) => f.name).join('  vs  ')} subtitle={`${processorLabel(result.processor)} · ${result.columns.length} generated columns compared · ${matched}`} onClose={onClose}>
      <div className="grid gap-3 pt-5 md:grid-cols-2">
        {files.map((f, k) => <ProblemCard key={f.id} side={SIDES[k]} name={f.name} list={f.problems} color={COLORS[k]} />)}
      </div>

      <div className="flex flex-wrap gap-2 pt-5">
        {result.columns.map((c, k) => (
          <button key={c.name} onClick={() => setI(k)} aria-pressed={k === i} className={`rounded-full px-4 py-1.5 text-sm font-medium ${k === i ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            {c.name}
          </button>
        ))}
      </div>

      {col && (
        <>
          <p className="mt-4 text-sm text-slate-500">
            {isCat ? 'Count of rows in each category, per file' : `Value per row${withUnit(col)}, per file. ${matched}.`}
          </p>
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: isCat ? 50 : 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={isCat ? 0 : 'preserveStartEnd'} angle={isCat ? -20 : 0} textAnchor={isCat ? 'end' : 'middle'} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  allowDecimals={!isCat}
                  label={{ value: isCat ? 'rows' : (col.unit ?? ''), angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip formatter={(v) => `${fmt(Number(v))}${isCat ? ' rows' : col.unit ? ` ${col.unit}` : ''}`} />
                <Legend verticalAlign="top" />
                {files.map((f, k) => <Bar key={f.id} dataKey={`f${k}`} name={`${SIDES[k]} · ${f.name}`} fill={COLORS[k]} radius={[4, 4, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <h3 className="mt-6 mb-2 font-semibold">Summary</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th>Column</th><th>Measure</th>
              {files.map((f, k) => <th key={f.id} className="text-right">{SIDES[k]}</th>)}
              {two && <th className="text-right">Δ (B − A)</th>}
              <th className="text-right">Rows differing</th>
            </tr>
          </thead>
          <tbody>
            {result.columns.map((c, k) => {
              const [a, b] = c.summary ?? [];
              return (
                <tr key={c.name} onClick={() => setI(k)} className={`cursor-pointer border-t border-slate-100 [&>td]:px-3 [&>td]:py-2 ${k === i ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <td className="font-medium">{c.name}</td>
                  <td className="text-slate-600">{measureLabel(c)}</td>
                  {files.map((f, n) => <td key={f.id} className="text-right">{fmt(c.summary?.[n])}</td>)}
                  {two && <td className="text-right">{a != null && b != null ? fmt(b - a) : '—'}</td>}
                  <td className="text-right">{c.rowsDiffering} / {c.rowsCompared}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

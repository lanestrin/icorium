import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Download, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PROCESSORS, type CompareColumn, type CompareResult, type FileMeta, type FileRows } from '../../../shared/types';
import { api } from '../api';

const processorLabel = (id?: string) => PROCESSORS.find((p) => p.id === id)?.label ?? '';
const fmt = (v?: number | null) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));
const withUnit = (c: CompareColumn) => (c.unit ? ` (${c.unit})` : '');
const measureLabel = (c: CompareColumn) =>
  c.measure === 'count' ? 'Rows per category (see chart)' : `${c.measure === 'total' ? 'Total' : 'Mean'} across rows${withUnit(c)}`;

const FOCUSABLE = 'a[href],button:not([disabled]),select,input,[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus moves in on open, Tab stays inside, Escape closes, focus returns on close. */
function Modal({ title, subtitle, actions, onClose, children }: { title: string; subtitle?: string; actions?: ReactNode; onClose: () => void; children: ReactNode }) {
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
        className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl outline-none"
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

const PAGE = 100; // rows loaded per "Show more"

export function PreviewModal({ file, onClose }: { file: FileMeta; onClose: () => void }) {
  const [data, setData] = useState<FileRows>();
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { api.rows(file.id, 0, PAGE).then(setData).catch((e) => setError(e.message)); }, [file.id]);
  const gen = new Set(data?.generatedColumns);
  const remaining = data ? data.totalRows - data.rows.length : 0;

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
      {data && (
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr>
              {data.headers.map((h) => (
                <th key={h} className={`whitespace-nowrap px-3 py-2 pt-6 text-left font-semibold ${gen.has(h) ? 'bg-blue-50 text-blue-800' : 'bg-white'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
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

export function CompareModal({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const [i, setI] = useState(0);
  const col = result.columns[i];
  const isCat = col?.kind === 'category';

  return (
    <Modal title={`${result.fileA}  vs  ${result.fileB}`} subtitle={`${processorLabel(result.processor)} · ${result.columns.length} generated columns compared`} onClose={onClose}>
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
            {isCat ? 'Count of rows in each category, A vs B' : `Value per row${withUnit(col)}, A vs B. Row # is the row's position in each file.`}
          </p>
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={col.data} margin={{ top: 10, right: 10, bottom: isCat ? 50 : 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={isCat ? 0 : 'preserveStartEnd'} angle={isCat ? -20 : 0} textAnchor={isCat ? 'end' : 'middle'} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  allowDecimals={!isCat}
                  label={{ value: isCat ? 'rows' : (col.unit ?? ''), angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }}
                />
                <Tooltip formatter={(v) => `${fmt(Number(v))}${isCat ? ' rows' : col.unit ? ` ${col.unit}` : ''}`} />
                <Legend verticalAlign="top" />
                <Bar dataKey="a" name={`A · ${result.fileA}`} fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="b" name={`B · ${result.fileB}`} fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
              <th>Column</th><th>Measure</th><th className="text-right">A</th><th className="text-right">B</th><th className="text-right">Δ (B − A)</th><th className="text-right">Rows differing</th>
            </tr>
          </thead>
          <tbody>
            {result.columns.map((c, k) => (
              <tr key={c.name} onClick={() => setI(k)} className={`cursor-pointer border-t border-slate-100 [&>td]:px-3 [&>td]:py-2 ${k === i ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <td className="font-medium">{c.name}</td>
                <td className="text-slate-600">{measureLabel(c)}</td>
                <td className="text-right">{fmt(c.valueA)}</td>
                <td className="text-right">{fmt(c.valueB)}</td>
                <td className="text-right">{c.valueA != null && c.valueB != null ? fmt(c.valueB - c.valueA) : '—'}</td>
                <td className="text-right">{c.rowsDiffering} / {c.rowsCompared}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

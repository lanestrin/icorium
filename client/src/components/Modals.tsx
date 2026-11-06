import { useEffect, useState, type ReactNode } from 'react';
import { Download, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PROCESSORS, type CompareResult, type FileMeta, type FileRows } from '../../../shared/types';
import { api } from '../api';

const processorLabel = (id?: string) => PROCESSORS.find((p) => p.id === id)?.label ?? '';
const fmt = (v?: number | null) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));

function Modal({ title, subtitle, actions, onClose, children }: { title: string; subtitle?: string; actions?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions}
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" title="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function PreviewModal({ file, onClose }: { file: FileMeta; onClose: () => void }) {
  const [data, setData] = useState<FileRows>();
  const [error, setError] = useState<string>();
  useEffect(() => { api.rows(file.id).then(setData).catch((e) => setError(e.message)); }, [file.id]);
  const gen = new Set(data?.generatedColumns);

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
    </Modal>
  );
}

export function CompareModal({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const [i, setI] = useState(0);
  const col = result.columns[i];

  return (
    <Modal title={`${result.fileA}  vs  ${result.fileB}`} subtitle={`${processorLabel(result.processor)} · ${result.columns.length} generated columns compared`} onClose={onClose}>
      <div className="flex flex-wrap gap-2 pt-5">
        {result.columns.map((c, k) => (
          <button key={c.name} onClick={() => setI(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${k === i ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            {c.name}
          </button>
        ))}
      </div>

      {col && (
        <>
          <p className="mt-4 text-sm text-slate-500">{col.kind === 'numeric' ? 'Value per row (A vs B)' : 'Number of rows per category (A vs B)'}</p>
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={col.data} margin={{ top: 10, right: 10, bottom: col.kind === 'category' ? 50 : 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={col.kind === 'category' ? 0 : 'preserveStartEnd'} angle={col.kind === 'category' ? -20 : 0} textAnchor={col.kind === 'category' ? 'end' : 'middle'} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="top" />
                <Bar dataKey="a" name={`A · ${result.fileA}`} fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="b" name={`B · ${result.fileB}`} fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <h3 className="mt-6 mb-2 font-semibold">Summary</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th>Column</th><th>Type</th><th className="text-right">Mean A</th><th className="text-right">Mean B</th><th className="text-right">Δ Mean (B − A)</th><th className="text-right">Rows differing</th>
          </tr>
        </thead>
        <tbody>
          {result.columns.map((c, k) => (
            <tr key={c.name} onClick={() => setI(k)} className={`cursor-pointer border-t border-slate-100 [&>td]:px-3 [&>td]:py-2 ${k === i ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
              <td className="font-medium">{c.name}</td>
              <td>{c.kind}</td>
              <td className="text-right">{fmt(c.meanA)}</td>
              <td className="text-right">{fmt(c.meanB)}</td>
              <td className="text-right">{c.meanA != null && c.meanB != null ? fmt(c.meanB - c.meanA) : '—'}</td>
              <td className="text-right">{c.rowsDiffering} / {c.kind === 'numeric' ? c.data.length : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Download, TriangleAlert, X } from 'lucide-react';
import { PROCESSORS, type FileMeta, type FileRows, type ProblemList, type ProcessorId } from '../../../shared/types';
import { api } from '../api';
import { importedLineage, type QualityWarning, type Replacement } from './FileTable';

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

const processorLabel = (id?: string) => PROCESSORS.find((p) => p.id === id)?.label ?? '';

const FOCUSABLE = 'a[href],button:not([disabled]),select,input,[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus moves in on open, Tab stays inside, Escape closes, focus returns on close. */
/** Dialog shell: focus moves in, Tab stays inside, Escape closes, focus returns. full = fills the screen on phones, near-full on larger screens. */
export function Modal({ title, subtitle, actions, narrow, full, onClose, children }: { title: string; subtitle?: string; actions?: ReactNode; narrow?: boolean; full?: boolean; onClose: () => void; children: ReactNode }) {
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
    <div className={`fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm ${full ? 'sm:p-4' : 'p-4'}`} onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex w-full flex-col bg-white shadow-2xl outline-none ${full ? 'h-full max-w-[1400px] sm:rounded-2xl' : `max-h-[88vh] rounded-2xl ${narrow ? 'max-w-lg' : 'max-w-6xl'}`}`}
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

/** What Mass or Classification will do with files that have invalid rows; shared by both run confirmations. */
function QualityDetails({ warning }: { warning: QualityWarning }) {
  const others = warning.cleanCount;
  return (
    <>
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
    </>
  );
}

function ConfirmButtons({ label, danger, onCancel, onConfirm }: { label: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
      <button onClick={onConfirm} className={`rounded-xl px-4 py-2.5 font-semibold text-white shadow-sm ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>{label}</button>
    </div>
  );
}

/** Asks before Mass or Classification calculates only the valid rows of files with invalid rows. */
export function QualityWarningModal({ warning, processor, onCancel, onConfirm }: {
  warning: QualityWarning; processor: ProcessorId; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal title="Data Quality Warning" subtitle={processorLabel(processor)} narrow onClose={onCancel}>
      <QualityDetails warning={warning} />
      <ConfirmButtons label="Process Valid Rows" onCancel={onCancel} onConfirm={onConfirm} />
    </Modal>
  );
}

const ARCHIVED_NOTE = 'Archived: replacing it returns it to Active Files.';

/**
 * Asks before a run replaces existing results (same input, same function, same File ID). When the Data
 * Quality Warning also applies, it is shown here too, so a run never needs two confirmations.
 */
export function ReplaceResultModal({ items, otherCount, warning, processor, onCancel, onConfirm }: {
  items: Replacement[]; otherCount: number; warning?: QualityWarning; processor: ProcessorId; onCancel: () => void; onConfirm: () => void;
}) {
  const label = processorLabel(processor);
  const [one] = items;
  return (
    <Modal title="Replace existing result?" subtitle={label} narrow onClose={onCancel}>
      <div className="flex items-start gap-3 pt-5 text-red-900">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
        {items.length === 1 ? (
          <div>
            <p>
              {label} has already been run for file <strong>{one.inputId}</strong>. Running it again will replace the
              existing result <strong>{one.resultId}</strong>. This action cannot be undone.
            </p>
            {one.archived && <p className="mt-2 text-sm text-slate-700">{ARCHIVED_NOTE}</p>}
          </div>
        ) : (
          <p>{label} has already been run for {items.length} selected files. Running it again will replace these existing results. This action cannot be undone.</p>
        )}
      </div>
      {items.length > 1 && (
        <ul aria-label="Results to replace" className="mt-4 max-h-60 space-y-2 overflow-auto">
          {items.map((r) => (
            <li key={r.resultId} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm">
              <span className="font-semibold text-slate-900">{r.resultId}</span>
              <span className="block break-all text-slate-700">{r.resultName}</span>
              {r.archived && <span className="block text-slate-700">{ARCHIVED_NOTE}</span>}
            </li>
          ))}
        </ul>
      )}
      {otherCount > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          {otherCount} other selected {otherCount === 1 ? 'file' : 'files'} will be processed normally.
        </p>
      )}
      {warning && <QualityDetails warning={warning} />}
      <ConfirmButtons label="Run & Replace" danger onCancel={onCancel} onConfirm={onConfirm} />
    </Modal>
  );
}

const PAGE = 100; // rows loaded per "Show more"

export function PreviewModal({ file, onClose }: { file: FileMeta; onClose: () => void }) {
  const [data, setData] = useState<FileRows>();
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  // The file currently shown. A response for any other file (or after closing) is ignored.
  const shown = useRef(file.id);
  useEffect(() => {
    shown.current = file.id;
    setData(undefined);
    setError(undefined);
    api.rows(file.id, 0, PAGE)
      .then((d) => { if (shown.current === file.id) setData(d); })
      .catch((e) => { if (shown.current === file.id) setError(e instanceof Error ? e.message : String(e)); });
    return () => { shown.current = ''; };
  }, [file.id]);
  const gen = new Set(data?.generatedColumns);
  const remaining = data ? data.totalRows - data.rows.length : 0;
  const flagged = new Map(data?.problems.items.map((p) => [p.row, p.message])); // row number -> problem

  async function showMore() {
    if (!data) return;
    const id = file.id;
    setLoadingMore(true);
    try {
      const next = await api.rows(id, data.rows.length, PAGE);
      if (shown.current === id) setData({ ...next, rows: [...data.rows, ...next.rows] });
    } catch (e) {
      if (shown.current === id) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (shown.current === id) setLoadingMore(false);
    }
  }

  return (
    <Modal
      title={file.name}
      subtitle={`File ID ${file.id} · ${file.status === 'Processed'
        ? `${processorLabel(file.processor)} result · ${file.rows} rows · generated columns highlighted`
        : `${file.rows} rows · ${file.columns} columns`}${file.imported ? ` · ${importedLineage(file).short}` : ''}`}
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

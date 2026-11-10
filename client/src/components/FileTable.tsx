import { ArrowDown, Check, CircleAlert, Download, Eye, FileSpreadsheet, Layers, LoaderCircle, MoreHorizontal, RotateCcw, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { FileMeta, ProcessorId } from '../../../shared/types';
import { api } from '../api';

export type Status = FileMeta['status'] | 'Processing' | 'Error';

/** Stored status, overridden while this file is processing or after its processing failed. */
export const displayStatus = (f: FileMeta, processingId?: string, failedIds?: Set<string>): Status =>
  f.id === processingId ? 'Processing' : failedIds?.has(f.id) ? 'Error' : f.status;

export interface QualityWarning {
  affected: { id: string; name: string; valid: number; invalid: number }[];
  cleanCount: number; // selected inputs with no invalid rows
}

/**
 * Mass and Classification only calculate valid rows, so warn before running them on
 * inputs with invalid rows. Validation never warns. Returns undefined when no warning is needed.
 */
export function qualityWarning(batch: FileMeta[], processor: ProcessorId): QualityWarning | undefined {
  if (processor === 'validation') return undefined;
  const affected = batch
    .filter((f) => (f.problemRows ?? 0) > 0)
    .map((f) => ({ id: f.id, name: f.name, invalid: f.problemRows!, valid: Math.max(0, f.rows - f.problemRows!) }));
  return affected.length ? { affected, cleanCount: batch.length - affected.length } : undefined;
}

const BADGE: Record<Status, [string, LucideIcon]> = {
  Ready: ['bg-green-50 text-green-700', Check],
  'Needs Review': ['bg-amber-50 text-amber-800', TriangleAlert],
  Processed: ['bg-violet-50 text-violet-700', Layers],
  Processing: ['bg-blue-50 text-blue-700', LoaderCircle],
  Error: ['bg-red-50 text-red-700', CircleAlert],
};

function StatusBadge({ status }: { status: Status }) {
  const [cls, Icon] = BADGE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${cls}`}>
      <Icon className={`h-4 w-4 ${status === 'Processing' ? 'animate-spin' : ''}`} />
      {status === 'Processing' ? 'Processing…' : status}
    </span>
  );
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });


export type Tab = 'active' | 'archived';
const TABS: { id: Tab; label: string }[] = [{ id: 'active', label: 'Active Files' }, { id: 'archived', label: 'Archived' }];

/** Active Files / Archived tabs with counts. Arrow keys move between tabs, as in any tab list. */
export function FileTabs({ tab, setTab, counts }: { tab: Tab; setTab: (t: Tab) => void; counts: Record<Tab, number> }) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + 1) % TABS.length].id; // only two tabs, so either arrow switches
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="File list" onKeyDown={onKeyDown} className="mt-5 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={active}
            aria-controls="file-tabpanel"
            tabIndex={active ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-3 rounded-t-lg border-b-2 px-5 py-2.5 font-medium transition ${active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
            <span className={`text-sm ${active ? 'text-blue-700' : 'text-slate-500'}`}>{counts[t.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The ⋯ menu on an archived row. Arrow keys move between items; Escape or a click outside closes it. */
function RowMenu({ file, onPreview, onRestore, disabled }: { file: FileMeta; onPreview: () => void; onRestore: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = () => [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (action: () => void) => { setOpen(false); action(); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  };
  const ITEM = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-slate-800 outline-none hover:bg-blue-50 focus:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div ref={box} className="relative inline-block" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        aria-label={`Actions for ${file.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-slate-200 px-2.5 py-1 hover:bg-slate-50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" aria-label={`Actions for ${file.name}`} className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <button role="menuitem" tabIndex={-1} className={ITEM} onClick={() => choose(onPreview)}>
            <Eye className="h-4 w-4" /> Preview file
          </button>
          <a role="menuitem" tabIndex={-1} className={ITEM} href={api.downloadUrl(file.id)} onClick={() => setOpen(false)}>
            <Download className="h-4 w-4" /> Download file
          </a>
          <button role="menuitem" tabIndex={-1} className={ITEM} disabled={disabled} onClick={() => choose(onRestore)}>
            <RotateCcw className="h-4 w-4" /> Restore file
          </button>
        </div>
      )}
    </div>
  );
}

const CHECKBOX = 'h-[18px] w-[18px] cursor-pointer rounded accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40';

interface Props {
  files: FileMeta[];
  selectedIds: Set<string>;
  processingId?: string;
  failedIds: Set<string>;
  locked: boolean; // true while a batch runs
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onPreview: (f: FileMeta) => void;
  archived?: boolean; // Archived tab: Archived On / Original Upload columns and a ⋯ menu per row
  onRestore?: (f: FileMeta) => void;
  restoreDisabled?: boolean;
  selectionBar?: ReactNode; // shown at the top of the card while rows are selected
  emptyMessage?: string;
}

export function FileTable({ files, selectedIds, processingId, failedIds, locked, onToggle, onToggleAll, onPreview, archived, onRestore, restoreDisabled, selectionBar, emptyMessage }: Props) {
  // Every file can be selected for archiving; Run Processing uses only the selected inputs.
  const ids = files.map((f) => f.id);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const allChecked = ids.length > 0 && checkedCount === ids.length;
  const columns = archived ? 8 : 7;

  return (
    // On desktop the list scrolls inside this box (header pinned) so the page and footer stay put.
    // A labelled, focusable region lets keyboard users scroll it too.
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {selectionBar}
      <div
        role="region"
        aria-label="CSV files"
        tabIndex={0}
        className="overflow-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:max-h-[calc(100vh-24rem)]"
      >
        <table className={`w-full text-sm ${archived ? 'min-w-[1080px]' : 'min-w-[920px]'}`}>
          <thead>
            <tr className="text-left text-slate-700 [&>th]:sticky [&>th]:top-0 [&>th]:z-[1] [&>th]:bg-slate-50 [&>th]:py-3 [&>th]:font-semibold">
              <th className="w-14 rounded-l-xl pl-6">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  aria-label="Select all files"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && !allChecked; }}
                  disabled={locked || !ids.length}
                  onChange={() => onToggleAll(ids, !allChecked)}
                />
              </th>
              <th className="pl-1">File Name</th>
              <th className="px-3 text-center">Rows</th>
              <th className="px-3 text-center">Columns</th>
              {archived ? (
                <>
                  <th className="pl-4 pr-3" aria-sort="descending">
                    <span className="inline-flex items-center gap-1">Archived On <ArrowDown className="h-3.5 w-3.5" aria-hidden /></span>
                  </th>
                  <th className="pr-3">Original Upload</th>
                </>
              ) : (
                <th className="pl-4 pr-3">Uploaded</th>
              )}
              <th>Status</th>
              <th className={`rounded-r-xl ${archived ? 'pr-4 text-center' : ''}`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => {
              const status = displayStatus(f, processingId, failedIds);
              const selectable = !locked;
              const checked = selectedIds.has(f.id);
              return (
                <tr
                  key={f.id}
                  onClick={() => selectable && onToggle(f.id)}
                  className={`border-b border-slate-100 transition ${selectable ? 'cursor-pointer' : ''} ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <td className="py-2.5 pl-6">
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      aria-label={`Select ${f.name}`}
                      checked={checked}
                      disabled={!selectable}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggle(f.id)}
                    />
                  </td>
                  <td className="py-2.5 pl-1 pr-4 font-semibold">
                    <span className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 shrink-0 text-green-600" strokeWidth={1.5} aria-hidden />
                      {f.name}
                    </span>
                  </td>
                  <td className="px-3 text-center">{f.rows}</td>
                  <td className="px-3 text-center">{f.columns}</td>
                  {archived && <td className="whitespace-nowrap pl-4 pr-3">{f.archivedAt ? fmtDate(f.archivedAt) : '—'}</td>}
                  <td className={`whitespace-nowrap pr-3 ${archived ? '' : 'pl-4'}`}>{fmtDate(f.uploadedAt)}</td>
                  <td>
                    <div className="whitespace-nowrap pr-3">
                      <StatusBadge status={status} />
                    </div>
                  </td>
                  <td>
                    {archived && onRestore ? (
                      <div className="pr-4 text-center">
                        <RowMenu file={f} onPreview={() => onPreview(f)} onRestore={() => onRestore(f)} disabled={restoreDisabled} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pr-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); onPreview(f); }}
                          className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-1.5 hover:bg-slate-50"
                        >
                          <Eye className="h-4 w-4" /> Preview
                        </button>
                        <a
                          href={api.downloadUrl(f.id)}
                          onClick={(e) => e.stopPropagation()}
                          title="Download CSV"
                          aria-label={`Download ${f.name}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!files.length && (
              <tr>
                <td colSpan={columns} className="py-12 text-center text-slate-500">{emptyMessage ?? 'No CSV files match your filters.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

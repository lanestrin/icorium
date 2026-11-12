import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ArrowDownUp, ArrowLeftRight, Calendar, Check, ChevronDown, CircleAlert, Filter, Layers, Network, RotateCcw, Search, Wand2, X, type LucideIcon } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta } from '../../../shared/types';
import { CompareWorkspace } from '../components/CompareWorkspace';
import { FileTable, FileTabs } from '../components/FileTable';
import { PreviewModal, QualityWarningModal, ReplaceResultModal } from '../components/Modals';
import { Sidebar } from '../components/Sidebar';
import { useArchive } from '../hooks/useArchive';
import { useFileList } from '../hooks/useFileList';
import { useFilters } from '../hooks/useFilters';
import { useProcessing } from '../hooks/useProcessing';
import { useSelection } from '../hooks/useSelection';
import { api } from '../lib/api';
import { compareBlocker } from '../lib/compare-view';
import { filterFiles, PROCESSING_FUNCTIONS, SORT_OPTIONS, STATUSES, type SortKey } from '../lib/file-status';
import { errorMessage, plural } from '../lib/format';

const FIELD = 'flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm sm:w-auto';
const Divider = () => <div className="hidden w-px self-stretch bg-slate-200 xl:block" aria-hidden />;

/** A filter dropdown with its label above the chosen value, as in the filter card design. */
function SelectFilter({ icon: Icon, label, value, onChange, children }: {
  icon: LucideIcon; label: string; value: string; onChange: (v: string) => void; children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`${FIELD} relative sm:min-w-56`}>
      <Icon className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
          className="menu-select w-full cursor-pointer appearance-none bg-transparent pr-7 text-sm text-slate-600 outline-none">
          {children}
        </select>
      </div>
      <ChevronDown className="pointer-events-none absolute right-4 h-4 w-4 text-slate-600" aria-hidden />
    </div>
  );
}

/** The file workspace: upload, filter, process, preview, archive and compare files. */
export function FilesPage() {
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [preview, setPreview] = useState<FileMeta>();
  const [comparison, setComparison] = useState<CompareResult>();
  const [comparing, setComparing] = useState(false);
  const busy = useRef(false); // set synchronously, so a double click cannot start a second batch or archive

  const { files, refresh, upload, uploading } = useFileList(setError);
  const { selectedIds, setSelectedIds, toggle, toggleAll } = useSelection();
  const {
    search, setSearch, from, setFrom, to, setTo, status, setStatus, fn, setFn, tab, setTab,
    viewArchived, sort, setSort, filtersActive, clearFilters,
  } = useFilters();
  const { archiving, toast, dismissToast, setArchived } = useArchive({ busy, refresh, deselect: (ids) => toggleAll(ids, false), onError: setError });
  const { processor, setProcessor, processingId, failedIds, pending, cancelPending, requestRun, confirmRun } =
    useProcessing({ files, busy, refresh, setSelectedIds, onError: setError, onNotice: setNotice, onPreview: setPreview });

  const selectedInputs = files.filter((f) => selectedIds.has(f.id) && isInputFile(f) && !f.archived);
  const visible = useMemo(
    () => filterFiles(files, { search, from, to, status, fn, viewArchived, sort }, { processingId, failedIds }),
    [files, search, status, fn, viewArchived, sort, from, to, processingId, failedIds],
  );
  const archivedCount = files.filter((f) => f.archived).length;
  // Archive and Restore act only on the selected files in view, never on hidden selections.
  const selectedInView = visible.filter((f) => selectedIds.has(f.id));

  // Compare is offered once the selection in view includes a result; it explains when it can't run.
  const showCompare = !viewArchived && selectedInView.some((f) => f.status === 'Processed');
  const compareReason = compareBlocker(selectedInView);

  async function compare() {
    if (compareReason || comparing) return;
    setError(undefined);
    setComparing(true);
    try { setComparison(await api.compare(selectedInView.map((f) => f.id))); } catch (e) { setError(`Comparison failed: ${errorMessage(e)}`); }
    setComparing(false);
  }

  return (
    <div className="min-h-screen overflow-x-clip pb-10 text-slate-900">
      <div className="flex flex-col gap-6 p-4 pt-8 sm:p-6 sm:pt-10 lg:flex-row">
        <Sidebar
          processor={processor}
          setProcessor={setProcessor}
          onUpload={upload}
          onRun={() => requestRun(selectedInputs)}
          canRun={selectedInputs.length > 0 && !processingId && !archiving}
          running={!!processingId}
          uploading={uploading}
          selected={selectedInputs.map(({ id, name }) => ({ id, name }))}
        />

        <main className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-4">
            <h1 className="text-3xl font-bold tracking-tight">CSV Files</h1>
            <p className="text-slate-600">Upload, preview, process, and compare refrigerant datasets.</p>
            <nav aria-label="Pages" className="ml-auto flex items-center gap-5 self-center text-sm font-medium">
              <a href="/generator" className="flex items-center gap-2 text-blue-700 hover:underline">
                <Wand2 className="h-4 w-4" /> CSV Generator
              </a>
              <a href="/architecture" className="flex items-center gap-2 text-blue-700 hover:underline">
                <Network className="h-4 w-4" /> Architecture
              </a>
            </nav>
          </div>

          <div role="search" aria-label="Filter files" className="mt-5 flex flex-wrap items-stretch gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
            <label className={`${FIELD} min-w-0 sm:min-w-64 sm:flex-1`}>
              <Search className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              <input aria-label="Search file ID or name" className="w-full min-w-0 bg-transparent py-1.5 outline-none" placeholder="Search file ID or name..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <Divider />
            <div role="group" aria-labelledby="date-range-label" className={FIELD}>
              <Calendar className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span id="date-range-label" className="text-sm font-semibold">Date Range</span>
                <span className="flex min-w-0 items-center gap-2">
                  <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-600 outline-none" />
                  <span className="text-slate-400">–</span>
                  <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-600 outline-none" />
                </span>
              </div>
            </div>
            <SelectFilter icon={Layers} label="Processing Function" value={fn} onChange={setFn}>
              <option value="All">All functions</option>
              {PROCESSING_FUNCTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectFilter>
            <Divider />
            <SelectFilter icon={Filter} label="Status" value={status} onChange={(v) => setStatus(v as typeof status)}>
              <option value="All">All statuses</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </SelectFilter>
            <Divider />
            <button onClick={clearFilters} disabled={!filtersActive}
              className="px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 disabled:cursor-default disabled:text-slate-400">
              Clear filters
            </button>
          </div>

          {notice && (
            <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice(undefined)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          )}
          {error && (
            <div role="alert" className="mt-4 flex items-start gap-3 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(undefined)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          )}

          <FileTabs
            tab={tab}
            setTab={setTab}
            counts={{ active: files.length - archivedCount, archived: archivedCount }}
            extra={
              <label className="flex items-center gap-3 text-slate-700">
                <ArrowDownUp className="h-5 w-5 shrink-0" aria-hidden />
                <span>Sort by</span>
                <span className="relative">
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                    className="menu-select cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-4 pr-10 shadow-sm outline-none focus:border-blue-400">
                    {SORT_OPTIONS.filter((o) => viewArchived || !o.archivedOnly).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
                </span>
              </label>
            }
          />

          <div role="tabpanel" id="file-tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4">
            {viewArchived && (
              <p className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <Archive className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                Archived files are excluded from processing and comparison.
              </p>
            )}
            <FileTable
              selectionBar={selectedInView.length > 0 && (
                <div role="toolbar" aria-label="Selected files" className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-blue-50/70 px-4 py-2.5">
                  <span className="font-semibold text-slate-900">{selectedInView.length} selected</span>
                  <button onClick={() => toggleAll(selectedInView.map((f) => f.id), false)} className="text-sm font-medium text-blue-700 hover:underline">
                    Clear selection
                  </button>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {showCompare && compareReason && <span id="compare-reason" className="text-sm text-slate-600">{compareReason}</span>}
                    {showCompare && (
                      <button
                        onClick={compare}
                        disabled={!!compareReason || comparing}
                        aria-describedby={compareReason ? 'compare-reason' : undefined}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ArrowLeftRight className="h-4 w-4" /> Compare {plural(selectedInView.length)}
                      </button>
                    )}
                    <button
                      onClick={() => setArchived(selectedInView.map((f) => f.id), !viewArchived)}
                      disabled={!!processingId || archiving}
                      className={`flex items-center gap-2 rounded-xl px-5 py-2 font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${showCompare ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      {viewArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      {viewArchived ? 'Restore' : 'Archive'} {plural(selectedInView.length)}
                    </button>
                  </div>
                </div>
              )}
              archived={viewArchived}
              sort={sort}
              files={visible}
              selectedIds={selectedIds}
              processingId={processingId}
              failedIds={failedIds}
              locked={!!processingId}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onPreview={setPreview}
              onRestore={viewArchived ? (f) => setArchived([f.id], false) : undefined}
              restoreDisabled={archiving}
              emptyMessage={viewArchived && !archivedCount ? 'No archived files. Select files in Active Files and click Archive to move them here.' : undefined}
            />
          </div>
        </main>
      </div>

      {toast && (
        <div role="status" className="fixed inset-x-4 top-4 z-30 flex items-center gap-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg sm:left-auto sm:right-6 sm:w-104">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"><Check className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{toast.title}</p>
            <p className="text-sm text-slate-600">{toast.detail}</p>
          </div>
          {toast.undo && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => { const { ids, archive } = toast.undo!; setArchived(ids, archive, false); }}
                // Archiving waits for a processing batch to finish, so Undo says so instead of doing nothing.
                disabled={archiving || !!processingId}
                aria-describedby={processingId ? 'undo-wait' : undefined}
                className="rounded-xl border border-blue-200 bg-white px-4 py-1.5 font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Undo
              </button>
              {processingId && <span id="undo-wait" className="text-xs text-slate-500">Available when processing finishes</span>}
            </div>
          )}
          <button onClick={dismissToast} aria-label="Dismiss notification" className="text-slate-500 hover:text-slate-800"><X className="h-5 w-5" /></button>
        </div>
      )}


      {preview && <PreviewModal file={preview} onClose={() => setPreview(undefined)} />}
      {pending?.items ? (
        <ReplaceResultModal items={pending.items} otherCount={pending.batch.length - pending.items.length} warning={pending.warning}
          processor={pending.processor} onCancel={cancelPending} onConfirm={confirmRun} />
      ) : pending?.warning && (
        <QualityWarningModal warning={pending.warning} processor={pending.processor} onCancel={cancelPending} onConfirm={confirmRun} />
      )}
      {comparison && <CompareWorkspace result={comparison} onClose={() => setComparison(undefined)} />}
    </div>
  );
}

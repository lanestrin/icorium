import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ArrowDownUp, ArrowLeftRight, Calendar, Check, ChevronDown, CircleAlert, Filter, Layers, Network, RotateCcw, Search, Wand2, X, type LucideIcon } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta, type ProcessorId, type ReplaceConflict } from '../../shared/types';
import { api } from './api';
import { Sidebar } from './components/Sidebar';
import { displayStatus, FileTable, FileTabs, PROCESSING_FUNCTIONS, processingFunction, qualityWarning, replacements, SORT_OPTIONS, sortFiles, type SortKey, type QualityWarning, type Replacement, type Status, type Tab } from './components/FileTable';
import { compareBlocker, CompareWorkspace } from './components/CompareWorkspace';
import { PreviewModal, QualityWarningModal, ReplaceResultModal } from './components/Modals';
import { GeneratorPage } from './components/GeneratorPage';
import { ArchitecturePage } from './components/ArchitecturePage';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
const TOAST_MS = 8000;

/** Archive/restore confirmation. undo reverses exactly the files it names. */
interface Toast { title: string; detail: string; undo?: { ids: string[]; archive: boolean } }

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

export default function App() {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processor, setProcessor] = useState<ProcessorId>('validation');
  const [processingId, setProcessingId] = useState<string>(); // batches run one file at a time
  const busy = useRef(false); // set synchronously, so a double click cannot start a second batch
  // A run waiting for confirmation: items lists results it would replace (Replace dialog); a warning
  // alone is the Data Quality Warning.
  const [pending, setPending] = useState<{ batch: FileMeta[]; processor: ProcessorId; warning?: QualityWarning; items?: Replacement[] }>();
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [toast, setToast] = useState<Toast>();

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'All' | Status>('All');
  const [fn, setFn] = useState('All'); // processing function filter: 'All', 'Original' or a function name
  // Each tab keeps its own order: newest uploads first, and most recently archived first.
  const [sortBy, setSortBy] = useState<Record<'active' | 'archived', SortKey>>({ active: 'uploaded-desc', archived: 'archived-desc' });
  const [tab, setTab] = useState<Tab>('active');
  const viewArchived = tab === 'archived';
  const sort = sortBy[tab];

  const [preview, setPreview] = useState<FileMeta>();
  const [comparison, setComparison] = useState<CompareResult>();
  const [comparing, setComparing] = useState(false);

  // Reloads the file list. Each request is numbered and only the latest one's answer is used,
  // so a slow older response (e.g. from an upload during a processing batch) never overwrites newer data.
  const listRequest = useRef(0);
  const refresh = () => {
    const request = ++listRequest.current;
    return api.list()
      .then((list) => { if (request === listRequest.current) setFiles(list); })
      .catch((e) => { if (request === listRequest.current) setError(msg(e)); });
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtersActive = !!(search || from || to || status !== 'All' || fn !== 'All');
  const clearFilters = () => { setSearch(''); setFrom(''); setTo(''); setStatus('All'); setFn('All'); };

  const selectedInputs = files.filter((f) => selectedIds.has(f.id) && isInputFile(f) && !f.archived);
  const toggle = (id: string) =>
    setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (ids: string[], on: boolean) =>
    setSelectedIds((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const visible = useMemo(
    () => {
      const shown = files.filter((f) => {
        const day = new Date(f.uploadedAt).toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
        return (
          f.name.toLowerCase().includes(search.toLowerCase()) &&
          // Each tab shows only its own files; the status filter applies within the tab.
          !!f.archived === viewArchived &&
          (status === 'All' || displayStatus(f, processingId, failedIds) === status) &&
          (fn === 'All' || processingFunction(f) === fn) &&
          (!from || day >= from) &&
          (!to || day <= to)
        );
      });
      return sortFiles(shown, sort);
    },
    [files, search, status, fn, viewArchived, sort, from, to, processingId, failedIds],
  );
  const archivedCount = files.filter((f) => f.archived).length;
  // Archive and Restore act only on the selected files in view, never on hidden selections.
  const archiveTargets = visible.filter((f) => selectedIds.has(f.id));

  /** Archives the given files, or restores them when archive is false. undoable adds Undo to the toast. */
  async function setArchived(ids: string[], archive: boolean, undoable = true) {
    if (!ids.length || busy.current) return;
    busy.current = true;
    setArchiving(true);
    setError(undefined);
    setToast(undefined);
    try {
      await api.archive(ids, archive);
      toggleAll(ids, false);
      setToast({
        title: `${plural(ids.length)} ${archive ? 'archived' : 'restored'}`,
        detail: archive ? 'Moved out of Active Files.' : 'Back in Active Files.',
        undo: undoable ? { ids, archive: !archive } : undefined,
      });
    } catch (e) {
      setError(`${archive ? 'Archive' : 'Restore'} failed: ${msg(e)}`);
    }
    await refresh();
    busy.current = false;
    setArchiving(false);
  }

  async function upload(list: File[]) {
    setUploading(true);
    setError(undefined);
    const errors: string[] = [];
    for (const f of list) {
      try { await api.upload(f); } catch (e) { errors.push(`${f.name}: ${msg(e)}`); }
    }
    setUploading(false);
    if (errors.length) setError(`Upload failed\n${errors.join('\n')}`);
    await refresh();
  }

  /**
   * Run Processing: asks first when the run would replace existing results (one dialog, which also
   * carries the Data Quality Warning when it applies), or when Mass or Classification would skip invalid rows.
   */
  function requestRun() {
    const batch = selectedInputs;
    if (!batch.length || busy.current) return;
    const warning = qualityWarning(batch, processor);
    const items = replacements(batch, processor, files);
    if (items.length) return setPending({ batch, processor, warning, items });
    if (warning) return setPending({ batch, processor, warning });
    run(batch, processor);
  }

  /** Process Valid Rows or Run & Replace: runs exactly the files the dialog showed, replacing only those it listed. */
  function confirmRun() {
    if (!pending) return;
    setPending(undefined);
    run(pending.batch, pending.processor, new Set(pending.items?.map((r) => r.inputId)));
  }

  /** Processes the given input files, one after another, with the given function. */
  async function run(batch: FileMeta[], processor: ProcessorId, replaceIds = new Set<string>()) {
    if (!batch.length || busy.current) return;
    busy.current = true;
    setError(undefined);
    setNotice(undefined);
    setFailedIds(new Set());
    const failed = new Set<string>();
    const errors: string[] = [];
    const made: FileMeta[] = [];
    const conflicts: { input: FileMeta; conflict: ReplaceConflict }[] = [];
    for (const f of batch) {
      setProcessingId(f.id);
      try {
        made.push(await (replaceIds.has(f.id) ? api.process(f.id, processor, true) : api.process(f.id, processor)));
        await refresh();
      } catch (e) {
        // A result appeared since the list loaded: ask about it after the batch instead of failing.
        const conflict = (e as { conflict?: ReplaceConflict }).conflict;
        if (conflict) conflicts.push({ input: f, conflict });
        else {
          failed.add(f.id);
          errors.push(`${f.name}: ${msg(e)}`);
        }
      }
    }
    busy.current = false; // per-file errors are caught above, so this always runs
    setProcessingId(undefined);
    setFailedIds(failed);
    // Failed and conflicting files stay checked so they can be retried. After a clean batch, the new
    // results are checked instead, so they can be compared straight away.
    const comparable = !failed.size && !conflicts.length && made.length >= 2;
    setSelectedIds(comparable ? new Set(made.map((m) => m.id)) : new Set([...failed, ...conflicts.map((c) => c.input.id)]));
    if (errors.length) setError(`Processing failed\n${errors.join('\n')}`);

    if (conflicts.length) {
      await refresh(); // show the result that appeared
      if (made.length) setNotice(`Processed ${plural(made.length)}.`);
      // The data quality warning, if any, was already confirmed for this batch.
      return setPending({
        batch: conflicts.map((c) => c.input),
        processor,
        items: conflicts.map(({ input, conflict: { existing } }) => ({ inputId: input.id, resultId: existing.id, resultName: existing.name, archived: !!existing.archived })),
      });
    }
    if (made.length === 1) return setPreview(made[0]); // single file: show the result right away
    if (made.length > 1) setNotice(`Processed ${made.length} files.${comparable ? ' Their results are selected, so you can compare them.' : ' Results are in the list.'}`);
  }

  // Compare is offered once the selection in view includes a result; it explains when it can't run.
  const showCompare = !viewArchived && archiveTargets.some((f) => f.status === 'Processed');
  const compareReason = compareBlocker(archiveTargets);

  async function compare() {
    if (compareReason || comparing) return;
    setError(undefined);
    setComparing(true);
    try { setComparison(await api.compare(archiveTargets.map((f) => f.id))); } catch (e) { setError(`Comparison failed: ${msg(e)}`); }
    setComparing(false);
  }

  return (
    <div className="min-h-screen overflow-x-clip pb-10 text-slate-900">
      <div className="flex flex-col gap-6 p-4 pt-8 sm:p-6 sm:pt-10 lg:flex-row">
        <Sidebar
          processor={processor}
          setProcessor={setProcessor}
          onUpload={upload}
          onRun={requestRun}
          canRun={selectedInputs.length > 0 && !processingId && !archiving}
          running={!!processingId}
          uploading={uploading}
          selectedNames={selectedInputs.map((f) => f.name)}
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
              <input aria-label="Search file name" className="w-full min-w-0 bg-transparent py-1.5 outline-none" placeholder="Search file name..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              {PROCESSING_FUNCTIONS.map((name) => <option key={name}>{name}</option>)}
            </SelectFilter>
            <Divider />
            <SelectFilter icon={Filter} label="Status" value={status} onChange={(v) => setStatus(v as typeof status)}>
              <option value="All">All statuses</option>
              <option>Ready</option>
              <option>Needs Review</option>
              <option>Processing</option>
              <option>Processed</option>
              <option>Error</option>
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
                  <select value={sort} onChange={(e) => setSortBy((b) => ({ ...b, [tab]: e.target.value as SortKey }))}
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
              selectionBar={archiveTargets.length > 0 && (
                <div role="toolbar" aria-label="Selected files" className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-blue-50/70 px-4 py-2.5">
                  <span className="font-semibold text-slate-900">{archiveTargets.length} selected</span>
                  <button onClick={() => toggleAll(archiveTargets.map((f) => f.id), false)} className="text-sm font-medium text-blue-700 hover:underline">
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
                        <ArrowLeftRight className="h-4 w-4" /> Compare {plural(archiveTargets.length)}
                      </button>
                    )}
                    <button
                      onClick={() => setArchived(archiveTargets.map((f) => f.id), !viewArchived)}
                      disabled={!!processingId || archiving}
                      className={`flex items-center gap-2 rounded-xl px-5 py-2 font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${showCompare ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      {viewArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      {viewArchived ? 'Restore' : 'Archive'} {plural(archiveTargets.length)}
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
        <div role="status" className="fixed inset-x-4 top-4 z-30 flex items-center gap-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg sm:left-auto sm:right-6 sm:w-[26rem]">
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
          <button onClick={() => setToast(undefined)} aria-label="Dismiss notification" className="text-slate-500 hover:text-slate-800"><X className="h-5 w-5" /></button>
        </div>
      )}


      {preview && <PreviewModal file={preview} onClose={() => setPreview(undefined)} />}
      {pending?.items ? (
        <ReplaceResultModal items={pending.items} otherCount={pending.batch.length - pending.items.length} warning={pending.warning}
          processor={pending.processor} onCancel={() => setPending(undefined)} onConfirm={confirmRun} />
      ) : pending?.warning && (
        <QualityWarningModal warning={pending.warning} processor={pending.processor} onCancel={() => setPending(undefined)} onConfirm={confirmRun} />
      )}
      {comparison && <CompareWorkspace result={comparison} onClose={() => setComparison(undefined)} />}
    </div>
  );
}

/** Picks the page from the URL: /generator and /architecture have their own pages; anything else is the file workspace. */
export function Root() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/generator') return <GeneratorPage />;
  if (path === '/architecture') return <ArchitecturePage />;
  return <App />;
}

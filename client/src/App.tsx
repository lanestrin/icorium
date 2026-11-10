import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Calendar, Check, CircleAlert, Filter, RotateCcw, Search, X } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta, type ProcessorId } from '../../shared/types';
import { api } from './api';
import { Sidebar } from './components/Sidebar';
import { displayStatus, FileTable, FileTabs, qualityWarning, type QualityWarning, type Status, type Tab } from './components/FileTable';
import { CompareFooter } from './components/CompareFooter';
import { CompareModal, PreviewModal, QualityWarningModal } from './components/Modals';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
const TOAST_MS = 8000;

/** Archive/restore confirmation. undo reverses exactly the files it names. */
interface Toast { title: string; detail: string; undo?: { ids: string[]; archive: boolean } }

export default function App() {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processor, setProcessor] = useState<ProcessorId>('validation');
  const [processingId, setProcessingId] = useState<string>(); // batches run one file at a time
  const busy = useRef(false); // set synchronously, so a double click cannot start a second batch
  const [pending, setPending] = useState<{ batch: FileMeta[]; processor: ProcessorId; warning: QualityWarning }>();
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
  const [tab, setTab] = useState<Tab>('active');
  const viewArchived = tab === 'archived';

  const [preview, setPreview] = useState<FileMeta>();
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [comparison, setComparison] = useState<CompareResult>();

  const refresh = () => api.list().then(setFiles).catch((e) => setError(msg(e)));
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtersActive = !!(search || from || to || status !== 'All');
  const clearFilters = () => { setSearch(''); setFrom(''); setTo(''); setStatus('All'); };

  const selectedInputs = files.filter((f) => selectedIds.has(f.id) && isInputFile(f) && !f.archived);
  const toggle = (id: string) =>
    setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (ids: string[], on: boolean) =>
    setSelectedIds((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const results = files.filter((f) => f.status === 'Processed' && !f.archived);
  const visible = useMemo(
    () => {
      const shown = files.filter((f) => {
        const day = new Date(f.uploadedAt).toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
        return (
          f.name.toLowerCase().includes(search.toLowerCase()) &&
          // Each tab shows only its own files; the status filter applies within the tab.
          !!f.archived === viewArchived &&
          (status === 'All' || displayStatus(f, processingId, failedIds) === status) &&
          (!from || day >= from) &&
          (!to || day <= to)
        );
      });
      // Archived tab: most recently archived first; files archived before the date was kept go last.
      return viewArchived ? shown.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')) : shown;
    },
    [files, search, status, viewArchived, from, to, processingId, failedIds],
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
      if (archive && ids.includes(compareA)) setCompareA('');
      if (archive && ids.includes(compareB)) setCompareB('');
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
    refresh();
  }

  /** Run Processing: asks first when Mass or Classification would skip invalid rows. */
  function requestRun() {
    const batch = selectedInputs;
    if (!batch.length || busy.current) return;
    const warning = qualityWarning(batch, processor);
    if (warning) return setPending({ batch, processor, warning });
    run(batch, processor);
  }

  /** Process Valid Rows: runs exactly the files whose counts the warning showed. */
  function confirmRun() {
    if (!pending) return;
    setPending(undefined);
    run(pending.batch, pending.processor);
  }

  /** Processes the given input files, one after another, with the given function. */
  async function run(batch: FileMeta[], processor: ProcessorId) {
    if (!batch.length || busy.current) return;
    busy.current = true;
    setError(undefined);
    setNotice(undefined);
    setFailedIds(new Set());
    const failed = new Set<string>();
    const errors: string[] = [];
    const made: FileMeta[] = [];
    for (const f of batch) {
      setProcessingId(f.id);
      try {
        made.push(await api.process(f.id, processor));
        await refresh();
      } catch (e) {
        failed.add(f.id);
        errors.push(`${f.name}: ${msg(e)}`);
      }
    }
    busy.current = false; // per-file errors are caught above, so this always runs
    setProcessingId(undefined);
    setFailedIds(failed);
    setSelectedIds(failed); // failed files stay checked so they can be retried
    if (errors.length) setError(`Processing failed\n${errors.join('\n')}`);

    if (made.length === 1) return setPreview(made[0]); // single file: show the result right away
    if (made.length > 1) setNotice(`Processed ${made.length} files. Results are in the list${made.length === 2 ? ' and ready to compare below' : ''}.`);
    if (made.length === 2) { setCompareA(made[0].id); setCompareB(made[1].id); }
  }

  async function compare() {
    setError(undefined);
    try { setComparison(await api.compare([compareA, compareB])); } catch (e) { setError(`Comparison failed: ${msg(e)}`); }
  }

  return (
    <div className="min-h-screen overflow-x-clip pb-32 text-slate-900">
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
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm sm:w-auto sm:min-w-64 sm:flex-1">
              <Search className="h-5 w-5 shrink-0 text-slate-500" />
              <input className="w-full min-w-0 bg-transparent outline-none" placeholder="Search CSV files..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm sm:w-auto">
              <Calendar className="h-5 w-5 shrink-0 text-slate-600" />
              <span className="mr-1 font-semibold">Date Range</span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                <span className="text-slate-400">–</span>
                <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </span>
            </div>
            <label className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm sm:w-auto">
              <Filter className="h-5 w-5 shrink-0 text-slate-600" />
              <span className="font-semibold">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="min-w-0 flex-1 bg-transparent pr-2 outline-none">
                <option value="All">All Statuses</option>
                <option>Ready</option>
                <option>Needs Review</option>
                <option>Processing</option>
                <option>Processed</option>
                <option>Error</option>
              </select>
            </label>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 sm:w-auto"
              >
                <X className="h-4 w-4" /> Clear filters
              </button>
            )}
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

          <FileTabs tab={tab} setTab={setTab} counts={{ active: files.length - archivedCount, archived: archivedCount }} />

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
                  <button
                    onClick={() => setArchived(archiveTargets.map((f) => f.id), !viewArchived)}
                    disabled={!!processingId || archiving}
                    className="ml-auto flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {viewArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    {viewArchived ? 'Restore' : 'Archive'} {plural(archiveTargets.length)}
                  </button>
                </div>
              )}
              archived={viewArchived}
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
            <button
              onClick={() => { const { ids, archive } = toast.undo!; setArchived(ids, archive, false); }}
              disabled={archiving}
              className="rounded-xl border border-blue-200 bg-white px-4 py-1.5 font-medium text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
            >
              Undo
            </button>
          )}
          <button onClick={() => setToast(undefined)} aria-label="Dismiss notification" className="text-slate-500 hover:text-slate-800"><X className="h-5 w-5" /></button>
        </div>
      )}

      <CompareFooter files={files} results={results} a={compareA} b={compareB} setA={setCompareA} setB={setCompareB} onCompare={compare} />

      {preview && <PreviewModal file={preview} onClose={() => setPreview(undefined)} />}
      {pending && <QualityWarningModal warning={pending.warning} processor={pending.processor} onCancel={() => setPending(undefined)} onConfirm={confirmRun} />}
      {comparison && <CompareModal result={comparison} onClose={() => setComparison(undefined)} />}
    </div>
  );
}

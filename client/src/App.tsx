import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, CircleAlert, Filter, Search, X } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta, type ProcessorId } from '../../shared/types';
import { api } from './api';
import { Sidebar } from './components/Sidebar';
import { displayStatus, FileTable, type Status } from './components/FileTable';
import { CompareFooter } from './components/CompareFooter';
import { CompareModal, PreviewModal } from './components/Modals';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processor, setProcessor] = useState<ProcessorId>('validation');
  const [processingId, setProcessingId] = useState<string>(); // batches run one file at a time
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'All' | Status>('All');

  const [preview, setPreview] = useState<FileMeta>();
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [comparison, setComparison] = useState<CompareResult>();

  const refresh = () => api.list().then(setFiles).catch((e) => setError(msg(e)));
  useEffect(() => { refresh(); }, []);

  const filtersActive = !!(search || from || to || status !== 'All');
  const clearFilters = () => { setSearch(''); setFrom(''); setTo(''); setStatus('All'); };

  const selectedInputs = files.filter((f) => selectedIds.has(f.id) && isInputFile(f));
  const toggle = (id: string) =>
    setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (ids: string[], on: boolean) =>
    setSelectedIds((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const results = files.filter((f) => f.status === 'Processed');
  const visible = useMemo(
    () =>
      files.filter((f) => {
        const day = new Date(f.uploadedAt).toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
        return (
          f.name.toLowerCase().includes(search.toLowerCase()) &&
          (status === 'All' || displayStatus(f, processingId, failedIds) === status) &&
          (!from || day >= from) &&
          (!to || day <= to)
        );
      }),
    [files, search, status, from, to, processingId, failedIds],
  );

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

  /** Processes every checked input file, one after another, with the chosen function. */
  async function run() {
    const batch = selectedInputs;
    if (!batch.length) return;
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
    try { setComparison(await api.compare(compareA, compareB)); } catch (e) { setError(`Comparison failed: ${msg(e)}`); }
  }

  return (
    <div className="min-h-screen overflow-x-clip pb-32 text-slate-900">
      <div className="flex flex-col gap-6 p-4 pt-8 sm:p-6 sm:pt-10 lg:flex-row">
        <Sidebar
          processor={processor}
          setProcessor={setProcessor}
          onUpload={upload}
          onRun={run}
          canRun={selectedInputs.length > 0 && !processingId}
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

          <div className="mt-5">
            <FileTable
              files={visible}
              selectedIds={selectedIds}
              processingId={processingId}
              failedIds={failedIds}
              locked={!!processingId}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onPreview={setPreview}
            />
          </div>
        </main>
      </div>

      <CompareFooter files={files} results={results} a={compareA} b={compareB} setA={setCompareA} setB={setCompareB} onCompare={compare} />

      {preview && <PreviewModal file={preview} onClose={() => setPreview(undefined)} />}
      {comparison && <CompareModal result={comparison} onClose={() => setComparison(undefined)} />}
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Archive, ArrowDownUp, ChevronDown, Network, Wand2 } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta } from '../../../shared/types';
import { ArchiveToast } from '../components/ArchiveToast';
import { Banner } from '../components/Banner';
import { CompareWorkspace } from '../components/compare/CompareWorkspace';
import { FileFilters } from '../components/FileFilters';
import { FileTable, FileTabs } from '../components/FileTable';
import { PreviewModal, QualityWarningModal, ReplaceResultModal } from '../components/Modals';
import { SelectionBar } from '../components/SelectionBar';
import { Sidebar } from '../components/Sidebar';
import { useArchive } from '../hooks/useArchive';
import { useFileList } from '../hooks/useFileList';
import { useFilters } from '../hooks/useFilters';
import { useProcessing } from '../hooks/useProcessing';
import { useSelection } from '../hooks/useSelection';
import { api } from '../lib/api';
import { compareBlocker } from '../lib/compare-view';
import { filterFiles, SORT_OPTIONS, type SortKey } from '../lib/file-status';
import { errorMessage } from '../lib/format';

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

          <FileFilters
            search={search} setSearch={setSearch} from={from} setFrom={setFrom} to={to} setTo={setTo}
            fn={fn} setFn={setFn} status={status} setStatus={setStatus}
            filtersActive={filtersActive} clearFilters={clearFilters}
          />

          {notice && <Banner tone="success" className="mt-4" onDismiss={() => setNotice(undefined)}>{notice}</Banner>}
          {error && <Banner tone="error" className="mt-4" onDismiss={() => setError(undefined)}>{error}</Banner>}

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
                <SelectionBar
                  count={selectedInView.length}
                  onClear={() => toggleAll(selectedInView.map((f) => f.id), false)}
                  showCompare={showCompare}
                  compareReason={compareReason}
                  comparing={comparing}
                  onCompare={compare}
                  viewArchived={viewArchived}
                  archiveDisabled={!!processingId || archiving}
                  onArchive={() => setArchived(selectedInView.map((f) => f.id), !viewArchived)}
                />
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
        <ArchiveToast
          toast={toast}
          archiving={archiving}
          processing={!!processingId}
          onUndo={() => toast.undo && setArchived(toast.undo.ids, toast.undo.archive, false)}
          onDismiss={dismissToast}
        />
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

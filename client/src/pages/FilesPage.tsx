import { useMemo, useRef, useState } from 'react';
import { Archive, Network, Wand2 } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta } from '../../../shared/types';
import { Banner } from '../components/Banner';
import { CompareWorkspace } from '../components/compare/CompareWorkspace';
import { PreviewModal } from '../components/modals/PreviewModal';
import { QualityWarningModal, ReplaceResultModal } from '../components/modals/RunConfirmations';
import { ArchiveToast } from '../components/files/ArchiveToast';
import { FileFilters } from '../components/files/FileFilters';
import { FileTable } from '../components/files/FileTable';
import { FileTabs } from '../components/files/FileTabs';
import { SelectionBar } from '../components/files/SelectionBar';
import { Sidebar } from '../components/files/Sidebar';
import { SortMenu } from '../components/files/SortMenu';
import styles from '../components/files/files.module.css';
import { useArchive } from '../hooks/useArchive';
import { useFileList } from '../hooks/useFileList';
import { useFilters } from '../hooks/useFilters';
import { useProcessing } from '../hooks/useProcessing';
import { useSelection } from '../hooks/useSelection';
import { api } from '../lib/api';
import { compareBlocker } from '../lib/compare-view';
import { filterFiles } from '../lib/file-status';
import { errorMessage } from '../lib/format';
import { AppVersion } from '../components/AppVersion';

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
    <div className="page-shell pb-10">
      <div className={styles.workspace}>
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
            <nav aria-label="Pages" className={styles.headerNav}>
              <a href="/generator" className="nav-link">
                <Wand2 className="h-4 w-4" /> CSV Generator
              </a>
              <a href="/architecture" className="nav-link">
                <Network className="h-4 w-4" /> Architecture
              </a>
              <AppVersion />
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
            extra={<SortMenu sort={sort} setSort={setSort} viewArchived={viewArchived} />}
          />

          <div role="tabpanel" id="file-tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4">
            {viewArchived && (
              <p className={styles.archivedNote}>
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

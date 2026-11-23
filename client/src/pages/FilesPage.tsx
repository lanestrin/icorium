import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Archive } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta } from '../../../shared/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/ui/Button';
import { ClearDataModal } from '../components/modals/ClearDataModal';
import { ConvertReviewDialog } from '../components/modals/ConvertReviewDialog';
import { MappingDialog } from '../components/modals/MappingDialog';
import { PreviewModal } from '../components/modals/PreviewModal';
import { QualityWarningModal, ReplaceResultModal } from '../components/modals/RunConfirmations';
import { ArchiveToast } from '../components/files/ArchiveToast';
import { FileFilters } from '../components/files/FileFilters';
import { FileTable } from '../components/files/FileTable';
import { FileTabs } from '../components/files/FileTabs';
import { SelectionBar } from '../components/files/SelectionBar';
import { Sidebar } from '../components/files/Sidebar';
import { SortMenu } from '../components/files/SortMenu';
import styles from '../components/files/files.module.scss';
import { useArchive } from '../hooks/useArchive';
import { useConversion } from '../hooks/useConversion';
import { useFileList } from '../hooks/useFileList';
import { useFilters } from '../hooks/useFilters';
import { useProcessing } from '../hooks/useProcessing';
import { useSelection } from '../hooks/useSelection';
import { useWorkspace } from '../hooks/useWorkspace';
import { api, type StorageMode } from '../lib/api';
import { compareBlocker } from '../lib/compare-view';
import { filterFiles } from '../lib/file-status';
import { errorMessage } from '../lib/format';
import { AppShell } from '../components/layout/AppShell';
import { useAccount } from '../hooks/useAccount';
import { useHashSection } from '../hooks/useHashSection';
import { showAndFocus, WORKSPACE_HASHES, type AdminSection, type WorkspaceSection } from '../lib/navigation';

// The comparison dialog and its charts download the first time Compare is used, alongside the request.
const loadCompareWorkspace = () => import('../components/compare/CompareWorkspace');
const CompareWorkspace = lazy(() => loadCompareWorkspace().then((m) => ({ default: m.CompareWorkspace })));
const COMPARE_CODE_FAILED = "The comparison couldn't be loaded. Reload the page to try again.";

/** The file workspace: upload, filter, process, preview, archive and compare files. */
export function FilesPage() {
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [preview, setPreview] = useState<FileMeta>();
  const [mapping, setMapping] = useState<FileMeta>(); // the file whose columns the Map columns dialog is confirming
  const [comparison, setComparison] = useState<CompareResult>();
  const [comparing, setComparing] = useState(false);
  const busy = useRef(false); // set synchronously, so a double click cannot start a second batch or archive
  const [storageMode, setStorageMode] = useState<StorageMode>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const account = useAccount();
  const workspace = useWorkspace(account.account);
  const { files, refresh, reset, upload, uploading, loading, loadFailed } = useFileList(setError, workspace.choice.kind === 'pending');
  const conversion = useConversion();
  const { selectedIds, setSelectedIds, toggle, toggleAll } = useSelection();
  const {
    search, setSearch, from, setFrom, to, setTo, status, setStatus, fn, setFn, tab, setTab,
    viewArchived, sort, setSort, filtersActive, clearFilters, showNewFiles,
  } = useFilters();
  const { archiving, toast, dismissToast, setArchived } = useArchive({ busy, refresh, deselect: (ids) => toggleAll(ids, false), onError: setError });
  const { processor, setProcessor, processingId, failedIds, pending, cancelPending, requestRun, confirmRun } =
    useProcessing({ files, busy, refresh, setSelectedIds, onError: setError, onNotice: setNotice, onPreview: setPreview, onResults: showNewFiles });

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

  // The navigation's workspace entries (and a #files, #processing or #results address): My Files and Results
  // show the Active Files tab with the filters cleared (Results then filters to Processed); Processing focuses
  // its panel. Dashboard changes nothing. An Admin section can't reach here, so it is ignored.
  function goToSection(section: WorkspaceSection | AdminSection) {
    if (section === 'files' || section === 'results') {
      clearFilters();
      setTab('active');
      if (section === 'results') setStatus('Processed');
      showAndFocus('file-tabpanel');
    } else if (section === 'processing') showAndFocus('processing-heading');
  }
  useHashSection(WORKSPACE_HASHES, goToSection);

  // Where files are kept, for the note under the upload area. If storage can't open, the file list reports it.
  // A different workspace (signing in or out, another account) starts clean: nothing from the old one stays on
  // screen, selected or open, and the list is read again from the new one.
  const shownWorkspace = useRef(workspace.key);
  useEffect(() => {
    let current = true; // a late answer for the workspace we just left must not replace this one's
    setStorageMode(undefined);
    api.storageMode().then((mode) => { if (current) setStorageMode(mode); }, () => {});
    const previous = shownWorkspace.current;
    shownWorkspace.current = workspace.key;
    if (previous === workspace.key) return () => { current = false; };
    // The account was still loading, so no files were shown and the list's first load was held until now.
    if (previous === 'pending') return () => { current = false; };
    reset();
    setSelectedIds(new Set());
    setPreview(undefined);
    setMapping(undefined);
    setComparison(undefined);
    setConfirmClear(false);
    cancelPending();
    dismissToast();
    setError(undefined);
    setNotice(undefined);
    void refresh();
    return () => { current = false; };
  }, [workspace.key]);

  // Try again after the list could not be loaded. An account that couldn't be confirmed is read again by reloading.
  function retryLoad() {
    if (workspace.choice.kind === 'unavailable') window.location.reload();
    else void refresh();
  }

  // Clear my data: every upload and result in this browser is deleted and the five samples come back.
  // It holds busy like a run or archive, so nothing else starts meanwhile, and it closes the archive toast
  // first: its Undo names File IDs that a re-added sample or a new upload may reuse after the clear.
  async function clearData() {
    setConfirmClear(false);
    if (busy.current) return;
    busy.current = true;
    dismissToast();
    setClearing(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await api.clearData();
      setSelectedIds(new Set());
      await refresh();
      setNotice('Your data was cleared. The five sample files are back.');
    } catch (e) {
      setError(`Clear my data failed: ${errorMessage(e)}`);
    } finally {
      busy.current = false;
      setClearing(false);
    }
  }

  // After an upload that added at least one file, filter to today's originals so the new files show first.
  // Excel files are converted and reviewed first; each is uploaded as a CSV only after Import as CSV.
  // A CSV with unfamiliar columns opens the Map columns dialog; an exact partner file is never sent through it.
  async function uploadFiles(list: File[]) {
    const { accepted, needsMapping } = await upload(list, conversion.prepare);
    if (accepted > 0) showNewFiles('original');
    if (needsMapping.length) {
      setMapping(needsMapping[0]);
      if (needsMapping.length > 1) setNotice(`${needsMapping.length} files need their columns mapped; use Map columns on each.`);
    }
  }

  function mappingConfirmed({ name, profileError }: { name: string; profileError?: string }) {
    setMapping(undefined);
    refresh();
    if (profileError) setError(profileError);
    else setNotice(`${name} is ready for processing.`);
  }

  async function compare() {
    if (compareReason || comparing) return;
    setError(undefined);
    setComparing(true);
    // The dialog opens only once both its code and the data are ready, so it is never half-open.
    const code = loadCompareWorkspace().then(
      () => undefined,
      () => { throw new Error(COMPARE_CODE_FAILED); },
    );
    const workspace = api.workspaceId();
    try {
      const [result] = await Promise.all([api.compare(selectedInView.map((f) => f.id)), code]);
      if (api.workspaceId() === workspace) setComparison(result); // another workspace's account must not see this one's data
    } catch (e) {
      if (api.workspaceId() === workspace) setError(`Comparison failed: ${errorMessage(e)}`);
    }
    setComparing(false);
  }

  return (
    <AppShell account={account} title="Dashboard" intro="Your file workspace for refrigerant analysis." onNavigate={goToSection}>
    <div className={styles.filesPage}>
      <main className={styles.workspace}>
        <Sidebar
          processor={processor}
          setProcessor={setProcessor}
          onUpload={uploadFiles}
          onRun={() => requestRun(selectedInputs)}
          canRun={selectedInputs.length > 0 && !processingId && !archiving && !clearing}
          running={!!processingId}
          uploading={uploading && !conversion.review}
          uploadDisabled={clearing}
          reading={conversion.reading ?? undefined}
          onCancelReading={conversion.cancel}
          selected={selectedInputs.map(({ id, name }) => ({ id, name }))}
          storageMode={storageMode}
          onClearData={() => setConfirmClear(true)}
          clearDisabled={workspace.choice.kind !== 'browser' || uploading || !!conversion.reading || !!processingId || archiving || clearing}
        />

        <div className={styles.main}>
          <FileFilters
            search={search} setSearch={setSearch} from={from} setFrom={setFrom} to={to} setTo={setTo}
            fn={fn} setFn={setFn} status={status} setStatus={setStatus}
            filtersActive={filtersActive} clearFilters={clearFilters}
          />

          {notice && <Banner tone="success" className={styles.banner} onDismiss={() => setNotice(undefined)}>{notice}</Banner>}
          {error && <Banner tone="error" className={styles.banner} onDismiss={() => setError(undefined)}>{error}</Banner>}
          {loadFailed && <Button variant="secondary" className={styles.banner} onClick={retryLoad}>Try again</Button>}

          <FileTabs
            tab={tab}
            setTab={setTab}
            counts={{ active: files.length - archivedCount, archived: archivedCount }}
            extra={<SortMenu sort={sort} setSort={setSort} viewArchived={viewArchived} />}
          />

          <div role="tabpanel" id="file-tabpanel" tabIndex={-1} aria-labelledby={`tab-${tab}`} className={styles.tabPanel}>
            {viewArchived && (
              <p className={styles.archivedNote}>
                <Archive className={styles.archivedIcon} aria-hidden />
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
                  archiveDisabled={!!processingId || archiving || clearing}
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
              onMapColumns={setMapping}
              onDownload={(f) => api.download(f.id).catch((e) => setError(`Download failed: ${errorMessage(e)}`))}
              onRestore={viewArchived ? (f) => setArchived([f.id], false) : undefined}
              restoreDisabled={archiving || clearing}
              emptyMessage={loading ? 'Loading files…'
                : loadFailed && !files.length ? "Your files couldn't be loaded."
                : viewArchived && !archivedCount ? 'No archived files. Select files in Active Files and click Archive to move them here.' : undefined}
            />
          </div>
        </div>
      </main>

      {toast && (
        <ArchiveToast
          toast={toast}
          archiving={archiving}
          processing={!!processingId}
          onUndo={() => toast.undo && setArchived(toast.undo.ids, toast.undo.archive, false)}
          onDismiss={dismissToast}
        />
      )}

      {conversion.review && (
        <ConvertReviewDialog name={conversion.review.name} tables={conversion.review.tables} chosen={conversion.review.chosen} ocr={conversion.review.ocr} decisions={conversion.review.decisions} onChoose={conversion.choose} onDecide={conversion.decide} onCancel={conversion.cancel} onImport={conversion.importReviewed} />
      )}
      {mapping && <MappingDialog key={mapping.id} file={mapping} onClose={() => setMapping(undefined)} onConfirmed={mappingConfirmed} />}
      {preview && <PreviewModal file={preview} onClose={() => setPreview(undefined)} />}
      {confirmClear && <ClearDataModal onCancel={() => setConfirmClear(false)} onConfirm={clearData} />}
      {pending?.items ? (
        <ReplaceResultModal items={pending.items} otherCount={pending.batch.length - pending.items.length} warning={pending.warning}
          processor={pending.processor} onCancel={cancelPending} onConfirm={confirmRun} />
      ) : pending?.warning && (
        <QualityWarningModal warning={pending.warning} processor={pending.processor} onCancel={cancelPending} onConfirm={confirmRun} />
      )}
      {comparison && (
        <Suspense fallback={null}>
          <CompareWorkspace result={comparison} onClose={() => setComparison(undefined)} />
        </Suspense>
      )}
    </div>
    </AppShell>
  );
}

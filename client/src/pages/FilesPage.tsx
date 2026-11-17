import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Network, Wand2 } from 'lucide-react';
import { isInputFile, type CompareResult, type FileMeta } from '../../../shared/types';
import { Banner } from '../components/Banner';
import { ClearDataModal } from '../components/modals/ClearDataModal';
import { ConvertReviewDialog } from '../components/modals/ConvertReviewDialog';
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
import page from '../styles/page.module.scss';
import { classNames } from '../lib/class-names';
import { useArchive } from '../hooks/useArchive';
import { useConversion } from '../hooks/useConversion';
import { useFileList } from '../hooks/useFileList';
import { useFilters } from '../hooks/useFilters';
import { useProcessing } from '../hooks/useProcessing';
import { useSelection } from '../hooks/useSelection';
import { api, type StorageMode } from '../lib/api';
import { compareBlocker } from '../lib/compare-view';
import { filterFiles } from '../lib/file-status';
import { errorMessage } from '../lib/format';
import { AppVersion } from '../components/AppVersion';

// The comparison dialog and its charts download the first time Compare is used, alongside the request.
const loadCompareWorkspace = () => import('../components/compare/CompareWorkspace');
const CompareWorkspace = lazy(() => loadCompareWorkspace().then((m) => ({ default: m.CompareWorkspace })));
const COMPARE_CODE_FAILED = "The comparison couldn't be loaded. Reload the page to try again.";

/** The file workspace: upload, filter, process, preview, archive and compare files. */
export function FilesPage() {
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [preview, setPreview] = useState<FileMeta>();
  const [comparison, setComparison] = useState<CompareResult>();
  const [comparing, setComparing] = useState(false);
  const busy = useRef(false); // set synchronously, so a double click cannot start a second batch or archive
  const [storageMode, setStorageMode] = useState<StorageMode>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { files, refresh, upload, uploading, loading } = useFileList(setError);
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

  // Where files are kept, for the note under the upload area. If storage can't open, the file list reports it.
  useEffect(() => {
    api.storageMode().then(setStorageMode, () => {});
  }, []);

  // Clear my data: every upload and result in this browser is deleted and the five samples come back.
  async function clearData() {
    setConfirmClear(false);
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
      setClearing(false);
    }
  }

  // After an upload that added at least one file, filter to today's originals so the new files show first.
  // Excel files are converted and reviewed first; each is uploaded as a CSV only after Import as CSV.
  async function uploadFiles(list: File[]) {
    if (await upload(list, conversion.prepare) > 0) showNewFiles('original');
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
    try {
      const [result] = await Promise.all([api.compare(selectedInView.map((f) => f.id)), code]);
      setComparison(result);
    } catch (e) {
      setError(`Comparison failed: ${errorMessage(e)}`);
    }
    setComparing(false);
  }

  return (
    <div className={classNames(page.shell, styles.filesPage)}>
      <main className={styles.workspace}>
        <div className={classNames(page.titleRow, styles.titleArea)}>
          <h1 className={page.title}>CSV Files</h1>
          <p className={page.intro}>Upload, preview, process, and compare refrigerant datasets.</p>
          <nav aria-label="Pages" className={styles.headerNav}>
            <a href="/generator" className={page.navLink}>
              <Wand2 aria-hidden /> CSV Generator
            </a>
            <a href="/architecture" className={page.navLink}>
              <Network aria-hidden /> Architecture
            </a>
            <AppVersion />
          </nav>
        </div>

        <Sidebar
          processor={processor}
          setProcessor={setProcessor}
          onUpload={uploadFiles}
          onRun={() => requestRun(selectedInputs)}
          canRun={selectedInputs.length > 0 && !processingId && !archiving}
          running={!!processingId}
          uploading={uploading && !conversion.review}
          reading={conversion.reading ?? undefined}
          selected={selectedInputs.map(({ id, name }) => ({ id, name }))}
          storageMode={storageMode}
          onClearData={() => setConfirmClear(true)}
          clearDisabled={uploading || !!conversion.reading || !!processingId || archiving || clearing}
        />

        <div className={styles.main}>
          <FileFilters
            search={search} setSearch={setSearch} from={from} setFrom={setFrom} to={to} setTo={setTo}
            fn={fn} setFn={setFn} status={status} setStatus={setStatus}
            filtersActive={filtersActive} clearFilters={clearFilters}
          />

          {notice && <Banner tone="success" className={styles.banner} onDismiss={() => setNotice(undefined)}>{notice}</Banner>}
          {error && <Banner tone="error" className={styles.banner} onDismiss={() => setError(undefined)}>{error}</Banner>}

          <FileTabs
            tab={tab}
            setTab={setTab}
            counts={{ active: files.length - archivedCount, archived: archivedCount }}
            extra={<SortMenu sort={sort} setSort={setSort} viewArchived={viewArchived} />}
          />

          <div role="tabpanel" id="file-tabpanel" aria-labelledby={`tab-${tab}`} className={styles.tabPanel}>
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
              onDownload={(f) => api.download(f.id).catch((e) => setError(`Download failed: ${errorMessage(e)}`))}
              onRestore={viewArchived ? (f) => setArchived([f.id], false) : undefined}
              restoreDisabled={archiving}
              emptyMessage={loading ? 'Loading files…'
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
        <ConvertReviewDialog name={conversion.review.name} table={conversion.review.table} onCancel={conversion.cancel} onImport={conversion.importReviewed} />
      )}
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
  );
}

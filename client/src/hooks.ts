import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { FileMeta, ProcessorId, ReplaceConflict } from '../../shared/types';
import { api } from './api';
import { qualityWarning, replacements, type QualityWarning, type Replacement, type SortKey, type Status, type Tab } from './file-status';

// State for the file workspace, one concern per hook. App owns the error and notice banners, preview and
// comparison, and passes setters in where a hook needs to report something.

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const plural = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
/** How long the archive/restore toast stays up. */
export const TOAST_MS = 8000;

type Report = (message: string | undefined) => void;

/** The file list, reloaded on demand, and uploads into it. */
export function useFileList(onError: Report) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [uploading, setUploading] = useState(false);

  // Each request is numbered and only the latest one's answer is used, so a slow older response
  // (e.g. from an upload during a processing batch) never overwrites newer data.
  const listRequest = useRef(0);
  const refresh = () => {
    const request = ++listRequest.current;
    return api.list()
      .then((list) => { if (request === listRequest.current) setFiles(list); })
      .catch((e) => { if (request === listRequest.current) onError(msg(e)); });
  };
  useEffect(() => { refresh(); }, []);

  async function upload(list: File[]) {
    setUploading(true);
    onError(undefined);
    const errors: string[] = [];
    for (const f of list) {
      try { await api.upload(f); } catch (e) { errors.push(`${f.name}: ${msg(e)}`); }
    }
    setUploading(false);
    if (errors.length) onError(`Upload failed\n${errors.join('\n')}`);
    await refresh();
  }

  return { files, refresh, upload, uploading };
}

/** Which files are checked. */
export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (ids: string[], on: boolean) =>
    setSelectedIds((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  return { selectedIds, setSelectedIds, toggle, toggleAll };
}

/** The filter card, the tabs and each tab's sort order. */
export function useFilters() {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'All' | Status>('All');
  const [fn, setFn] = useState('All'); // processing function filter: 'All', 'original' or a function id
  // Each tab keeps its own order: newest uploads first, and most recently archived first.
  const [sortBy, setSortBy] = useState<Record<Tab, SortKey>>({ active: 'uploaded-desc', archived: 'archived-desc' });
  const [tab, setTab] = useState<Tab>('active');

  const filtersActive = !!(search || from || to || status !== 'All' || fn !== 'All');
  const clearFilters = () => { setSearch(''); setFrom(''); setTo(''); setStatus('All'); setFn('All'); };
  const setSort = (key: SortKey) => setSortBy((b) => ({ ...b, [tab]: key }));

  return {
    search, setSearch, from, setFrom, to, setTo, status, setStatus, fn, setFn, tab, setTab,
    viewArchived: tab === 'archived', sort: sortBy[tab], setSort, filtersActive, clearFilters,
  };
}

/** Archive/restore confirmation. undo reverses exactly the files it names. */
export interface Toast { title: string; detail: string; undo?: { ids: string[]; archive: boolean } }

/**
 * Archiving and restoring, with the confirmation toast. busy is shared with processing, so an archive
 * and a processing batch never run at the same time.
 */
export function useArchive({ busy, refresh, deselect, onError }: {
  busy: MutableRefObject<boolean>; refresh: () => Promise<void>; deselect: (ids: string[]) => void; onError: Report;
}) {
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState<Toast>();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Archives the given files, or restores them when archive is false. undoable adds Undo to the toast. */
  async function setArchived(ids: string[], archive: boolean, undoable = true) {
    if (!ids.length || busy.current) return;
    busy.current = true;
    setArchiving(true);
    onError(undefined);
    setToast(undefined);
    try {
      await api.archive(ids, archive);
      deselect(ids);
      setToast({
        title: `${plural(ids.length)} ${archive ? 'archived' : 'restored'}`,
        detail: archive ? 'Moved out of Active Files.' : 'Back in Active Files.',
        undo: undoable ? { ids, archive: !archive } : undefined,
      });
    } catch (e) {
      onError(`${archive ? 'Archive' : 'Restore'} failed: ${msg(e)}`);
    }
    await refresh();
    busy.current = false;
    setArchiving(false);
  }

  return { archiving, toast, dismissToast: () => setToast(undefined), setArchived };
}

/** A run waiting for confirmation: items lists results it would replace (Replace dialog); a warning alone is the Data Quality Warning. */
export interface PendingRun { batch: FileMeta[]; processor: ProcessorId; warning?: QualityWarning; items?: Replacement[] }

/** Running a processing function over input files, one at a time, with its confirmation dialogs. */
export function useProcessing({ files, busy, refresh, setSelectedIds, onError, onNotice, onPreview }: {
  files: FileMeta[];
  busy: MutableRefObject<boolean>;
  refresh: () => Promise<void>;
  setSelectedIds: (ids: Set<string>) => void;
  onError: Report;
  onNotice: Report;
  onPreview: (file: FileMeta) => void;
}) {
  const [processor, setProcessor] = useState<ProcessorId>('validation');
  const [processingId, setProcessingId] = useState<string>(); // batches run one file at a time
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingRun>();

  /**
   * Run Processing: asks first when the run would replace existing results (one dialog, which also
   * carries the Data Quality Warning when it applies), or when Mass or Classification would skip invalid rows.
   */
  function requestRun(batch: FileMeta[]) {
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
    onError(undefined);
    onNotice(undefined);
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
    if (errors.length) onError(`Processing failed\n${errors.join('\n')}`);

    if (conflicts.length) {
      await refresh(); // show the result that appeared
      if (made.length) onNotice(`Processed ${plural(made.length)}.`);
      // The data quality warning, if any, was already confirmed for this batch.
      return setPending({
        batch: conflicts.map((c) => c.input),
        processor,
        items: conflicts.map(({ input, conflict: { existing } }) => ({ inputId: input.id, resultId: existing.id, resultName: existing.name, archived: !!existing.archived })),
      });
    }
    if (made.length === 1) return onPreview(made[0]); // single file: show the result right away
    if (made.length > 1) onNotice(`Processed ${made.length} files.${comparable ? ' Their results are selected, so you can compare them.' : ' Results are in the list.'}`);
  }

  return { processor, setProcessor, processingId, failedIds, pending, cancelPending: () => setPending(undefined), requestRun, confirmRun };
}

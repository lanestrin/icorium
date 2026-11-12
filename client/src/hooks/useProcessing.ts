import { useState, type MutableRefObject } from 'react';
import type { FileMeta, ProcessorId, ReplaceConflict } from '../../../shared/types';
import { api } from '../lib/api';
import { qualityWarning, replacements, type QualityWarning, type Replacement } from '../lib/file-status';
import { errorMessage, plural, type Report } from '../lib/format';

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
          errors.push(`${f.name}: ${errorMessage(e)}`);
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

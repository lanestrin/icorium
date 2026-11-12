import { parseFileId, PROCESSORS, resultFileId, type FileMeta, type ProcessorId } from '../../../shared/types';

// Rules for files in the workspace: statuses, warnings, replacements, function names, sorting and filtering.

/** Every status a file row can show, in the order the Status filter lists them. */
export const STATUSES = ['Ready', 'Needs Review', 'Processing', 'Processed', 'Error'] as const;
export type Status = (typeof STATUSES)[number];

/** Stored status, overridden while this file is processing or after its processing failed. */
export const displayStatus = (f: FileMeta, processingId?: string, failedIds?: Set<string>): Status =>
  f.id === processingId ? 'Processing' : failedIds?.has(f.id) ? 'Error' : f.status;

export interface QualityWarning {
  affected: { id: string; name: string; valid: number; invalid: number }[];
  cleanCount: number; // selected inputs with no invalid rows
}

/**
 * Mass and Classification only calculate valid rows, so warn before running them on
 * inputs with invalid rows. Validation never warns. Returns undefined when no warning is needed.
 */
export function qualityWarning(batch: FileMeta[], processor: ProcessorId): QualityWarning | undefined {
  if (processor === 'validation') return undefined;
  const affected = batch
    .filter((f) => (f.problemRows ?? 0) > 0)
    .map((f) => ({ id: f.id, name: f.name, invalid: f.problemRows!, valid: Math.max(0, f.rows - f.problemRows!) }));
  return affected.length ? { affected, cleanCount: batch.length - affected.length } : undefined;
}

/** A result that running a function would replace. */
export interface Replacement { inputId: string; resultId: string; resultName: string; archived: boolean }

/**
 * The batch inputs that already have a result for this function, in batch order. A result is found by
 * its File ID (the input's ID plus the function's code), never by name, and archived results count too.
 */
export function replacements(batch: FileMeta[], processor: ProcessorId, files: FileMeta[]): Replacement[] {
  return batch.flatMap((input) => {
    const result = files.find((f) => f.id === resultFileId(input.id, processor));
    return result ? [{ inputId: input.id, resultId: result.id, resultName: result.name, archived: !!result.archived }] : [];
  });
}

/** Choices for the processing function filter: inputs first, then each function in PROCESSORS order. */
export const PROCESSING_FUNCTIONS: { value: 'original' | ProcessorId; label: string }[] = [
  { value: 'original', label: 'Original' },
  ...PROCESSORS.map((p) => ({ value: p.id, label: p.tableLabel })),
];
/** Which processing function made a file: 'original' for inputs, the function's id for results (undefined if unknown). */
export const processingFunctionId = (f: FileMeta): 'original' | ProcessorId | undefined =>
  f.status !== 'Processed' ? 'original' : f.processor;
/** That function's name for the table: "Original" for inputs, "—" for a result whose function is unknown. */
export const processingFunction = (f: FileMeta) =>
  PROCESSING_FUNCTIONS.find((o) => o.value === processingFunctionId(f))?.label ?? '—';

export type SortKey = 'archived-desc' | 'uploaded-desc' | 'uploaded-asc' | 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc';
/** Sort by choices. "Archived (newest)" is offered only in the Archived tab, where it is the default. */
export const SORT_OPTIONS: { key: SortKey; label: string; archivedOnly?: boolean }[] = [
  { key: 'archived-desc', label: 'Archived (newest)', archivedOnly: true },
  { key: 'uploaded-desc', label: 'Uploaded (newest)' },
  { key: 'uploaded-asc', label: 'Uploaded (oldest)' },
  { key: 'name-asc', label: 'Name (A–Z)' },
  { key: 'name-desc', label: 'Name (Z–A)' },
  { key: 'id-asc', label: 'File ID (low–high)' },
  { key: 'id-desc', label: 'File ID (high–low)' },
];

const byName = (a: FileMeta, b: FileMeta) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });

/**
 * Where a File ID sorts: its base number, then its place in that group (the original first, then
 * results in PROCESSORS order: -V, -M, -C). Anything that is not a File ID sorts after every File ID.
 */
function idPosition(id: string): { base: number; place: number } {
  const parsed = parseFileId(id);
  if (!parsed) return { base: Infinity, place: 0 };
  const place = parsed.code ? PROCESSORS.findIndex((p) => p.code === parsed.code) + 1 : 0;
  return { base: Number(parsed.base), place };
}

/** By base number in the given direction; within one base the original and its results keep their fixed order. */
const byId = (descending: boolean) => (a: FileMeta, b: FileMeta) => {
  const x = idPosition(a.id);
  const y = idPosition(b.id);
  if (x.base !== y.base) {
    if (x.base === Infinity || y.base === Infinity) return x.base === Infinity ? 1 : -1;
    return descending ? y.base - x.base : x.base - y.base;
  }
  return x.place - y.place;
};
/** A sorted copy. Ties keep their existing order. Files archived before the date was kept sort last. */
export function sortFiles(files: FileMeta[], key: SortKey): FileMeta[] {
  const compare: Record<SortKey, (a: FileMeta, b: FileMeta) => number> = {
    'archived-desc': (a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''),
    'uploaded-desc': (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
    'uploaded-asc': (a, b) => a.uploadedAt.localeCompare(b.uploadedAt),
    'name-asc': byName,
    'name-desc': (a, b) => byName(b, a),
    'id-asc': byId(false),
    'id-desc': byId(true),
  };
  return [...files].sort(compare[key]);
}

/**
 * What an imported result is linked to, for the Imported marker (note) and the preview subtitle (short).
 * It is linked only when sourceId is set; importedFrom is just the source the file named.
 */
export function importedLineage(f: Pick<FileMeta, 'sourceId' | 'importedFrom'>): { note: string; short: string } {
  if (f.sourceId) return { note: `Uploaded result file, linked to original input ${f.sourceId}.`, short: `Imported from ${f.sourceId}` };
  if (f.importedFrom) return {
    note: `Uploaded result file. It names ${f.importedFrom} as its source, but that original input is not in this workspace or its data differs, so it is not linked.`,
    short: `Imported: not linked to ${f.importedFrom}`,
  };
  return { note: 'Uploaded result file. Its original input is not linked in this workspace.', short: 'Imported: original input not linked' };
}

export type Tab = 'active' | 'archived';

/** What the filter card and tabs are set to. 'All' turns a dropdown filter off; dates are YYYY-MM-DD. */
export interface FileFilters {
  search: string;
  from: string;
  to: string;
  status: 'All' | Status;
  fn: string; // 'All', 'original' or a function id
  viewArchived: boolean;
  sort: SortKey;
}

/** The files to show in the table: those matching every filter in the current tab, sorted. */
export function filterFiles(files: FileMeta[], filters: FileFilters, state: { processingId?: string; failedIds?: Set<string> } = {}): FileMeta[] {
  const { search, from, to, status, fn, viewArchived, sort } = filters;
  const query = search.toLowerCase();
  const shown = files.filter((f) => {
    const day = new Date(f.uploadedAt).toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
    return (
      // Search finds files by name or File ID: "101010" finds the input and its results.
      (f.name.toLowerCase().includes(query) || f.id.toLowerCase().includes(query)) &&
      // Each tab shows only its own files; the status filter applies within the tab.
      !!f.archived === viewArchived &&
      (status === 'All' || displayStatus(f, state.processingId, state.failedIds) === status) &&
      (fn === 'All' || processingFunctionId(f) === fn) &&
      (!from || day >= from) &&
      (!to || day <= to)
    );
  });
  return sortFiles(shown, sort);
}

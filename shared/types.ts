export const PROCESSORS = [
  { id: 'validation', label: 'Composition Validation', short: 'Validation', description: 'Check mixture percentages (≈100%)' },
  { id: 'mass', label: 'Component Mass Calculation', short: 'Mass', description: 'Calculate mass of each refrigerant (kg)' },
  { id: 'classification', label: 'Batch Classification', short: 'Classification', description: 'Categorize batches by composition' },
] as const;

export type ProcessorId = (typeof PROCESSORS)[number]['id'];
export type FileStatus = 'Ready' | 'Needs Review' | 'Processed';

export interface FileMeta {
  id: string;
  name: string;
  rows: number;
  columns: number;
  uploadedAt: string; // ISO
  status: FileStatus;
  processor?: ProcessorId; // result files only
  sourceId?: string;
  generatedColumns?: string[];
  problemRows?: number; // rows with missing, invalid or duplicate values
  archived?: boolean; // hidden from the main list and the compare pickers until restored
  archivedAt?: string; // ISO; when it was last archived, cleared on restore
}

/** Both clean and invalid input files can be processed; result files cannot. */
export const isInputFile = (file: FileMeta) => file.status === 'Ready' || file.status === 'Needs Review';

/** A row the Composition Validation rules flag. row is 1-based. */
export interface Problem {
  row: number;
  batchId: string;
  message: string;
}

/** Problem rows in one file: the total, and the first ones in detail. */
export interface ProblemList {
  total: number;
  items: Problem[];
}

export type Row = Record<string, string>;

/** One page of a file's rows. */
export interface FileRows {
  headers: string[];
  rows: Row[];
  offset: number; // index of rows[0] in the file
  totalRows: number;
  generatedColumns: string[];
  problems: ProblemList; // for the whole file, not just this page
}

/** Compare 2 to 5 results at a time. */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 5;

/** How rows were lined up across files: by batch ID when every pair of files shares IDs, otherwise by position. */
export type RowMatch = 'batch_id' | 'position';

/** One compared file. Arrays elsewhere in CompareResult list files in this order. */
export interface CompareFile {
  id: string;
  name: string;
  source?: string; // partner adapter, e.g. 'Partner A'
  rows: number;
  problems: ProblemList;
}

/** One matched row: its key (batch ID or "#n") and its 1-based row number in each file, null where the file lacks it. */
export interface MatchedRow {
  key: string;
  rowNumbers: (number | null)[];
}

export interface CompareColumn {
  name: string;
  kind: 'numeric' | 'category';
  unit?: string; // 'kg' or '%'
  /** How summary describes each file. 'count' = categories hold rows per category. */
  measure: 'total' | 'mean' | 'count';
  /** numeric: each file's total or mean (null when it has no values). */
  summary?: (number | null)[];
  /** category: rows per category in each file. */
  categories?: { label: string; counts: number[] }[];
  /** values[row][file], following CompareResult.rows. null = blank number or no such row in that file. */
  values: (number | string | null)[][];
  rowsDiffering: number; // matched rows whose values differ between files, or that some file lacks
  rowsCompared: number;
}

export interface CompareResult {
  processor: ProcessorId;
  rowMatch: RowMatch;
  files: CompareFile[];
  rows: MatchedRow[];
  columns: CompareColumn[];
}

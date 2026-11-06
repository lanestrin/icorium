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

export interface CompareColumn {
  name: string;
  kind: 'numeric' | 'category';
  unit?: string; // 'kg' or '%'
  /** How valueA/valueB summarize the rows. 'count' = the chart shows rows per category. */
  measure: 'total' | 'mean' | 'count';
  /** numeric: one point per row; category: one point per category with row counts */
  data: { label: string; a: number | null; b: number | null }[];
  valueA?: number;
  valueB?: number;
  rowsDiffering: number;
  rowsCompared: number;
}

export interface CompareResult {
  processor: ProcessorId;
  fileA: string;
  fileB: string;
  columns: CompareColumn[];
  problemsA: ProblemList;
  problemsB: ProblemList;
}

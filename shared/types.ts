export const PROCESSORS = [
  { id: 'validation', label: 'Composition Validation', short: 'Validation', description: 'Check mixture percentages (≈100%)' },
  { id: 'mass', label: 'Component Mass Calculation', short: 'Mass', description: 'Calculate mass of each refrigerant (kg)' },
  { id: 'classification', label: 'Batch Classification', short: 'Classification', description: 'Categorize batches by composition' },
] as const;

export type ProcessorId = (typeof PROCESSORS)[number]['id'];
export type FileStatus = 'Ready' | 'Processed';

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
}

export type Row = Record<string, string>;

export interface FileRows {
  headers: string[];
  rows: Row[];
  generatedColumns: string[];
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
}

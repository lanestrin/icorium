// code: the fixed letter a result's File ID ends with (101010-V). Never change or reuse a code.
export const PROCESSORS = [
  { id: 'validation', code: 'V', label: 'Composition Validation', short: 'Validation', description: 'Check mixture percentages (≈100%)' },
  { id: 'mass', code: 'M', label: 'Component Mass Calculation', short: 'Mass', description: 'Calculate mass of each refrigerant (kg)' },
  { id: 'classification', code: 'C', label: 'Batch Classification', short: 'Classification', description: 'Categorize batches by composition' },
] as const;

export type ProcessorId = (typeof PROCESSORS)[number]['id'];
export type ProcessorCode = (typeof PROCESSORS)[number]['code'];

/*
 * File IDs. Every upload gets a new six-digit base ID, counting up from 100001 and never reused.
 * A result's ID is its input's base ID, a dash and its function's code: 101010-V, 101010-M, 101010-C.
 * IDs are always uppercase; anything else is not a File ID.
 */
export const FIRST_FILE_ID = 100001;
/** The File ID travels with the data: inputs carry it in file_id, results add their own in result_id. */
export const FILE_ID_COLUMN = 'file_id';
export const RESULT_ID_COLUMN = 'result_id';
export const LAST_FILE_ID = 999999;
const FILE_ID = new RegExp(`^(\\d{6})(?:-([${PROCESSORS.map((p) => p.code).join('')}]))?$`);

/** The parts of a File ID, or undefined when the text is not one. */
export function parseFileId(id: string): { base: string; code?: ProcessorCode } | undefined {
  const m = FILE_ID.exec(id);
  if (!m || Number(m[1]) < FIRST_FILE_ID) return undefined;
  return { base: m[1], code: m[2] as ProcessorCode | undefined };
}

export const codeOf = (processor: ProcessorId): ProcessorCode => PROCESSORS.find((p) => p.id === processor)!.code;

/** The ID of the result a function makes from an input: 101010 + mass = 101010-M. */
export const resultFileId = (inputId: string, processor: ProcessorId) => `${inputId}-${codeOf(processor)}`;

/** The base number after the highest one in use (inputs, results and claims alike), starting at 100001. */
export function nextBaseId(ids: Iterable<string>): string {
  let highest = FIRST_FILE_ID - 1;
  for (const id of ids) {
    const parsed = parseFileId(id);
    if (parsed) highest = Math.max(highest, Number(parsed.base));
  }
  if (highest >= LAST_FILE_ID) throw new Error('No File IDs left: every six-digit ID is in use.');
  return String(highest + 1);
}
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
  imported?: boolean; // an uploaded result: its original input is not in this workspace
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

/** Partners the CSV generator can write for (see server/src/lib/generate.ts). */
export const GENERATOR_PARTNERS = ['A', 'B', 'C'] as const;
export type GeneratorPartner = (typeof GENERATOR_PARTNERS)[number];

/** One planted error. A duplicate batch ID is reported on both rows that share it. 1-based rows. */
export interface GeneratedError {
  row: number;
  kind: 'mass missing' | 'mass not a number' | 'negative percentage' | 'composition total off' | 'batch ID missing' | 'duplicate batch ID';
}

/** A generated partner CSV, returned for download or for adding to the file list. Nothing is saved. */
export interface GeneratedFile {
  name: string;
  partner: GeneratorPartner;
  rows: number;
  text: string;
  errors: GeneratedError[];
}

/** POST /api/generate: 1–10 files with the same settings and different data. */
export interface GeneratedBatch { files: GeneratedFile[] }

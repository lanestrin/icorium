// Canonical ingestion types (build-plan 19.1), shared by header matching, unit verification, the processing
// gate, the import review and provenance (19.2 to 19.8). Types and the issue codes only: no behaviour lives here.

/** Where a value came from. */
export type SourceKind = 'csv' | 'excel' | 'pdf' | 'image';

/** One place in the original file. row is 1-based; column is the original header name. */
export interface SourceRef {
  kind: SourceKind;
  sheet?: string;
  page?: number;
  row: number;
  column?: string;
}

/** The record fields the processors use: the measurement keys of `Normalized`. */
export type CanonicalField = 'batchId' | 'sampleDate' | 'massKg' | 'r32' | 'r125' | 'r134a';

/** How a source column was matched to a field. Only an approved mapping may feed a calculation. */
export type MappingOrigin = 'exact' | 'normalized' | 'alias' | 'profile' | 'manual';

export interface FieldMapping {
  field: CanonicalField;
  sourceColumn: string;
  origin: MappingOrigin;
  approved: boolean;
}

/** The fields that hold a measured number, and so a unit. */
export type MeasurementField = 'massKg' | 'r32' | 'r125' | 'r134a';

/** The unit a measurement is read in, and the factor that converts it to kg or percent. */
export interface UnitDecision {
  field: MeasurementField;
  unit: string;
  factor: number;
  origin: 'header' | 'metadata' | 'profile' | 'confirmed' | 'partner';
}

/** A blocking issue keeps the affected data out of calculations; a warning or info finding does not. */
export type IssueSeverity = 'blocking' | 'warning' | 'info';

export const ISSUE_CODES = [
  'batch_id_missing',
  'batch_id_duplicate',
  'mass_missing',
  'mass_invalid',
  'component_missing',
  'component_not_number',
  'component_out_of_range',
  'composition_total',
  'mapping_missing',
  'mapping_ambiguous',
  'mapping_collision',
  'mapping_unknown_column',
  'header_duplicate',
  'unit_unverified',
  'unit_unsupported',
  'unit_conflict',
  'unit_range_suspect',
  'number_separator_ambiguous',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface ValidationIssue {
  severity: IssueSeverity;
  code: IssueCode;
  field?: CanonicalField;
  /** 1-based data row. Set once a whole file is validated; unset for a single record. */
  row?: number;
  /** The text shown to people, and written to `validation_errors`. */
  reason: string;
  source?: SourceRef;
}

/** A blocking issue: it keeps the affected data out of calculations. Every check so far is blocking. */
export const blockingIssue = (code: IssueCode, reason: string, field?: CanonicalField): ValidationIssue =>
  field ? { severity: 'blocking', code, field, reason } : { severity: 'blocking', code, reason };

/** A warning: it is shown for review and never blocks processing or changes a decision. */
export const warningIssue = (code: IssueCode, reason: string, field?: CanonicalField): ValidationIssue =>
  field ? { severity: 'warning', code, field, reason } : { severity: 'warning', code, reason };

/**
 * What upload and confirmMapping store on a file that is not exactly a partner's (build-plan 19.4), and what a
 * result copies from its input. `approved` is never trusted alone: the processing gate checks the record
 * against the stored CSV's headers every time.
 */
export interface IngestionRecord {
  /** One per mapped field; approved only after confirmMapping. */
  mappings: FieldMapping[];
  units: UnitDecision[];
  /** File-level issues: blocking and warnings before approval, warnings only after. */
  issues: ValidationIssue[];
  /** Original header names the upload repeated (Papa Parse renames the later copies, which the stored CSV keeps). */
  duplicateHeaders: string[];
  approved: boolean;
  /** ISO time confirmMapping approved it. */
  confirmedAt?: string;
}

/** A saved mapping that only suggests. `key` is headerKey() of the file it came from; one profile per key. */
export interface SupplierProfile {
  key: string;
  name: string;
  columns: Record<CanonicalField, string>;
  units: Record<MeasurementField, string>;
  /** ISO time. */
  savedAt: string;
}

/** Where a file is in import, apart from its stored status. */
export type IngestionState = 'Needs Mapping' | 'Needs Review' | 'Ready for Processing';

/** The largest original file kept (and converted), in MB. */
export const ORIGINAL_MAX_MB = 20;

/** What OCR read: the whole image, or these PDF pages (1-based). */
export type SourceOcr = 'image' | number[];

/** The small summary kept on a file's metadata; the per-row data stays in its SourceRecord. */
export interface SourceSummary {
  kind: SourceKind;
  name: string;
  size: number;
  /** Excel only: the sheet and the A1 range of the table. */
  sheet?: string;
  range?: string;
  ocr?: SourceOcr;
}

/** A value read from a PDF or image that the person decided on before import. column is its 0-based position among the uploaded headers. */
export interface SourceCheck {
  /** 1-based data row. */
  row: number;
  column: number;
  asRead: string;
  reasons: string[];
  decision: 'keep' | 'blank';
}

/**
 * What storage keeps beside a file's CSV (build-plan 19.8): the original file and where each stored data row came
 * from. A CSV has no per-row references (its source row is the data row plus one).
 */
export interface SourceRecord {
  kind: SourceKind;
  original: { name: string; mediaType: string; bytes: ArrayBuffer };
  sheet?: string;
  range?: string;
  /** Excel only: the column letter of each header, in order. */
  columns?: string[];
  /** One per data row, in stored order; empty for a CSV. row is the sheet or document row. */
  rows: { row: number; page?: number; pageRow?: number }[];
  checks: SourceCheck[];
  ocr?: SourceOcr;
}

/** What a result records about how it was calculated. */
export interface ResultTrace {
  inputFileId: string;
  /** Absent for an input uploaded before sources were kept. */
  source?: SourceSummary;
  mappings: FieldMapping[];
  units: UnitDecision[];
  validation: {
    approval: 'partner' | 'confirmed';
    confirmedAt?: string;
    rows: number;
    excludedRows: number;
    warnings: string[];
  };
  processor: string;
  processorVersion: number;
}

/** One mapped field of a result row, traced to its raw source cell (build-plan 19.8). */
export interface FieldExplanation {
  field: CanonicalField;
  label: string;
  /** The input column the mapping read, and how it was matched. */
  column: string;
  origin: MappingOrigin;
  /** Where the raw value is in the original file: "Sheet1!C7", "page 2, row 5" or `row 7, column "Net Mass"`; absent when not recorded. */
  location?: string;
  /** The raw value, exactly as stored in the input (empty when missing, or when the person chose Leave blank). */
  raw: string;
  /** PDF and image only: the value as read, when the person had to confirm it. */
  confirmed?: { asRead: string; reasons: string[]; decision: 'keep' | 'blank' };
  /** Measurements only: the unit read in, the factor to kg or percent, and the value used (never zero for a missing one). */
  unit?: string;
  factor?: number;
  normalized?: number | null;
  problem?: 'missing' | 'not a number' | 'ambiguous separator';
}

/** What explain() answers for a result that has a trace. */
export interface Explanation {
  traced: true;
  fileId: string;
  row: number;
  column: string;
  /** The value as stored in the result. */
  value: string;
  processor: { id: string; label: string; version: number };
  /** excluded: the row had a blocking problem, so no value was calculated from it. */
  rowStatus: 'calculated' | 'excluded';
  reasons: string;
  input: { fileId: string; name?: string; source?: SourceSummary };
  fields: FieldExplanation[];
}

export type ExplainOutcome = Explanation | { traced: false; reason: string };

/** What a converted upload (Excel, PDF or image) sends beside its CSV: the SourceRecord of a file that is not a CSV. */
export type UploadSource = Omit<SourceRecord, 'kind'> & { kind: Exclude<SourceKind, 'csv'> };

/** Why a result cannot be explained: it was uploaded, or it was processed before traces were recorded. */
export const NO_TRACE_UPLOADED = 'This result was uploaded, so how it was calculated is not recorded.';
export const NO_TRACE_OLD = 'This result was made before traces were recorded. Run the function again to record one.';

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

/** Where a file is in import, apart from its stored status. */
export type IngestionState = 'Needs Mapping' | 'Needs Review' | 'Ready for Processing';

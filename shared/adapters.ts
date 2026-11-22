import { ADAPTERS, ADAPTER_FIELDS, FILE_ID_COLUMN, RESULT_ID_COLUMN, type FileMeta, type Row } from './types';
import type { FieldMapping, IngestionRecord, MeasurementField, UnitDecision } from './ingestion';
import { httpError } from './csv';
import { FIELD_LABELS, matchPartner, partnerMatchProblem } from './mapping';
import { isSupportedUnit, MEASUREMENT_FIELDS, normalizeRow, partnerUnits, UNIT_FACTORS } from './units';

/** Canonical record every processor works on. null = missing, NaN = not a number. Percentages 0–100. */
export interface Normalized {
  batchId: string;
  sampleDate: string;
  source: string; // which partner adapter read the row
  massKg: number | null;
  r32: number | null;
  r125: number | null;
  r134a: number | null;
  /** Measurement fields whose cell had an ambiguous decimal or thousands separator. Omitted when none. */
  ambiguous?: MeasurementField[];
}

// The partner formats themselves are ADAPTERS in shared/types.ts; this file matches and normalizes rows.

/** How to read a file's rows: the partner adapter or the approved mapping, and the units it was read in. */
export interface Reader {
  name: string;
  units: UnitDecision[];
  normalize(row: Row): Normalized;
}

/** The `source` of rows read through a confirmed mapping. */
export const MAPPED_SOURCE = 'Mapped columns';

const readerForAdapter = (a: (typeof ADAPTERS)[number]): Reader => {
  const mappings: FieldMapping[] = ADAPTER_FIELDS.map((field, i) => ({ field, sourceColumn: a.columns[i], origin: 'exact', approved: true }));
  const units = partnerUnits(a);
  return { name: a.name, units, normalize: (row) => normalizeRow(row, mappings, units, a.name) };
};

/**
 * Why a stored mapping record cannot be used on these headers, or an empty list when it can. Never trusts
 * `approved` alone: every mapped column must still be in the file, once, and no ID column; every unit must be
 * supported with its exact factor; and no blocking issue may remain.
 */
export function recordProblems(record: IngestionRecord, headers: readonly string[]): string[] {
  if (!record.approved) return ['its columns and units have not been confirmed'];
  const out: string[] = [];
  const used = new Set<string>();
  for (const field of ADAPTER_FIELDS) {
    const label = FIELD_LABELS[field];
    const mapped = record.mappings.filter((m) => m.field === field);
    if (mapped.length !== 1 || !mapped[0].approved) { out.push(`${label} has no approved column`); continue; }
    const column = mapped[0].sourceColumn;
    if (!headers.includes(column)) out.push(`the column "${column}" for ${label} is not in the file`);
    else if (column === FILE_ID_COLUMN || column === RESULT_ID_COLUMN) out.push(`the column "${column}" cannot hold ${label}`);
    else if (record.duplicateHeaders.includes(column)) out.push(`the column "${column}" for ${label} appears more than once in the file`);
    else if (used.has(column)) out.push(`the column "${column}" is used for two fields`);
    used.add(column);
  }
  for (const field of MEASUREMENT_FIELDS) {
    const decided = record.units.filter((u) => u.field === field);
    const unit = decided.length === 1 ? decided[0] : undefined;
    if (!unit || !isSupportedUnit(field, unit.unit) || unit.factor !== UNIT_FACTORS[unit.unit as keyof typeof UNIT_FACTORS]) out.push(`the unit for ${FIELD_LABELS[field]} is not confirmed`);
  }
  for (const issue of record.issues) if (issue.severity === 'blocking') out.push(issue.reason);
  return out;
}

/**
 * How to read a stored file: through its approved mapping record when it has one, otherwise as the one partner
 * format its headers match. Otherwise the reasons it cannot be read (and so cannot be processed) yet.
 */
export function resolveReader(meta: Pick<FileMeta, 'ingestion'>, headers: readonly string[]): { reader: Reader } | { problems: string[] } {
  if (meta.ingestion) {
    const problems = recordProblems(meta.ingestion, headers);
    if (problems.length) return { problems };
    const { mappings, units } = meta.ingestion;
    return { reader: { name: MAPPED_SOURCE, units, normalize: (row) => normalizeRow(row, mappings, units, MAPPED_SOURCE) } };
  }
  const adapter = ADAPTERS.find((a) => a.columns.every((c) => headers.includes(c)));
  if (!adapter) return { problems: ['its columns are not a known partner format and have not been mapped'] };
  return { reader: readerForAdapter(adapter) };
}

/** The reader for a stored file, or undefined when it cannot be read yet (previews and comparisons then skip row checks). */
export function readerFor(meta: Pick<FileMeta, 'ingestion'>, headers: readonly string[]): Reader | undefined {
  const found = resolveReader(meta, headers);
  return 'reader' in found ? found.reader : undefined;
}

/**
 * The partner adapter for a file's headers. A new upload passes `check` with the headers that appeared more than
 * once, and is then refused when two partner schemas match or a matched column is duplicated. Without `check`
 * (files already stored) the first matching partner is used, as before.
 */
export function getAdapter(headers: string[], check?: { duplicates: string[] }): Reader {
  const problem = check ? partnerMatchProblem(matchPartner(headers, check.duplicates)) : undefined;
  if (problem) throw httpError(400, problem);
  const a = ADAPTERS.find((a) => a.columns.every((c) => headers.includes(c)));
  if (!a) throw httpError(400, `Unrecognized CSV schema. Expected columns for one of: ${ADAPTERS.map((a) => `${a.name} (${a.columns.join(', ')})`).join('; ')}`);
  return readerForAdapter(a);
}

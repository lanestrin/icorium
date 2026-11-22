import { ADAPTERS, ADAPTER_FIELDS, type Row } from './types';
import type { FieldMapping, MeasurementField } from './ingestion';
import { httpError } from './csv';
import { matchPartner, partnerMatchProblem } from './mapping';
import { normalizeRow, partnerUnits } from './units';

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

/**
 * The partner adapter for a file's headers. A new upload passes `check` with the headers that appeared more than
 * once, and is then refused when two partner schemas match or a matched column is duplicated. Without `check`
 * (files already stored) the first matching partner is used, as before.
 */
export function getAdapter(headers: string[], check?: { duplicates: string[] }) {
  const problem = check ? partnerMatchProblem(matchPartner(headers, check.duplicates)) : undefined;
  if (problem) throw httpError(400, problem);
  const a = ADAPTERS.find((a) => a.columns.every((c) => headers.includes(c)));
  if (!a) throw httpError(400, `Unrecognized CSV schema. Expected columns for one of: ${ADAPTERS.map((a) => `${a.name} (${a.columns.join(', ')})`).join('; ')}`);
  const mappings: FieldMapping[] = ADAPTER_FIELDS.map((field, i) => ({ field, sourceColumn: a.columns[i], origin: 'exact', approved: true }));
  const units = partnerUnits(a);
  return {
    name: a.name,
    units,
    normalize: (row: Row): Normalized => normalizeRow(row, mappings, units, a.name),
  };
}

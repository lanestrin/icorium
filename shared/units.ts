import { adapterUnit, ADAPTER_FIELDS, type Row } from './types';
import type { Normalized } from './adapters';
import { blockingIssue, warningIssue, type FieldMapping, type MeasurementField, type UnitDecision, type ValidationIssue } from './ingestion';
import type { MappingSuggestion, Adapter } from './mapping';

// Unit verification (build-plan 19.3). A unit comes from evidence, never from the size of the values:
//   1. a unit the header or alias states (or the exact partner schema)
//   2. a supplier profile
//   3. the person's confirmation
// Without one of these the field is blocked. Value ranges only warn. Nothing here stores or reads a file.

/** Factor from each supported unit to kg (mass) or percent (composition). */
export const UNIT_FACTORS = { kg: 1, lb: 0.45359237, g: 0.001, '%': 1, fraction: 100 } as const;

const MASS_UNITS = ['kg', 'lb', 'g'];
const COMPOSITION_UNITS = ['%', 'fraction'];
export const MEASUREMENT_FIELDS = ['massKg', 'r32', 'r125', 'r134a'] as const satisfies readonly MeasurementField[];

const LABEL: Record<MeasurementField, string> = { massKg: 'mass', r32: 'R-32', r125: 'R-125', r134a: 'R-134a' };
const acceptedUnits = (field: MeasurementField) => (field === 'massKg' ? MASS_UNITS : COMPOSITION_UNITS);
const unitList = (field: MeasurementField) => acceptedUnits(field).join(', ').replace(/, ([^,]+)$/, ' or $1');
export const isSupportedUnit = (field: MeasurementField, unit: string) => acceptedUnits(field).includes(unit);
const decision = (field: MeasurementField, unit: string, origin: UnitDecision['origin']): UnitDecision => ({
  field,
  unit,
  factor: UNIT_FACTORS[unit as keyof typeof UNIT_FACTORS],
  origin,
});

/** Units from outside the file, per field. The strings are untrusted and compared exactly against the supported units. */
export interface UnitEvidence {
  profile?: Partial<Record<MeasurementField, string>>;
  confirmed?: Partial<Record<MeasurementField, string>>;
}

/** The four unit decisions of an exact partner schema. */
export function partnerUnits(adapter: Adapter): UnitDecision[] {
  return MEASUREMENT_FIELDS.map((field) => decision(field, adapterUnit(adapter, field)!, 'partner'));
}

/**
 * Decides the unit of each mapped measurement field. A header or partner unit wins over a profile (a profile only
 * suggests); a confirmation that contradicts a stated unit blocks instead of overriding it. A confirmation
 * replaces a profile. Fields with no mapping are skipped (they already have a mapping issue).
 */
export function decideUnits(suggestion: MappingSuggestion, evidence: UnitEvidence = {}): { decisions: UnitDecision[]; issues: ValidationIssue[] } {
  const decisions: UnitDecision[] = [];
  const issues: ValidationIssue[] = [];
  for (const field of MEASUREMENT_FIELDS) {
    const entry = suggestion.mappings.find((m) => m.mapping.field === field);
    if (!entry) continue;
    const label = LABEL[field];
    const profile = evidence.profile?.[field];
    const confirmed = evidence.confirmed?.[field];
    const unsupported = [profile, confirmed].filter((u): u is string => u !== undefined && !isSupportedUnit(field, u));
    if (unsupported.length) {
      issues.push(blockingIssue('unit_unsupported', `${label}: unit "${unsupported[0]}" is not supported; use ${unitList(field)}`, field));
      continue;
    }
    const stated = entry.statedUnit;
    if (stated) {
      if (confirmed && confirmed !== stated) {
        issues.push(blockingIssue('unit_conflict', `${label}: the column states ${stated} but ${confirmed} was confirmed; resolve the difference`, field));
        continue;
      }
      if (profile && profile !== stated) issues.push(warningIssue('unit_conflict', `${label}: the column states ${stated}, so the profile's ${profile} is ignored`, field));
      decisions.push(decision(field, stated, entry.mapping.origin === 'exact' ? 'partner' : 'header'));
    } else if (confirmed) decisions.push(decision(field, confirmed, 'confirmed'));
    else if (profile) decisions.push(decision(field, profile, 'profile'));
    else issues.push(blockingIssue('unit_unverified', `${label}: no unit is stated; confirm ${unitList(field)}`, field));
  }
  return { decisions, issues };
}

/**
 * Reads a measurement cell. `value` is null for a blank and NaN for text, as Number() gives. A number-like cell
 * with a comma or more than one dot ("1,234", "1,5", "1.234,5") is ambiguous (decimal or thousands separator?)
 * and is never converted. A single dot is the decimal point.
 */
export function parseMeasurement(text: string | undefined): { value: number | null; ambiguous: boolean } {
  if (text == null || text.trim() === '') return { value: null, ambiguous: false };
  const looksNumeric = /^[+-]?[\d.,\s]*\d[\d.,\s]*$/.test(text.trim());
  const ambiguous = looksNumeric && (text.includes(',') || (text.match(/\./g) ?? []).length > 1);
  return { value: ambiguous ? NaN : Number(text), ambiguous };
}

/** The canonical record for a row, from approved mappings and decided units. A field without a decision stays missing. */
export function normalizeRow(row: Row, mappings: readonly FieldMapping[], decisions: readonly UnitDecision[], source: string): Normalized {
  const column = (field: (typeof ADAPTER_FIELDS)[number]) => mappings.find((m) => m.field === field)?.sourceColumn;
  const text = (field: (typeof ADAPTER_FIELDS)[number]) => (row[column(field) ?? ''] ?? '').trim();
  const ambiguous: MeasurementField[] = [];
  const measure = (field: MeasurementField) => {
    const unit = decisions.find((d) => d.field === field);
    const col = column(field);
    if (!unit || !col) return null;
    const parsed = parseMeasurement(row[col]);
    if (parsed.ambiguous) ambiguous.push(field);
    return parsed.value === null ? null : parsed.value * unit.factor; // NaN stays NaN
  };
  const n: Normalized = {
    batchId: text('batchId'),
    sampleDate: text('sampleDate'),
    source,
    massKg: measure('massKg'),
    r32: measure('r32'),
    r125: measure('r125'),
    r134a: measure('r134a'),
  };
  return ambiguous.length ? { ...n, ambiguous } : n;
}

/** Composition columns whose values look like the other unit. A warning for review only; it never changes a decision. */
export function unitRangeWarnings(rows: readonly Row[], mappings: readonly FieldMapping[], decisions: readonly UnitDecision[]): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const d of decisions) {
    if (d.field === 'massKg') continue;
    const col = mappings.find((m) => m.field === d.field)?.sourceColumn;
    if (!col) continue;
    const values = rows.map((r) => parseMeasurement(r[col]).value).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!values.length) continue;
    if (d.unit === '%' && values.every((v) => v <= 1)) out.push(warningIssue('unit_range_suspect', `${LABEL[d.field]}: every value is 1 or less; check they are percent, not fractions`, d.field));
    if (d.unit === 'fraction' && values.some((v) => v > 1)) out.push(warningIssue('unit_range_suspect', `${LABEL[d.field]}: some values are above 1; check they are fractions, not percent`, d.field));
  }
  return out;
}

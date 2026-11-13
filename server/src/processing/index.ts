import { FILE_ID_COLUMN, parseFileId, RESULT_ID_COLUMN, type Problem, type ProblemList, type ProcessorId, type Row } from '../../../shared/types';
import { getAdapter, type Normalized } from '../adapters';
import { httpError } from '../lib/csv';

const COMPONENTS = ['r32', 'r125', 'r134a'] as const;
type Component = (typeof COMPONENTS)[number];
const LABEL: Record<Component, string> = { r32: 'R-32', r125: 'R-125', r134a: 'R-134a' };

/** A composition total within ±0.5 percentage points of 100% counts as valid (rounding tolerance). */
export const TOTAL_TOLERANCE_PCT = 0.5;

const round = (v: number, d = 3) => Number(v.toFixed(d));
const ok = (v: number | null): v is number => v !== null && Number.isFinite(v);
const total = (n: Normalized) => COMPONENTS.reduce((s, c) => s + (ok(n[c]) ? n[c]! : 0), 0);
/** Demo-only classification thresholds (%). Not real refrigerant specifications or Icorium policy. */
const DEMO_CLASS_RULES = { r32RichMin: 40, r134aRichMin: 34 };
/** Demo-only flag (%): Classification marks rows where R-32 + R-125 is strictly above this. */
const R32_R125_FLAG_ABOVE = 50;
/** Classification's Yes/No column for R-32 + R-125 above R32_R125_FLAG_ABOVE. */
export const R32_R125_FLAG_COLUMN = 'r32_r125_over_50';

/** Field checks shared by all processors. Invalid values are reported, never replaced with zero. */
export function issues(n: Normalized): string[] {
  const out: string[] = [];
  if (n.massKg === null) out.push('mass missing');
  else if (!ok(n.massKg) || n.massKg <= 0) out.push('mass invalid');
  for (const c of COMPONENTS) {
    const v = n[c];
    if (v === null) out.push(`${LABEL[c]} missing`);
    else if (!Number.isFinite(v)) out.push(`${LABEL[c]} not a number`);
    else if (v < 0 || v > 100) out.push(`${LABEL[c]} out of range`);
  }
  const compsValid = COMPONENTS.every((c) => ok(n[c]) && n[c]! >= 0 && n[c]! <= 100);
  if (compsValid && Math.abs(total(n) - 100) > TOTAL_TOLERANCE_PCT) out.push(`composition totals ${round(total(n), 2)}%`);
  return out;
}

interface RowContext {
  duplicate: boolean; // another row in the file has the same batch ID
}

/** Every problem with one row, including batch-ID checks that need the whole file. */
function rowIssues(n: Normalized, ctx: RowContext): string[] {
  const p = issues(n);
  if (!n.batchId) p.unshift('batch ID missing');
  else if (ctx.duplicate) p.unshift(`duplicate batch ID ${n.batchId}`);
  return p;
}

/** Normalizes every row and works out which batch IDs appear more than once. */
function normalizeAll(headers: string[], rows: Row[]) {
  const norm = rows.map(getAdapter(headers).normalize);
  const idCounts = new Map<string, number>();
  for (const n of norm) if (n.batchId) idCounts.set(n.batchId, (idCounts.get(n.batchId) ?? 0) + 1);
  return norm.map((n) => ({ n, errors: rowIssues(n, { duplicate: (idCounts.get(n.batchId) ?? 0) > 1 }) }));
}

/** Rows the Composition Validation rules flag, for any file (input or result). Lists the first `cap` in detail. */
export function findProblems(headers: string[], rows: Row[], cap = 100): ProblemList {
  const items: Problem[] = [];
  let total = 0;
  normalizeAll(headers, rows).forEach(({ n, errors: p }, i) => {
    if (!p.length) return;
    total++;
    if (items.length < cap) items.push({ row: i + 1, batchId: n.batchId, message: p.join('; ') });
  });
  return { total, items };
}

interface Processor {
  columns: string[];
  run(n: Normalized, errors: string[]): Record<string, string | number>;
}

const STATUS_COLUMNS = ['processing_status', 'validation_errors'];
// Every result starts its generated columns with its own File ID; the input's file_id stays among the originals.
const ID_COLUMNS = [RESULT_ID_COLUMN];

// Exact historical suffixes remain readable; new exports only use the current columns.
const LEGACY_COLUMNS: Record<ProcessorId, string[]> = {
  validation: ['composition_total_pct', 'validation_status', 'validation_message'],
  mass: ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status'],
  classification: ['blend_class', 'dominant_component'],
};

// Earlier current columns that are still accepted: Classification before it gained the R-32 + R-125 flag.
const PREVIOUS_COLUMNS: Partial<Record<ProcessorId, string[]>> = {
  classification: [...ID_COLUMNS, 'blend_class', 'dominant_component', ...STATUS_COLUMNS],
};

// To add a processing function: add an entry here and to PROCESSORS in shared/types.ts.
export const processors: Record<ProcessorId, Processor> = {
  validation: {
    columns: [...ID_COLUMNS, 'composition_total_pct', ...STATUS_COLUMNS],
    run: (n) => ({ composition_total_pct: round(total(n), 2) }),
  },
  mass: {
    columns: [...ID_COLUMNS, 'r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', ...STATUS_COLUMNS],
    run: (n, errors) => {
      if (errors.length) return { r32_mass_kg: '', r125_mass_kg: '', r134a_mass_kg: '' };
      const kg = (c: Component) => round((n.massKg! * n[c]!) / 100);
      return { r32_mass_kg: kg('r32'), r125_mass_kg: kg('r125'), r134a_mass_kg: kg('r134a') };
    },
  },
  classification: {
    // Uses DEMO_CLASS_RULES; checked in order, first match wins.
    columns: [...ID_COLUMNS, 'blend_class', 'dominant_component', R32_R125_FLAG_COLUMN, ...STATUS_COLUMNS],
    run: (n, errors) => {
      if (errors.length) return { blend_class: 'Needs review', dominant_component: '', [R32_R125_FLAG_COLUMN]: '' };
      const dominant = COMPONENTS.reduce((a, b) => (n[b]! > n[a]! ? b : a));
      const blend_class =
        n.r32! >= DEMO_CLASS_RULES.r32RichMin ? 'R-32-rich (demo)'
        : n.r134a! >= DEMO_CLASS_RULES.r134aRichMin ? 'R-134a-rich (demo)'
        : 'Balanced (demo)';
      // Rounded so float noise (25.1 + 24.9) never reads as just over the threshold.
      const flagged = round(n.r32! + n.r125!) > R32_R125_FLAG_ABOVE;
      return { blend_class, dominant_component: LABEL[dominant], [R32_R125_FLAG_COLUMN]: flagged ? 'Yes' : 'No' };
    },
  },
};

/**
 * Which processor produced a CSV, judged by its last columns. undefined = an input file. Accepts the
 * current columns, the same columns without result_id (exports made before File ID columns), the
 * previous current columns (with or without result_id) and the older legacy columns.
 */
export function detectResult(headers: string[]): { processor: ProcessorId; generatedColumns: string[] } | undefined {
  for (const processor of Object.keys(processors) as ProcessorId[]) {
    const withoutIds = (cols: string[]) => cols.filter((c) => !ID_COLUMNS.includes(c));
    const current = processors[processor].columns;
    const previous = PREVIOUS_COLUMNS[processor] ?? [];
    const accepted = [current, withoutIds(current), ...(previous.length ? [previous, withoutIds(previous)] : []), LEGACY_COLUMNS[processor]];
    for (const generatedColumns of accepted) {
      if (generatedColumns.every((c, i) => headers[headers.length - generatedColumns.length + i] === c))
        return { processor, generatedColumns: [...generatedColumns] };
    }
  }
}

/**
 * Puts File IDs into a CSV's rows. An input gets file_id (added if missing). A result's existing
 * file_id and result_id are overwritten; they are not added to results that never had them.
 * Every upload is a new file, so IDs carried in from elsewhere are replaced, except that a result
 * linked to its original keeps that original's base ID in file_id (sourceBase).
 */
export function stampFileIds(headers: string[], rows: Row[], fileId: string, isResult: boolean, sourceBase?: string) {
  const base = sourceBase ?? fileId.split('-')[0];
  const out = isResult || headers.includes(FILE_ID_COLUMN) ? headers : [...headers, FILE_ID_COLUMN];
  const stamped = rows.map((r) => ({
    ...r,
    ...(out.includes(FILE_ID_COLUMN) ? { [FILE_ID_COLUMN]: base } : {}),
    ...(isResult && out.includes(RESULT_ID_COLUMN) ? { [RESULT_ID_COLUMN]: fileId } : {}),
  }));
  return { headers: out, rows: stamped };
}

/**
 * The source File ID an uploaded result names in its file_id column: the same File ID on every row.
 * A missing column, no rows, mixed values or anything that is not a File ID name no source.
 */
export function embeddedSourceId(headers: string[], rows: Row[]): string | undefined {
  if (!headers.includes(FILE_ID_COLUMN) || !rows.length) return undefined;
  const value = rows[0][FILE_ID_COLUMN];
  if (!rows.every((r) => r[FILE_ID_COLUMN] === value) || !parseFileId(value)) return undefined;
  return value;
}

/**
 * Whether an uploaded result's original columns hold exactly an input's data. The original columns
 * are the result's columns minus its generated ones (and result_id). They must be the same set of
 * names as the input's columns, in any order, with the same rows in the same order and the same
 * text in every cell. Nothing is normalised, so an edited file never matches.
 */
export function matchesInput(resultHeaders: string[], resultRows: Row[], generatedColumns: string[], inputHeaders: string[], inputRows: Row[]): boolean {
  const original = resultHeaders.filter((h) => !generatedColumns.includes(h) && h !== RESULT_ID_COLUMN);
  if (original.length !== inputHeaders.length || !inputHeaders.every((h) => original.includes(h))) return false;
  if (resultRows.length !== inputRows.length) return false;
  return inputRows.every((input, i) => inputHeaders.every((h) => resultRows[i][h] === input[h]));
}

/** Runs a processor on every row; keeps all original columns and values and appends generated ones, starting with result_id. */
export function processRows(headers: string[], rows: Row[], id: ProcessorId, resultId = '') {
  const p = processors[id];
  const collisions = p.columns.filter((c) => headers.includes(c));
  if (collisions.length) throw httpError(400, `Cannot process this file: source columns conflict with generated columns: ${collisions.join(', ')}. Rename the source columns before processing.`);
  const norm = normalizeAll(headers, rows);
  const out = rows.map((r, i) => {
    const { n, errors } = norm[i];
    const res = {
      [RESULT_ID_COLUMN]: resultId,
      ...p.run(n, errors),
      processing_status: errors.length ? 'Invalid' : 'Valid',
      validation_errors: errors.join('; '),
    };
    return { ...r, ...Object.fromEntries(Object.entries(res).map(([k, v]) => [k, String(v)])) };
  });
  return { headers: [...headers, ...p.columns], rows: out, generated: p.columns, problemRows: norm.filter(({ errors }) => errors.length).length };
}

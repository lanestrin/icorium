// Comparison rules and number formats, kept apart from the charts so they are easy to test (compare-view.test.ts).
import { COMPARE_MAX, COMPARE_MIN, type CompareColumn, type CompareFile, type CompareResult, type FileMeta } from '../../../shared/types';

/** Why the selected files can't be compared, or undefined when they can. */
export function compareBlocker(selected: FileMeta[]): string | undefined {
  if (selected.some((f) => f.status !== 'Processed')) return 'Comparison uses result files only. Unselect input files to compare.';
  if (selected.length < COMPARE_MIN) return `Select at least ${COMPARE_MIN} results to compare.`;
  if (selected.length > COMPARE_MAX) return `Compare up to ${COMPARE_MAX} results at a time.`;
  if (new Set(selected.map((f) => f.processor)).size > 1) return 'Pick results from the same function.';
  return undefined;
}

// Column names the general rule below would read badly.
const METRIC_LABELS: Record<string, string> = { r32_r125_over_50: 'R32 + R125 over 50%' };

/** "composition_total_pct" -> "Composition total (%)", "r32_mass_kg" -> "R32 mass (kg)". */
export function metricLabel(name: string) {
  if (METRIC_LABELS[name]) return METRIC_LABELS[name];
  const unit = name.endsWith('_pct') ? ' (%)' : name.endsWith('_kg') ? ' (kg)' : '';
  const words = name.replace(/_(pct|kg)$/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1) + unit;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Short labels such as "Partner A · Baseline": the partner, then what is left of the result name
 * once "result_", the partner and the function are removed. Falls back to the file name when two
 * files would otherwise share a label (e.g. a renamed copy).
 */
export function fileLabels(files: Pick<CompareFile, 'name' | 'source'>[], processor: string) {
  const labels = files.map((f) => {
    const base = f.name.replace(/^result_/i, '').replace(new RegExp(`_${processor}\\.csv$`, 'i'), '').replace(/\.csv$/i, '');
    if (!f.source) return base;
    const slug = `${f.source.toLowerCase().replace(/\s+/g, '_')}_`;
    const rest = base.toLowerCase().startsWith(slug) ? base.slice(slug.length) : base;
    return `${f.source} · ${capitalize(rest.replace(/_/g, ' '))}`;
  });
  return labels.map((l, k) => (labels.indexOf(l) !== labels.lastIndexOf(l) ? files[k].name : l));
}

/** Each file's summary minus the reference file's; null for the reference itself or a missing value. */
export function deltas(summary: (number | null)[], ref: number) {
  return summary.map((v, k) => (k === ref || v === null || summary[ref] === null ? null : v - summary[ref]!));
}

/** Percentages differ in percentage points; masses in kg. */
export const deltaUnit = (col: Pick<CompareColumn, 'unit'>) => (col.unit === '%' ? 'pp' : col.unit ?? '');

const num = (v: number, digits = 2) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** "100.00%", "123.45 kg", or a plain number. */
export const fmtValue = (v: number | null | undefined, unit?: string) =>
  v == null ? '—' : unit === '%' ? `${num(v)}%` : unit ? `${num(v)} ${unit}` : num(v);
/** "+1.27 pp", "-0.50 pp", "—". */
export const fmtDelta = (v: number | null, unit: string) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${num(v)}${unit ? ` ${unit}` : ''}`;

/** True when file k's value in matched row r differs from the reference file's. A row one of them lacks counts. */
export const differsFromRef = (col: Pick<CompareColumn, 'values'>, r: number, k: number, ref: number) =>
  k !== ref && col.values[r][k] !== col.values[r][ref];

/**
 * An axis that hugs the data, so a 98% row stands out from 100% rows instead of sitting on a 0–110% scale.
 * Pads by a tenth of the range (at least 0.5) and rounds outwards.
 */
export function yDomain(values: (number | string | null)[]): [number, number] | undefined {
  const xs = values.filter((v): v is number => typeof v === 'number');
  if (!xs.length) return undefined;
  const [min, max] = [Math.min(...xs), Math.max(...xs)];
  const pad = Math.max((max - min) * 0.1, 0.5);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

export interface TopDifference { key: string; label: string; text: string; files: number[] }

/**
 * The rows that differ most from the reference file for one metric. Numbers rank by the largest gap;
 * rows that differ only because a value or row is missing come after them; categories keep row order.
 */
export function topDifferences(result: Pick<CompareResult, 'rows'>, col: CompareColumn, ref: number, limit = 3): TopDifference[] {
  const show = (v: number | string | null) => (v === null || v === '' ? '—' : String(v));
  const found = result.rows.flatMap((row, r) => {
    const files = row.rowNumbers.map((_, k) => k).filter((k) => differsFromRef(col, r, k, ref));
    if (!files.length) return [];
    const refValue = col.values[r][ref];

    if (col.kind === 'category') {
      const v = col.values[r][files[0]];
      const text = row.rowNumbers[ref] === null ? 'Not in the reference file'
        : row.rowNumbers[files[0]] === null ? 'Not in file' : `${show(v)} (reference: ${show(refValue)})`;
      return [{ key: row.key, label: row.label, text, files, score: 0, order: r }];
    }

    const gaps = files.flatMap((k) => {
      const v = col.values[r][k];
      return typeof v === 'number' && typeof refValue === 'number' ? [{ v, gap: v - refValue }] : [];
    }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    if (gaps.length) {
      const { v, gap } = gaps[0];
      return [{ key: row.key, label: row.label, text: `${metricLabel(col.name).replace(/ \(.*\)$/, '')} ${fmtValue(v, col.unit)} (Δ ${fmtDelta(gap, deltaUnit(col))})`, files, score: Math.abs(gap), order: r }];
    }
    const text = row.rowNumbers[ref] === null ? 'Not in the reference file'
      : files.some((k) => row.rowNumbers[k] === null) ? 'Not in file' : 'No value';
    return [{ key: row.key, label: row.label, text, files, score: -1, order: r }];
  });
  return found
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ key, label, text, files }) => ({ key, label, text, files }));
}

/** Composition totals read better as distance from 100%, since most rows are exactly 100. */

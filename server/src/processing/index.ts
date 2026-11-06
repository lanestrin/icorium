import type { ProcessorId, Row } from '../../../shared/types';
import { getAdapter, type Normalized } from '../adapters';

const COMPONENTS = ['r32', 'r125', 'r134a'] as const;
type Component = (typeof COMPONENTS)[number];
const LABEL: Record<Component, string> = { r32: 'R-32', r125: 'R-125', r134a: 'R-134a' };

/** A composition total within ±0.5 percentage points of 100% counts as valid (rounding tolerance). */
export const TOTAL_TOLERANCE_PCT = 0.5;

const round = (v: number, d = 3) => Number(v.toFixed(d));
const ok = (v: number | null): v is number => v !== null && Number.isFinite(v);
const total = (n: Normalized) => COMPONENTS.reduce((s, c) => s + (ok(n[c]) ? n[c]! : 0), 0);
/** Demo-only classification thresholds (%). Not real refrigerant specifications or Icorium policy. */
export const DEMO_CLASS_RULES = { r32RichMin: 40, r134aRichMin: 34 };

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

interface Processor {
  columns: string[];
  run(n: Normalized, ctx: RowContext): Record<string, string | number>;
}

// To add a processing function: add an entry here and to PROCESSORS in shared/types.ts.
export const processors: Record<ProcessorId, Processor> = {
  validation: {
    columns: ['composition_total_pct', 'validation_status', 'validation_message'],
    run: (n, ctx) => {
      const p = issues(n);
      if (!n.batchId) p.unshift('batch ID missing');
      else if (ctx.duplicate) p.unshift(`duplicate batch ID ${n.batchId}`);
      return { composition_total_pct: round(total(n), 2), validation_status: p.length ? 'ERROR' : 'OK', validation_message: p.join('; ') || 'Composition valid' };
    },
  },
  mass: {
    columns: ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status'],
    run: (n) => {
      if (issues(n).length) return { r32_mass_kg: '', r125_mass_kg: '', r134a_mass_kg: '', mass_status: 'Skipped (invalid input)' };
      const kg = (c: Component) => round((n.massKg! * n[c]!) / 100);
      return { r32_mass_kg: kg('r32'), r125_mass_kg: kg('r125'), r134a_mass_kg: kg('r134a'), mass_status: 'OK' };
    },
  },
  classification: {
    // Uses DEMO_CLASS_RULES; checked in order, first match wins.
    columns: ['blend_class', 'dominant_component'],
    run: (n) => {
      if (issues(n).length) return { blend_class: 'Unclassifiable', dominant_component: '' };
      const dominant = COMPONENTS.reduce((a, b) => (n[b]! > n[a]! ? b : a));
      const blend_class =
        n.r32! >= DEMO_CLASS_RULES.r32RichMin ? 'R-32-rich (demo)'
        : n.r134a! >= DEMO_CLASS_RULES.r134aRichMin ? 'R-134a-rich (demo)'
        : 'Balanced (demo)';
      return { blend_class, dominant_component: LABEL[dominant] };
    },
  },
};

/** Which processor produced a CSV, judged by its last columns. undefined = an input file. */
export function detectProcessor(headers: string[]): ProcessorId | undefined {
  return (Object.keys(processors) as ProcessorId[]).find((id) => {
    const cols = processors[id].columns;
    return cols.every((c, i) => headers[headers.length - cols.length + i] === c);
  });
}

/** Runs a processor on every row; keeps all original columns and values and appends generated ones. */
export function processRows(headers: string[], rows: Row[], id: ProcessorId) {
  const adapter = getAdapter(headers);
  const p = processors[id];
  const norm = rows.map(adapter.normalize);
  const idCounts = new Map<string, number>();
  for (const n of norm) if (n.batchId) idCounts.set(n.batchId, (idCounts.get(n.batchId) ?? 0) + 1);

  const out = rows.map((r, i) => {
    const res = p.run(norm[i], { duplicate: (idCounts.get(norm[i].batchId) ?? 0) > 1 });
    return { ...r, ...Object.fromEntries(Object.entries(res).map(([k, v]) => [k, String(v)])) };
  });
  return { headers: [...headers, ...p.columns], rows: out, generated: p.columns };
}

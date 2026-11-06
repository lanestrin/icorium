import type { ProcessorId, Row } from '../../../shared/types';
import { getAdapter, type Normalized } from '../adapters';

const COMPONENTS = ['r32', 'r125', 'r134a'] as const;
const LABEL = { r32: 'R-32', r125: 'R-125', r134a: 'R-134a' };
const round = (v: number, d = 3) => Number(v.toFixed(d));
const ok = (v: number | null): v is number => v !== null && Number.isFinite(v);
const total = (n: Normalized) => COMPONENTS.reduce((s, c) => s + (ok(n[c]) ? n[c]! : 0), 0);
const near = (v: number, target: number, tol = 3) => Math.abs(v - target) <= tol;

/** Shared row checks used by all processors. */
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
  if (compsValid && Math.abs(total(n) - 100) > 0.5) out.push(`composition totals ${round(total(n), 2)}%`);
  return out;
}

interface Processor {
  columns: string[];
  run(n: Normalized): Record<string, string | number>;
}

// To add a processing function: add an entry here and to PROCESSORS in shared/types.ts.
export const processors: Record<ProcessorId, Processor> = {
  validation: {
    columns: ['composition_total_pct', 'validation_status', 'validation_message'],
    run: (n) => {
      const p = issues(n);
      return { composition_total_pct: round(total(n), 2), validation_status: p.length ? 'ERROR' : 'OK', validation_message: p.join('; ') || 'Composition valid' };
    },
  },
  mass: {
    columns: ['r32_kg', 'r125_kg', 'r134a_kg', 'mass_status'],
    run: (n) => {
      if (issues(n).length) return { r32_kg: '', r125_kg: '', r134a_kg: '', mass_status: 'Skipped (invalid input)' };
      const kg = (c: (typeof COMPONENTS)[number]) => round((n.massKg! * n[c]!) / 100);
      return { r32_kg: kg('r32'), r125_kg: kg('r125'), r134a_kg: kg('r134a'), mass_status: 'OK' };
    },
  },
  classification: {
    // Demo-only rules, not real refrigerant specifications.
    columns: ['blend_class', 'dominant_component'],
    run: (n) => {
      if (issues(n).length) return { blend_class: 'Unclassifiable', dominant_component: '' };
      const [r32, r125, r134a] = [n.r32!, n.r125!, n.r134a!];
      const dominant = COMPONENTS.reduce((a, b) => (n[b]! > n[a]! ? b : a));
      const blend_class =
        r134a >= 95 ? 'Single R-134a (demo)'
        : near(r32, 50) && near(r125, 50) ? 'R-410A-like (demo)'
        : near(r32, 23) && near(r125, 25) && near(r134a, 52) ? 'R-407C-like (demo)'
        : 'Mixed / off-spec (demo)';
      return { blend_class, dominant_component: LABEL[dominant] };
    },
  },
};

/** Runs a processor on every row; keeps all original columns and appends generated ones. */
export function processRows(headers: string[], rows: Row[], id: ProcessorId) {
  const adapter = getAdapter(headers);
  const p = processors[id];
  const out = rows.map((r) => {
    const res = p.run(adapter.normalize(r));
    return { ...r, ...Object.fromEntries(Object.entries(res).map(([k, v]) => [k, String(v)])) };
  });
  return { headers: [...headers, ...p.columns], rows: out, generated: p.columns };
}

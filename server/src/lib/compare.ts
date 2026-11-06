import { PROCESSORS, type CompareColumn, type CompareResult, type FileMeta, type Row } from '../../../shared/types';
import { httpError } from './csv';

interface Loaded { meta: FileMeta; rows: Row[] }

const label = (id?: string) => PROCESSORS.find((p) => p.id === id)?.label ?? 'unknown';
const unitOf = (name: string) => (name.endsWith('_kg') ? 'kg' : name.endsWith('_pct') ? '%' : undefined);
const present = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const sum = (xs: (number | null)[]) => present(xs).reduce((s, x) => s + x, 0);
const mean = (xs: (number | null)[]) => (present(xs).length ? sum(xs) / present(xs).length : undefined);

export function compareResults(A: Loaded, B: Loaded): Omit<CompareResult, 'problemsA' | 'problemsB'> {
  for (const f of [A, B])
    if (f.meta.status !== 'Processed') throw httpError(400, `${f.meta.name} is an input file. Compare two files produced by Run Processing.`);
  if (A.meta.processor !== B.meta.processor)
    throw httpError(400, `These files can't be compared: ${A.meta.name} is a ${label(A.meta.processor)} result but ${B.meta.name} is a ${label(B.meta.processor)} result. Pick two results from the same function.`);

  const n = Math.max(A.rows.length, B.rows.length);
  const columns = (A.meta.generatedColumns ?? []).map((name): CompareColumn => {
    const va = Array.from({ length: n }, (_, i) => A.rows[i]?.[name] ?? '');
    const vb = Array.from({ length: n }, (_, i) => B.rows[i]?.[name] ?? '');
    const rowsDiffering = va.filter((v, i) => v !== vb[i]).length;
    const numeric = [...va, ...vb].every((v) => v === '' || Number.isFinite(Number(v)));

    if (numeric) {
      const toNum = (v: string) => (v === '' ? null : Number(v));
      const data = va.map((v, i) => ({ label: `#${i + 1}`, a: toNum(v), b: toNum(vb[i]) }));
      const unit = unitOf(name);
      // Masses add up meaningfully; percentages only average.
      const measure = unit === 'kg' ? 'total' : 'mean';
      const agg = measure === 'total' ? sum : mean;
      return { name, kind: 'numeric', unit, measure, data, valueA: agg(data.map((d) => d.a)), valueB: agg(data.map((d) => d.b)), rowsDiffering, rowsCompared: n };
    }
    const cats = [...new Set([...va, ...vb])];
    const data = cats.map((c) => ({ label: c || '(blank)', a: va.filter((v) => v === c).length, b: vb.filter((v) => v === c).length }));
    return { name, kind: 'category', measure: 'count', data, rowsDiffering, rowsCompared: n };
  });

  return { processor: A.meta.processor!, fileA: A.meta.name, fileB: B.meta.name, columns };
}

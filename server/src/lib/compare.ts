import type { CompareColumn, CompareResult, FileMeta, Row } from '../../../shared/types';
import { httpError } from './csv';

interface Loaded { meta: FileMeta; rows: Row[] }

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined;
};

export function compareResults(A: Loaded, B: Loaded): CompareResult {
  if (A.meta.status !== 'Processed' || B.meta.status !== 'Processed') throw httpError(400, 'Both files must be processed result CSVs');
  if (A.meta.processor !== B.meta.processor)
    throw httpError(400, `Incompatible files: ${A.meta.name} came from "${A.meta.processor}" but ${B.meta.name} came from "${B.meta.processor}"`);

  const n = Math.max(A.rows.length, B.rows.length);
  const columns = (A.meta.generatedColumns ?? []).map((name): CompareColumn => {
    const va = Array.from({ length: n }, (_, i) => A.rows[i]?.[name] ?? '');
    const vb = Array.from({ length: n }, (_, i) => B.rows[i]?.[name] ?? '');
    const rowsDiffering = va.filter((v, i) => v !== vb[i]).length;
    const numeric = [...va, ...vb].every((v) => v === '' || Number.isFinite(Number(v)));

    if (numeric) {
      const toNum = (v: string) => (v === '' ? null : Number(v));
      const data = va.map((v, i) => ({ label: `#${i + 1}`, a: toNum(v), b: toNum(vb[i]) }));
      return { name, kind: 'numeric', data, meanA: mean(data.map((d) => d.a)), meanB: mean(data.map((d) => d.b)), rowsDiffering };
    }
    const cats = [...new Set([...va, ...vb])];
    const data = cats.map((c) => ({ label: c || '(blank)', a: va.filter((v) => v === c).length, b: vb.filter((v) => v === c).length }));
    return { name, kind: 'category', data, rowsDiffering };
  });

  return { processor: A.meta.processor!, fileA: A.meta.name, fileB: B.meta.name, columns };
}

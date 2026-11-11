import { COMPARE_MAX, COMPARE_MIN, PROCESSORS, RESULT_ID_COLUMN, type CompareColumn, type CompareResult, type FileMeta, type MatchedRow, type Row, type RowMatch } from '../../../shared/types';
import { getAdapter } from '../adapters';
import { httpError } from './csv';

interface Loaded { meta: FileMeta; headers: string[]; rows: Row[] }

const label = (id?: string) => PROCESSORS.find((p) => p.id === id)?.label ?? 'unknown';
const unitOf = (name: string) => (name.endsWith('_kg') ? 'kg' : name.endsWith('_pct') ? '%' : undefined);
const present = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const sum = (xs: (number | null)[]) => present(xs).reduce((s, x) => s + x, 0);
const mean = (xs: (number | null)[]) => (present(xs).length ? sum(xs) / present(xs).length : null);

/** The partner adapter for a file's columns, or undefined when none matches. */
function adapterFor(headers: string[]) {
  try { return getAdapter(headers); } catch { return undefined; }
}

/**
 * Lines rows up across files. Batch IDs are used only when every pair of files shares at least one,
 * e.g. a partner's baseline and follow-up; files from different partners never do, so they fall back
 * to position. A repeated ID is matched occurrence by occurrence ("B-010", then "B-010 (2)").
 * A blank ID never matches another row. Rows are matched on a key that no batch ID can imitate
 * (the occurrence number comes first); the label is only for display, so two rows may share one.
 */
export function matchRows(files: Loaded[]): { rowMatch: RowMatch; rows: MatchedRow[] } {
  const adapters = files.map((f) => adapterFor(f.headers));
  const ids = adapters.every(Boolean) ? files.map((f, k) => f.rows.map((r) => adapters[k]!.normalize(r).batchId)) : undefined;
  const shares = (a: string[], b: string[]) => { const set = new Set(a.filter(Boolean)); return b.some((id) => id && set.has(id)); };
  const byId = !!ids && ids.every((a, i) => ids.every((b, j) => i === j || shares(a, b)));

  if (!byId) {
    const n = Math.max(...files.map((f) => f.rows.length));
    const rows = Array.from({ length: n }, (_, i) => ({ key: `#${i + 1}`, label: `#${i + 1}`, rowNumbers: files.map((f) => (i < f.rows.length ? i + 1 : null)) }));
    return { rowMatch: 'position', rows };
  }

  const index = new Map<string, MatchedRow>();
  ids!.forEach((fileIds, k) => {
    const seen = new Map<string, number>();
    fileIds.forEach((id, i) => {
      let key: string;
      let label: string;
      if (!id) {
        key = `blank:${k + 1}:${i + 1}`;
        label = `(blank ID) file ${k + 1} row ${i + 1}`;
      } else {
        const n = (seen.get(id) ?? 0) + 1;
        seen.set(id, n);
        key = `id:${n}:${id}`;
        label = n === 1 ? id : `${id} (${n})`;
      }
      if (!index.has(key)) index.set(key, { key, label, rowNumbers: files.map(() => null) });
      index.get(key)!.rowNumbers[k] = i + 1;
    });
  });
  return { rowMatch: 'batch_id', rows: [...index.values()] };
}

/** Compares 2–5 results of the same function, column by column. Problems per file are added by the route. */
export function compareResults(files: Loaded[]): Omit<CompareResult, 'files'> & { files: Omit<CompareResult['files'][number], 'problems'>[] } {
  if (files.length < COMPARE_MIN || files.length > COMPARE_MAX) throw httpError(400, `Choose ${COMPARE_MIN} to ${COMPARE_MAX} results to compare.`);
  for (const f of files)
    if (f.meta.status !== 'Processed') throw httpError(400, `${f.meta.name} is an input file. Compare files produced by Run Processing.`);
  const [first] = files;
  const other = files.find((f) => f.meta.processor !== first.meta.processor);
  if (other)
    throw httpError(400, `These files can't be compared: ${first.meta.name} is a ${label(first.meta.processor)} result but ${other.meta.name} is a ${label(other.meta.processor)} result. Pick results from the same function.`);

  // Compare the function's own columns. result_id always differs between files, so it is left out,
  // which also lets results exported before File ID columns compare with new ones.
  const functionColumns = (f: Loaded) => (f.meta.generatedColumns ?? []).filter((c) => c !== RESULT_ID_COLUMN);
  const cols = functionColumns(first);
  for (const f of files) {
    const c = functionColumns(f);
    if (!cols.length || c.length !== cols.length || c.some((x, i) => x !== cols[i]))
      throw httpError(400, "These result schemas can't be compared. Regenerate the older result from its original input so all files use the same output columns.");
  }

  const { rowMatch, rows } = matchRows(files);
  const columns = cols.map((name): CompareColumn => {
    // raw[row][file]: the cell text, or undefined when the file has no such row.
    const raw = rows.map((r) => r.rowNumbers.map((n, k) => (n === null ? undefined : (files[k].rows[n - 1][name] ?? ''))));
    const numeric = raw.every((vals) => vals.every((v) => v === undefined || v === '' || Number.isFinite(Number(v))));
    // A row differs when a file lacks it, or its values differ: as numbers for numeric columns
    // (so 100 and 100.0 are equal; a blank is no value), as text for categories.
    const same = (a: string, b: string) => (numeric ? (a === '' || b === '' ? a === b : Number(a) === Number(b)) : a === b);
    const rowsDiffering = raw.filter((vals) => vals.some((v) => v === undefined || vals[0] === undefined || !same(v, vals[0]))).length;

    if (numeric) {
      const values = raw.map((vals) => vals.map((v) => (v === undefined || v === '' ? null : Number(v))));
      const unit = unitOf(name);
      // Masses add up meaningfully; percentages only average.
      const measure = unit === 'kg' ? 'total' : 'mean';
      const summary = files.map((_, k) => {
        const xs = values.map((vals) => vals[k]);
        return measure === 'total' ? (present(xs).length ? sum(xs) : null) : mean(xs);
      });
      return { name, kind: 'numeric', unit, measure, summary, values, rowsDiffering, rowsCompared: rows.length };
    }
    const values = raw.map((vals) => vals.map((v) => (v === undefined ? null : v)));
    const labels = [...new Set(values.flat().filter((v): v is string => v !== null))];
    const categories = labels.map((c) => ({ label: c || '(blank)', counts: files.map((_, k) => values.filter((vals) => vals[k] === c).length) }));
    return { name, kind: 'category', measure: 'count', categories, values, rowsDiffering, rowsCompared: rows.length };
  });

  return {
    processor: first.meta.processor!,
    rowMatch,
    rows,
    files: files.map((f) => ({ id: f.meta.id, name: f.meta.name, source: adapterFor(f.headers)?.name, rows: f.rows.length })),
    columns,
  };
}

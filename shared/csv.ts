import Papa from 'papaparse';
import type { Row } from './types';

export const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

/** `duplicateHeaders` names the headers that appeared more than once; Papa Parse renamed the later copies (a, a_1). */
export function parseCsv(text: string): { headers: string[]; rows: Row[]; duplicateHeaders: string[] } {
  const res = Papa.parse<Row>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  if (res.errors.length) {
    const e = res.errors[0];
    throw httpError(400, `CSV parse error${e.row !== undefined ? ` on data row ${e.row + 1}` : ''}: ${e.message}`);
  }
  const headers = res.meta.fields ?? [];
  if (!headers.length || !res.data.length) throw httpError(400, 'CSV must contain a header row and at least one data row');
  return { headers, rows: res.data, duplicateHeaders: [...new Set(Object.values(res.meta.renamedHeaders ?? {}))] };
}

export const toCsv = (headers: string[], rows: Row[]) =>
  Papa.unparse({ fields: headers, data: rows.map((r) => headers.map((h) => r[h] ?? '')) });

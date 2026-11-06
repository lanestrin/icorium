import Papa from 'papaparse';
import type { Row } from '../../../shared/types';

export const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const res = Papa.parse<Row>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  if (res.errors.length) {
    const e = res.errors[0];
    throw httpError(400, `CSV parse error${e.row !== undefined ? ` on data row ${e.row + 1}` : ''}: ${e.message}`);
  }
  const headers = res.meta.fields ?? [];
  if (!headers.length || !res.data.length) throw httpError(400, 'CSV must contain a header row and at least one data row');
  return { headers, rows: res.data };
}

export const toCsv = (headers: string[], rows: Row[]) =>
  Papa.unparse({ fields: headers, data: rows.map((r) => headers.map((h) => r[h] ?? '')) });

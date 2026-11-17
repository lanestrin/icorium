import { ConvertError } from './table';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One cell as text. Numbers keep their stored value, so a sheet's number format (thousands separators,
 * rounding, currency) never changes the data; dates become YYYY-MM-DD from their calendar date.
 */
function cellText(value: unknown): string {
  if (value instanceof Date) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value.trim();
  return '';
}

/**
 * Reads the first sheet of an Excel file (.xlsx or .xls) into rows of cell text, each row as wide as the
 * sheet's used range. SheetJS is imported here, when an Excel file is chosen, so it stays out of the
 * main bundle. Only the first sheet is read.
 */
export async function readExcel(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  } catch {
    throw new ConvertError("It couldn't be read as an Excel file.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true });
  return rows.map((row) => row.map(cellText));
}

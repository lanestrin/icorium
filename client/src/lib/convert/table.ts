import { ADAPTERS } from '../../../../shared/types';

// Turning a non-CSV partner file into a CSV, after a reader (Excel or PDF now, OCR in 9.14c) has
// produced rows of cell text. Nothing here knows which reader ran, so every reader shares these rules.

/** Largest source file the browser will try to convert. */
export const CONVERT_MAX_MB = 20;
/** The header row must be within this many rows of the top. */
export const HEADER_SEARCH_ROWS = 50;

/** A conversion problem with a message ready to show; the upload list prefixes the file name. */
export class ConvertError extends Error {}

/** How a chosen file is handled: uploaded as it is, or read by the Excel or PDF reader first. */
export type FileKind = 'csv' | 'excel' | 'pdf';

const extensionOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

/** Picks how to handle a file by its extension, refusing types that can't be converted and files too large to read. */
export function fileKind(file: { name: string; size: number }): FileKind {
  const ext = file.name.includes('.') ? extensionOf(file.name) : '';
  if (ext === 'csv') return 'csv';
  const kind = ext === 'xlsx' || ext === 'xls' ? 'excel' : ext === 'pdf' ? 'pdf' : null;
  if (!kind) throw new ConvertError("This file type can't be converted. Upload a CSV, Excel or PDF file.");
  if (file.size > CONVERT_MAX_MB * 1024 * 1024) throw new ConvertError(`It is larger than the ${CONVERT_MAX_MB} MB conversion limit.`);
  return kind;
}

/** A row the person should look at before importing: its row number in the source, and why. */
export interface RowFlag { row: number; reason: string }

/** A partner table found in a source file, ready to review and import. */
export interface FoundTable {
  partner: string;
  /** 1-based row number of the header in the source. */
  headerRow: number;
  headers: string[];
  /** Data rows, each exactly as wide as the header; sourceRow is its 1-based row number in the source. */
  rows: { sourceRow: number; cells: string[] }[];
  flags: RowFlag[];
}

const s = (n: number) => (n === 1 ? '' : 's');

/**
 * Finds the partner table in rows of cell text: the first row (within HEADER_SEARCH_ROWS) holding all of
 * one adapter's columns is the header, matched exactly as uploads match them, and the rows below it
 * are the data. Rows with the wrong number of cells are kept and flagged, never guessed: a short row is
 * padded with empty cells, and cells beyond the header are left out. A later row equal to the header (a
 * PDF repeats it on each page) is left out and flagged. `where` names the place searched.
 */
export function findTable(source: string[][], where = 'the first sheet'): FoundTable {
  const cleaned = source.map((row) => row.map((cell) => (cell ?? '').trim()));
  const headerIndex = cleaned.slice(0, HEADER_SEARCH_ROWS).findIndex((row) => ADAPTERS.some((a) => a.columns.every((c) => row.includes(c))));
  if (headerIndex < 0) {
    const expected = ADAPTERS.map((a) => `${a.name} (${a.columns.join(', ')})`).join('; ');
    throw new ConvertError(`No header row with a partner's columns was found in ${where}. Expected the columns of one of: ${expected}`);
  }
  const headerCells = cleaned[headerIndex];
  const width = headerCells.reduce((last, cell, i) => (cell !== '' ? i + 1 : last), 0);
  const headers = headerCells.slice(0, width);
  const partner = ADAPTERS.find((a) => a.columns.every((c) => headers.includes(c)))!.name;

  const rows: FoundTable['rows'] = [];
  const flags: RowFlag[] = [];
  cleaned.slice(headerIndex + 1).forEach((row, i) => {
    if (row.every((cell) => cell === '')) return; // blank rows are skipped
    const sourceRow = headerIndex + 2 + i;
    if (row.length >= width && row.slice(0, width).every((cell, c) => cell === headers[c]) && row.slice(width).every((cell) => cell === '')) {
      flags.push({ row: sourceRow, reason: 'repeated header, left out' });
      return;
    }
    const extra = row.slice(width).filter((cell) => cell !== '').length;
    const missing = Math.max(0, width - row.length);
    if (missing) flags.push({ row: sourceRow, reason: `missing ${missing} cell${s(missing)}` });
    if (extra) flags.push({ row: sourceRow, reason: `${extra} cell${s(extra)} beyond the header, left out` });
    rows.push({ sourceRow, cells: [...row.slice(0, width), ...Array<string>(missing).fill('')] });
  });
  return { partner, headerRow: headerIndex + 1, headers, rows, flags };
}

/** One CSV field, quoted when it holds a comma, quote or line break, with quotes doubled. */
const field = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The table as CSV text: the header, then each row, with LF line endings. */
export const toCsvText = (table: Pick<FoundTable, 'headers' | 'rows'>) =>
  [table.headers, ...table.rows.map((r) => r.cells)].map((cells) => cells.map(field).join(',')).join('\n') + '\n';

/** The source name with its extension replaced by .csv: "report.xlsx" becomes "report.csv". */
export const csvName = (name: string) => `${name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name}.csv`;

/** The CSV file uploaded in place of the source file. */
export const toCsvFile = (table: FoundTable, sourceName: string) =>
  new File([toCsvText(table)], csvName(sourceName), { type: 'text/csv' });

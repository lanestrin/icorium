import { ADAPTERS } from '../../../../shared/types';
import { matchPartner, partnerMatchProblem } from '../../../../shared/mapping';
import { ConvertError, type FoundTable, type RowFlag } from './table';

const pad = (n: number) => String(n).padStart(2, '0');

/** What a cell holds, from the workbook's own cell types. Text is never guessed to be a number. */
export type CellKind = 'text' | 'number' | 'date' | 'boolean' | 'error' | 'empty';

/** One cell: its text, its kind, and the formula behind it when it has one (without the "="). */
export interface SheetCell { text: string; kind: CellKind; formula?: string }

/** Cells merged into one: rows are 1-based sheet rows, columns are 0-based positions (0 is column A). */
export interface SheetMerge { top: number; bottom: number; left: number; right: number }

/**
 * One sheet. cells[0][0] is the cell at sheet row firstRow and column position firstCol (0 is column A), so a
 * sheet whose used range starts at B3 still reports its true coordinates. Every row is as wide as the range.
 */
export interface SheetData { name: string; firstRow: number; firstCol: number; cells: SheetCell[][]; merges: SheetMerge[] }

const EMPTY: SheetCell = { text: '', kind: 'empty' };

/** Column letters: 0 is A, 25 is Z, 26 is AA. */
export function columnLetter(position: number): string {
  let letters = '';
  for (let n = position + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

const address = (sheetRow: number, position: number) => `${columnLetter(position)}${sheetRow}`;

/**
 * One cell as text. Numbers keep their stored value, so a sheet's number format (thousands separators,
 * rounding, currency) never changes the data; dates become YYYY-MM-DD from their calendar date. An error
 * cell keeps the text Excel shows (#DIV/0!), and a formula with no stored result is empty, never zero.
 */
function toCell(raw: { t?: string; v?: unknown; w?: string; f?: string } | undefined): SheetCell {
  if (!raw) return EMPTY;
  const formula = raw.f ? { formula: raw.f } : {};
  const { t, v } = raw;
  if (t === 'e') return { text: raw.w ?? '#ERROR', kind: 'error', ...formula };
  if (v === undefined || v === null || t === 'z') return { ...EMPTY, ...formula };
  // SheetJS reports a date's face value in the Date's UTC fields (its own sheet_to_json shifts it to local time).
  if (v instanceof Date) return { text: `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`, kind: 'date', ...formula };
  if (typeof v === 'number') return { text: String(v), kind: 'number', ...formula };
  if (typeof v === 'boolean') return { text: String(v), kind: 'boolean', ...formula };
  if (typeof v === 'string') {
    const text = v.trim();
    return { text, kind: text ? 'text' : 'empty', ...formula };
  }
  return { ...EMPTY, ...formula };
}

/**
 * Reads every sheet of an Excel file (.xlsx or .xls), in workbook order, with true cell coordinates, cell
 * kinds and formulas. SheetJS is imported here, when an Excel file is chosen, so it stays out of the main
 * bundle.
 */
export async function readExcel(file: File): Promise<SheetData[]> {
  const XLSX = await import('xlsx');
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true });
  } catch {
    throw new ConvertError("It couldn't be read as an Excel file.");
  }
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const ref = sheet?.['!ref'];
    if (!sheet || !ref) return { name, firstRow: 1, firstCol: 0, cells: [], merges: [] };
    const range = XLSX.utils.decode_range(ref);
    const cells: SheetCell[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: SheetCell[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) row.push(toCell(sheet[XLSX.utils.encode_cell({ r, c })]));
      cells.push(row);
    }
    const merges = (sheet['!merges'] ?? []).map((m) => ({ top: m.s.r + 1, bottom: m.e.r + 1, left: m.s.c, right: m.e.c }));
    return { name, firstRow: range.s.r + 1, firstCol: range.s.c, cells, merges };
  });
}

const total = /^(grand\s+total|sub-?\s?total|totals?|sum)\b/i;
const s = (n: number) => (n === 1 ? '' : 's');

const filled = (row: SheetCell[]) => row.filter((cell) => cell.text !== '');
const isBlank = (row: SheetCell[]) => filled(row).length === 0;

/**
 * Whether the row at `index` is a table's header: it holds all of one partner's columns, or it is two or more
 * text cells followed (after any blank rows) by a row holding a number or a date within the same columns.
 */
function isHeader(cells: SheetCell[][], index: number): boolean {
  const row = cells[index];
  const texts = filled(row).map((cell) => cell.text);
  if (ADAPTERS.some((a) => a.columns.every((c) => texts.includes(c)))) return true;
  if (texts.length < 2 || !filled(row).every((cell) => cell.kind === 'text')) return false;
  const first = row.findIndex((cell) => cell.text !== '');
  const last = row.length - 1 - [...row].reverse().findIndex((cell) => cell.text !== '');
  const next = cells.slice(index + 1).find((r) => !isBlank(r));
  return !!next && next.slice(first, last + 1).some((cell) => cell.kind === 'number' || cell.kind === 'date');
}

/**
 * Builds the table whose header is cells[header], running to cells[end) (exclusive); null when no data row
 * is left. Left out, and flagged by sheet row: a repeat of the header, a total row, and a note (one text
 * cell). Cells beyond the header's columns are left out and flagged. A blank header over a column with data
 * is named "Column D" and flagged; a blank-headed column with no data is dropped. Formula and error cells,
 * duplicate headers and merged cells are flagged. Nothing is calculated or corrected.
 */
function buildTable(sheet: SheetData, header: number, end: number): FoundTable | null {
  const { cells, firstRow, firstCol } = sheet;
  const headerCells = cells[header];
  const first = headerCells.findIndex((cell) => cell.text !== '');
  const last = headerCells.length - 1 - [...headerCells].reverse().findIndex((cell) => cell.text !== '');
  const headerRow = firstRow + header;
  const flags: RowFlag[] = [];
  const flag = (row: number, reason: string) => flags.push({ row, reason });

  const used = new Set(headerCells.map((cell) => cell.text).filter(Boolean));
  const columns: { index: number; name: string }[] = [];
  for (let c = first; c <= last; c++) {
    let name = headerCells[c].text;
    if (name === '') {
      if (!cells.slice(header + 1, end).some((row) => row[c].text !== '')) continue;
      const base = `Column ${columnLetter(firstCol + c)}`;
      name = base;
      for (let n = 2; used.has(name); n++) name = `${base} (${n})`;
      used.add(name);
      flag(headerRow, `${address(headerRow, firstCol + c)} has no header; named "${name}"`);
    }
    columns.push({ index: c, name });
  }
  const headers = columns.map((c) => c.name);
  const duplicates = [...new Set(headers.filter((h, i) => headers.indexOf(h) !== i))];
  for (const name of duplicates) flag(headerRow, `the header "${name}" appears more than once; mapping will ask which column to keep`);

  const match = matchPartner(headers, duplicates);
  const problem = partnerMatchProblem(match);
  if (problem) throw new ConvertError(problem);

  const rows: FoundTable['rows'] = [];
  const formulaCells = (row: SheetCell[], sheetRow: number) => {
    for (const { index } of columns) {
      const cell = row[index];
      const where = address(sheetRow, firstCol + index);
      if (cell.kind === 'error') flag(sheetRow, `${where} shows the error ${cell.text}`);
      if (cell.formula === undefined) continue;
      flag(sheetRow, cell.kind === 'empty'
        ? `${where} is a formula (=${cell.formula}) with no stored result, so it is empty`
        : `${where} is a formula (=${cell.formula}); its stored result is used and can't be checked here`);
    }
  };
  formulaCells(headerCells, headerRow);
  for (let i = header + 1; i < end; i++) {
    const row = cells[i];
    if (isBlank(row)) continue;
    const sheetRow = firstRow + i;
    const inSpan = row.slice(first, last + 1);
    if (inSpan.every((cell, c) => cell.text === headerCells[first + c].text) && row.every((cell, c) => (c >= first && c <= last) || cell.text === '')) {
      flag(sheetRow, 'repeated header, left out');
      continue;
    }
    const lead = filled(row)[0].text;
    if (total.test(lead)) {
      flag(sheetRow, 'total row, left out');
      continue;
    }
    if (filled(inSpan).length === 1 && filled(inSpan)[0].kind === 'text' && last > first) {
      flag(sheetRow, 'note row, left out');
      continue;
    }
    const extra = row.filter((cell, c) => (c < first || c > last) && cell.text !== '').length;
    if (extra) flag(sheetRow, `${extra} cell${s(extra)} beyond the header, left out`);
    formulaCells(row, sheetRow);
    rows.push({ sourceRow: sheetRow, cells: columns.map(({ index }) => row[index].text) });
  }
  if (!rows.length) return null;

  let bottom = end - 1;
  while (isBlank(cells[bottom])) bottom--;
  const lastRow = firstRow + bottom;
  for (const m of sheet.merges) {
    if (m.bottom < headerRow || m.top > lastRow || m.right < firstCol + first || m.left > firstCol + last) continue;
    const range = `${address(m.top, m.left)}:${address(m.bottom, m.right)}`;
    flag(Math.max(m.top, headerRow), `merged cells ${range}; the value is only in ${address(m.top, m.left)}, the others are empty`);
  }

  const partner = match?.kind === 'partner' ? match.adapter.name : '';
  const range = `${address(headerRow, firstCol + first)}:${address(lastRow, firstCol + last)}`;
  return { partner, headerRow, headers, sheet: sheet.name, range, rows, flags };
}

/**
 * Finds every candidate table on every sheet, in workbook order. A header is a row holding all of one
 * partner's columns, or two or more text cells above a row with a number or date in the same columns.
 * Non-blank rows above a sheet's first header are introduction and are not imported. A table runs from its
 * header to the next header that follows a blank row, or to the end of the sheet; tables are never merged.
 * Throws a ConvertError when no sheet holds a table.
 */
export function findExcelTables(sheets: SheetData[]): FoundTable[] {
  const tables: FoundTable[] = [];
  for (const sheet of sheets) {
    const { cells } = sheet;
    let i = 0;
    while (i < cells.length) {
      if (isBlank(cells[i]) || !isHeader(cells, i)) { i++; continue; }
      let end = i + 1;
      let next = cells.length;
      for (; end < cells.length; end++) {
        if (!isBlank(cells[end])) continue;
        const k = cells.findIndex((row, n) => n > end && !isBlank(row));
        if (k >= 0 && isHeader(cells, k)) { next = k; break; }
      }
      const table = buildTable(sheet, i, Math.min(end, cells.length));
      if (table) tables.push(table);
      i = next === cells.length ? cells.length : next;
    }
  }
  if (!tables.length) {
    throw new ConvertError(`No table with a header row and data rows was found on any of its ${sheets.length} sheet${s(sheets.length)}.`);
  }
  return tables;
}

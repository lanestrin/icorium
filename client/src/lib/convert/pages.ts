import { ADAPTERS } from '../../../../shared/types';
import type { PlacedCell } from './layout';
import { ConvertError, HEADER_SEARCH_ROWS, locateHeader, type FoundTable, type RowFlag, type ValueCheck } from './table';

// Finding the partner table in a PDF or an image, where every cell has a position. Cells are placed in the
// header's columns by where they sit, so an empty cell stays in its own column, and every value the reader
// could have got wrong is listed for the person to keep or leave blank. Nothing is corrected here.

/** OCR confidence (0 to 100) below which a value is listed for confirmation. */
export const OCR_MIN_CONFIDENCE = 80;

/** One page of positioned rows. page is absent for an image, which has no pages. */
export interface PageRows { page?: number; ocr: boolean; rows: PlacedCell[][] }

/** "A", "A and B", "A, B and C". */
const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

const PLAIN_INTEGER = /^[+-]?\d+$/;
const NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;
const NUMBERISH = /^[+-]?[\d.,]*\d[\d.,]*%?$/;
const DATE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;
const isValue = (text: string) => NUMBERISH.test(text) || DATE.test(text);

/**
 * Why a value read from a PDF or image may be wrong, as a list of reasons (empty when no rule applies).
 * Rules 1 and 2 apply to OCR-read cells only; the rest apply to every cell. `merged` is true when several
 * cells fell in the column, which is reported on its own. A value matching no rule can still be wrong.
 *  1. Letters that look like digits (O/0, I/1, S/5): a digit and one of O o I l | S s, and nothing else but
 *     digits and number punctuation.
 *  2. OCR confidence below OCR_MIN_CONFIDENCE.
 *  3. A minus sign that may be lost or misplaced: a trailing minus (12.5-), a minus apart from its digits
 *     (- 12.5), a dash other than ASCII "-" before digits, or a cell holding only a dash.
 *  4. Handled by the caller, which needs the whole column (a lost decimal point).
 *  5. Two or more numbers in one cell (12.5 40.1), which may be two values merged.
 */
function valueReasons(text: string, ocr: boolean, confidence: number | undefined, merged: boolean): string[] {
  const reasons: string[] = [];
  if (ocr && /\d/.test(text) && /[OoIl|Ss]/.test(text) && /^[\d.,+\-%\sOoIl|Ss]+$/.test(text)) {
    reasons.push('may contain a letter read for a digit (O/0, I/1, S/5)');
  }
  if (ocr && confidence !== undefined && confidence < OCR_MIN_CONFIDENCE) {
    reasons.push(`OCR confidence ${Math.round(confidence)} (below ${OCR_MIN_CONFIDENCE})`);
  }
  if (/\d\s*-\s*$/.test(text) || /^-\s+\d/.test(text) || /[−–—]\s*\d/.test(text) || /^[-−–—]+$/.test(text)) {
    reasons.push('minus sign may be lost or misplaced');
  }
  const parts = text.split(/\s+/);
  if (!merged && parts.length >= 2 && parts.every((p) => NUMBERISH.test(p))) reasons.push('may be two values merged');
  return reasons;
}

/** Column boundaries: the midpoints of the gaps between neighbouring header cells. */
const boundaries = (header: PlacedCell[]) => header.slice(1).map((cell, i) => (header[i].right + cell.x) / 2);
/** The column a position falls in. */
const columnAt = (bounds: number[], position: number) => bounds.filter((b) => position >= b).length;

/**
 * The header of a table that is not a partner's, as an index into the flat rows: the first row within
 * HEADER_SEARCH_ROWS with two or more cells and no number or date, followed by a row with a number or date
 * under it. -1 when there is none.
 */
function findGenericHeader(flat: { cells: PlacedCell[] }[]): number {
  return flat.slice(0, HEADER_SEARCH_ROWS).findIndex(({ cells }, i) => {
    if (cells.length < 2 || cells.some((cell) => isValue(cell.text.trim()))) return false;
    const left = cells[0].x;
    const right = cells[cells.length - 1].right;
    return (flat[i + 1]?.cells ?? []).some((cell) => isValue(cell.text.trim()) && cell.x <= right && cell.right >= left);
  });
}

/**
 * Finds the table in pages of positioned rows. When a row within HEADER_SEARCH_ROWS holds all of one
 * partner's columns, the first such row is the header, as findTable finds it (refused when it mixes
 * partners). Otherwise the header is the first row of column names above a row of values (findGenericHeader)
 * and the table has no partner, so it is imported as Needs Mapping. The rows after the header are data.
 *
 * A row with exactly as many cells as headers is taken in order. In a row with missing or extra cells, which
 * is flagged, each cell goes in the header column that holds its middle; the boundaries are the midpoints
 * between neighbouring header cells, and the first and last columns are open at their outer sides, so no
 * cell is dropped. A later row equal to the header (a PDF repeats it on each page) is left out and flagged, and its
 * cells give the column positions for the rest of that page; a page without one uses the latest header's.
 * A column with no cell is empty (never zero, never filled from a neighbour) and its row is flagged. A cell
 * lying across a boundary, several cells in one column, and every value matching a rule of valueReasons or a
 * lost decimal point (a whole number in a column where every other number has one) become values to confirm.
 * `where` names the place searched. Each row keeps its page and its row on that page.
 */
export function findPageTable(pages: PageRows[], where: string): FoundTable {
  const flat = pages.flatMap((page) => page.rows.map((cells, i) => ({ page, cells, pageRow: i + 1 })));
  const texts = flat.map((row) => row.cells.map((cell) => cell.text.trim()));
  const hasPartnerHeader = texts.slice(0, HEADER_SEARCH_ROWS).some((row) => ADAPTERS.some((a) => a.columns.every((c) => row.includes(c))));
  const generic = hasPartnerHeader ? -1 : findGenericHeader(flat);
  if (!hasPartnerHeader && generic < 0) {
    const expected = ADAPTERS.map((a) => `${a.name} (${a.columns.join(', ')})`).join('; ');
    throw new ConvertError(`No header row was found in ${where}. Expected a row of column names above a row of values, or the columns of one of: ${expected}`);
  }
  const { headerIndex, headers, partner } = hasPartnerHeader ? locateHeader(texts, where) : { headerIndex: generic, headers: texts[generic], partner: '' };
  const width = headers.length;
  const paged = (row: (typeof flat)[number]) => (row.page.page === undefined ? {} : { page: row.page.page, pageRow: row.pageRow });

  const rows: FoundTable['rows'] = [];
  const flags: RowFlag[] = [];
  const placed: { row: (typeof flat)[number]; sourceRow: number; values: { text: string; confidence?: number; reasons: string[] }[] }[] = [];

  if (!hasPartnerHeader) {
    for (const name of new Set(headers.filter((h, i) => headers.indexOf(h) !== i))) {
      flags.push({ row: headerIndex + 1, reason: `the header "${name}" appears more than once; mapping will ask which column to keep`, ...paged(flat[headerIndex]) });
    }
  }
  let header = flat[headerIndex].cells;
  let positions = boundaries(header);
  flat.slice(headerIndex + 1).forEach((row, i) => {
    const sourceRow = headerIndex + 2 + i;
    const flag = (reason: string) => flags.push({ row: sourceRow, reason, ...paged(row) });
    if (row.cells.length === width && row.cells.every((cell, c) => cell.text.trim() === headers[c])) {
      header = row.cells;
      positions = boundaries(header);
      flag(`repeated header${row.page.page === undefined ? '' : ` on page ${row.page.page}`}, left out`);
      return;
    }

    const columns: PlacedCell[][] = Array.from({ length: width }, () => []);
    const crossed = new Set<PlacedCell>();
    if (row.cells.length === width) {
      // As many cells as headers: taken in order, whatever their alignment (numbers are often right-aligned
      // under left-aligned headers, which positions would misplace).
      row.cells.forEach((cell, c) => columns[c].push(cell));
    } else {
      for (const cell of row.cells) {
        const first = columnAt(positions, cell.x);
        const last = columnAt(positions, cell.right);
        columns[columnAt(positions, (cell.x + cell.right) / 2)].push(cell);
        if (last > first) crossed.add(cell);
      }
      flag('cells placed by position: check the columns');
    }
    const empty = headers.filter((_, c) => columns[c].length === 0);
    if (empty.length) flag(`empty: ${empty.join(', ')}`);

    const values = columns.map((cells, c) => {
      const text = cells.map((cell) => cell.text.trim()).join(' ');
      const confidences = cells.flatMap((cell) => (cell.confidence === undefined ? [] : [cell.confidence]));
      const confidence = confidences.length ? Math.min(...confidences) : undefined;
      const reasons = text === '' ? [] : valueReasons(text, row.page.ocr, confidence, cells.length > 1);
      for (const cell of cells) if (crossed.has(cell)) reasons.push(`lies across ${list(headers.slice(columnAt(positions, cell.x), columnAt(positions, cell.right) + 1))}`);
      if (cells.length > 1) reasons.push(`${cells.length} values fell in one column`);
      return { text, ...(confidence === undefined ? {} : { confidence }), reasons };
    });
    placed.push({ row, sourceRow, values });
    rows.push({ sourceRow, cells: values.map((v) => v.text), ...paged(row) });
  });

  // A lost decimal point: a whole number in a column where every other number (at least two) has one.
  headers.forEach((_, c) => {
    const numbers = placed.filter((p) => NUMBER.test(p.values[c].text));
    for (const p of placed) {
      const text = p.values[c].text;
      if (!PLAIN_INTEGER.test(text)) continue;
      const others = numbers.filter((o) => o !== p);
      if (others.length >= 2 && others.every((o) => /[.,]/.test(o.values[c].text))) p.values[c].reasons.push('no decimal point, unlike the rest of this column');
    }
  });

  const checks: ValueCheck[] = [];
  for (const p of placed) {
    p.values.forEach((v, c) => {
      if (v.reasons.length) checks.push({ id: `${p.sourceRow}:${c}`, sourceRow: p.sourceRow, column: c, value: v.text, reasons: [...new Set(v.reasons)], ...paged(p.row) });
    });
  }
  const headerRow = flat[headerIndex];
  return {
    partner, headerRow: headerRow.page.page === undefined ? headerIndex + 1 : headerRow.pageRow,
    ...(headerRow.page.page === undefined ? {} : { headerPage: headerRow.page.page }),
    headers, rows, flags, checks,
  };
}

/** What the person decided for a value to confirm: import it as read, or import an empty cell. */
export type Decision = 'keep' | 'blank';

/** Whether every value to confirm in the table has a decision. */
export const allDecided = (table: FoundTable, decisions: Record<string, Decision>) => (table.checks ?? []).every((check) => decisions[check.id] !== undefined);

/** The table with each value the person chose to leave blank emptied (never zero); every other value stays as read. */
export function applyDecisions(table: FoundTable, decisions: Record<string, Decision>): FoundTable {
  const blanked = new Set((table.checks ?? []).filter((check) => decisions[check.id] === 'blank').map((check) => check.id));
  if (blanked.size === 0) return table;
  return { ...table, rows: table.rows.map((row) => ({ ...row, cells: row.cells.map((cell, c) => (blanked.has(`${row.sourceRow}:${c}`) ? '' : cell)) })) };
}

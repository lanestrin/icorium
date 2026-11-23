import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { columnLetter, findExcelTables, readExcel, type SheetCell, type SheetData } from './excel';
import { ConvertError } from './table';

const A = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
const unfamiliar = ['Lot', 'Mass (lb)', 'R32 %', 'R125 %', 'R134a %'];

type Content = unknown[][] | XLSX.WorkSheet;

/** A real workbook file, made with SheetJS itself. Each entry is a sheet, or a prepared worksheet. */
function workbook(sheets: Record<string, Content>, bookType: 'xlsx' | 'biff8' = 'xlsx') {
  const book = XLSX.utils.book_new();
  for (const [name, content] of Object.entries(sheets)) {
    const sheet = Array.isArray(content) ? XLSX.utils.aoa_to_sheet(content, { cellDates: true }) : content;
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  const bytes = XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer;
  return new File([bytes], bookType === 'xlsx' ? 'report.xlsx' : 'report.xls');
}

/** A worksheet whose used range starts at the given cell (the range SheetJS computes would start at A1). */
function sheetAt(origin: string, rows: unknown[][]) {
  const sheet = XLSX.utils.sheet_add_aoa({}, rows, { origin });
  sheet['!ref'] = XLSX.utils.encode_range({ s: XLSX.utils.decode_cell(origin), e: XLSX.utils.decode_range(sheet['!ref']!).e });
  return sheet;
}

/** Reads a workbook, then finds its tables: the whole Excel path except the review. */
const tablesOf = async (sheets: Record<string, Content>) => findExcelTables(await readExcel(workbook(sheets)));

/** The text of a sheet's cells by row, for comparing what was read. */
const text = (sheet: SheetData) => sheet.cells.map((row) => row.map((cell) => cell.text));

describe('readExcel', () => {
  it('reads numbers as stored, dates as YYYY-MM-DD, text trimmed and empty cells as empty', async () => {
    const file = workbook({ Data: [['batch_id', 'sample_date', 'feed_mass_kg'], ['  A-1 ', new Date(2026, 8, 1), 1234.5], ['A-2', null, 0.125]] });
    const [sheet] = await readExcel(file);
    expect(text(sheet)).toEqual([['batch_id', 'sample_date', 'feed_mass_kg'], ['A-1', '2026-09-01', '1234.5'], ['A-2', '', '0.125']]);
    expect(sheet.cells[1].map((c) => c.kind)).toEqual(['text', 'date', 'number']);
    expect(sheet.cells[2][1].kind).toBe('empty');
  });

  it('ignores the number format, so a formatted value keeps its full stored number', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['mass'], [1234.5678]]);
    sheet.A2.z = '#,##0.0';
    expect(text((await readExcel(workbook({ Data: sheet })))[0])).toEqual([['mass'], ['1234.5678']]);
  });

  it('reads every sheet, in workbook order', async () => {
    const sheets = await readExcel(workbook({ First: [['a']], Second: [['b']] }));
    expect(sheets.map((s) => s.name)).toEqual(['First', 'Second']);
    expect(text(sheets[1])).toEqual([['b']]);
  });

  it('keeps the true coordinates of a range that starts below and to the right of A1', async () => {
    const [sheet] = await readExcel(workbook({ Data: sheetAt('B3', [['x', 'y'], [1, 2]]) }));
    expect({ firstRow: sheet.firstRow, firstCol: sheet.firstCol }).toEqual({ firstRow: 3, firstCol: 1 });
    expect(text(sheet)).toEqual([['x', 'y'], ['1', '2']]);
  });

  it('keeps blank rows and pads every row to the used width', async () => {
    expect(text((await readExcel(workbook({ Data: [['a', 'b', 'c'], [], ['x']] })))[0])).toEqual([['a', 'b', 'c'], ['', '', ''], ['x', '', '']]);
  });

  it('keeps a formula with its stored result', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]);
    sheet.C1 = { t: 's', v: 'c' };
    sheet.C2 = { t: 'n', v: 3, f: 'A2+B2' };
    sheet['!ref'] = 'A1:C2';
    const [read] = await readExcel(workbook({ Data: sheet }));
    expect(read.cells[1][2]).toEqual({ text: '3', kind: 'number', formula: 'A2+B2' });
  });

  it('keeps an error cell as the text Excel shows', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['a'], [1]]);
    sheet.A2 = { t: 'e', v: 7, w: '#DIV/0!', f: '1/0' };
    expect((await readExcel(workbook({ Data: sheet })))[0].cells[1][0]).toMatchObject({ text: '#DIV/0!', kind: 'error' });
  });

  it('reads the older .xls format', async () => {
    expect(text((await readExcel(workbook({ Data: [['a', 1]] }, 'biff8')))[0])).toEqual([['a', '1']]);
  });

  it('refuses a file that is not a readable workbook', async () => {
    const broken = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5])], 'broken.xlsx');
    await expect(readExcel(broken)).rejects.toThrow(new ConvertError("It couldn't be read as an Excel file."));
  });
});

describe('columnLetter', () => {
  it('counts A to Z, then AA', () => {
    expect([0, 3, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(['A', 'D', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});

describe('findExcelTables', () => {
  const data = [['X-1', '2026-09-01', 100, 40, 30, 30], ['X-2', '2026-09-01', 200, 40, 30, 30]];

  it('finds an exact partner table as findTable would: same headers, rows and partner', async () => {
    const [table] = await tablesOf({ Data: [A, ['X-1', '2026-09-01', 100, 40, 30, 30]] });
    expect(table).toMatchObject({ partner: 'Partner A', headerRow: 1, headers: A, sheet: 'Data', range: 'A1:F2', flags: [] });
    expect(table.rows).toEqual([{ sourceRow: 2, cells: ['X-1', '2026-09-01', '100', '40', '30', '30'] }]);
  });

  it('imports data on a later sheet, below introduction rows, with sheet row numbers', async () => {
    const intro = XLSX.utils.aoa_to_sheet([['Supplier report'], ['Prepared 2026-09'], [], A, ...data]);
    const tables = await tablesOf({ Cover: [['Nothing to see here']], Data: intro });
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ sheet: 'Data', headerRow: 4, range: 'A4:F6', partner: 'Partner A' });
    expect(tables[0].rows.map((r) => r.sourceRow)).toEqual([5, 6]);
  });

  it('uses the sheet coordinates of a table that starts at B3', async () => {
    const [table] = await tablesOf({ Data: sheetAt('B3', [A, ...data]) });
    expect(table).toMatchObject({ headerRow: 3, range: 'B3:G5' });
    expect(table.rows.map((r) => r.sourceRow)).toEqual([4, 5]);
  });

  it('finds a table with unfamiliar headers and no partner', async () => {
    const [table] = await tablesOf({ Data: [unfamiliar, ['L1', 10, 40, 30, 30]] });
    expect(table).toMatchObject({ partner: '', headers: unfamiliar, headerRow: 1 });
  });

  it('keeps two tables on one sheet apart and never merges them', async () => {
    const tables = await tablesOf({ Data: [A, ...data, [], unfamiliar, ['L1', 10, 40, 30, 30]] });
    expect(tables.map((t) => [t.partner, t.range, t.rows.length])).toEqual([['Partner A', 'A1:F3', 2], ['', 'A5:E6', 1]]);
  });

  it('finds a table on each sheet', async () => {
    const tables = await tablesOf({ One: [A, data[0]], Two: [unfamiliar, ['L1', 10, 40, 30, 30]] });
    expect(tables.map((t) => t.sheet)).toEqual(['One', 'Two']);
  });

  it('leaves out total and note rows and flags each by its sheet row', async () => {
    const [table] = await tablesOf({ Data: [A, ...data, ['Total', '', 300, '', '', ''], ['Grand total (kg)', '', 300, '', '', ''], ['Source: lab export']] });
    expect(table.rows.map((r) => r.sourceRow)).toEqual([2, 3]);
    expect(table.flags).toEqual([
      { row: 4, reason: 'total row, left out' },
      { row: 5, reason: 'total row, left out' },
      { row: 6, reason: 'note row, left out' },
    ]);
  });

  it('does not take a word that only starts like a total for one', async () => {
    const [table] = await tablesOf({ Data: [A, ['Summit-1', '2026-09-01', 100, 40, 30, 30]] });
    expect(table.rows).toHaveLength(1);
  });

  it('leaves out a repeated header and flags it', async () => {
    const [table] = await tablesOf({ Data: [A, data[0], A, data[1]] });
    expect(table.rows.map((r) => r.sourceRow)).toEqual([2, 4]);
    expect(table.flags).toEqual([{ row: 3, reason: 'repeated header, left out' }]);
  });

  it('names a blank header over data by its column letter, and avoids a name already used', async () => {
    const [table] = await tablesOf({ Data: [['Lot', 'Mass (lb)', null, 'Column D'], ['L1', 10, 'x', 'y']] });
    expect(table.headers).toEqual(['Lot', 'Mass (lb)', 'Column C', 'Column D']);
    expect(table.flags).toEqual([{ row: 1, reason: 'C1 has no header; named "Column C"' }]);
    expect(table.columns).toEqual(['A', 'B', 'C', 'D']);
    const [clash] = await tablesOf({ Data: [['Lot', null, 'Column B', 'Mass'], ['L1', 'x', 'y', 10]] });
    expect(clash.headers).toEqual(['Lot', 'Column B (2)', 'Column B', 'Mass']);
  });

  it('drops a blank-headed column that holds no data', async () => {
    const [table] = await tablesOf({ Data: [['Lot', null, 'Mass'], ['L1', null, 10]] });
    expect(table.headers).toEqual(['Lot', 'Mass']);
    expect(table.rows[0].cells).toEqual(['L1', '10']);
  });

  it('flags a duplicate header and keeps both columns', async () => {
    const [table] = await tablesOf({ Data: [['Lot', 'Mass', 'Mass'], ['L1', 10, 12]] });
    expect(table.headers).toEqual(['Lot', 'Mass', 'Mass']);
    expect(table.flags).toEqual([{ row: 1, reason: 'the header "Mass" appears more than once; mapping will ask which column to keep' }]);
  });

  it('still refuses a duplicated partner column', async () => {
    await expect(tablesOf({ Data: [[...A, 'batch_id'], ['X', '2026-09-01', 1, 2, 3, 4, 'Y']] })).rejects.toThrow('The column batch_id appears more than once');
  });

  it('flags formulas with the stored result used, and a formula with no stored result', async () => {
    const cell = (t: string, formula?: string): SheetCell => ({ text: t, kind: t ? (Number.isNaN(Number(t)) ? 'text' : 'number') : 'empty', ...(formula ? { formula } : {}) });
    const sheet: SheetData = { name: 'S', firstRow: 1, firstCol: 0, merges: [], cells: [
      unfamiliar.map((h) => cell(h)),
      [cell('L1'), cell('10', 'C2/4'), cell('', 'SUM(D2:E2)'), cell('30'), cell('30')],
    ] };
    const [table] = findExcelTables([sheet]);
    expect(table.rows[0].cells).toEqual(['L1', '10', '', '30', '30']); // the missing result is empty, never zero
    expect(table.flags).toEqual([
      { row: 2, reason: "B2 is a formula (=C2/4); its stored result is used and can't be checked here" },
      { row: 2, reason: 'C2 is a formula (=SUM(D2:E2)) with no stored result, so it is empty' },
    ]);
  });

  it('flags an error cell', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([unfamiliar, ['L1', 10, 40, 30, 30]]);
    sheet.B2 = { t: 'e', v: 7, w: '#DIV/0!' };
    const [table] = await tablesOf({ Data: sheet });
    expect(table.flags).toEqual([{ row: 2, reason: 'B2 shows the error #DIV/0!' }]);
    expect(table.rows[0].cells[1]).toBe('#DIV/0!');
  });

  it('flags merged cells and leaves the value only in the first cell', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([unfamiliar, ['L1', 10, 40, 30, 30], ['L2', 12, 'x', null, 30]]);
    sheet['!merges'] = [{ s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }];
    const [table] = await tablesOf({ Data: sheet });
    expect(table.flags).toEqual([{ row: 3, reason: 'merged cells C3:D3; the value is only in C3, the others are empty' }]);
    expect(table.rows[1].cells).toEqual(['L2', '12', 'x', '', '30']);
  });

  it('flags cells beyond the header and leaves them out', async () => {
    const [table] = await tablesOf({ Data: [A, ['X-1', '2026-09-01', 100, 40, 30, 30, 'stray']] });
    expect(table.flags).toEqual([{ row: 2, reason: '1 cell beyond the header, left out' }]);
    expect(table.rows[0].cells).toHaveLength(6);
  });

  it('keeps a row with an empty measurement as it is, never filling in zero', async () => {
    const [table] = await tablesOf({ Data: [A, ['X-1', '2026-09-01', 100, null, 30, 30]] });
    expect(table.rows[0].cells).toEqual(['X-1', '2026-09-01', '100', '', '30', '30']);
  });

  it('refuses a workbook with no table, counting its sheets', async () => {
    await expect(tablesOf({ One: [['just a title']], Two: [['x']] })).rejects.toThrow(new ConvertError('No table with a header row and data rows was found on any of its 2 sheets.'));
    await expect(tablesOf({ Data: [A] })).rejects.toThrow('on any of its 1 sheet.');
  });

  it('does not take a header with only a total row beneath as a table', () => {
    const cell = (t: string): SheetCell => ({ text: t, kind: t ? 'text' : 'empty' });
    const sheet: SheetData = { name: 'S', firstRow: 1, firstCol: 0, merges: [], cells: [A.map(cell), ['Total', '', '', '', '', ''].map(cell)] };
    expect(() => findExcelTables([sheet])).toThrow(ConvertError);
  });
});

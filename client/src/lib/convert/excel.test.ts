import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readExcel } from './excel';
import { ConvertError } from './table';

/** A real workbook file, made with SheetJS itself, with one sheet per entry. */
function workbook(sheets: Record<string, unknown[][]>, bookType: 'xlsx' | 'biff8' = 'xlsx') {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  const bytes = XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer;
  return new File([bytes], bookType === 'xlsx' ? 'report.xlsx' : 'report.xls');
}

describe('readExcel', () => {
  it('reads numbers as stored, dates as YYYY-MM-DD, text trimmed and empty cells as empty', async () => {
    const file = workbook({ Data: [['batch_id', 'sample_date', 'feed_mass_kg'], ['  A-1 ', new Date(2026, 8, 1), 1234.5], ['A-2', null, 0.125]] });
    expect(await readExcel(file)).toEqual([['batch_id', 'sample_date', 'feed_mass_kg'], ['A-1', '2026-09-01', '1234.5'], ['A-2', '', '0.125']]);
  });

  it('ignores the number format, so a formatted value keeps its full stored number', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['mass'], [1234.5678]]);
    sheet.A2.z = '#,##0.0';
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Data');
    const file = new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], 'report.xlsx');
    expect(await readExcel(file)).toEqual([['mass'], ['1234.5678']]);
  });

  it('reads only the first sheet', async () => {
    expect(await readExcel(workbook({ First: [['a']], Second: [['b']] }))).toEqual([['a']]);
  });

  it('keeps blank rows and pads every row to the used width, so row numbers match the sheet', async () => {
    expect(await readExcel(workbook({ Data: [['a', 'b', 'c'], [], ['x']] }))).toEqual([['a', 'b', 'c'], ['', '', ''], ['x', '', '']]);
  });

  it('reads the older .xls format', async () => {
    expect(await readExcel(workbook({ Data: [['a', 1]] }, 'biff8'))).toEqual([['a', '1']]);
  });

  it('refuses a file that is not a readable workbook', async () => {
    const broken = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5])], 'broken.xlsx');
    await expect(readExcel(broken)).rejects.toThrow(new ConvertError("It couldn't be read as an Excel file."));
  });
});

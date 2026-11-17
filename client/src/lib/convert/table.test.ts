import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../../../../shared/types';
import { CONVERT_MAX_MB, ConvertError, csvName, fileKind, findTable, toCsvFile, toCsvText } from './table';

const [A, B, C] = ADAPTERS.map((a) => [...a.columns]);

describe('fileKind', () => {
  it.each([['data.csv', 'csv'], ['DATA.CSV', 'csv'], ['report.xlsx', 'excel'], ['Old.XLS', 'excel'], ['scan.pdf', 'pdf'], ['SCAN.PDF', 'pdf']])('%s is %s', (name, kind) => {
    expect(fileKind({ name, size: 10 })).toBe(kind);
  });

  it.each(['report.docx', 'photo.png', 'noextension'])('refuses %s, naming what can be uploaded', (name) => {
    expect(() => fileKind({ name, size: 10 })).toThrow(new ConvertError("This file type can't be converted. Upload a CSV, Excel or PDF file."));
  });

  it('refuses an Excel file over the conversion limit before reading it', () => {
    const limit = CONVERT_MAX_MB * 1024 * 1024;
    expect(fileKind({ name: 'big.xlsx', size: limit })).toBe('excel');
    expect(() => fileKind({ name: 'big.xlsx', size: limit + 1 })).toThrow('It is larger than the 20 MB conversion limit.');
  });

  it('refuses a PDF over the conversion limit before reading it', () => {
    expect(() => fileKind({ name: 'big.pdf', size: CONVERT_MAX_MB * 1024 * 1024 + 1 })).toThrow('It is larger than the 20 MB conversion limit.');
  });

  it('never applies the conversion limit to a CSV, which the server limits instead', () => {
    expect(fileKind({ name: 'big.csv', size: 50 * 1024 * 1024 })).toBe('csv');
  });
});

describe('findTable', () => {
  it.each([['Partner A', A], ['Partner B', B], ['Partner C', C]])('finds a %s header below title rows', (partner, columns) => {
    const table = findTable([['Quarterly report'], [], columns, ['X-1', '2026-09-01', '1', '2', '3', '4']]);
    expect(table).toMatchObject({ partner, headerRow: 3, headers: columns, flags: [] });
    expect(table.rows).toEqual([{ sourceRow: 4, cells: ['X-1', '2026-09-01', '1', '2', '3', '4'] }]);
  });

  it('matches header cells exactly after trimming, like the server', () => {
    expect(findTable([A.map((c) => ` ${c} `), ['1', '2', '3', '4', '5', '6']]).headers).toEqual(A);
    expect(() => findTable([A.map((c) => c.toUpperCase())])).toThrow(ConvertError);
  });

  it('says what was expected when no header is found', () => {
    expect(() => findTable([['name', 'value'], ['a', '1']])).toThrow(
      "No header row with a partner's columns was found in the first sheet. Expected the columns of one of: Partner A (batch_id, sample_date, feed_mass_kg, r32_pct, r125_pct, r134a_pct); ");
    expect(() => findTable([], 'page 1')).toThrow('was found in page 1.');
  });

  it('only looks for the header in the first 50 rows', () => {
    const filler = Array.from({ length: 50 }, () => ['note']);
    expect(() => findTable([...filler, A])).toThrow(ConvertError);
    expect(findTable([...filler.slice(1), A]).headerRow).toBe(50);
  });

  it('keeps extra named columns and stops at the last named header cell', () => {
    const table = findTable([[...A, 'notes', '', ''], ['X-1', 'd', '1', '2', '3', '4', 'ok', '', '']]);
    expect(table.headers).toEqual([...A, 'notes']);
    expect(table.rows[0].cells).toEqual(['X-1', 'd', '1', '2', '3', '4', 'ok']);
    expect(table.flags).toEqual([]);
  });

  it('leaves out a repeated header row and flags it, keeping the source numbers of other rows', () => {
    const table = findTable([A, ['X-1', 'd', '1', '2', '3', '4'], [...A, ''], ['X-2', 'd', '1', '2', '3', '4']]);
    expect(table.rows.map((r) => r.sourceRow)).toEqual([2, 4]);
    expect(table.flags).toEqual([{ row: 3, reason: 'repeated header, left out' }]);
  });

  it('keeps a row that only partly repeats the header', () => {
    const table = findTable([A, [...A.slice(0, 5), 'X']]);
    expect(table.rows).toEqual([{ sourceRow: 2, cells: [...A.slice(0, 5), 'X'] }]);
    expect(table.flags).toEqual([]);
  });

  it('skips blank rows, and keeps rows with blank cells as they are', () => {
    const table = findTable([A, ['X-1', 'd', '', '2', '3', '4'], ['', '', '', '', '', ''], [], ['X-2', 'd', '1', '2', '3', '4']]);
    expect(table.rows.map((r) => r.sourceRow)).toEqual([2, 5]);
    expect(table.rows[0].cells[2]).toBe('');
    expect(table.flags).toEqual([]);
  });

  it('pads a short row and flags it, never guessing where the cells belong', () => {
    const table = findTable([A, ['X-1', 'd', '1']]);
    expect(table.rows[0].cells).toEqual(['X-1', 'd', '1', '', '', '']);
    expect(table.flags).toEqual([{ row: 2, reason: 'missing 3 cells' }]);
  });

  it('flags cells beyond the header and leaves them out', () => {
    const table = findTable([A, ['X-1', 'd', '1', '2', '3', '4', 'note'], ['X-2', 'd', '1', '2', '3', '4', 'a', 'b']]);
    expect(table.rows.map((r) => r.cells.length)).toEqual([6, 6]);
    expect(table.flags).toEqual([{ row: 2, reason: '1 cell beyond the header, left out' }, { row: 3, reason: '2 cells beyond the header, left out' }]);
  });
});

describe('CSV output', () => {
  it('quotes commas, quotes and line breaks, and ends each line with LF', () => {
    const text = toCsvText({ headers: ['a', 'b'], rows: [{ sourceRow: 2, cells: ['1,5', 'say "hi"'] }, { sourceRow: 3, cells: ['two\nlines', 'plain'] }] });
    expect(text).toBe('a,b\n"1,5","say ""hi"""\n"two\nlines",plain\n');
  });

  it.each([['report.xlsx', 'report.csv'], ['q3.data.XLS', 'q3.data.csv'], ['noext', 'noext.csv']])('names %s as %s', (from, to) => {
    expect(csvName(from)).toBe(to);
  });

  it('makes a text/csv file holding the table', async () => {
    const file = toCsvFile(findTable([A, ['X-1', 'd', '1', '2', '3', '4']]), 'report.xlsx');
    expect({ name: file.name, type: file.type }).toEqual({ name: 'report.csv', type: 'text/csv' });
    expect(await file.text()).toBe(`${A.join(',')}\nX-1,d,1,2,3,4\n`);
  });
});

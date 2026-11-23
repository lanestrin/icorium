import { describe, expect, it } from 'vitest';
import type { PlacedCell } from './layout';
import { findPageTable, OCR_MIN_CONFIDENCE, type PageRows } from './pages';
import { ConvertError } from './table';

const A = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
const B = ['lot_number', 'collected_on', 'weight_lb', 'hfc32_percent', 'hfc125_percent', 'hfc134a_percent'];

/** A cell under column `col` (columns 100 apart), shifted by `dx`, 5 units a character wide. */
const cell = (text: string, col: number, { dx = 0, confidence }: { dx?: number; confidence?: number } = {}): PlacedCell => ({
  text, x: col * 100 + dx, right: col * 100 + dx + text.length * 5, ...(confidence === undefined ? {} : { confidence }),
});
/** A row with one cell per text, in columns 0, 1, 2…; null leaves that column empty. */
const row = (texts: (string | null)[], dx = 0): PlacedCell[] => texts.flatMap((t, c) => (t === null ? [] : [cell(t, c, { dx })]));
const page = (rows: PlacedCell[][], extra: Partial<PageRows> = {}): PageRows => ({ page: 1, ocr: false, rows, ...extra });
const good = ['A-001', '2026-09-01', '120.875', '34.71', '29.13', '36.16'];
const good2 = ['A-002', '2026-09-02', '136.257', '38.77', '28.19', '33.03'];

describe('findPageTable', () => {
  it("reads an exact Partner A text PDF with no values to confirm, keeping each row's page and page row", () => {
    const table = findPageTable([
      page([[cell('Report', 0)], row(A), row(good)]),
      page([row(good2)], { page: 2 }),
    ], 'the PDF');
    expect(table.partner).toBe('Partner A');
    expect(table.headers).toEqual(A);
    expect([table.headerPage, table.headerRow]).toEqual([1, 2]);
    expect(table.rows.map((r) => [r.sourceRow, r.page, r.pageRow, r.cells[0]])).toEqual([[3, 1, 3, 'A-001'], [4, 2, 1, 'A-002']]);
    expect(table.flags).toEqual([]);
    expect(table.checks).toEqual([]);
  });

  it('leaves out a repeated header and flags it, and uses its positions for that page and the pages after', () => {
    const shifted = (texts: (string | null)[]) => row(texts, 70);
    const table = findPageTable([
      page([row(A), row(good)]),
      page([shifted(A), shifted(good2)], { page: 2 }),
      page([shifted(['A-003', null, '100.500', '30.10', '30.20', '39.70'])], { page: 3 }), // a short row is placed by position
    ], 'the PDF');
    expect(table.flags).toEqual([
      { row: 3, reason: 'repeated header on page 2, left out', page: 2, pageRow: 1 },
      { row: 5, reason: 'cells placed by position: check the columns', page: 3, pageRow: 1 },
      { row: 5, reason: 'empty: sample_date', page: 3, pageRow: 1 },
    ]);
    expect(table.rows.map((r) => r.cells)).toEqual([good, good2, ['A-003', '', '100.500', '30.10', '30.20', '39.70']]);
    expect(table.checks).toEqual([]); // under the first page's positions the shifted cells would have landed one column late
  });

  it('keeps an empty cell in its own column and flags the row, never filling it from a neighbour', () => {
    const table = findPageTable([page([row(A), row(['A-001', '2026-09-01', null, '34.71', '29.13', '36.16'])])], 'the PDF');
    expect(table.rows[0].cells).toEqual(['A-001', '2026-09-01', '', '34.71', '29.13', '36.16']);
    expect(table.flags).toEqual([
      { row: 2, reason: 'cells placed by position: check the columns', page: 1, pageRow: 2 },
      { row: 2, reason: 'empty: feed_mass_kg', page: 1, pageRow: 2 },
    ]);
    expect(table.checks).toEqual([]);
  });

  it('takes a full row in order, so right-aligned numbers under left-aligned headers stay in their columns', () => {
    // Excel's default: headers start at each column's left edge (100 apart), numbers end at its right edge.
    const header = A.map((text, c) => ({ text, x: c * 100, right: c * 100 + text.length * 5 }));
    const right = (text: string, c: number) => ({ text, x: c * 100 + 95 - text.length * 5, right: c * 100 + 95 });
    const table = findPageTable([page([header, ['A-001', '2026-09-01', '120.875', '40', '30', '30'].map(right)])], 'the PDF');
    expect(table.rows[0].cells).toEqual(['A-001', '2026-09-01', '120.875', '40', '30', '30']);
    expect(table.flags).toEqual([]);
    expect(table.checks).toEqual([]);
  });

  it('asks about a cell lying across two columns, and about two cells in one column', () => {
    const wide = { ...cell('2026-09-01 120.875', 1), right: 260 }; // spans the sample_date and feed_mass_kg columns
    const split = [cell('A-001', 0), cell('2026-09-01', 1), cell('120.875', 2), cell('34.7', 3), cell('1', 3, { dx: 40 }), cell('29.13', 4), cell('36.16', 5)];
    const table = findPageTable([page([row(A), [cell('A-001', 0), wide, cell('34.71', 3), cell('29.13', 4), cell('36.16', 5)], split])], 'the PDF');
    expect(table.checks?.map((c) => [c.sourceRow, c.column, c.value, c.reasons])).toEqual([
      [2, 2, '2026-09-01 120.875', ['lies across sample_date and feed_mass_kg']], // placed where its middle falls
      [3, 3, '34.7 1', ['2 values fell in one column']],
    ]);
    expect(table.rows[0].cells).toHaveLength(6); // nothing is dropped
  });

  describe('values to confirm', () => {
    /** The reasons for one value placed in the feed_mass_kg column of an otherwise clean row. */
    const reasonsFor = (value: string, { ocr = true, confidence, others = ['120.875'] }: { ocr?: boolean; confidence?: number; others?: string[] } = {}) => {
      const rows = [row(A), ...others.map((o) => row(['A-001', '2026-09-01', o, '34.71', '29.13', '36.16']))];
      rows.push([cell('A-009', 0), cell('2026-09-09', 1), cell(value, 2, { confidence }), cell('34.71', 3), cell('29.13', 4), cell('36.16', 5)]);
      const table = findPageTable([page(rows, { ocr })], 'the image');
      return table.checks?.filter((c) => c.value === value).flatMap((c) => c.reasons) ?? [];
    };
    const LOOKALIKE = 'may contain a letter read for a digit (O/0, I/1, S/5)';

    it('lists look-alike letters in an OCR value', () => {
      expect(reasonsFor('12O.875')).toEqual([LOOKALIKE]);
      expect(reasonsFor('l25')).toEqual([LOOKALIKE]);
      expect(reasonsFor('SO')).toEqual([]); // no digit at all
    });

    it('lists low OCR confidence, below the floor only', () => {
      expect(reasonsFor('120.875', { confidence: OCR_MIN_CONFIDENCE })).toEqual([]);
      expect(reasonsFor('120.875', { confidence: 61.6 })).toEqual(['OCR confidence 62 (below 80)']);
    });

    it('applies the look-alike and confidence rules to OCR pages only', () => {
      expect(reasonsFor('12O.875', { ocr: false })).toEqual([]);
      expect(reasonsFor('120.875', { ocr: false, confidence: 10 })).toEqual([]);
    });

    it('lists a lost or misplaced minus sign', () => {
      for (const value of ['12.5-', '- 12.5', '−12.5', '–12.5', '—']) expect(reasonsFor(value, { ocr: false })).toEqual(['minus sign may be lost or misplaced']);
      expect(reasonsFor('-12.5', { ocr: false })).toEqual([]);
    });

    it('lists a whole number in a column where every other number has a decimal point', () => {
      expect(reasonsFor('12075', { others: ['120.875', '130.250'] })).toEqual(['no decimal point, unlike the rest of this column']);
      expect(reasonsFor('12075', { others: ['120.875'] })).toEqual([]); // fewer than two others
      expect(reasonsFor('12075', { others: ['120', '130.250'] })).toEqual([]); // the column has whole numbers too
    });

    it('lists two numbers in one cell', () => {
      expect(reasonsFor('120.875 34.71', { ocr: false })).toEqual(['may be two values merged']);
      expect(reasonsFor('Lot 5', { ocr: false })).toEqual([]);
    });

    it('gives a cell with several reasons one entry', () => {
      const table = findPageTable([page([row(A), [cell('A-009', 0), cell('1O.5-', 2, { confidence: 50 })]], { ocr: true })], 'the image');
      expect(table.checks).toHaveLength(1);
      expect(table.checks?.[0]).toMatchObject({ id: '2:2', value: '1O.5-', page: 1, pageRow: 2 });
      expect(table.checks?.[0].reasons).toHaveLength(3);
    });
  });

  it('numbers the rows of an image without a page', () => {
    const table = findPageTable([{ ocr: true, rows: [row(A), row(good)] }], 'the image');
    expect(table.headerRow).toBe(1);
    expect(table.headerPage).toBeUndefined();
    expect(table.rows[0]).toEqual({ sourceRow: 2, cells: good });
  });

  it('refuses a header mixing two partners, and says when there is no header', () => {
    expect(() => findPageTable([page([row([...A, ...B])])], 'the PDF')).toThrow(ConvertError);
    expect(() => findPageTable([page([row(['x', 'y'])])], 'the PDF')).toThrow('No header row was found in the PDF. Expected a row of column names above a row of values');
    expect(() => findPageTable([page([row(['x', 'y']), row(['z', 'w'])])], 'the image')).toThrow('No header row was found in the image.');
    expect(() => findPageTable([page([row(['only']), row(['1'])])], 'the PDF')).toThrow(ConvertError); // one cell is not a header
  });

  describe("a header that is not a partner's", () => {
    const other = ['Lot', 'R-32 %', 'Mass (lb)'];
    it('is found above a row of values, with no partner and page and row labels', () => {
      const table = findPageTable([page([[cell('Site: Plant 4', 0)], row(['Site', 'Period']), row(other), row(['L-1', '34.7', '120.5'])]), page([row(['L-2', '35.1', '98.2'])], { page: 2 })], 'the PDF');
      expect(table.partner).toBe('');
      expect(table.headers).toEqual(other);
      expect([table.headerPage, table.headerRow]).toEqual([1, 3]);
      expect(table.rows.map((r) => [r.page, r.pageRow, r.cells])).toEqual([[1, 4, ['L-1', '34.7', '120.5']], [2, 1, ['L-2', '35.1', '98.2']]]);
      expect(table.checks).toEqual([]);
    });

    it('accepts a date as the value under the header, also on the next page', () => {
      const table = findPageTable([page([row(['Lot', 'Date'])]), page([row(['L-1', '2026-09-01'])], { page: 2 })], 'the PDF');
      expect(table.headers).toEqual(['Lot', 'Date']);
      expect(table.rows).toHaveLength(1);
    });

    it('leaves out a repeated header and keeps listing doubtful values from OCR', () => {
      const table = findPageTable([{ ocr: true, rows: [row(other), row(['L-1', '1O.5', '120.5']), row(other), row(['L-2', '35.1', '98.2'])] }], 'the image');
      expect(table.flags).toEqual([{ row: 3, reason: 'repeated header, left out' }]);
      expect(table.rows.map((r) => r.cells[0])).toEqual(['L-1', 'L-2']);
      expect(table.checks?.map((c) => [c.value, c.column])).toEqual([['1O.5', 1]]);
    });

    it('flags a repeated header name once', () => {
      const table = findPageTable([page([row(['Lot', 'Mass', 'Mass']), row(['L-1', '1', '2'])])], 'the PDF');
      expect(table.flags).toEqual([{ row: 1, reason: 'the header "Mass" appears more than once; mapping will ask which column to keep', page: 1, pageRow: 1 }]);
      expect(table.headers).toEqual(['Lot', 'Mass', 'Mass']);
    });

    it('does not take a header beyond the search window', () => {
      const filler = Array.from({ length: 50 }, () => [cell('note', 0)]);
      expect(() => findPageTable([page([...filler, row(other), row(['L-1', '1', '2'])])], 'the PDF')).toThrow(ConvertError);
    });

    it('never loses to a generic header: a later partner header wins', () => {
      const table = findPageTable([page([row(other), row(['L-1', '1', '2']), row(A), row(good)])], 'the PDF');
      expect(table.partner).toBe('Partner A');
      expect(table.headerRow).toBe(3);
    });
  });
});

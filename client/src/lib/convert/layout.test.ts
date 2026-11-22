import { describe, expect, it } from 'vitest';
import { groupTextCells, groupTextItems, type PlacedText } from './layout';

/** A text item at (x, y), 10 units high, as wide as its text at 5 units a character. */
const at = (text: string, x: number, y: number, height = 10): PlacedText => ({ text, x, y, width: text.length * 5, height });

describe('groupTextItems', () => {
  it('groups items into rows by y, top to bottom, and cells by x gaps', () => {
    const items = [at('X-1', 0, 680), at('2026-09-01', 60, 680), at('batch_id', 0, 700), at('sample_date', 60, 700)];
    expect(groupTextItems(items)).toEqual([['batch_id', 'sample_date'], ['X-1', '2026-09-01']]);
  });

  it('keeps items on one row when their baselines differ by up to half the text height', () => {
    expect(groupTextItems([at('a', 0, 700), at('b', 50, 695)])).toEqual([['a', 'b']]);
    expect(groupTextItems([at('a', 0, 700), at('b', 50, 694)])).toEqual([['a'], ['b']]);
  });

  it('joins a word gap with a space, touching items with none, and splits a column gap', () => {
    // "R-32" ends at 20; a 4-unit gap is a word space, 0 touches, and 6 (over half of 10) is a new cell.
    expect(groupTextItems([at('R-32', 0, 700), at('blend', 24, 700)])).toEqual([['R-32 blend']]);
    expect(groupTextItems([at('R-3', 0, 700), at('2', 15, 700)])).toEqual([['R-32']]);
    expect(groupTextItems([at('R-32', 0, 700), at('12.5', 26, 700)])).toEqual([['R-32', '12.5']]);
  });

  it('orders cells by x whatever order the items come in', () => {
    expect(groupTextItems([at('c', 200, 700), at('a', 0, 700), at('b', 100, 700)])).toEqual([['a', 'b', 'c']]);
  });

  it('skips blank items and gives zero-height items the typical height', () => {
    const items = [at('a', 0, 700), at('   ', 20, 700), { ...at('b', 100, 698), height: 0 }, at('c', 0, 680)];
    expect(groupTextItems(items)).toEqual([['a', 'b'], ['c']]);
    expect(groupTextItems([at(' ', 0, 700)])).toEqual([]);
  });

  it('leaves a row with a missing cell shorter, for findTable to flag', () => {
    const items = [at('a', 0, 700), at('b', 100, 700), at('c', 200, 700), at('x', 0, 680), at('z', 200, 680)];
    expect(groupTextItems(items)).toEqual([['a', 'b', 'c'], ['x', 'z']]);
  });

  it('keeps cell edges, and a joined cell takes the lowest word confidence', () => {
    const rows = groupTextCells([{ ...at('Batch', 0, 700), confidence: 95 }, { ...at('id', 27, 700), confidence: 60 }, { ...at('Mass', 100, 700), confidence: 88 }]);
    expect(rows).toEqual([[{ text: 'Batch id', x: 0, right: 37, confidence: 60 }, { text: 'Mass', x: 100, right: 120, confidence: 88 }]]);
  });

  it('leaves confidence off cells that have none', () => {
    expect(groupTextCells([at('a', 0, 700)])).toEqual([[{ text: 'a', x: 0, right: 5 }]]);
  });
});

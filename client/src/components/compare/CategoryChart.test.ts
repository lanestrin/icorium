import { describe, expect, it } from 'vitest';
import { categoryAxis } from './CategoryChart';

describe('categoryAxis', () => {
  it('keeps 180px of full labels from the sm breakpoint up', () => {
    const axis = categoryAxis(true);
    expect(axis.width).toBe(180);
    expect(axis.tickFormatter('Recovered for reclamation')).toBe('Recovered for reclamation');
  });

  it('narrows the labels on phones and shortens long ones', () => {
    const axis = categoryAxis(false);
    expect(axis.width).toBe(110);
    expect(axis.tickFormatter('Recovered for reclamation')).toBe('Recovered for r…');
    expect(axis.tickFormatter('Reclaim')).toBe('Reclaim');
  });
});

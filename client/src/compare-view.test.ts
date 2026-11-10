import { describe, expect, it } from 'vitest';
import type { FileMeta } from '../../shared/types';
import type { CompareColumn, MatchedRow } from '../../shared/types';
import { compareBlocker, deltas, deltaUnit, differsFromRef, fileLabels, fmtDelta, fmtValue, metricLabel, topDifferences, yDomain } from './components/CompareWorkspace';

const result = (id: string, processor: FileMeta['processor'] = 'validation'): FileMeta =>
  ({ id, name: `${id}.csv`, rows: 25, columns: 9, uploadedAt: '', status: 'Processed', processor });

describe('when a selection can be compared', () => {
  it('needs 2 to 5 results from one function', () => {
    expect(compareBlocker([result('a'), result('b')])).toBeUndefined();
    expect(compareBlocker(['a', 'b', 'c', 'd', 'e'].map((id) => result(id)))).toBeUndefined();
    expect(compareBlocker([result('a')])).toBe('Select at least 2 results to compare.');
    expect(compareBlocker(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => result(id)))).toBe('Compare up to 5 results at a time.');
    expect(compareBlocker([result('a'), result('b', 'mass')])).toBe('Pick results from the same function.');
  });
  it('refuses input files first, whatever else is selected', () => {
    const input: FileMeta = { ...result('in'), status: 'Needs Review', processor: undefined };
    expect(compareBlocker([result('a'), result('b'), input])).toBe('Comparison uses result files only. Unselect input files to compare.');
  });
});

describe('comparison labels and numbers', () => {
  it('names metrics in plain words with their unit', () => {
    expect(metricLabel('composition_total_pct')).toBe('Composition total (%)');
    expect(metricLabel('r32_mass_kg')).toBe('R32 mass (kg)');
    expect(metricLabel('validation_errors')).toBe('Validation errors');
  });
  it('shortens file names to partner and remaining name', () => {
    expect(fileLabels([
      { name: 'result_partner_a_baseline_validation.csv', source: 'Partner A' },
      { name: 'result_partner_b_followup_validation.csv', source: 'Partner B' },
      { name: 'my_export.csv', source: 'Partner C' },
      { name: 'result_unknown_validation.csv' },
    ], 'validation')).toEqual(['Partner A · Baseline', 'Partner B · Followup', 'Partner C · My export', 'unknown']);
  });
  it('falls back to file names when two labels would be the same', () => {
    // A downloaded result re-uploaded without its "result_" prefix gets the same short label.
    expect(fileLabels([
      { name: 'result_partner_a_baseline_mass.csv', source: 'Partner A' },
      { name: 'partner_a_baseline_mass.csv', source: 'Partner A' },
      { name: 'result_partner_a_followup_mass.csv', source: 'Partner A' },
    ], 'mass')).toEqual(['result_partner_a_baseline_mass.csv', 'partner_a_baseline_mass.csv', 'Partner A · Followup']);
  });
  it('measures differences against the chosen reference', () => {
    expect(deltas([100, 98.73, 99.5], 0)).toEqual([null, expect.closeTo(-1.27, 10), -0.5]);
    expect(deltas([100, 98.73, 99.5], 2)).toEqual([0.5, expect.closeTo(-0.77, 10), null]);
    expect(deltas([100, null, 99.5], 0)).toEqual([null, null, -0.5]);
    expect(deltas([null, 1, 2], 0)).toEqual([null, null, null]);
  });
  it('uses percentage points for percentages and kg for masses', () => {
    expect(deltaUnit({ unit: '%' })).toBe('pp');
    expect(deltaUnit({ unit: 'kg' })).toBe('kg');
    expect(deltaUnit({})).toBe('');
    expect(fmtValue(100, '%')).toBe('100.00%');
    expect(fmtValue(1234.5, 'kg')).toBe('1,234.50 kg');
    expect(fmtValue(null, '%')).toBe('—');
    expect(fmtDelta(-1.27, 'pp')).toBe('-1.27 pp');
    expect(fmtDelta(0.5, 'kg')).toBe('+0.50 kg');
    expect(fmtDelta(null, 'pp')).toBe('—');
  });
});

describe('top differences and the row chart axis', () => {
  const rows: MatchedRow[] = [
    { key: '#1', rowNumbers: [1, 1, 1] },
    { key: '#2', rowNumbers: [2, 2, 2] },
    { key: '#3', rowNumbers: [3, 3, null] },
    { key: '#4', rowNumbers: [4, 4, 4] },
    { key: '#5', rowNumbers: [5, 5, 5] },
  ];
  const total: CompareColumn = {
    name: 'composition_total_pct', kind: 'numeric', unit: '%', measure: 'mean', summary: [], rowsDiffering: 0, rowsCompared: 5,
    values: [[100, 100, 100], [100, 99, 101.5], [100, 100, null], [100, 97, 100], [100, null, 100]],
  };

  it('compares each cell with the reference file', () => {
    expect(differsFromRef(total, 1, 1, 0)).toBe(true);
    expect(differsFromRef(total, 0, 1, 0)).toBe(false);
    expect(differsFromRef(total, 1, 0, 0)).toBe(false); // the reference never differs from itself
    expect(differsFromRef(total, 2, 2, 0)).toBe(true); // a row the file lacks
  });
  it('ranks rows by their largest gap from the reference, then rows with missing values', () => {
    expect(topDifferences({ rows }, total, 0)).toEqual([
      { key: '#4', text: 'Composition total 97.00% (Δ -3.00 pp)', files: [1] },
      { key: '#2', text: 'Composition total 101.50% (Δ +1.50 pp)', files: [1, 2] },
      { key: '#3', text: 'Not in file', files: [2] },
    ]);
    expect(topDifferences({ rows }, total, 0, 5).map((d) => [d.key, d.text])).toContainEqual(['#5', 'No value']);
  });
  it('follows the chosen reference', () => {
    expect(topDifferences({ rows }, total, 2)[0]).toEqual({ key: '#4', text: 'Composition total 97.00% (Δ -3.00 pp)', files: [1] });
    expect(topDifferences({ rows }, total, 2).map((d) => d.key)).toContain('#3');
    expect(topDifferences({ rows }, total, 2).find((d) => d.key === '#3')?.text).toBe('Not in the reference file');
  });
  it('lists differing categories in row order', () => {
    const status: CompareColumn = {
      name: 'processing_status', kind: 'category', measure: 'count', rowsDiffering: 2, rowsCompared: 2,
      values: [['Valid', 'Invalid'], ['Valid', 'Valid'], ['Invalid', '']],
    };
    expect(topDifferences({ rows: rows.slice(0, 3).map((r) => ({ ...r, rowNumbers: r.rowNumbers.slice(0, 2) })) }, status, 0)).toEqual([
      { key: '#1', text: 'Invalid (reference: Valid)', files: [1] },
      { key: '#3', text: '— (reference: Invalid)', files: [1] },
    ]);
  });
  it('returns nothing when no row differs', () => {
    expect(topDifferences({ rows: rows.slice(0, 1) }, { ...total, values: [[100, 100, 100]] }, 0)).toEqual([]);
  });
  it('fits the chart axis to the data so small gaps show', () => {
    expect(yDomain([100, 97.46, null, 100.4])).toEqual([96, 101]); // 97.46 - 0.5 rounds down to 96
    expect(yDomain([100, 100])).toEqual([99, 101]);
    expect(yDomain([null, 'x'])).toBeUndefined();
  });
});

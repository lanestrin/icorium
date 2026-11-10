import { describe, expect, it } from 'vitest';
import type { FileMeta } from '../../shared/types';
import { compareBlocker, deltas, deltaUnit, fileLabels, fmtDelta, fmtValue, metricLabel } from './components/CompareWorkspace';

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

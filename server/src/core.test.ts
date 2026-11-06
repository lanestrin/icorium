import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './lib/csv';
import { getAdapter } from './adapters';
import { detectProcessor, issues, processRows } from './processing';
import { compareResults } from './lib/compare';
import type { FileMeta, Row } from '../../shared/types';

const A_HEADERS = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct';
const A_CSV = `${A_HEADERS}
A-1,2026-09-01,100,50,30,20
A-2,2026-09-02,200,,50,50
A-3,2026-09-03,300,55,30,20`;

describe('parsing', () => {
  it('parses headers and rows', () => {
    const { headers, rows } = parseCsv(A_CSV);
    expect(headers).toHaveLength(6);
    expect(rows).toHaveLength(3);
  });
  it('rejects malformed rows', () => {
    expect(() => parseCsv('a,b\n1,2,3')).toThrow(/parse error/);
  });
});

describe('adapters', () => {
  it('passes Partner A through (kg, %)', () => {
    const n = getAdapter(A_HEADERS.split(',')).normalize({ batch_id: ' A-1 ', sample_date: '2026-09-01', feed_mass_kg: '100', r32_pct: '50', r125_pct: '30', r134a_pct: '20' });
    expect(n).toEqual({ batchId: 'A-1', sampleDate: '2026-09-01', source: 'Partner A', massKg: 100, r32: 50, r125: 30, r134a: 20 });
  });
  it('converts Partner B units (lb, %) and maps its column names', () => {
    const a = getAdapter(['lot_number', 'collected_on', 'weight_lb', 'hfc32_percent', 'hfc125_percent', 'hfc134a_percent']);
    const n = a.normalize({ lot_number: 'B-001', collected_on: '2026-09-01', weight_lb: '100', hfc32_percent: '37.09', hfc125_percent: '27', hfc134a_percent: '35.9' });
    expect(n.massKg).toBeCloseTo(45.359, 2);
    expect(n).toMatchObject({ batchId: 'B-001', sampleDate: '2026-09-01', source: 'Partner B', r32: 37.09 });
  });
  it('converts Partner C units (g, fraction)', () => {
    const a = getAdapter(['material_ref', 'collection_date', 'quantity_g', 'R32_fraction', 'R125_fraction', 'R134a_fraction']);
    const n = a.normalize({ material_ref: 'C-001', quantity_g: '122720', R32_fraction: '0.37633', R125_fraction: '0.27931', R134a_fraction: '0.34436' });
    expect(n.massKg).toBeCloseTo(122.72);
    expect(n.r32).toBeCloseTo(37.633);
    expect(n.source).toBe('Partner C');
  });
  it('rejects unknown schemas', () => {
    expect(() => getAdapter(['foo', 'bar'])).toThrow(/Unrecognized CSV schema/);
  });
});

describe('validation rules', () => {
  const norm = getAdapter(A_HEADERS.split(',')).normalize;
  const row = (mass: string, r32: string, r125: string, r134a: string) => norm({ batch_id: 'A', feed_mass_kg: mass, r32_pct: r32, r125_pct: r125, r134a_pct: r134a });

  it('accepts a valid row and totals within tolerance', () => {
    expect(issues(row('100', '50', '30', '20'))).toEqual([]);
    expect(issues(row('100', '50', '30', '20.4'))).toEqual([]);
  });
  it('flags missing, non-numeric, negative and inconsistent values', () => {
    expect(issues(row('', '50', '30', '20'))).toContain('mass missing');
    expect(issues(row('abc', '50', '30', '20'))).toContain('mass invalid');
    expect(issues(row('100', 'x', '30', '20'))).toContain('R-32 not a number');
    expect(issues(row('100', '50', '-2', '20'))).toContain('R-125 out of range');
    expect(issues(row('100', '55', '30', '20'))).toEqual(['composition totals 105%']);
  });
  it('flags duplicate batch IDs', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}\nA-1,d,100,50,30,20\nA-1,d,100,50,30,20\nA-2,d,100,50,30,20`);
    const out = processRows(headers, rows, 'validation').rows;
    expect(out.map((r) => r.validation_status)).toEqual(['ERROR', 'ERROR', 'OK']);
    expect(out[0].validation_message).toMatch(/duplicate batch ID A-1/);
  });
});

describe('processing and export', () => {
  const { headers, rows } = parseCsv(A_CSV);

  it('processes every row, keeps original values and appends only the chosen columns', () => {
    const out = processRows(headers, rows, 'mass');
    expect(out.rows).toHaveLength(rows.length);
    expect(out.headers).toEqual([...headers, 'r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status']);
    out.rows.forEach((r, i) => headers.forEach((h) => expect(r[h]).toBe(rows[i][h])));
    expect(out.rows[0]).toMatchObject({ r32_mass_kg: '50', mass_status: 'OK' });
    expect(out.rows[1]).toMatchObject({ r32_mass_kg: '', mass_status: 'Skipped (invalid input)' });
  });

  it('round-trips through CSV export', () => {
    const out = processRows(headers, rows, 'classification');
    const back = parseCsv(toCsv(out.headers, out.rows));
    expect(back.headers).toEqual(out.headers);
    expect(back.rows.map((r) => r.blend_class)).toEqual(['R-32-rich (demo)', 'Unclassifiable', 'Unclassifiable']);
  });

  it('classifies with the demo thresholds', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}\nA,d,100,40,30,30\nB,d,100,36,28,36\nC,d,100,37,30,33`);
    expect(processRows(headers, rows, 'classification').rows.map((r) => r.blend_class)).toEqual(['R-32-rich (demo)', 'R-134a-rich (demo)', 'Balanced (demo)']);
  });

  it('escapes commas, quotes and line breaks', () => {
    const tricky: Row = { a: 'one, two', b: 'say "hi"', c: 'line1\nline2' };
    const text = toCsv(['a', 'b', 'c'], [tricky]);
    expect(parseCsv(text).rows[0]).toEqual(tricky);
  });

  it('recognises an exported result file by its columns', () => {
    expect(detectProcessor(processRows(headers, rows, 'mass').headers)).toBe('mass');
    expect(detectProcessor(processRows(headers, rows, 'validation').headers)).toBe('validation');
    expect(detectProcessor(headers)).toBeUndefined();
  });
});

describe('compare', () => {
  const meta = (processor: FileMeta['processor'], cols: string[]): FileMeta => ({
    id: processor!, name: `${processor}.csv`, rows: 1, columns: 1, uploadedAt: '', status: 'Processed', processor, generatedColumns: cols,
  });

  it('rejects results from different processors in plain language', () => {
    expect(() => compareResults({ meta: meta('mass', []), rows: [] }, { meta: meta('validation', []), rows: [] })).toThrow(
      /Component Mass Calculation result but .* Composition Validation result/,
    );
  });
  it('rejects input files', () => {
    const input: FileMeta = { ...meta('mass', []), status: 'Ready', processor: undefined };
    expect(() => compareResults({ meta: input, rows: [] }, { meta: meta('mass', []), rows: [] })).toThrow(/input file/);
  });
  it('totals kg columns and averages others', () => {
    const cols = ['r32_mass_kg', 'composition_total_pct'];
    const A = { meta: meta('mass', cols), rows: [{ r32_mass_kg: '1', composition_total_pct: '100' }, { r32_mass_kg: '2', composition_total_pct: '98' }] };
    const B = { meta: meta('mass', cols), rows: [{ r32_mass_kg: '1', composition_total_pct: '100' }, { r32_mass_kg: '4', composition_total_pct: '100' }] };
    const [kg, pct] = compareResults(A, B).columns;
    expect(kg).toMatchObject({ unit: 'kg', measure: 'total', valueA: 3, valueB: 5, rowsDiffering: 1, rowsCompared: 2 });
    expect(pct).toMatchObject({ unit: '%', measure: 'mean', valueA: 99, valueB: 100 });
  });
  it('counts rows per category', () => {
    const A = { meta: meta('validation', ['s']), rows: [{ s: 'OK' }, { s: 'ERROR' }] };
    const B = { meta: meta('validation', ['s']), rows: [{ s: 'OK' }, { s: 'OK' }] };
    expect(compareResults(A, B).columns[0]).toMatchObject({ kind: 'category', measure: 'count', data: [{ label: 'OK', a: 1, b: 2 }, { label: 'ERROR', a: 1, b: 0 }] });
  });
});

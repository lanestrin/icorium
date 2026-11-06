import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './lib/csv';
import { getAdapter } from './adapters';
import { issues, processRows } from './processing';
import { compareResults } from './lib/compare';
import type { FileMeta } from '../../shared/types';

const A_CSV = `batch_id,received_date,supplier,mass_kg,r32_pct,r125_pct,r134a_pct
A-1,2026-01-05,X,100,50,50,0
A-2,2026-01-06,X,200,,50,0
A-3,2026-01-07,X,300,55,50,0`;

describe('parsing', () => {
  it('parses headers and rows', () => {
    const { headers, rows } = parseCsv(A_CSV);
    expect(headers).toHaveLength(7);
    expect(rows).toHaveLength(3);
  });
  it('rejects malformed rows', () => {
    expect(() => parseCsv('a,b\n1,2,3')).toThrow(/parse error/);
  });
});

describe('adapters', () => {
  it('normalizes Partner B units (lb, fraction)', () => {
    const a = getAdapter(['BatchNo', 'Date', 'Site', 'Weight_lb', 'R32_frac', 'R125_frac', 'R134a_frac']);
    const n = a.normalize({ BatchNo: 'B1', Weight_lb: '100', R32_frac: '0.23', R125_frac: '0.25', R134a_frac: '0.52' });
    expect(n.massKg).toBeCloseTo(45.359, 2);
    expect(n.r32).toBeCloseTo(23);
  });
  it('rejects unknown schemas', () => {
    expect(() => getAdapter(['foo', 'bar'])).toThrow(/Unrecognized CSV schema/);
  });
});

describe('processing', () => {
  const { headers, rows } = parseCsv(A_CSV);

  it('flags missing and inconsistent composition', () => {
    const norm = getAdapter(headers).normalize;
    expect(issues(norm(rows[0]))).toEqual([]);
    expect(issues(norm(rows[1]))).toContain('R-32 missing');
    expect(issues(norm(rows[2]))[0]).toMatch(/totals 105%/);
  });

  it('keeps every original column and appends generated ones', () => {
    const out = processRows(headers, rows, 'mass');
    expect(out.headers).toEqual([...headers, 'r32_kg', 'r125_kg', 'r134a_kg', 'mass_status']);
    expect(out.rows[0]).toMatchObject({ batch_id: 'A-1', r32_kg: '50', mass_status: 'OK' });
    expect(out.rows[1].mass_status).toMatch(/Skipped/);
  });

  it('exports a CSV that round-trips', () => {
    const out = processRows(headers, rows, 'classification');
    const back = parseCsv(toCsv(out.headers, out.rows));
    expect(back.headers).toEqual(out.headers);
    expect(back.rows[0].blend_class).toBe('R-410A-like (demo)');
  });
});

describe('compare', () => {
  const meta = (processor: FileMeta['processor']): FileMeta => ({
    id: processor!, name: `${processor}.csv`, rows: 1, columns: 1, uploadedAt: '', status: 'Processed', processor, generatedColumns: ['x'],
  });
  it('rejects results from different processors', () => {
    expect(() => compareResults({ meta: meta('mass'), rows: [] }, { meta: meta('validation'), rows: [] })).toThrow(/Incompatible/);
  });
  it('computes numeric differences', () => {
    const r = compareResults({ meta: meta('mass'), rows: [{ x: '1' }, { x: '2' }] }, { meta: meta('mass'), rows: [{ x: '1' }, { x: '4' }] });
    expect(r.columns[0]).toMatchObject({ kind: 'numeric', meanA: 1.5, meanB: 2.5, rowsDiffering: 1 });
  });
});

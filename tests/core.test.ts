import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../shared/csv';
import { getAdapter } from '../shared/adapters';
import { matchPartner, normalizeHeader, partnerMatchProblem, suggestMapping } from '../shared/mapping';
import { detectResult, embeddedSourceId, findProblems, issues, matchesInput, processors, processRows, stampFileIds } from '../shared/processing';
import { compareResults, matchRows } from '../shared/compare';
import { GENERATE_MAX_ATTEMPTS, generateCsv, generatedName, generateFiles } from '../shared/generate';
import { ADAPTER_FIELDS, ADAPTERS, FIELD_ALIASES, GENERATOR_PARTNERS, nextBaseId, parseFileId, PROCESSORS, resultFileId, type FileMeta, type GeneratedError, type Row } from '../shared/types';

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

describe('header matching', () => {
  const A = [...ADAPTERS[0].columns];
  const B = [...ADAPTERS[1].columns];
  const codes = (headers: string[], options?: Parameters<typeof suggestMapping>[1]) => suggestMapping(headers, options).issues.map((i) => `${i.code}:${i.field}`);

  it.each(ADAPTERS)('matches $name exactly, approved, with its units', (adapter) => {
    const out = suggestMapping([...adapter.columns]);
    expect(out.partner).toBe(adapter.name);
    expect(out.issues).toEqual([]);
    expect(out.unusedColumns).toEqual([]);
    expect(out.mappings.map((m) => [m.mapping.field, m.mapping.sourceColumn, m.mapping.origin, m.mapping.approved])).toEqual(
      ADAPTER_FIELDS.map((field, i) => [field, adapter.columns[i], 'exact', true]));
    expect(out.mappings.map((m) => m.statedUnit)).toEqual([undefined, undefined, adapter.units.mass, ...Array(3).fill(adapter.units.composition === 'percent' ? '%' : 'fraction')]);
  });
  it('still matches exactly when columns are reordered or extra ones are present', () => {
    const out = suggestMapping(['notes', ...A].reverse());
    expect(out.partner).toBe('Partner A');
    expect(out.unusedColumns).toEqual(['notes']);
  });
  it('keeps the adapters\' units in step with their factors', () => {
    for (const a of ADAPTERS) {
      expect(a.massFactor).toBe({ kg: 1, lb: 0.45359237, g: 0.001 }[a.units.mass]);
      expect(a.pctFactor).toBe(a.units.composition === 'percent' ? 1 : 100);
    }
  });

  it('normalizes case, spacing and separators but keeps unit words', () => {
    expect(normalizeHeader(' R32 % ')).toBe(normalizeHeader('r32_%'));
    expect(normalizeHeader('Feed-Mass.KG')).toBe('feed mass kg');
    expect(normalizeHeader('weight_lb')).not.toBe(normalizeHeader('weight_kg'));
  });
  it('maps a partner column written another way as normalized, not approved', () => {
    const out = suggestMapping(['Batch_ID', 'SAMPLE DATE', ' FEED MASS KG', 'R32-PCT', 'r125.pct', 'r134a  pct']);
    expect(out.issues).toEqual([]);
    expect(out.partner).toBeUndefined();
    expect(out.mappings.map((m) => [m.mapping.origin, m.mapping.approved])).toEqual(Array(6).fill(['normalized', false]));
    expect(out.mappings.map((m) => m.statedUnit)).toEqual([undefined, undefined, 'kg', '%', '%', '%']);
  });
  it('does not let a different unit word match: weight_kg is not Partner B\'s weight_lb', () => {
    expect(codes(['batch_id', 'sample_date', 'weight_kg', 'r32_pct', 'r125_pct', 'r134a_pct'])).toEqual(['mapping_missing:massKg']);
    const lb = suggestMapping(['batch_id', 'sample_date', 'Weight LB', 'r32_pct', 'r125_pct', 'r134a_pct']).mappings;
    expect(lb.find((m) => m.mapping.field === 'massKg')).toMatchObject({ statedUnit: 'lb', mapping: { origin: 'normalized' } });
  });
  it('recognises known aliases and records their stated unit', () => {
    const out = suggestMapping(['batch_id', 'sample_date', 'quantity', 'R32 %', 'HFC-125', '1,1,1,2-Tetrafluoroethane']);
    expect(out.issues).toEqual([]);
    expect(out.mappings.map((m) => [m.mapping.field, m.mapping.origin, m.statedUnit])).toEqual([
      ['batchId', 'normalized', undefined], ['sampleDate', 'normalized', undefined], ['massKg', 'alias', undefined],
      ['r32', 'alias', '%'], ['r125', 'alias', undefined], ['r134a', 'alias', undefined],
    ]);
    expect(out.mappings.every((m) => !m.mapping.approved)).toBe(true);
  });
  it('lists every partner column among the aliases, with the field it holds', () => {
    for (const a of ADAPTERS) a.columns.forEach((name, i) => expect(FIELD_ALIASES).toContainEqual(expect.objectContaining({ name, field: ADAPTER_FIELDS[i] })));
  });

  it('reports two columns for one field instead of taking the first', () => {
    const out = suggestMapping(['batch_id', 'sample_date', 'net_mass', 'total_weight', 'r32_pct', 'r125_pct', 'r134a_pct']);
    expect(out.issues).toEqual([{ severity: 'blocking', code: 'mapping_ambiguous', field: 'massKg', reason: 'mass: columns "net_mass" and "total_weight" both match; choose one' }]);
    expect(out.mappings.map((m) => m.mapping.field)).not.toContain('massKg');
    expect(codes(['batch_id', 'sample_date', 'feed_mass_kg', 'R-32', 'HFC32', 'r125_pct', 'r134a_pct'])).toEqual(['mapping_ambiguous:r32']);
  });
  it('treats a partner column and an alias for the same field as two candidates, unless a full partner schema matches', () => {
    expect(codes(['batch_id', 'sample_date', 'weight_lb', 'quantity', 'r32_pct', 'r125_pct', 'r134a_pct'])).toEqual(['mapping_ambiguous:massKg']);
    const full = suggestMapping(['batch_id', 'sample_date', 'feed_mass_kg', 'quantity', 'r32_pct', 'r125_pct', 'r134a_pct']);
    expect(full.partner).toBe('Partner A');
    expect(full.unusedColumns).toEqual(['quantity']);
  });
  it('reports one column chosen for two fields and drops both mappings', () => {
    const out = suggestMapping(A, { manual: { r125: 'r32_pct' } });
    expect(out.issues.map((i) => [i.code, i.field])).toEqual([['mapping_collision', 'r32'], ['mapping_collision', 'r125']]);
    expect(out.issues[0].reason).toBe('R-32: column "r32_pct" is chosen for R-32 and R-125; each field needs its own column');
    expect(out.mappings.map((m) => m.mapping.field)).toEqual(['batchId', 'sampleDate', 'massKg', 'r134a']);
  });
  it('cannot map a duplicated header', () => {
    const out = suggestMapping(A, { duplicates: ['feed_mass_kg'] });
    expect(out.partner).toBeUndefined();
    expect(out.issues.map((i) => [i.code, i.field])).toEqual([['header_duplicate', 'massKg']]);
    expect(out.mappings).toHaveLength(5);
  });
  it('reports every field missing for unknown headers', () => {
    const out = suggestMapping(['foo', 'bar']);
    expect(out.issues.map((i) => i.code)).toEqual(Array(6).fill('mapping_missing'));
    expect(out.issues.map((i) => i.field)).toEqual([...ADAPTER_FIELDS]);
    expect(out.mappings).toEqual([]);
    expect(out.unusedColumns).toEqual(['foo', 'bar']);
  });
  it('takes the person\'s choice as manual and unapproved, and rejects a column that is not there', () => {
    const headers = ['a', 'b', 'c', 'd', 'e', 'f'];
    const manual = { batchId: 'a', sampleDate: 'b', massKg: 'c', r32: 'd', r125: 'e', r134a: 'f' } as const;
    const out = suggestMapping(headers, { manual });
    expect(out.issues).toEqual([]);
    expect(out.mappings.map((m) => [m.mapping.origin, m.mapping.approved])).toEqual(Array(6).fill(['manual', false]));
    expect(codes(headers, { manual: { ...manual, r134a: 'zzz' } })).toEqual(['mapping_unknown_column:r134a']);
    expect(codes(headers, { manual, duplicates: ['f'] })).toEqual(['header_duplicate:r134a']);
  });
  it('lets a manual choice replace an exact suggestion', () => {
    const out = suggestMapping([...A, 'mass_total'], { manual: { massKg: 'mass_total' } });
    expect(out.partner).toBe('Partner A');
    expect(out.mappings.find((m) => m.mapping.field === 'massKg')?.mapping).toEqual({ field: 'massKg', sourceColumn: 'mass_total', origin: 'manual', approved: false });
    expect(out.unusedColumns).toEqual(['feed_mass_kg']);
  });

  it('refuses to pick between two partner schemas or a duplicated partner column', () => {
    const both = matchPartner([...A, ...B]);
    expect(both).toEqual({ kind: 'several', names: ['Partner A', 'Partner B'] });
    expect(partnerMatchProblem(both)).toBe('This file has the columns of more than one partner format (Partner A, Partner B); keep one set of columns.');
    const dup = matchPartner(A, ['feed_mass_kg']);
    expect(dup).toEqual({ kind: 'duplicate', column: 'feed_mass_kg' });
    expect(partnerMatchProblem(dup)).toBe('The column feed_mass_kg appears more than once; keep one.');
    expect(matchPartner(['foo'])).toBeNull();
    expect(matchPartner(A, ['notes'])).toMatchObject({ kind: 'partner' });
    expect([partnerMatchProblem(null), partnerMatchProblem(matchPartner(A))]).toEqual([undefined, undefined]);
  });
  it('lists the headers a CSV repeats', () => {
    expect(parseCsv('a,b,a\n1,2,3').duplicateHeaders).toEqual(['a']);
    expect(parseCsv('a,b,c\n1,2,3').duplicateHeaders).toEqual([]);
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
    const reasons = (n: ReturnType<typeof row>) => issues(n).map((i) => i.reason);
    expect(reasons(row('', '50', '30', '20'))).toContain('mass missing');
    expect(reasons(row('abc', '50', '30', '20'))).toContain('mass invalid');
    expect(reasons(row('100', 'x', '30', '20'))).toContain('R-32 not a number');
    expect(reasons(row('100', '50', '-2', '20'))).toContain('R-125 out of range');
    expect(reasons(row('100', '55', '30', '20'))).toEqual(['composition totals 105%']);
  });
  it('gives each issue a stable code, the field and a blocking severity', () => {
    expect(issues(row('', '50', '30', '20'))).toEqual([{ severity: 'blocking', code: 'mass_missing', field: 'massKg', reason: 'mass missing' }]);
    expect(issues(row('0', '50', '30', '20'))).toEqual([{ severity: 'blocking', code: 'mass_invalid', field: 'massKg', reason: 'mass invalid' }]);
    expect(issues(row('100', '', '30', '20'))).toEqual([{ severity: 'blocking', code: 'component_missing', field: 'r32', reason: 'R-32 missing' }]);
    expect(issues(row('100', '50', 'x', '20'))).toEqual([{ severity: 'blocking', code: 'component_not_number', field: 'r125', reason: 'R-125 not a number' }]);
    expect(issues(row('100', '50', '30', '101'))).toEqual([{ severity: 'blocking', code: 'component_out_of_range', field: 'r134a', reason: 'R-134a out of range' }]);
    expect(issues(row('100', '55', '30', '20'))).toEqual([{ severity: 'blocking', code: 'composition_total', reason: 'composition totals 105%' }]);
  });
  it('lists issues in the order batch ID, mass, R-32, R-125, R-134a, total, with the row on each', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}
A-1,d,,x,-1,
A-1,d,100,50,30,20`);
    const [first] = findProblems(headers, rows).items;
    expect(first.issues.map((i) => i.code)).toEqual(['batch_id_duplicate', 'mass_missing', 'component_not_number', 'component_out_of_range', 'component_missing']);
    expect(first.issues.every((i) => i.row === 1 && i.severity === 'blocking')).toBe(true);
    expect(first.message).toBe('duplicate batch ID A-1; mass missing; R-32 not a number; R-125 out of range; R-134a missing');
    expect(findProblems(headers, rows).items[1].issues.map((i) => [i.code, i.field, i.row])).toEqual([['batch_id_duplicate', 'batchId', 2]]);
  });
  it('reports a missing batch ID with its code and row', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}
,d,100,50,30,20`);
    expect(findProblems(headers, rows).items[0].issues).toEqual([{ severity: 'blocking', code: 'batch_id_missing', field: 'batchId', row: 1, reason: 'batch ID missing' }]);
  });
  it('leaves composition_total_pct blank when a component is missing or not a number, never a partial sum', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}
A-1,d,100,50,30,
A-2,d,100,50,x,20
A-3,d,100,50,30,20
A-4,d,100,50,-2,20`);
    const out = processRows(headers, rows, 'validation').rows;
    expect(out.map((r) => r.composition_total_pct)).toEqual(['', '', '100', '68']);
    expect(out.map((r) => r.processing_status)).toEqual(['Invalid', 'Invalid', 'Valid', 'Invalid']);
    expect(out[0].validation_errors).toBe('R-134a missing');
  });
  it('flags duplicate batch IDs', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}\nA-1,d,100,50,30,20\nA-1,d,100,50,30,20\nA-2,d,100,50,30,20`);
    const out = processRows(headers, rows, 'validation').rows;
    expect(out.map((r) => r.processing_status)).toEqual(['Invalid', 'Invalid', 'Valid']);
    expect(out[0].validation_errors).toMatch(/duplicate batch ID A-1/);
  });
});

describe('problem rows', () => {
  it('lists each flagged row with its number, batch ID and reason', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}\nA-1,d,100,50,30,20\nA-2,d,,50,30,20\nA-1,d,100,50,30,20\n,d,100,50,30,20`);
    expect(findProblems(headers, rows)).toEqual({
      total: 4,
      items: [
        { row: 1, batchId: 'A-1', message: 'duplicate batch ID A-1', issues: [expect.objectContaining({ code: 'batch_id_duplicate', row: 1 })] },
        { row: 2, batchId: 'A-2', message: 'mass missing', issues: [expect.objectContaining({ code: 'mass_missing', row: 2 })] },
        { row: 3, batchId: 'A-1', message: 'duplicate batch ID A-1', issues: [expect.objectContaining({ code: 'batch_id_duplicate', row: 3 })] },
        { row: 4, batchId: '', message: 'batch ID missing', issues: [expect.objectContaining({ code: 'batch_id_missing', row: 4 })] },
      ],
    });
  });
  it('finds the same problems in a result file as in its input', () => {
    const { headers, rows } = parseCsv(A_CSV);
    const out = processRows(headers, rows, 'mass');
    expect(findProblems(out.headers, out.rows)).toEqual(findProblems(headers, rows));
  });
  it('counts every problem row but details only the first ones', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}\n${Array.from({ length: 5 }, (_, i) => `A-${i},d,,50,30,20`).join('\n')}`);
    const list = findProblems(headers, rows, 2);
    expect(list.total).toBe(5);
    expect(list.items.map((p) => p.row)).toEqual([1, 2]);
  });
});

describe('processing and export', () => {
  const { headers, rows } = parseCsv(A_CSV);

  it('processes every row, keeps original values and appends only the chosen columns', () => {
    const out = processRows(headers, rows, 'mass');
    expect(out.rows).toHaveLength(rows.length);
    expect(out.headers).toEqual([...headers, 'result_id', 'r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'processing_status', 'validation_errors']);
    out.rows.forEach((r, i) => headers.forEach((h) => expect(r[h]).toBe(rows[i][h])));
    expect(out.rows[0]).toMatchObject({ r32_mass_kg: '50', processing_status: 'Valid', validation_errors: '' });
    expect(out.rows[1]).toMatchObject({ r32_mass_kg: '', processing_status: 'Invalid' });
  });

  it('round-trips through CSV export', () => {
    const out = processRows(headers, rows, 'classification');
    const back = parseCsv(toCsv(out.headers, out.rows));
    expect(back.headers).toEqual(out.headers);
    expect(back.rows.map((r) => r.blend_class)).toEqual(['R-32-rich (demo)', 'Needs review', 'Needs review']);
  });

  it('classifies with the demo thresholds', () => {
    const { headers, rows } = parseCsv(`${A_HEADERS}\nA,d,100,40,30,30\nB,d,100,36,28,36\nC,d,100,37,30,33`);
    expect(processRows(headers, rows, 'classification').rows.map((r) => r.blend_class)).toEqual(['R-32-rich (demo)', 'R-134a-rich (demo)', 'Balanced (demo)']);
  });

  it('flags rows where R-32 + R-125 is strictly above 50%, leaving blend_class unchanged', () => {
    // r32 + r125: 50.01, exactly 50, 49.99, 25.1 + 24.9 (float noise), 70; the last row is invalid.
    const { headers, rows } = parseCsv(`${A_HEADERS}
A,d,100,30,20.01,49.99
B,d,100,30,20,50
C,d,100,29.99,20,50.01
D,d,100,25.1,24.9,50
E,d,100,40,30,30
F,d,,40,30,30`);
    const out = processRows(headers, rows, 'classification');
    expect(out.headers.slice(-4)).toEqual(['dominant_component', 'r32_r125_over_50', 'processing_status', 'validation_errors']);
    expect(out.rows.map((r) => r.r32_r125_over_50)).toEqual(['Yes', 'No', 'No', 'No', 'Yes', '']);
    expect(out.rows.map((r) => r.blend_class)).toEqual(['R-134a-rich (demo)', 'R-134a-rich (demo)', 'R-134a-rich (demo)', 'R-134a-rich (demo)', 'R-32-rich (demo)', 'Needs review']);
  });

  it('escapes commas, quotes and line breaks', () => {
    const tricky: Row = { a: 'one, two', b: 'say "hi"', c: 'line1\nline2' };
    const text = toCsv(['a', 'b', 'c'], [tricky]);
    expect(parseCsv(text).rows[0]).toEqual(tricky);
  });

  it('recognises an exported result file by its columns', () => {
    expect(detectResult(processRows(headers, rows, 'mass').headers)?.processor).toBe('mass');
    expect(detectResult(processRows(headers, rows, 'validation').headers)?.processor).toBe('validation');
    expect(detectResult(headers)?.processor).toBeUndefined();
  });
});

describe('compare', () => {
  const meta = (processor: FileMeta['processor'], cols: string[], name = `${processor}.csv`): FileMeta => ({
    id: name, name, rows: 1, columns: 1, uploadedAt: '', status: 'Processed', processor, generatedColumns: cols,
  });
  // Files without a partner schema: rows are matched by position.
  const file = (processor: FileMeta['processor'], cols: string[], rows: Row[] = [], name?: string) => ({ meta: meta(processor, cols, name), headers: cols, rows });

  it('rejects results from different processors in plain language', () => {
    expect(() => compareResults([file('mass', []), file('validation', [])])).toThrow(
      /Component Mass Calculation result but .* Composition Validation result/,
    );
  });
  it('rejects input files', () => {
    const input = { ...file('mass', []), meta: { ...meta('mass', []), status: 'Ready' as const, processor: undefined } };
    expect(() => compareResults([input, file('mass', [])])).toThrow(/input file/);
  });
  it('accepts 2 to 5 files only', () => {
    const one = file('mass', ['x'], [{ x: '1' }]);
    expect(() => compareResults([one])).toThrow(/Choose 2 to 5/);
    expect(() => compareResults(Array(6).fill(one))).toThrow(/Choose 2 to 5/);
    expect(compareResults(Array(5).fill(one)).files).toHaveLength(5);
  });
  it('rejects a file whose output columns differ from the others', () => {
    expect(() => compareResults([file('mass', ['x']), file('mass', ['x']), file('mass', ['y'])])).toThrow(/Regenerate the older result/);
  });
  it('totals kg columns and averages others, per file', () => {
    const cols = ['r32_mass_kg', 'composition_total_pct'];
    const A = file('mass', cols, [{ r32_mass_kg: '1', composition_total_pct: '100' }, { r32_mass_kg: '2', composition_total_pct: '98' }], 'a');
    const B = file('mass', cols, [{ r32_mass_kg: '1', composition_total_pct: '100' }, { r32_mass_kg: '4', composition_total_pct: '100' }], 'b');
    const C = file('mass', cols, [{ r32_mass_kg: '', composition_total_pct: '' }, { r32_mass_kg: '', composition_total_pct: '' }], 'c');
    const [kg, pct] = compareResults([A, B, C]).columns;
    expect(kg).toMatchObject({ unit: 'kg', measure: 'total', summary: [3, 5, null], rowsDiffering: 2, rowsCompared: 2 });
    expect(kg.values).toEqual([[1, 1, null], [2, 4, null]]);
    expect(pct).toMatchObject({ unit: '%', measure: 'mean', summary: [99, 100, null] });
  });
  it('counts rows per category in each file', () => {
    const A = file('validation', ['s'], [{ s: 'OK' }, { s: 'ERROR' }], 'a');
    const B = file('validation', ['s'], [{ s: 'OK' }, { s: 'OK' }], 'b');
    const C = file('validation', ['s'], [{ s: 'ERROR' }, { s: '' }], 'c');
    expect(compareResults([A, B, C]).columns[0]).toMatchObject({
      kind: 'category', measure: 'count', rowsDiffering: 2,
      categories: [{ label: 'OK', counts: [1, 2, 0] }, { label: 'ERROR', counts: [1, 0, 1] }, { label: '(blank)', counts: [0, 0, 1] }],
    });
  });
  it('matches by position when files have no shared batch IDs, padding shorter files', () => {
    const A = file('mass', ['x'], [{ x: '1' }, { x: '2' }], 'a');
    const B = file('mass', ['x'], [{ x: '1' }], 'b');
    const out = compareResults([A, B]);
    expect(out.rowMatch).toBe('position');
    expect(out.rows).toEqual([{ key: '#1', label: '#1', rowNumbers: [1, 1] }, { key: '#2', label: '#2', rowNumbers: [2, null] }]);
    expect(out.columns[0]).toMatchObject({ values: [[1, 1], [2, null]], rowsDiffering: 1 });
  });
  it('counts numeric rows as differing only when their values differ as numbers', () => {
    const rows = (xs: string[]) => xs.map((x) => ({ x }));
    const differing = (a: string[], b: string[]) => compareResults([file('mass', ['x'], rows(a), 'a'), file('mass', ['x'], rows(b), 'b')]).columns[0].rowsDiffering;
    expect(differing(['100'], ['100.0'])).toBe(0); // same number, different text
    expect(differing(['1e2'], ['100'])).toBe(0);
    expect(differing([''], [''])).toBe(0); // no value in either file
    expect(differing([''], ['100'])).toBe(1);
    expect(differing(['100'], ['100.5'])).toBe(1);
    expect(differing(['100', '1'], ['100'])).toBe(1); // the second row is missing from b
  });
  it('compares the R-32 + R-125 flag only when every file has it', () => {
    const previous = ['result_id', 'blend_class', 'dominant_component', 'processing_status', 'validation_errors'];
    const current = ['result_id', 'blend_class', 'dominant_component', 'r32_r125_over_50', 'processing_status', 'validation_errors'];
    const row = { blend_class: 'R-32-rich (demo)', dominant_component: 'R-32', r32_r125_over_50: 'Yes', processing_status: 'Valid', validation_errors: '' };
    const names = (...fs: ReturnType<typeof file>[]) => compareResults(fs).columns.map((c) => c.name);
    const old = file('classification', previous, [row], 'old');
    const a = file('classification', current, [row], 'a');
    const b = file('classification', current, [row], 'b');
    expect(names(old, a)).toEqual(['blend_class', 'dominant_component', 'processing_status', 'validation_errors']);
    expect(names(a, old, b)).toEqual(['blend_class', 'dominant_component', 'processing_status', 'validation_errors']);
    expect(compareResults([a, b]).columns.find((c) => c.name === 'r32_r125_over_50')).toMatchObject({ kind: 'category', categories: [{ label: 'Yes', counts: [1, 1] }] });
    // Any other difference is still refused.
    expect(() => compareResults([file('classification', ['blend_class', 'dominant_component'], [row], 'legacy'), a])).toThrow(/Regenerate the older result/);
  });
  it('still compares category columns as text', () => {
    const out = compareResults([file('mass', ['s'], [{ s: 'Valid' }], 'a'), file('mass', ['s'], [{ s: 'valid' }], 'b')]);
    expect(out.columns[0]).toMatchObject({ kind: 'category', rowsDiffering: 1 });
  });
});

describe('matching rows by batch ID', () => {
  const cols = ['composition_total_pct'];
  const meta: FileMeta = { id: 'm', name: 'm.csv', rows: 1, columns: 1, uploadedAt: '', status: 'Processed', processor: 'validation', generatedColumns: cols };
  const headers = [...A_HEADERS.split(','), ...cols];
  const file = (ids: string[], totals = ids.map(() => '100')) =>
    ({ meta, headers, rows: ids.map((id, i) => ({ batch_id: id, sample_date: 'd', feed_mass_kg: '1', r32_pct: '40', r125_pct: '30', r134a_pct: '30', composition_total_pct: totals[i] })) });

  it('lines rows up by ID when every pair of files shares one, whatever their order', () => {
    const out = matchRows([file(['A-1', 'A-2', 'A-3']), file(['A-3', 'A-1', 'A-2']), file(['A-2', 'A-9'])]);
    expect(out.rowMatch).toBe('batch_id');
    expect(out.rows).toEqual([
      { key: 'id:1:A-1', label: 'A-1', rowNumbers: [1, 2, null] },
      { key: 'id:1:A-2', label: 'A-2', rowNumbers: [2, 3, 1] },
      { key: 'id:1:A-3', label: 'A-3', rowNumbers: [3, 1, null] },
      { key: 'id:1:A-9', label: 'A-9', rowNumbers: [null, null, 2] },
    ]);
  });
  it('falls back to position when any pair of files shares no ID', () => {
    expect(matchRows([file(['A-1']), file(['A-1']), file(['B-1'])]).rowMatch).toBe('position');
  });
  it('matches repeated IDs occurrence by occurrence and never matches blank IDs', () => {
    const out = matchRows([file(['B-1', 'B-1', '']), file(['B-1', '', 'B-1'])]);
    expect(out.rows).toEqual([
      { key: 'id:1:B-1', label: 'B-1', rowNumbers: [1, 1] },
      { key: 'id:2:B-1', label: 'B-1 (2)', rowNumbers: [2, 3] },
      { key: 'blank:1:3', label: '(blank ID) file 1 row 3', rowNumbers: [3, null] },
      { key: 'blank:2:2', label: '(blank ID) file 2 row 2', rowNumbers: [null, 2] },
    ]);
  });
  it('never merges a real batch ID with the label of a repeated one', () => {
    // "B-1 (2)" is a real batch ID here, and also the label of the second "B-1".
    const out = matchRows([file(['B-1', 'B-1', 'B-1 (2)']), file(['B-1 (2)', 'B-1', 'B-1'])]);
    expect(out.rows).toEqual([
      { key: 'id:1:B-1', label: 'B-1', rowNumbers: [1, 2] },
      { key: 'id:2:B-1', label: 'B-1 (2)', rowNumbers: [2, 3] },
      { key: 'id:1:B-1 (2)', label: 'B-1 (2)', rowNumbers: [3, 1] },
    ]);
    expect(new Set(out.rows.map((r) => r.key)).size).toBe(3);
  });
  it('compares the matched rows, so reordered files do not differ', () => {
    const out = compareResults([file(['A-1', 'A-2'], ['100', '98']), file(['A-2', 'A-1'], ['98', '100'])]);
    expect(out.columns[0]).toMatchObject({ values: [[100, 100], [98, 98]], rowsDiffering: 0 });
  });
});

describe('shared row validation contract', () => {
  const csv = `${A_HEADERS},notes
 A-1 ,d,100,40,30,30,first
A-1,d,100,40,30,30,second
   ,d,,x,-1,30,missing
a-1,d,100,40,30,30,case-sensitive
A-2,d,100,40,30,29.5,lower edge
A-3,d,100,40,30,30.5,upper edge`;
  const { headers, rows } = parseCsv(csv);

  it.each(['validation', 'mass', 'classification'] as const)('uses every row error for %s and preserves the source', (id) => {
    const out = processRows(headers, rows, id);
    expect(out.headers).toEqual([...headers, ...processors[id].columns]);
    expect(out.headers.slice(-2)).toEqual(['processing_status', 'validation_errors']);
    expect(out.rows.map((r) => r.processing_status)).toEqual(['Invalid', 'Invalid', 'Invalid', 'Valid', 'Valid', 'Valid']);
    expect(out.problemRows).toBe(3);
    expect(out.rows[2].validation_errors).toBe('batch ID missing; mass missing; R-32 not a number; R-125 out of range');
    for (const problem of findProblems(headers, rows).items)
      expect(out.rows[problem.row - 1].validation_errors).toBe(problem.message);
    out.rows.forEach((r, i) => headers.forEach((h) => expect(r[h]).toBe(rows[i][h])));
    for (const r of out.rows.slice(3)) expect(r.validation_errors).toBe('');
    if (id === 'mass') {
      for (const r of out.rows.slice(0, 3))
        expect([r.r32_mass_kg, r.r125_mass_kg, r.r134a_mass_kg]).toEqual(['', '', '']);
      expect(out.rows[3].r32_mass_kg).toBe('40');
    }
    if (id === 'classification') {
      for (const r of out.rows.slice(0, 3)) expect(r).toMatchObject({ blend_class: 'Needs review', dominant_component: '' });
      expect(out.rows[3]).toMatchObject({ blend_class: 'R-32-rich (demo)', dominant_component: 'R-32' });
    }
  });

  it('does not limit validation to the first 100 problem details', () => {
    const many = Array.from({ length: 125 }, (_, i) => ({ ...rows[3], batch_id: `ID-${i}`, feed_mass_kg: '' }));
    expect(findProblems(headers, many).items).toHaveLength(100);
    const out = processRows(headers, many, 'mass');
    expect(out.problemRows).toBe(125);
    expect(out.rows.every((r) => r.processing_status === 'Invalid' && r.r32_mass_kg === '')).toBe(true);
  });

  it.each(['validation', 'mass', 'classification'] as const)('rejects collisions for %s before overwriting source data', (id) => {
    for (const column of processors[id].columns) {
      const original = { ...rows[3], [column]: 'keep me' };
      expect(() => processRows([...headers, column], [original], id)).toThrow(column);
      expect(original[column]).toBe('keep me');
    }
  });

  it('recognizes complete current and legacy suffixes, not partial or misleading headers', () => {
    for (const id of ['validation', 'mass', 'classification'] as const) {
      const suffix = processors[id].columns;
      expect(detectResult([...headers, ...suffix])).toEqual({ processor: id, generatedColumns: suffix });
      expect(detectResult([...headers, ...suffix, 'extra'])).toBeUndefined();
    }
    for (const [id, suffix] of [
      ['validation', ['composition_total_pct', 'validation_status', 'validation_message']],
      ['mass', ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status']],
      ['classification', ['blend_class', 'dominant_component']],
      // Classification exports from before the R-32 + R-125 flag, with and without result_id.
      ['classification', ['result_id', 'blend_class', 'dominant_component', 'processing_status', 'validation_errors']],
      ['classification', ['blend_class', 'dominant_component', 'processing_status', 'validation_errors']],
    ] as const) expect(detectResult([...headers, ...suffix])).toEqual({ processor: id, generatedColumns: suffix });
    expect(detectResult([...headers, 'r32_r125_over_50', 'processing_status', 'validation_errors'])).toBeUndefined();
    expect(detectResult([...headers, 'processing_status', 'validation_errors'])).toBeUndefined();
    expect(detectResult([...headers, 'r32_mass_kg', 'processing_status', 'validation_errors'])).toBeUndefined();
  });
});

describe('CSV generator', () => {
  it('offers every partner adapter in the generator', () => {
    expect(GENERATOR_PARTNERS).toEqual(ADAPTERS.map((a) => a.id));
  });

  it('writes exactly the same file for the same partner, settings and seed', () => {
    const hash = (partner: 'A' | 'B' | 'C') => createHash('sha256').update(generateCsv(partner, 25, 3, 7, 'pin.csv').text).digest('hex');
    expect({ A: hash('A'), B: hash('B'), C: hash('C') }).toEqual({
      A: '46980e0760dd905713913a96c758483c134f6a6bf7dc6da86ff3d4acb70bb132',
      B: '69ee0eb15683ce3fd16c24e82704722593fa7ab8be5e6bc89279f9d2afa26e85',
      C: 'a468968c44bb4ee3ef126f69da73cbf24179ce6385c19495cb5d6115fba9da9b',
    });
  });

  // What Composition Validation says about each planted error kind.
  const MESSAGE: Record<GeneratedError['kind'], string> = {
    'mass missing': 'mass missing',
    'mass not a number': 'mass invalid',
    'negative percentage': 'R-125 out of range',
    'composition total off': 'composition totals',
    'batch ID missing': 'batch ID missing',
    'duplicate batch ID': 'duplicate batch ID',
  };

  it.each(GENERATOR_PARTNERS)('writes clean Partner %s files in its own columns and units', (partner) => {
    const file = generateCsv(partner, 25, 0, 1);
    const { headers, rows } = parseCsv(file.text);
    const adapter = getAdapter(headers);
    expect(adapter.name).toBe(ADAPTERS.find((a) => a.id === partner)!.name);
    expect(file).toMatchObject({ partner, rows: 25, errors: [] });
    expect(file.name).toMatch(new RegExp(`^partner${partner}-\\d{8}-001\\.csv$`));
    expect(rows).toHaveLength(25);
    expect(findProblems(headers, rows).total).toBe(0);
    const norm = rows.map(adapter.normalize);
    expect(norm.map((n) => n.batchId)).toEqual(Array.from({ length: 25 }, (_, i) => `${partner}-${String(i + 1).padStart(3, '0')}`));
    expect(norm[0].sampleDate).toBe('2026-09-01');
    for (const n of norm) {
      expect(n.massKg).toBeGreaterThanOrEqual(109.9);
      expect(n.massKg).toBeLessThanOrEqual(140.1);
      expect(Math.abs(n.r32! + n.r125! + n.r134a! - 100)).toBeLessThan(0.05);
    }
  });

  it('makes exactly the requested number of rows fail validation, with the reason it reports', () => {
    for (const partner of ['A', 'B', 'C'] as const)
      for (const errorRows of [1, 2, 3, 7, 25])
        for (let seed = 1; seed <= 20; seed++) {
          const file = generateCsv(partner, 25, errorRows, seed);
          const { headers, rows } = parseCsv(file.text);
          const problems = findProblems(headers, rows);
          expect(problems.total).toBe(errorRows);
          expect(file.errors.map((e) => e.row)).toEqual(problems.items.map((p) => p.row));
          file.errors.forEach((e, i) => expect(problems.items[i].message).toContain(MESSAGE[e.kind]));
        }
  });

  it.each(GENERATOR_PARTNERS)('gives clean Partner %s files every demo classification', (partner) => {
    const classes = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) {
      const { headers, rows } = parseCsv(generateCsv(partner, 50, 0, seed).text);
      processRows(headers, rows, 'classification').rows.forEach((r) => classes.add(r.blend_class));
    }
    expect([...classes].sort()).toEqual(['Balanced (demo)', 'R-134a-rich (demo)', 'R-32-rich (demo)']);
  });

  it('plants every kind of error across seeds', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) generateCsv('A', 30, 6, seed).errors.forEach((e) => kinds.add(e.kind));
    expect([...kinds].sort()).toEqual(Object.keys(MESSAGE).sort());
  });

  it('repeats a file for the same seed and pads IDs for large files', () => {
    expect(generateCsv('B', 10, 2, 7).text).toBe(generateCsv('B', 10, 2, 7).text);
    expect(generateCsv('B', 10, 2, 7).text).not.toBe(generateCsv('B', 10, 2, 8).text);
    const big = parseCsv(generateCsv('A', 1200, 0, 3).text).rows;
    expect([big[0].batch_id, big[1199].batch_id]).toEqual(['A-0001', 'A-1200']);
  });

  it('names files by partner, the day they were made and their number', () => {
    const made = new Date(2026, 10, 9, 23, 59); // 9 Nov 2026, local time
    expect(generatedName('A', 1, made)).toBe('partnerA-11092026-001.csv');
    expect(generatedName('C', 12, new Date(2027, 0, 3))).toBe('partnerC-01032027-012.csv');
    expect(generateFiles('B', 3, 0, 3, 5, made).map((f) => f.name)).toEqual(['partnerB-11092026-001.csv', 'partnerB-11092026-002.csv', 'partnerB-11092026-003.csv']);
    expect(generateFiles('B', 3, 0, 1, 5, made)[0].name).toBe('partnerB-11092026-001.csv');
  });

  it('makes a batch of files that never share their data', () => {
    const files = generateFiles('C', 6, 2, 10, 11);
    expect(new Set(files.map((f) => f.name)).size).toBe(10);
    expect(new Set(files.map((f) => f.text)).size).toBe(10);
    for (const f of files) {
      const { headers, rows } = parseCsv(f.text);
      expect(findProblems(headers, rows).total).toBe(2);
    }
    // Even the smallest files, with the fewest ways to differ, stay distinct in a full batch.
    for (let seed = 1; seed <= 50; seed++) expect(new Set(generateFiles('A', 1, 1, 10, seed).map((f) => f.text)).size).toBe(10);
  });

  it('repeats a batch for the same seed, and makes different batches without one', () => {
    expect(generateFiles('B', 5, 1, 3, 2)).toEqual(generateFiles('B', 5, 1, 3, 2));
  });
  it('stops with a clear error, after a fixed number of tries, when it cannot make distinct files', () => {
    let calls = 0;
    const same = (...args: Parameters<typeof generateCsv>) => { calls++; return { ...generateCsv(...args), text: 'always the same' }; };
    expect(GENERATE_MAX_ATTEMPTS).toBe(100);
    expect(() => generateFiles('A', 3, 0, 2, 1, new Date(), same)).toThrow('Could not make 2 different files with these settings. Try more rows or fewer files.');
    expect(calls).toBe(GENERATE_MAX_ATTEMPTS);
    const error = (() => { try { generateFiles('A', 3, 0, 2, 1, new Date(), same); } catch (e) { return e; } })();
    expect(error).toMatchObject({ statusCode: 400 });
    expect(generateFiles('B', 5, 1, 3)[0].text).not.toBe(generateFiles('B', 5, 1, 3)[0].text);
  });

});

describe('File IDs', () => {
  it('reads base IDs and result IDs, and nothing else', () => {
    expect(parseFileId('101010')).toEqual({ base: '101010', code: undefined });
    expect(parseFileId('101010-V')).toEqual({ base: '101010', code: 'V' });
    expect(parseFileId('999999-C')).toEqual({ base: '999999', code: 'C' });
    for (const bad of ['101010-v', '101010-X', '101010-VM', '10101', '1010100', '100000', '000001', ' 101010', '101010 ', 'abc', '../101010', ''])
      expect(parseFileId(bad), bad).toBeUndefined();
  });

  it('gives each function its own fixed code', () => {
    expect(PROCESSORS.map((p) => [p.id, p.code])).toEqual([['validation', 'V'], ['mass', 'M'], ['classification', 'C']]);
    expect(resultFileId('101010', 'validation')).toBe('101010-V');
    expect(resultFileId('101010', 'mass')).toBe('101010-M');
    expect(resultFileId('101010', 'classification')).toBe('101010-C');
  });

  it('hands out the number after the highest one in use, starting at 100001', () => {
    expect(nextBaseId([])).toBe('100001');
    expect(nextBaseId(['100001', '100002-V'])).toBe('100003');
    expect(nextBaseId(['100001', '100007-M', '100003'])).toBe('100008'); // results count too
    expect(nextBaseId(['not-an-id', '42', '100005'])).toBe('100006'); // other text is ignored
    expect(() => nextBaseId(['999999'])).toThrow('No File IDs left');
  });
});

describe('File ID columns', () => {
  const headers = ['batch_id', 'value'];
  const rows = [{ batch_id: 'A-1', value: '1' }, { batch_id: 'A-2', value: '2' }];

  it('adds file_id to an input, or rewrites one it already has', () => {
    expect(stampFileIds(headers, rows, '101010', false)).toEqual({
      headers: ['batch_id', 'value', 'file_id'],
      rows: rows.map((r) => ({ ...r, file_id: '101010' })),
    });
    const carried = stampFileIds(['batch_id', 'file_id'], [{ batch_id: 'A-1', file_id: '100001' }], '101011', false);
    expect(carried).toEqual({ headers: ['batch_id', 'file_id'], rows: [{ batch_id: 'A-1', file_id: '101011' }] });
  });

  it("rewrites a result's file_id and result_id, and adds neither to a result without them", () => {
    const result = stampFileIds(['batch_id', 'file_id', 'result_id', 'x'], [{ batch_id: 'A', file_id: '100001', result_id: '100001-M', x: '1' }], '101012-M', true);
    expect(result.rows).toEqual([{ batch_id: 'A', file_id: '101012', result_id: '101012-M', x: '1' }]);
    expect(stampFileIds(headers, rows, '101013-V', true)).toEqual({ headers, rows });
  });

  it('writes the result ID on every row and recognises results with or without it', () => {
    const input = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
    const out = processRows(input, [{ batch_id: 'A', sample_date: 'd', feed_mass_kg: '100', r32_pct: '40', r125_pct: '30', r134a_pct: '30' }], 'validation', '101010-V');
    expect(out.rows[0].result_id).toBe('101010-V');
    expect(detectResult(out.headers)).toEqual({ processor: 'validation', generatedColumns: ['result_id', 'composition_total_pct', 'processing_status', 'validation_errors'] });
    expect(detectResult([...input, 'composition_total_pct', 'processing_status', 'validation_errors'])?.processor).toBe('validation');
    expect(detectResult([...input, 'file_id'])).toBeUndefined(); // an input with its file_id is still an input
  });
});

describe('linking an imported result to its original', () => {
  const inputHeaders = ['batch_id', 'feed_mass_kg', 'file_id'];
  const inputRows = [
    { batch_id: 'A-1', feed_mass_kg: '10.0', file_id: '101010' },
    { batch_id: 'A-2', feed_mass_kg: '12', file_id: '101010' },
  ];
  const generated = ['result_id', 'composition_total_pct', 'processing_status', 'validation_errors'];
  const resultHeaders = [...inputHeaders, ...generated];
  const resultRows = inputRows.map((r) => ({ ...r, result_id: '101010-V', composition_total_pct: '100', processing_status: 'Valid', validation_errors: '' }));
  const matches = (headers: string[], rows: Row[]) => matchesInput(headers, rows, generated, inputHeaders, inputRows);

  it('reads the source File ID only when every row names the same File ID', () => {
    expect(embeddedSourceId(resultHeaders, resultRows)).toBe('101010');
    expect(embeddedSourceId(resultHeaders, resultRows.map((r) => ({ ...r, file_id: '101010-V' })))).toBe('101010-V');
    expect(embeddedSourceId(['batch_id'], [{ batch_id: 'A-1' }])).toBeUndefined(); // no file_id column
    expect(embeddedSourceId(resultHeaders, [])).toBeUndefined();
    expect(embeddedSourceId(resultHeaders, [resultRows[0], { ...resultRows[1], file_id: '101011' }])).toBeUndefined();
    expect(embeddedSourceId(resultHeaders, resultRows.map((r) => ({ ...r, file_id: '' })))).toBeUndefined();
    expect(embeddedSourceId(resultHeaders, resultRows.map((r) => ({ ...r, file_id: 'abc' })))).toBeUndefined();
  });

  it('matches identical original data, in any column order', () => {
    expect(matches(resultHeaders, resultRows)).toBe(true);
    expect(matches(['feed_mass_kg', 'file_id', 'batch_id', ...generated], resultRows)).toBe(true);
  });

  it('does not match a changed value, a row or column more or less, or rows in another order', () => {
    expect(matches(resultHeaders, [{ ...resultRows[0], feed_mass_kg: '10' }, resultRows[1]])).toBe(false); // 10.0 vs 10
    expect(matches(resultHeaders, resultRows.slice(0, 1))).toBe(false);
    expect(matches(resultHeaders, [...resultRows, resultRows[1]])).toBe(false);
    expect(matches(resultHeaders.filter((h) => h !== 'feed_mass_kg'), resultRows)).toBe(false);
    expect(matches(['notes', ...resultHeaders], resultRows.map((r) => ({ ...r, notes: '' })))).toBe(false);
    expect(matches(resultHeaders, [resultRows[1], resultRows[0]])).toBe(false);
  });

  it('keeps the original base ID in file_id for a linked result', () => {
    expect(stampFileIds(resultHeaders, resultRows, '101012-V', true, '101010').rows[0]).toMatchObject({ file_id: '101010', result_id: '101012-V' });
    expect(stampFileIds(resultHeaders, resultRows, '101012-V', true).rows[0]).toMatchObject({ file_id: '101012', result_id: '101012-V' });
  });
});

describe('structured issues on the sample files', () => {
  const sampleDir = path.resolve(import.meta.dirname, '../sample-data');
  const samples = readdirSync(sampleDir).filter((name) => name.endsWith('.csv'));

  it.each(samples)('%s: validation_errors is the issues joined, and a blank total only follows a missing or non-numeric component', (name) => {
    const { headers, rows } = parseCsv(readFileSync(path.join(sampleDir, name), 'utf8'));
    const problems = new Map(findProblems(headers, rows).items.map((p) => [p.row, p]));
    const out = processRows(headers, rows, 'validation').rows;
    out.forEach((r, i) => {
      const problem = problems.get(i + 1);
      expect(r.validation_errors).toBe(problem?.message ?? '');
      expect(problem?.message).toBe(problem?.issues.map((x) => x.reason).join('; '));
      const brokenComponent = problem?.issues.some((x) => x.code === 'component_missing' || x.code === 'component_not_number') ?? false;
      expect(r.composition_total_pct === '').toBe(brokenComponent);
    });
  });
});

describe('shared code', () => {
  // shared/ runs in the browser, so it must not import Node or server-only packages.
  const sharedDir = path.resolve(import.meta.dirname, '../shared');
  const files = readdirSync(sharedDir).filter((name) => name.endsWith('.ts'));
  const serverOnly = /from '(node:[^']*|fastify|@fastify\/[^']*|@vercel\/blob|fs|fs\/promises|path|os|crypto)'/;

  it.each(files)('%s imports nothing from Node or the server', (name) => {
    const imports = readFileSync(path.join(sharedDir, name), 'utf8').split('\n').filter((line) => line.startsWith('import '));
    expect(imports.filter((line) => serverOnly.test(line))).toEqual([]);
  });

  it('finds the shared modules', () => {
    expect(files).toEqual(expect.arrayContaining(['csv.ts', 'adapters.ts', 'processing.ts', 'compare.ts', 'generate.ts', 'types.ts']));
  });
});

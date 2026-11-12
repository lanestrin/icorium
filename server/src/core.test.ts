import { createHash } from 'node:crypto';
import { DEFAULT_LOG_LEVEL, DEFAULT_MAX_UPLOAD_MB, serverSettings } from './app';
import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './lib/csv';
import { getAdapter } from './adapters';
import { detectResult, embeddedSourceId, findProblems, issues, matchesInput, processors, processRows, stampFileIds } from './processing';
import { compareResults, matchRows } from './lib/compare';
import { GENERATE_MAX_ATTEMPTS, generateCsv, generatedName, generateFiles } from './lib/generate';
import { ADAPTERS, GENERATOR_PARTNERS, nextBaseId, parseFileId, PROCESSORS, resultFileId, type FileMeta, type GeneratedError, type Row } from '../../shared/types';

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
        { row: 1, batchId: 'A-1', message: 'duplicate batch ID A-1' },
        { row: 2, batchId: 'A-2', message: 'mass missing' },
        { row: 3, batchId: 'A-1', message: 'duplicate batch ID A-1' },
        { row: 4, batchId: '', message: 'batch ID missing' },
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
    ] as const) expect(detectResult([...headers, ...suffix])).toEqual({ processor: id, generatedColumns: suffix });
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
      A: '5f60d34432142e5fda5f195b679ea6c68771896213352f307945ec3534ac1133',
      B: '0aaaf3f11f001dc2b6189960810adcb9a24dcdc140a7232ba7994aaa1e8b3e49',
      C: 'db438f73a06640aa18b48037b7a810d0d486a2157122a18370ba488f1d93245f',
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

describe('server settings', () => {
  it("uses today's defaults when nothing is set, or a variable is empty", () => {
    const defaults = { maxUploadMb: DEFAULT_MAX_UPLOAD_MB, logLevel: DEFAULT_LOG_LEVEL, host: '0.0.0.0', port: 3001 };
    expect(serverSettings({})).toEqual(defaults);
    expect(serverSettings({ MAX_UPLOAD_MB: '', LOG_LEVEL: '', HOST: '', PORT: '' })).toEqual(defaults);
    expect(defaults).toMatchObject({ maxUploadMb: 10, logLevel: 'warn' });
  });

  it('reads each setting from its environment variable', () => {
    expect(serverSettings({ MAX_UPLOAD_MB: '0.5', LOG_LEVEL: 'info', HOST: '127.0.0.1', PORT: '4000' }))
      .toEqual({ maxUploadMb: 0.5, logLevel: 'info', host: '127.0.0.1', port: 4000 });
  });

  it.each(['0', '-1', 'ten', 'Infinity'])('refuses MAX_UPLOAD_MB=%s, naming the variable', (value) => {
    expect(() => serverSettings({ MAX_UPLOAD_MB: value })).toThrow(`MAX_UPLOAD_MB must be a positive number of megabytes, got "${value}".`);
  });

  it('refuses an unknown LOG_LEVEL, listing the valid ones', () => {
    expect(() => serverSettings({ LOG_LEVEL: 'loud' }))
      .toThrow('LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, silent, got "loud".');
  });
});

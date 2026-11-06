// API tests: the real Fastify app, called in memory with app.inject(), using a throwaway data folder.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { FileMeta, FileRows, ProcessorId } from '../../shared/types';
import { parseCsv } from './lib/csv';
import { processors } from './processing';

// Storage reads RECLAIM_DATA_DIR when first imported, so set it before loading the app.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reclaim-api-'));
process.env.RECLAIM_DATA_DIR = dataDir;
const { buildApp } = await import('./app');

const SAMPLES = path.resolve(import.meta.dirname, '../../sample-data');
const sample = (name: string) => fs.readFileSync(path.join(SAMPLES, name), 'utf8');
const MASS_COLUMNS = ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'processing_status', 'validation_errors'];

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(false); });
afterAll(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('loading files', () => {
  it('starts with the five sample files marked Needs Review', async () => {
    const files = await listFiles();
    expect(files.map((f) => f.name)).toEqual([
      'partner_a_baseline.csv', 'partner_a_followup.csv', 'partner_b_baseline.csv', 'partner_b_followup.csv', 'partner_c_baseline.csv',
    ]);
    for (const f of files) expect(f).toMatchObject({ status: 'Needs Review', rows: 25, columns: 6, problemRows: f.name === 'partner_b_followup.csv' ? 2 : 1 });
  });

  it('accepts an upload, previews its rows and downloads it unchanged', async () => {
    const text = sample('partner_c_baseline.csv');
    const res = await upload('uploaded_c.csv', text);
    expect(res.statusCode).toBe(200);
    const meta = res.json<FileMeta>();
    expect(meta).toMatchObject({ name: 'uploaded_c.csv', status: 'Needs Review', rows: 25, columns: 6 });

    const preview = await rowsOf(meta.id);
    expect(preview.headers).toEqual(['material_ref', 'collection_date', 'quantity_g', 'R32_fraction', 'R125_fraction', 'R134a_fraction']);
    expect(preview.rows).toHaveLength(25);

    const download = await app.inject(`/api/files/${meta.id}/download`);
    expect(download.headers['content-disposition']).toBe('attachment; filename="uploaded_c.csv"');
    expect(download.body).toBe(text);
  });

  it.each([
    ['notes.txt', sample('partner_a_baseline.csv'), 'Only .csv files are supported'],
    ['unknown.csv', 'foo,bar\n1,2\n', 'Unrecognized CSV schema'],
    ['broken.csv', 'batch_id,sample_date\nA-1,2026-09-01,extra\n', 'CSV parse error on data row 1'],
    ['empty.csv', 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct\n', 'at least one data row'],
  ])('rejects %s with a clear message', async (name, text, message) => {
    const res = await upload(name, text);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain(message);
    expect((await listFiles()).some((f) => f.name === name)).toBe(false);
  });

  it('returns 404 for a file that does not exist', async () => {
    const res = await app.inject('/api/files/nope/rows');
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('File not found');
  });
});

describe('preview paging', () => {
  const bigCsv = (n: number) =>
    ['batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct', ...Array.from({ length: n }, (_, i) => `X-${i + 1},2026-09-01,100,40,30,30`)].join('\n');
  const page = (id: string, query: string) => app.inject(`/api/files/${id}/rows?${query}`);
  let id: string;
  beforeAll(async () => { id = (await upload('big.csv', bigCsv(250))).json<FileMeta>().id; });

  it('returns the first 100 rows and the total by default', async () => {
    const res = (await app.inject(`/api/files/${id}/rows`)).json<FileRows>();
    expect(res).toMatchObject({ offset: 0, totalRows: 250 });
    expect(res.rows).toHaveLength(100);
    expect(res.rows[0].batch_id).toBe('X-1');
  });

  it('returns the requested page, and a short last page', async () => {
    const second = (await page(id, 'offset=100&limit=100')).json<FileRows>();
    expect(second.rows[0].batch_id).toBe('X-101');
    const last = (await page(id, 'offset=200&limit=100')).json<FileRows>();
    expect(last.rows.map((r) => r.batch_id)).toEqual(Array.from({ length: 50 }, (_, i) => `X-${i + 201}`));
  });

  it.each(['limit=0', 'limit=1001', 'offset=-1', 'limit=abc'])('rejects %s', async (query) => {
    expect((await page(id, query)).statusCode).toBe(400);
  });
});

describe('processing', () => {
  // The one planted problem per file, from sample-data/README.txt (1-based data rows).
  it.each([
    ['partner_a_baseline.csv', [8], 'mass missing'],
    ['partner_a_followup.csv', [13], 'R-125 out of range'],
    ['partner_b_baseline.csv', [5], 'mass invalid'],
    ['partner_b_followup.csv', [10, 11], 'duplicate batch ID B-010'],
    ['partner_c_baseline.csv', [18], 'composition totals'],
  ])('flags exactly the planted problem in %s', async (name, rows, message) => {
    const result = await processSample(name, 'validation');
    const { rows: out } = await rowsOf(result.id);
    const flagged = out.flatMap((r, i) => (r.processing_status === 'Invalid' ? [i + 1] : []));
    expect(flagged).toEqual(rows);
    for (const row of rows) expect(out[row - 1].validation_errors).toContain(message);
  });

  it.each(['validation', 'mass', 'classification'] as const)('runs %s on every row and keeps every original column and value', async (processor) => {
    const source = await fileNamed('partner_b_baseline.csv');
    const before = await rowsOf(source.id);
    const result = await processSample('partner_b_baseline.csv', processor);

    expect(result).toMatchObject({ name: `result_partner_b_baseline_${processor}.csv`, status: 'Processed', processor, sourceId: source.id, rows: 25 });
    const after = await rowsOf(result.id);
    expect(after.headers.slice(0, before.headers.length)).toEqual(before.headers);
    expect(after.headers.slice(before.headers.length)).toEqual(result.generatedColumns);
    expect(after.rows).toHaveLength(before.rows.length);
    after.rows.forEach((row, i) => before.headers.forEach((h) => expect(row[h]).toBe(before.rows[i][h])));
  });

  it('calculates component masses in kg from pounds', async () => {
    const { id } = await processSample('partner_b_baseline.csv', 'mass');
    const { headers, rows } = await rowsOf(id);
    expect(headers.slice(-5)).toEqual(MASS_COLUMNS);
    // Row 1: 266.713 lb x 37.09 % R-32
    expect(Number(rows[0].r32_mass_kg)).toBeCloseTo(266.713 * 0.45359237 * 0.3709, 2);
    expect(rows[4]).toMatchObject({ r32_mass_kg: '', processing_status: 'Invalid' });
  });

  it('replaces the earlier result when the same function runs again', async () => {
    const first = await processSample('partner_a_baseline.csv', 'classification');
    const second = await processSample('partner_a_baseline.csv', 'classification');
    expect(second.id).not.toBe(first.id);
    expect((await listFiles()).filter((f) => f.name === 'result_partner_a_baseline_classification.csv')).toHaveLength(1);
  });

  it('refuses to process a result file', async () => {
    const result = await processSample('partner_a_baseline.csv', 'mass');
    const res = await processFile(result.id, 'mass');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Select an input file, not a result file');
  });

  it('rejects an unknown processing function', async () => {
    const res = await processFile((await fileNamed('partner_a_baseline.csv')).id, 'purity');
    expect(res.statusCode).toBe(400);
  });
});

describe('problem rows', () => {
  it('counts problem rows for every file in the list', async () => {
    const counts = Object.fromEntries((await listFiles()).filter((f) => f.name.startsWith('partner_')).map((f) => [f.name, f.problemRows]));
    expect(counts).toEqual({
      'partner_a_baseline.csv': 1, 'partner_a_followup.csv': 1, 'partner_b_baseline.csv': 1, 'partner_b_followup.csv': 2, 'partner_c_baseline.csv': 1,
    });
  });

  it('marks a result file with its problem rows, whatever function made it', async () => {
    const result = await processSample('partner_a_followup.csv', 'classification');
    expect(result.problemRows).toBe(1);
    const { problems } = await rowsOf(result.id);
    expect(problems).toEqual({ total: 1, items: [{ row: 13, batchId: expect.any(String), message: 'R-125 out of range' }] });
  });

  it('says which file of a comparison each problem row is in', async () => {
    const a = await processSample('partner_a_baseline.csv', 'validation');
    const c = await processSample('partner_c_baseline.csv', 'validation');
    const { problemsA, problemsB } = (await compare(a.id, c.id)).json();
    expect(problemsA.items).toEqual([expect.objectContaining({ row: 8, message: 'mass missing' })]);
    expect(problemsB.items).toEqual([expect.objectContaining({ row: 18, message: expect.stringContaining('composition totals') })]);
  });

  it('fills in the count for files saved before it existed', async () => {
    const { storage } = await import('./lib/storage');
    const id = (await fileNamed('partner_b_followup.csv')).id;
    storage.patch(id, { problemRows: undefined });
    expect((await fileNamed('partner_b_followup.csv')).problemRows).toBe(2);
  });
});

describe('comparing results', () => {
  it('compares two results from the same function', async () => {
    const a = await processSample('partner_a_baseline.csv', 'mass');
    const b = await processSample('partner_a_followup.csv', 'mass');
    const res = await compare(a.id, b.id);
    expect(res.statusCode).toBe(200);
    const { columns } = res.json();
    expect(columns.map((c: { name: string }) => c.name)).toEqual(MASS_COLUMNS);
    expect(columns[0]).toMatchObject({ unit: 'kg', measure: 'total', rowsCompared: 25 });
    expect(columns[0].rowsDiffering).toBeGreaterThan(0);
    expect(columns[0].valueB).not.toBe(columns[0].valueA);
  });

  it('accepts result CSVs uploaded from disk, even when renamed', async () => {
    const result = await processSample('partner_b_followup.csv', 'validation');
    const text = (await app.inject(`/api/files/${result.id}/download`)).body;
    const res = await upload('my_saved_results.csv', text);
    expect(res.json()).toMatchObject({ status: 'Processed', processor: 'validation', generatedColumns: result.generatedColumns });

    const other = await processSample('partner_b_baseline.csv', 'validation');
    expect((await compare(res.json().id, other.id)).statusCode).toBe(200);
  });

  it('explains in plain words why two results cannot be compared', async () => {
    const a = await processSample('partner_c_baseline.csv', 'mass');
    const b = await processSample('partner_c_baseline.csv', 'validation');
    const res = await compare(a.id, b.id);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("can't be compared");
    expect(res.json().message).toContain('Component Mass Calculation result');
  });

  it('rejects comparing a file with itself or with an input file', async () => {
    const result = await processSample('partner_c_baseline.csv', 'mass');
    const input = await fileNamed('partner_c_baseline.csv');
    expect((await compare(result.id, result.id)).json().message).toBe('Choose two different files');
    expect((await compare(result.id, input.id)).json().message).toContain('is an input file');
  });
});

describe('current result contract', () => {
  const samples = [
    ['partner_a_baseline.csv', [8]], ['partner_a_followup.csv', [13]],
    ['partner_b_baseline.csv', [5]], ['partner_b_followup.csv', [10, 11]],
    ['partner_c_baseline.csv', [18]],
  ] as const;
  const cases = samples.flatMap(([name, invalid]) =>
    (['validation', 'mass', 'classification'] as const).map((id) => ({ name, invalid, id })));

  it.each(cases)('$name / $id retains every row and round-trips its exact schema', async ({ name, invalid, id }) => {
    const source = await fileNamed(name);
    const before = await rowsOf(source.id);
    const result = await processSample(name, id);
    const after = await rowsOf(result.id);
    expect(after.headers).toEqual([...before.headers, ...processors[id].columns]);
    expect(result.columns).toBe(after.headers.length);
    expect(result.generatedColumns).toEqual(processors[id].columns);
    expect(result.problemRows).toBe(invalid.length);
    expect(after.rows).toHaveLength(25);
    expect(after.rows.flatMap((r, i) => r.processing_status === 'Invalid' ? [i + 1] : [])).toEqual(invalid);
    expect(after.rows.filter((r) => r.processing_status === 'Valid')).toHaveLength(25 - invalid.length);
    after.rows.forEach((r, i) => {
      before.headers.forEach((h) => expect(r[h]).toBe(before.rows[i][h]));
      if (r.processing_status === 'Valid') expect(r.validation_errors).toBe('');
      else {
        expect(r.validation_errors).toBe(after.problems.items.find((p) => p.row === i + 1)?.message);
        if (id === 'mass') expect([r.r32_mass_kg, r.r125_mass_kg, r.r134a_mass_kg]).toEqual(['', '', '']);
        if (id === 'classification') expect(r).toMatchObject({ blend_class: 'Needs review', dominant_component: '' });
      }
    });
    const download = (await app.inject(`/api/files/${result.id}/download`)).body;
    expect(parseCsv(download)).toEqual({ headers: after.headers, rows: after.rows });
    const imported = (await upload(`renamed_${name}_${id}.csv`, download)).json<FileMeta>();
    expect(imported).toMatchObject({ status: 'Processed', processor: id, generatedColumns: result.generatedColumns });
    expect((await rowsOf(imported.id)).generatedColumns).toEqual(after.generatedColumns);
    expect((await app.inject(`/api/files/${imported.id}/download`)).body).toBe(download);
    const compared = await compare(result.id, imported.id);
    expect(compared.statusCode).toBe(200);
    expect(compared.json().columns.every((c: { rowsDiffering: number }) => c.rowsDiffering === 0)).toBe(true);
    if (id === 'mass') {
      const col = compared.json().columns[0];
      expect(col.valueA).toBeCloseTo(after.rows.reduce((s, r) => s + Number(r.r32_mass_kg || 0), 0), 8);
      for (const row of invalid) expect(col.data[row - 1]).toMatchObject({ a: null, b: null });
    }
    expect((await rowsOf(source.id)).rows).toEqual(before.rows);
  });

  it('rejects a source-column collision without saving a result or changing the input', async () => {
    const csv = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct,processing_status,notes\nA,d,100,40,30,30,original,keep';
    const input = (await upload('collision.csv', csv)).json<FileMeta>();
    expect(input.status).toBe('Ready');
    const before = (await listFiles()).length;
    for (const id of ['validation', 'mass', 'classification']) {
      const response = await processFile(input.id, id);
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('processing_status');
    }
    expect((await listFiles()).length).toBe(before);
    expect((await app.inject(`/api/files/${input.id}/download`)).body).toBe(csv);
  });

  it('compares actual CSV schemas even if stored generated-column metadata is stale', async () => {
    const result = await processSample('partner_a_baseline.csv', 'mass');
    const text = (await app.inject(`/api/files/${result.id}/download`)).body;
    const imported = (await upload('current_mass_stale_metadata.csv', text)).json<FileMeta>();
    const { storage } = await import('./lib/storage');
    storage.patch(imported.id, { generatedColumns: ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status'] });
    const response = await compare(imported.id, result.id);
    expect(response.statusCode).toBe(200);
    expect(response.json().columns.map((c: { name: string }) => c.name)).toEqual(processors.mass.columns);
    expect((await app.inject(`/api/files/${imported.id}/download`)).body).toBe(text);
  });
});

describe('input review status', () => {
  const clean = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct\nCLEAN,d,100,40,30,30';

  it('returns Ready only for clean inputs and keeps upload/list status consistent', async () => {
    const a = (await upload('clean_status.csv', clean)).json<FileMeta>();
    const b = (await upload('invalid_status.csv', clean.replace(',100,', ',,'))).json<FileMeta>();
    expect(a).toMatchObject({ status: 'Ready', problemRows: 0 });
    expect(b).toMatchObject({ status: 'Needs Review', problemRows: 1 });
    const files = await listFiles();
    expect(files.find((f) => f.id === a.id)).toEqual(a);
    expect(files.find((f) => f.id === b.id)).toEqual(b);
  });

  it.each(['validation', 'mass', 'classification'] as const)('processes Needs Review inputs with %s without changing the source status', async (processor) => {
    const source = await fileNamed('partner_b_followup.csv');
    expect(source).toMatchObject({ status: 'Needs Review', problemRows: 2 });
    const before = (await app.inject(`/api/files/${source.id}/download`)).body;
    const response = await processFile(source.id, processor);
    expect(response.statusCode).toBe(200);
    const result = response.json<FileMeta>();
    expect(result).toMatchObject({ status: 'Processed', problemRows: 2, processor });
    const imported = (await upload(`review_result_${processor}.csv`, (await app.inject(`/api/files/${result.id}/download`)).body)).json<FileMeta>();
    expect(imported).toMatchObject({ status: 'Processed', problemRows: 2, processor });
    expect((await fileNamed(source.name))).toEqual(source);
    expect((await app.inject(`/api/files/${source.id}/download`)).body).toBe(before);
  });

  it('keeps an invalid legacy result Processed and counts errors from its source columns', async () => {
    const text = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct,r32_mass_kg,r125_mass_kg,r134a_mass_kg,mass_status\nOLD,d,,40,30,30,,,,Skipped (invalid input)';
    const result = (await upload('legacy_invalid_status.csv', text)).json<FileMeta>();
    expect(result).toMatchObject({ status: 'Processed', processor: 'mass', problemRows: 1 });
    expect((await fileNamed(result.name))).toEqual(result);
    expect((await app.inject(`/api/files/${result.id}/download`)).body).toBe(text);
  });

  it('reconciles old statuses and missing counts without rereading or rewriting known files', async () => {
    const { storage } = await import('./lib/storage');
    const cleanMeta = (await upload('old_clean_status.csv', clean)).json<FileMeta>();
    const invalid = (await upload('old_invalid_status.csv', clean.replace(',100,', ',,'))).json<FileMeta>();
    const missing = (await upload('missing_count_status.csv', clean.replace(',100,', ',,'))).json<FileMeta>();
    const result = await processSample('partner_a_baseline.csv', 'mass');
    storage.patch(cleanMeta.id, { status: 'Needs Review' });
    storage.patch(invalid.id, { status: 'Ready' });
    storage.patch(missing.id, { status: 'Ready', problemRows: undefined });
    storage.patch(result.id, { problemRows: undefined });
    const read = vi.spyOn(storage, 'read');
    const patch = vi.spyOn(storage, 'patch');
    try {
      const files = await listFiles();
      expect(files.find((f) => f.id === cleanMeta.id)).toEqual(cleanMeta);
      expect(files.find((f) => f.id === invalid.id)).toEqual(invalid);
      expect(files.find((f) => f.id === missing.id)).toEqual(missing);
      expect(files.find((f) => f.id === result.id)).toEqual(result);
      expect(files.find((f) => f.id === cleanMeta.id)?.status).toBe('Ready');
      expect(files.find((f) => f.id === invalid.id)).toMatchObject({ status: 'Needs Review', problemRows: 1 });
      expect(files.find((f) => f.id === missing.id)).toMatchObject({ status: 'Needs Review', problemRows: 1 });
      expect(files.find((f) => f.id === result.id)).toMatchObject({ status: 'Processed', problemRows: 1 });
      expect(read.mock.calls.map(([id]) => id).sort()).toEqual([missing.id, result.id].sort());
      read.mockClear(); patch.mockClear();
      await listFiles();
      expect(read).not.toHaveBeenCalled();
      expect(patch).not.toHaveBeenCalled();
    } finally { read.mockRestore(); patch.mockRestore(); }
    for (const [meta, text] of [[cleanMeta, clean], [invalid, clean.replace(',100,', ',,')], [missing, clean.replace(',100,', ',,')]] as const)
      expect((await app.inject(`/api/files/${meta.id}/download`)).body).toBe(text);
  });
});

describe('legacy result compatibility', () => {
  const originalHeaders = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
  const legacy = {
    validation: { columns: ['composition_total_pct', 'validation_status', 'validation_message'], values: ['100', 'OK', 'Composition valid'] },
    mass: { columns: ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status'], values: ['40', '30', '30', 'OK'] },
    classification: { columns: ['blend_class', 'dominant_component'], values: ['R-32-rich (demo)', 'R-32'] },
  };
  const legacyCsv = (id: ProcessorId) => `${[...originalHeaders, ...legacy[id].columns].join(',')}\nA,d,100,40,30,30,${legacy[id].values.join(',')}\n`;

  it.each(['validation', 'mass', 'classification'] as const)('keeps old %s files unchanged and rejects mixed schemas in either order', async (id) => {
    const text = legacyCsv(id);
    const a = (await upload(`old_${id}.csv`, text)).json<FileMeta>();
    const b = (await upload(`renamed_old_${id}.csv`, text)).json<FileMeta>();
    expect(a).toMatchObject({ status: 'Processed', processor: id, generatedColumns: legacy[id].columns });
    expect((await rowsOf(a.id)).generatedColumns).toEqual(legacy[id].columns);
    expect((await app.inject(`/api/files/${a.id}/download`)).body).toBe(text);
    const same = await compare(a.id, b.id);
    expect(same.statusCode).toBe(200);
    expect(same.json().columns.map((c: { name: string }) => c.name)).toEqual(legacy[id].columns);
    expect((await processFile(a.id, id)).statusCode).toBe(400);
    const current = await processSample('partner_a_baseline.csv', id);
    for (const [left, right] of [[a.id, current.id], [current.id, a.id]]) {
      const response = await compare(left, right);
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('Regenerate the older result');
    }
  });

  it('loads persisted legacy metadata after restarting without rewriting CSVs', async () => {
    const { storage } = await import('./lib/storage');
    const saved = (['validation', 'mass', 'classification'] as const).map((id) => {
      const text = legacyCsv(id);
      const meta = storage.save({ name: `persisted_${id}.csv`, text, rows: 1, columns: originalHeaders.length + legacy[id].columns.length,
        status: 'Processed', processor: id, generatedColumns: legacy[id].columns, problemRows: 0 });
      return { meta, text };
    });
    vi.resetModules();
    const { buildApp: restart } = await import('./app');
    const restarted = await restart(false);
    try {
      const files = (await restarted.inject('/api/files')).json<FileMeta[]>();
      for (const [name, status] of [['old_clean_status.csv', 'Ready'], ['old_invalid_status.csv', 'Needs Review'], ['missing_count_status.csv', 'Needs Review']] as const) {
        const original = (await listFiles()).find((f) => f.name === name)!;
        expect(files.find((f) => f.id === original.id)).toEqual({ ...original, status });
        expect((await restarted.inject(`/api/files/${original.id}/download`)).body)
          .toBe((await app.inject(`/api/files/${original.id}/download`)).body);
      }
      for (const { meta, text } of saved) {
        expect(files.find((f) => f.id === meta.id)).toEqual(meta);
        const preview = (await restarted.inject(`/api/files/${meta.id}/rows`)).json<FileRows>();
        expect(preview.generatedColumns).toEqual(meta.generatedColumns);
        expect((await restarted.inject(`/api/files/${meta.id}/download`)).body).toBe(text);
        const uploaded = (await restarted.inject({ method: 'POST', url: '/api/process', payload: { fileId: meta.id, processor: meta.processor } }));
        expect(uploaded.statusCode).toBe(400);
      }
      // A second legacy result of the same function is still comparable after restart.
      const other = files.find((f) => f.name === 'old_mass.csv')!;
      expect((await restarted.inject(`/api/compare?a=${saved[1].meta.id}&b=${other.id}`)).statusCode).toBe(200);
    } finally { await restarted.close(); }
  });
});

const listFiles = async () => (await app.inject('/api/files')).json<FileMeta[]>();
const fileNamed = async (name: string) => {
  const f = (await listFiles()).find((x) => x.name === name);
  if (!f) throw new Error(`no file named ${name}`);
  return f;
};
const rowsOf = async (id: string) => (await app.inject(`/api/files/${id}/rows`)).json<FileRows>();
const processFile = (fileId: string, processor: string) => app.inject({ method: 'POST', url: '/api/process', payload: { fileId, processor } });
const processSample = async (name: string, processor: ProcessorId) => (await processFile((await fileNamed(name)).id, processor)).json<FileMeta>();
const compare = (a: string, b: string) => app.inject(`/api/compare?a=${a}&b=${b}`);

/** Sends a real multipart upload, as the browser's file chooser does. */
async function upload(name: string, text: string) {
  const form = new FormData();
  form.append('file', new Blob([text], { type: 'text/csv' }), name);
  const req = new Request('http://localhost/', { method: 'POST', body: form });
  return app.inject({
    method: 'POST',
    url: '/api/files',
    headers: { 'content-type': req.headers.get('content-type')! },
    payload: Buffer.from(await req.arrayBuffer()),
  });
}

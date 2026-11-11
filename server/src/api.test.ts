// API tests: the real Fastify app, called in memory with app.inject(), using a throwaway data folder.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { codeOf, type CompareResult, type FileMeta, type ReplaceConflict, type FileRows, type GeneratedBatch, type ProcessorId } from '../../shared/types';
import { parseCsv, toCsv } from './lib/csv';
import { processors } from './processing';

// Storage reads RECLAIM_DATA_DIR when first imported, so set it before loading the app.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reclaim-api-'));
process.env.RECLAIM_DATA_DIR = dataDir;
const { buildApp } = await import('./app');
// The app's own storage instance; importing it later, after vi.resetModules(), would give a separate copy.
const { storage } = await import('./lib/storage');

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
    for (const f of files) expect(f).toMatchObject({ status: 'Needs Review', rows: 25, columns: 7, problemRows: f.name === 'partner_b_followup.csv' ? 2 : 1 });
    expect(files.map((f) => f.id)).toEqual(['100001', '100002', '100003', '100004', '100005']); // File IDs in name order
  });

  it('accepts an upload, previews its rows and downloads it with only its file_id added', async () => {
    const text = sample('partner_c_baseline.csv');
    const res = await upload('uploaded_c.csv', text);
    expect(res.statusCode).toBe(200);
    const meta = res.json<FileMeta>();
    expect(meta).toMatchObject({ name: 'uploaded_c.csv', status: 'Needs Review', rows: 25, columns: 7 });

    const preview = await rowsOf(meta.id);
    expect(preview.headers).toEqual(['material_ref', 'collection_date', 'quantity_g', 'R32_fraction', 'R125_fraction', 'R134a_fraction', 'file_id']);
    expect(preview.rows).toHaveLength(25);

    const download = await app.inject(`/api/files/${meta.id}/download`);
    expect(download.headers['content-disposition']).toBe(`attachment; filename="uploaded_c.csv"; filename*=UTF-8''uploaded_c.csv`);
    expect(parseCsv(download.body)).toEqual(storedInput(text, meta.id)); // the upload plus its file_id
  });

  it.each(['報告.csv', 'café_ñ.csv', "it's (final) * draft!.csv", 'résumé "v2".csv'])('downloads %s under its own name', async (name) => {
    const text = sample('partner_a_baseline.csv');
    const meta = (await upload(name, text)).json<FileMeta>();
    const download = await app.inject(`/api/files/${meta.id}/download`);
    expect(download.statusCode).toBe(200);
    expect(parseCsv(download.body)).toEqual(storedInput(text, meta.id));
    const header = download.headers['content-disposition'] as string;
    // RFC 5987: the exact name, UTF-8 and percent-encoded, for browsers that read filename*.
    const encoded = header.match(/filename\*=UTF-8''([^;\s]+)/)![1];
    expect(encoded).toMatch(/^[A-Za-z0-9%._~-]+$/);
    expect(decodeURIComponent(encoded)).toBe(meta.name);
    // A plain ASCII fallback for older clients, with nothing that could break the quoted string.
    const fallback = header.match(/filename="([^"]*)"/)![1];
    expect(fallback).toMatch(/^[\x20-\x7e]+$/);
    expect(fallback).not.toMatch(/["\\]/);
    expect(fallback.endsWith('.csv')).toBe(true);
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
    expect(second.id).toBe(first.id); // the same result ID, replaced
    expect(second.id).toBe(`${(await fileNamed('partner_a_baseline.csv')).id}-C`);
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
    const { files } = (await compare(a.id, c.id)).json<CompareResult>();
    expect(files[0].problems.items).toEqual([expect.objectContaining({ row: 8, message: 'mass missing' })]);
    expect(files[1].problems.items).toEqual([expect.objectContaining({ row: 18, message: expect.stringContaining('composition totals') })]);
  });

  it('fills in the count for files saved before it existed, at startup rather than when listing', async () => {
    const { storage, reconcileMetadata } = await import('./lib/storage');
    const id = (await fileNamed('partner_b_followup.csv')).id;
    await storage.patch(id, { problemRows: undefined });
    expect((await fileNamed('partner_b_followup.csv')).problemRows).toBeUndefined(); // listing leaves it alone
    await reconcileMetadata();
    expect((await fileNamed('partner_b_followup.csv')).problemRows).toBe(2);
  });
});

describe('comparing results', () => {
  it('compares two results from the same function', async () => {
    const a = await processSample('partner_a_baseline.csv', 'mass');
    const b = await processSample('partner_a_followup.csv', 'mass');
    const res = await compare(a.id, b.id);
    expect(res.statusCode).toBe(200);
    const { columns, files } = res.json<CompareResult>();
    expect(files.map((f) => [f.name, f.source, f.rows])).toEqual([[a.name, 'Partner A', 25], [b.name, 'Partner A', 25]]);
    expect(columns.map((c) => c.name)).toEqual(MASS_COLUMNS);
    expect(columns[0]).toMatchObject({ unit: 'kg', measure: 'total', rowsCompared: 25 });
    expect(columns[0].rowsDiffering).toBeGreaterThan(0);
    expect(columns[0].summary![1]).not.toBe(columns[0].summary![0]);
  });

  it("matches a partner's baseline and follow-up by batch ID", async () => {
    const a = await processSample('partner_a_baseline.csv', 'validation');
    const b = await processSample('partner_a_followup.csv', 'validation');
    const res = (await compare(a.id, b.id)).json<CompareResult>();
    expect(res.rowMatch).toBe('batch_id');
    expect(res.rows[0]).toEqual({ key: 'id:1:A-001', label: 'A-001', rowNumbers: [1, 1] });
    expect(res.rows).toHaveLength(25);
  });

  it('matches files from different partners by position, and compares up to five at once', async () => {
    const names = ['partner_a_baseline.csv', 'partner_a_followup.csv', 'partner_b_baseline.csv', 'partner_b_followup.csv', 'partner_c_baseline.csv'];
    const results = [];
    for (const name of names) results.push(await processSample(name, 'validation'));
    const res = await compare(...results.map((r) => r.id));
    expect(res.statusCode).toBe(200);
    const body = res.json<CompareResult>();
    expect(body.rowMatch).toBe('position');
    expect(body.files.map((f) => f.source)).toEqual(['Partner A', 'Partner A', 'Partner B', 'Partner B', 'Partner C']);
    expect(body.files.map((f) => f.problems.total)).toEqual([1, 1, 1, 2, 1]);
    expect(body.rows[0]).toEqual({ key: '#1', label: '#1', rowNumbers: [1, 1, 1, 1, 1] });
    const total = body.columns.find((c) => c.name === 'composition_total_pct')!;
    expect(total.summary).toHaveLength(5);
    expect(total.values[0]).toHaveLength(5);
    const status = body.columns.find((c) => c.name === 'processing_status')!;
    expect(status.categories).toEqual(expect.arrayContaining([{ label: 'Invalid', counts: [1, 1, 1, 2, 1] }]));
  });

  it.each([
    ['one file', 1, 'Choose 2 to 5 results to compare'],
    ['six files', 6, 'Choose 2 to 5 results to compare'],
  ])('rejects %s', async (_, n, message) => {
    const result = await processSample('partner_c_baseline.csv', 'validation');
    const res = await compare(...Array.from({ length: n }, (_, i) => (i === 0 ? result.id : `other-${i}`)));
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(message);
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
    expect((await compare(result.id, result.id)).json().message).toBe('Choose different files');
    expect((await compare(result.id, input.id)).json().message).toContain('is an input file');
  });
});

describe('current result contract', () => {
  // Planted problems, with the exact reasons documented in the README.
  const samples = [
    ['partner_a_baseline.csv', [8], ['mass missing']],
    ['partner_a_followup.csv', [13], ['R-125 out of range']],
    ['partner_b_baseline.csv', [5], ['mass invalid']],
    ['partner_b_followup.csv', [10, 11], ['duplicate batch ID B-010', 'duplicate batch ID B-010']],
    ['partner_c_baseline.csv', [18], ['composition totals 78.37%']],
  ] as const;
  const cases = samples.flatMap(([name, invalid, reasons]) =>
    (['validation', 'mass', 'classification'] as const).map((id) => ({ name, invalid, reasons, id })));

  it.each(cases)('$name / $id retains every row and round-trips its exact schema', async ({ name, invalid, reasons, id }) => {
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
    expect(invalid.map((row) => after.rows[row - 1].validation_errors)).toEqual(reasons);
    after.rows.forEach((r, i) => {
      before.headers.forEach((h) => expect(r[h]).toBe(before.rows[i][h]));
      expect([r.file_id, r.result_id]).toEqual([source.id, result.id]); // the input's ID travels into the result
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
    // An unchanged export of a sample's result links back to that sample.
    expect(imported).toMatchObject({ status: 'Processed', processor: id, generatedColumns: result.generatedColumns, imported: true, sourceId: source.id, importedFrom: source.id });
    expect((await rowsOf(imported.id)).generatedColumns).toEqual(after.generatedColumns);
    // The copy is a new file with its own result_id; file_id still names its original, and every other value is unchanged.
    const copy = parseCsv((await app.inject(`/api/files/${imported.id}/download`)).body);
    expect(copy.headers).toEqual(after.headers);
    expect(copy.rows).toEqual(after.rows.map((r) => ({ ...r, file_id: source.id, result_id: imported.id })));
    const compared = await compare(result.id, imported.id);
    expect(compared.statusCode).toBe(200);
    expect(compared.json<CompareResult>().columns.every((c) => c.rowsDiffering === 0)).toBe(true);
    if (id === 'mass') {
      const col = compared.json<CompareResult>().columns[0];
      expect(col.summary![0]).toBeCloseTo(after.rows.reduce((s, r) => s + Number(r.r32_mass_kg || 0), 0), 8);
      for (const row of invalid) expect(col.values[row - 1]).toEqual([null, null]);
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
    expect(parseCsv((await app.inject(`/api/files/${input.id}/download`)).body)).toEqual(storedInput(csv, input.id));
  });

  it('compares actual CSV schemas even if stored generated-column metadata is stale', async () => {
    const result = await processSample('partner_a_baseline.csv', 'mass');
    const text = (await app.inject(`/api/files/${result.id}/download`)).body;
    const imported = (await upload('current_mass_stale_metadata.csv', text)).json<FileMeta>();
    const { storage } = await import('./lib/storage');
    await storage.patch(imported.id, { generatedColumns: ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status'] });
    const response = await compare(imported.id, result.id);
    expect(response.statusCode).toBe(200);
    // result_id is never compared: it always differs between files.
    expect(response.json().columns.map((c: { name: string }) => c.name)).toEqual(processors.mass.columns.filter((c) => c !== 'result_id'));
    expect(parseCsv((await app.inject(`/api/files/${imported.id}/download`)).body).rows[0].result_id).toBe(imported.id);
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
    // A shared sample other tests also process, so the re-run is confirmed.
    const response = await processFile(source.id, processor, true);
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

  it('lists without writing, and reconciles old statuses and missing counts once at startup', async () => {
    const { storage, reconcileMetadata } = await import('./lib/storage');
    const cleanMeta = (await upload('old_clean_status.csv', clean)).json<FileMeta>();
    const invalid = (await upload('old_invalid_status.csv', clean.replace(',100,', ',,'))).json<FileMeta>();
    const missing = (await upload('missing_count_status.csv', clean.replace(',100,', ',,'))).json<FileMeta>();
    const result = await processSample('partner_a_baseline.csv', 'mass');
    await storage.patch(cleanMeta.id, { status: 'Needs Review' });
    await storage.patch(invalid.id, { status: 'Ready' });
    await storage.patch(missing.id, { status: 'Ready', problemRows: undefined });
    await storage.patch(result.id, { problemRows: undefined });
    const read = vi.spyOn(storage, 'read');
    const patch = vi.spyOn(storage, 'patch');
    const create = vi.spyOn(storage, 'create');
    const put = vi.spyOn(storage, 'put');
    try {
      // Listing is a pure read: it shows what is stored and never reads CSVs or writes.
      const stale = await listFiles();
      expect(stale.find((f) => f.id === cleanMeta.id)?.status).toBe('Needs Review');
      expect(stale.find((f) => f.id === missing.id)?.problemRows).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
      expect(patch).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();

      const { updated, skipped } = await reconcileMetadata();
      expect(updated.sort()).toEqual([cleanMeta.name, invalid.name, missing.name, result.name].sort());
      expect(skipped).toEqual([]);
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
      expect((await reconcileMetadata()).updated).toEqual([]); // nothing left to correct
      expect(read).not.toHaveBeenCalled();
      expect(patch).not.toHaveBeenCalled();
    } finally { read.mockRestore(); patch.mockRestore(); create.mockRestore(); put.mockRestore(); }
    for (const [meta, text] of [[cleanMeta, clean], [invalid, clean.replace(',100,', ',,')], [missing, clean.replace(',100,', ',,')]] as const)
      expect(parseCsv((await app.inject(`/api/files/${meta.id}/download`)).body)).toEqual(storedInput(text, meta.id));
  });

  it('skips a stored file it cannot read instead of failing startup or the list', async () => {
    const { storage, reconcileMetadata } = await import('./lib/storage');
    const broken = await storage.create({ name: 'unreadable_old_file.csv', text: 'batch_id,sample_date\nA-1,2026-09-01,extra\n', rows: 1, columns: 2, status: 'Ready' });
    expect((await reconcileMetadata()).skipped).toEqual([broken.name]);
    const listed = await app.inject('/api/files');
    expect(listed.statusCode).toBe(200);
    expect(listed.json<FileMeta[]>().find((f) => f.id === broken.id)).toEqual(broken);
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
    const saved = await Promise.all((['validation', 'mass', 'classification'] as const).map(async (id) => {
      const text = legacyCsv(id);
      const meta = await storage.create({ name: `persisted_${id}.csv`, text, rows: 1, columns: originalHeaders.length + legacy[id].columns.length,
        status: 'Processed', processor: id, generatedColumns: legacy[id].columns, problemRows: 0 }, codeOf(id));
      return { meta, text };
    }));
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
      expect((await restarted.inject(`/api/compare?ids=${saved[1].meta.id},${other.id}`)).statusCode).toBe(200);
    } finally { await restarted.close(); }
  });
});

describe('File IDs', () => {
  const csv = sample('partner_a_baseline.csv');

  it('gives every upload the next base ID, even for the same file', async () => {
    const first = (await upload('ids_first.csv', csv)).json<FileMeta>();
    const again = (await upload('ids_first.csv', csv)).json<FileMeta>();
    expect(first.id).toMatch(/^\d{6}$/);
    expect(Number(again.id)).toBe(Number(first.id) + 1);
  });

  it('names each result after its input ID and function code, and keeps the name as a label', async () => {
    const input = (await upload('ids_input.csv', csv)).json<FileMeta>();
    for (const processor of ['validation', 'mass', 'classification'] as const) {
      const result = (await processFile(input.id, processor)).json<FileMeta>();
      expect(result).toMatchObject({ id: `${input.id}-${codeOf(processor)}`, sourceId: input.id, name: `result_ids_input_${processor}.csv` });
    }
  });

  it('keeps separate results for two inputs with the same name', async () => {
    const a = (await upload('twin.csv', csv)).json<FileMeta>();
    const b = (await upload('twin.csv', sample('partner_a_followup.csv'))).json<FileMeta>();
    const ra = (await processFile(a.id, 'mass')).json<FileMeta>();
    const rb = (await processFile(b.id, 'mass')).json<FileMeta>();
    expect([ra.id, rb.id]).toEqual([`${a.id}-M`, `${b.id}-M`]);
    const results = (await listFiles()).filter((f) => f.name === 'result_twin_mass.csv');
    expect(results.map((f) => f.id).sort()).toEqual([ra.id, rb.id].sort()); // neither replaced the other
    expect((await rowsOf(ra.id)).rows[7].r32_mass_kg).toBe(''); // a's row 8 has no mass
    expect((await rowsOf(rb.id)).rows[7].r32_mass_kg).not.toBe('');
  });

  it('replaces a confirmed re-run result in place, keeping its ID and nothing else', async () => {
    const input = (await upload('rerun_ids.csv', csv)).json<FileMeta>();
    const first = (await processFile(input.id, 'validation')).json<FileMeta>();
    const second = (await processFile(input.id, 'validation', true)).json<FileMeta>();
    expect(second.id).toBe(first.id);
    expect((await listFiles()).filter((f) => f.id === first.id)).toEqual([second]);
  });

  it('gives an uploaded result a new base ID plus its function code', async () => {
    const input = (await upload('export_source.csv', csv)).json<FileMeta>();
    const result = (await processFile(input.id, 'mass')).json<FileMeta>();
    const text = (await app.inject(`/api/files/${result.id}/download`)).body;
    const imported = (await upload('my_copy.csv', text)).json<FileMeta>();
    expect(imported.id).toMatch(/^\d{6}-M$/);
    expect(Number(imported.id.slice(0, 6))).toBeGreaterThan(Number(input.id));
    expect(imported).toMatchObject({ status: 'Processed', processor: 'mass' });
  });

  it.each(['abc', '..%2Fmeta', '100000', '10101', '101010-m', '101010-X', '1010100'])('treats %s as an unknown file', async (id) => {
    expect((await app.inject(`/api/files/${id}/rows`)).statusCode).toBe(404);
    expect((await app.inject(`/api/files/${id}/download`)).statusCode).toBe(404);
    expect((await processFile(id, 'mass')).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/files/archive', payload: { ids: [id], archived: true } })).statusCode).toBe(404);
  });

  it('refuses to start on data saved before File IDs, without deleting it', async () => {
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'reclaim-old-'));
    const meta = path.join(old, 'meta.json');
    fs.writeFileSync(meta, JSON.stringify([{ id: '0b6c5a8e-3c1f-4e7a-9f2d-6d1a2b3c4d5e', name: 'old.csv', rows: 1, columns: 6, uploadedAt: '', status: 'Ready' }]));
    vi.stubEnv('RECLAIM_DATA_DIR', old);
    vi.resetModules();
    try {
      await expect(import('./lib/storage')).rejects.toThrow(/created before File IDs\. Stop the server, delete that folder/);
      expect(fs.existsSync(meta)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      fs.rmSync(old, { recursive: true, force: true });
    }
  });
});

describe('replacing a result', () => {
  const csv = sample('partner_a_baseline.csv');
  const download = async (id: string) => (await app.inject(`/api/files/${id}/download`)).body;

  it('runs a first time without asking, even when replace is sent', async () => {
    const input = (await upload('first_run.csv', csv)).json<FileMeta>();
    expect((await processFile(input.id, 'mass')).statusCode).toBe(200);
    expect((await processFile(input.id, 'validation', true)).statusCode).toBe(200);
  });

  it.each([undefined, false])('refuses a re-run that does not confirm (replace: %s) and changes nothing', async (replace) => {
    const input = (await upload('refused.csv', csv)).json<FileMeta>();
    const first = (await processFile(input.id, 'validation')).json<FileMeta>();
    const text = await download(first.id);
    const before = await listFiles();
    const res = await processFile(input.id, 'validation', replace);
    expect(res.statusCode).toBe(409);
    expect(res.json<ReplaceConflict>()).toEqual({
      message: `Composition Validation has already been run for file ${input.id}. Confirm to replace the existing result ${first.id}.`,
      existing: { id: first.id, name: first.name },
    });
    expect(await listFiles()).toEqual(before);
    expect(await download(first.id)).toBe(text);
  });

  it('only asks about the same function: other results of the input are separate', async () => {
    const input = (await upload('other_function.csv', csv)).json<FileMeta>();
    await processFile(input.id, 'validation');
    expect((await processFile(input.id, 'mass')).statusCode).toBe(200);
    expect((await processFile(input.id, 'mass')).statusCode).toBe(409);
  });

  it('creates a file at an exact ID only once in local storage, leaving an existing one unchanged', async () => {
    const input = (await upload('create_at.csv', csv)).json<FileMeta>();
    const id = `${input.id}-C`;
    const first = await storage.createAt(id, { name: 'result_create_at_classification.csv', text: 'first', rows: 1, columns: 1, status: 'Processed' });
    expect(first).toMatchObject({ id, name: 'result_create_at_classification.csv' });
    expect(await storage.createAt(id, { name: 'other.csv', text: 'second', rows: 1, columns: 1, status: 'Processed' })).toBeUndefined();
    expect(await download(id)).toBe('first');
    expect((await listFiles()).filter((f) => f.id === id)).toEqual([first]);
  });

  it('lets only one of two simultaneous first runs save the result; the other is refused', async () => {
    const input = (await upload('simultaneous.csv', csv)).json<FileMeta>();
    // Hold both requests at the input read, after each has checked that no result exists yet, so
    // both pass that check before either saves: the race the create-if-absent write closes.
    const read = storage.read.bind(storage);
    const waiting: (() => void)[] = [];
    const spy = vi.spyOn(storage, 'read').mockImplementation(async (id: string) => {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
        if (waiting.length === 2) waiting.forEach((release) => release());
      });
      return read(id);
    });
    let responses;
    try {
      responses = await Promise.all([processFile(input.id, 'validation'), processFile(input.id, 'validation')]);
    } finally {
      spy.mockRestore();
    }
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const saved = responses.find((r) => r.statusCode === 200)!.json<FileMeta>();
    expect(responses.find((r) => r.statusCode === 409)!.json<ReplaceConflict>()).toEqual({
      message: `Composition Validation has already been run for file ${input.id}. Confirm to replace the existing result ${saved.id}.`,
      existing: { id: saved.id, name: saved.name },
    });
    expect((await listFiles()).filter((f) => f.id === saved.id)).toEqual([saved]);
  });

  it('overwrites a confirmed re-run under the same ID with new content', async () => {
    const input = (await upload('confirmed.csv', csv)).json<FileMeta>();
    const first = (await processFile(input.id, 'mass')).json<FileMeta>();
    // Rewrite the stored result so the replacement is visibly new content.
    const { storage } = await import('./lib/storage');
    await storage.put(first.id, { ...first, text: (await download(first.id)).replace(/,Valid,/g, ',STALE,') });
    expect(await download(first.id)).toContain(',STALE,');
    const res = await processFile(input.id, 'mass', true);
    expect(res.statusCode).toBe(200);
    const second = res.json<FileMeta>();
    expect(second).toMatchObject({ id: first.id, name: first.name, sourceId: input.id });
    expect(await download(first.id)).not.toContain(',STALE,');
    expect((await listFiles()).filter((f) => f.id === first.id)).toEqual([second]);
  });
});

describe('File ID columns', () => {
  const csv = sample('partner_b_baseline.csv');
  const download = async (id: string) => parseCsv((await app.inject(`/api/files/${id}/download`)).body);

  it('stores every input with its file_id on every row, samples included', async () => {
    const input = (await upload('carry_id.csv', csv)).json<FileMeta>();
    const stored = await download(input.id);
    expect(stored.headers.at(-1)).toBe('file_id');
    expect(new Set(stored.rows.map((r) => r.file_id))).toEqual(new Set([input.id]));
    const sampleRows = (await download('100001')).rows;
    expect(sampleRows.every((r) => r.file_id === '100001')).toBe(true);
    expect(input.problemRows).toBe(1); // the extra column changes nothing about validation
  });

  it('gives a re-uploaded input a new file_id instead of a second column', async () => {
    const first = (await upload('travel.csv', csv)).json<FileMeta>();
    const exported = (await app.inject(`/api/files/${first.id}/download`)).body;
    const again = (await upload('travel_copy.csv', exported)).json<FileMeta>();
    const stored = await download(again.id);
    expect(stored.headers.filter((h) => h === 'file_id')).toHaveLength(1);
    expect(stored.rows.every((r) => r.file_id === again.id)).toBe(true);
    expect(again.columns).toBe(first.columns);
    expect(again.imported).toBeUndefined(); // an input is never "Imported"
  });

  it('starts every result with result_id after the input columns, including file_id', async () => {
    const input = (await upload('ids_in_result.csv', csv)).json<FileMeta>();
    const result = (await processFile(input.id, 'validation')).json<FileMeta>();
    const stored = await download(result.id);
    expect(stored.headers.slice(-4)).toEqual(['result_id', 'composition_total_pct', 'processing_status', 'validation_errors']);
    expect(stored.rows.every((r) => r.file_id === input.id && r.result_id === result.id)).toBe(true);
    expect(result.imported).toBeUndefined();
  });

  it('keeps recognising, storing unchanged and comparing results exported before ID columns', async () => {
    const input = (await upload('pre_ids.csv', csv)).json<FileMeta>();
    const result = (await processFile(input.id, 'mass')).json<FileMeta>();
    const current = await download(result.id);
    // An export made before File ID columns: no file_id, no result_id.
    const headers = current.headers.filter((h) => h !== 'file_id' && h !== 'result_id');
    const oldText = [headers.join(','), ...current.rows.map((r) => headers.map((h) => r[h]).join(','))].join('\n');
    const old = (await upload('old_export.csv', oldText)).json<FileMeta>();
    expect(old).toMatchObject({ status: 'Processed', processor: 'mass', imported: true });
    expect(old.sourceId).toBeUndefined(); // no file_id to link by, and no provenance to keep
    expect(old.importedFrom).toBeUndefined();
    expect(old.id).toMatch(/^\d{6}-M$/);
    expect((await app.inject(`/api/files/${old.id}/download`)).body).toBe(oldText);
    const compared = await compare(result.id, old.id);
    expect(compared.statusCode).toBe(200);
    expect(compared.json<CompareResult>().columns.every((c) => c.rowsDiffering === 0)).toBe(true);
  });
});

describe('archiving', () => {
  const archive = (ids: string[], archived: boolean) => app.inject({ method: 'POST', url: '/api/files/archive', payload: { ids, archived } });

  it('archives and restores several files, changing nothing else', async () => {
    const input = (await upload('archive_me.csv', sample('partner_a_baseline.csv'))).json<FileMeta>();
    const result = (await processFile(input.id, 'mass')).json<FileMeta>();
    const text = (await app.inject(`/api/files/${result.id}/download`)).body;

    const before = Date.now();
    const res = await archive([input.id, result.id, input.id], true);
    expect(res.statusCode).toBe(200);
    const [archivedInput, archivedResult] = res.json<FileMeta[]>();
    expect(archivedInput).toEqual({ ...input, archived: true, archivedAt: expect.any(String) });
    expect(archivedResult).toEqual({ ...result, archived: true, archivedAt: archivedInput.archivedAt }); // one time for the batch
    expect(Date.parse(archivedInput.archivedAt!)).toBeGreaterThanOrEqual(before);
    const listed = await listFiles();
    expect(listed.find((f) => f.id === input.id)).toEqual(archivedInput);
    expect(listed.find((f) => f.id === result.id)).toEqual(archivedResult);
    expect((await app.inject(`/api/files/${result.id}/download`)).body).toBe(text);

    // Restoring clears the archive time.
    expect((await archive([input.id, result.id], false)).json<FileMeta[]>()).toEqual([{ ...input, archived: false }, { ...result, archived: false }]);
    const restored = (await listFiles()).filter((f) => f.id === input.id || f.id === result.id);
    expect(restored).toEqual([{ ...input, archived: false }, { ...result, archived: false }]);
    expect(restored.every((f) => !('archivedAt' in f))).toBe(true);
  });

  it('refuses to process an archived input until it is restored', async () => {
    const input = (await upload('archived_input.csv', sample('partner_a_baseline.csv'))).json<FileMeta>();
    await archive([input.id], true);
    const res = await processFile(input.id, 'validation');
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Restore archived_input.csv before processing it');
    await archive([input.id], false);
    expect((await processFile(input.id, 'validation')).statusCode).toBe(200);
  });

  it('brings back an archived result when its function runs again', async () => {
    const input = (await upload('rerun.csv', sample('partner_a_baseline.csv'))).json<FileMeta>();
    const first = (await processFile(input.id, 'classification')).json<FileMeta>();
    await archive([first.id], true);
    const refused = await processFile(input.id, 'classification');
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ReplaceConflict>().existing).toEqual({ id: first.id, name: first.name, archived: true }); // the dialog can say it is archived
    const second = (await processFile(input.id, 'classification', true)).json<FileMeta>();
    const results = (await listFiles()).filter((f) => f.name === 'result_rerun_classification.csv');
    expect(results).toEqual([second]);
    expect(second.archived).toBeUndefined();
  });

  it('changes nothing when any file is missing', async () => {
    const input = (await upload('kept.csv', sample('partner_a_baseline.csv'))).json<FileMeta>();
    const res = await archive([input.id, 'missing'], true);
    expect(res.statusCode).toBe(404);
    expect((await listFiles()).find((f) => f.id === input.id)?.archived).toBeUndefined();
  });

  it.each([
    ['no files', { ids: [], archived: true }],
    ['no archived flag', { ids: ['x'] }],
    ['a non-boolean flag', { ids: ['x'], archived: 'yes' }],
  ])('rejects a request with %s', async (_, payload) => {
    const res = await app.inject({ method: 'POST', url: '/api/files/archive', payload });
    expect(res.statusCode).toBe(400);
  });
});

describe('generating CSVs', () => {
  const generate = (payload: object) => app.inject({ method: 'POST', url: '/api/generate', payload });

  it('returns a partner CSV and its planted errors without saving anything', async () => {
    const before = (await listFiles()).length;
    const res = await generate({ partner: 'B', rows: 10, errorRows: 2, seed: 4 });
    expect(res.statusCode).toBe(200);
    const { files } = res.json<GeneratedBatch>();
    expect(files).toHaveLength(1); // one file unless asked for more
    const [file] = files;
    expect(file).toMatchObject({ partner: 'B', rows: 10 });
    expect(file.name).toMatch(/^partnerB-\d{8}-001\.csv$/);
    expect(parseCsv(file.text).headers).toEqual(['lot_number', 'collected_on', 'weight_lb', 'hfc32_percent', 'hfc125_percent', 'hfc134a_percent']);
    expect(file.errors).toHaveLength(2);
    expect((await listFiles()).length).toBe(before);
  });

  it.each([[0, 'Ready'], [3, 'Needs Review']] as const)('uploads a generated file with %s error rows as %s, like any partner CSV', async (errorRows, status) => {
    const [file] = (await generate({ partner: 'C', rows: 12, errorRows, seed: 9 })).json<GeneratedBatch>().files;
    const meta = (await upload(file.name, file.text)).json<FileMeta>();
    expect(meta).toMatchObject({ name: file.name, rows: 12, columns: 7, problemRows: errorRows, status });
  });

  it('makes several files with different data and names, each uploadable', async () => {
    const { files } = (await generate({ partner: 'A', rows: 8, errorRows: 1, files: 4 })).json<GeneratedBatch>();
    expect(files.map((f) => f.name.replace(/-\d{8}-/, '-DATE-'))).toEqual(['001', '002', '003', '004'].map((n) => `partnerA-DATE-${n}.csv`));
    expect(new Set(files.map((f) => f.text)).size).toBe(4);
    for (const f of files) expect((await upload(f.name, f.text)).json<FileMeta>()).toMatchObject({ rows: 8, problemRows: 1 });
  });

  it('never repeats a file across requests with the same settings', async () => {
    const texts = new Set<string>();
    for (let i = 0; i < 5; i++) for (const f of (await generate({ partner: 'B', rows: 3, errorRows: 0, files: 2 })).json<GeneratedBatch>().files) texts.add(f.text);
    expect(texts.size).toBe(10);
  });

  it.each([
    [{ partner: 'A', rows: 5, errorRows: 0, files: 0 }, 'Generate at least 1 file'],
    [{ partner: 'A', rows: 5, errorRows: 0, files: 11 }, 'Generate at most 10 files at a time'],
    [{ partner: 'A', rows: 5, errorRows: 0, files: 1.5 }, 'Number of files must be a whole number'],
    [{ partner: 'D', rows: 5, errorRows: 0 }, 'Choose partner A, B or C'],
    [{ partner: 'A', rows: 0, errorRows: 0 }, 'Generate at least 1 row'],
    [{ partner: 'A', rows: 5001, errorRows: 0 }, 'Generate at most 5000 rows'],
    [{ partner: 'A', rows: 2.5, errorRows: 0 }, 'Rows must be a whole number'],
    [{ partner: 'A', rows: 5, errorRows: 6 }, 'Rows with errors must be a whole number from 0 to the number of rows.'],
    [{ partner: 'A', rows: 5, errorRows: -1 }, 'Rows with errors cannot be negative'],
    [{ partner: 'A', rows: '5', errorRows: 0 }, 'Rows must be a number'],
  ])('rejects %j', async (payload, message) => {
    const res = await generate(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe(message);
  });
});

/** What a stored input looks like: the uploaded CSV plus file_id (its File ID) on every row. */
const storedInput = (text: string, id: string) => {
  const { headers, rows } = parseCsv(text);
  return { headers: [...headers, 'file_id'], rows: rows.map((r) => ({ ...r, file_id: id })) };
};
describe('file identity regression', () => {
  // One scenario per function, so every suffix (-V, -M, -C) is covered. Each run uploads its own files.
  const body = async (id: string) => (await app.inject(`/api/files/${id}/download`)).body;
  const metaOf = async (id: string) => (await listFiles()).filter((f) => f.id === id);

  it.each(PROCESSOR_IDS)('keeps same-named files apart through every action, by full ID (%s)', async (fn) => {
    const code = codeOf(fn);
    // 1. Three uploads share a filename; the first and third also share their content.
    const [a, b, c] = [
      (await upload('identity.csv', sample('partner_a_baseline.csv'))).json<FileMeta>(),
      (await upload('identity.csv', sample('partner_a_followup.csv'))).json<FileMeta>(),
      (await upload('identity.csv', sample('partner_a_baseline.csv'))).json<FileMeta>(),
    ];
    expect([a.name, b.name, c.name]).toEqual(['identity.csv', 'identity.csv', 'identity.csv']);
    expect(Number(b.id)).toBe(Number(a.id) + 1);
    expect(Number(c.id)).toBe(Number(b.id) + 1);
    for (const input of [a, b, c]) expect((await rowsOf(input.id)).rows.every((r) => r.file_id === input.id)).toBe(true);

    // 2. Each input gets its own result, named alike but identified by its input's ID plus the code.
    const results = [];
    for (const input of [a, b, c]) results.push((await processFile(input.id, fn)).json<FileMeta>());
    const [ra, rb, rc] = results;
    expect(results.map((r) => r.id)).toEqual([`${a.id}-${code}`, `${b.id}-${code}`, `${c.id}-${code}`]);
    expect(new Set(results.map((r) => r.name))).toEqual(new Set([`result_identity_${fn}.csv`]));
    for (const [result, input] of [[ra, a], [rb, b], [rc, c]] as const) {
      const rows = (await rowsOf(result.id)).rows;
      expect(rows.every((r) => r.result_id === result.id && r.file_id === input.id)).toBe(true);
    }
    expect(await body(ra.id)).not.toBe(await body(rb.id));
    const before = { a: await body(ra.id), b: await body(rb.id), c: await body(rc.id) };

    // 3. A repeat run that is not confirmed is refused and changes nothing.
    const refused = await processFile(a.id, fn);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ReplaceConflict>().existing.id).toBe(ra.id);
    expect({ a: await body(ra.id), b: await body(rb.id), c: await body(rc.id) }).toEqual(before);

    // 4. A confirmed repeat replaces exactly that one result, under the same ID.
    const replaced = await processFile(a.id, fn, true);
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json<FileMeta>().id).toBe(ra.id);
    expect(await metaOf(ra.id)).toHaveLength(1);
    expect(await body(rb.id)).toBe(before.b);
    expect(await body(rc.id)).toBe(before.c);

    // 5. Archive and restore act on one ID, not on every file with that name.
    await app.inject({ method: 'POST', url: '/api/files/archive', payload: { ids: [rb.id], archived: true } });
    const named = (await listFiles()).filter((f) => f.name === `result_identity_${fn}.csv` && [ra.id, rb.id, rc.id].includes(f.id));
    expect(named.filter((f) => f.archived).map((f) => f.id)).toEqual([rb.id]);
    await app.inject({ method: 'POST', url: '/api/files/archive', payload: { ids: [rb.id], archived: false } });
    expect((await metaOf(rb.id))[0].archived).toBeFalsy();
    expect(await body(rb.id)).toBe(before.b);

    // 6. Downloads share the filename label but each carries its own data and result_id.
    const downloads = await Promise.all([ra, rb].map((r) => app.inject(`/api/files/${r.id}/download`)));
    expect(downloads[0].headers['content-disposition']).toBe(downloads[1].headers['content-disposition']);
    expect(parseCsv(downloads[0].body).rows[0].result_id).toBe(ra.id);
    expect(parseCsv(downloads[1].body).rows[0].result_id).toBe(rb.id);

    // 7. Re-uploads follow the 11.7 rule: an unchanged copy links; an edited copy keeps its source but is not linked.
    const linked = (await upload(`result_identity_${fn}.csv`, downloads[0].body)).json<FileMeta>();
    expect(linked.id).toMatch(new RegExp(`^[0-9]{6}-${code}$`));
    expect(Number(linked.id.slice(0, 6))).toBeGreaterThan(Number(c.id));
    expect(linked.imported).toBe(true);
    expect(linked.sourceId).toBe(a.id);
    expect(linked.importedFrom).toBe(a.id);
    const copy = parseCsv(downloads[1].body);
    const column = copy.headers[1]; // an original partner column
    const edited = (await upload(`result_identity_${fn}.csv`, toCsv(copy.headers, copy.rows.map((r, i) => (i === 0 ? { ...r, [column]: `${r[column]}0` } : r))))).json<FileMeta>();
    expect(edited.imported).toBe(true);
    expect(edited.sourceId).toBeUndefined();
    expect(edited.importedFrom).toBe(b.id);
    expect(await body(rb.id)).toBe(before.b);
    expect(await metaOf(ra.id)).toHaveLength(1);

    // 8. Comparisons are keyed by full ID, in request order, even when names repeat.
    const two = await compare(ra.id, rb.id);
    expect(two.statusCode).toBe(200);
    expect(two.json<CompareResult>().files.map((f) => f.id)).toEqual([ra.id, rb.id]);
    const fiveIds = [rc.id, linked.id, ra.id, edited.id, rb.id];
    const five = await compare(...fiveIds);
    expect(five.statusCode).toBe(200);
    expect(five.json<CompareResult>().files.map((f) => f.id)).toEqual(fiveIds);

    // 9. A filename is never a File ID.
    expect((await app.inject('/api/files/identity.csv/rows')).statusCode).toBe(404);
    expect((await app.inject('/api/files/identity.csv/download')).statusCode).toBe(404);
    expect((await processFile('identity.csv', fn)).statusCode).toBe(404);
  });
});

describe('linking imported results', () => {
  const csv = sample('partner_a_baseline.csv');
  const exportOf = async (id: string) => parseCsv((await app.inject(`/api/files/${id}/download`)).body);
  const reupload = async (name: string, headers: string[], rows: Record<string, string>[]) =>
    (await upload(name, toCsv(headers, rows))).json<FileMeta>();
  /** A fresh input, its Validation result and that result's export. */
  async function exported() {
    const input = (await upload('link_source.csv', csv)).json<FileMeta>();
    const result = (await processFile(input.id, 'validation')).json<FileMeta>();
    return { input, result, ...(await exportOf(result.id)) };
  }
  const unlinked = (meta: FileMeta) => {
    expect(meta).toMatchObject({ status: 'Processed', processor: 'validation', imported: true });
    expect(meta.sourceId).toBeUndefined();
  };

  it('links an unchanged export to its original, under a new ID that keeps the original in file_id', async () => {
    const { input, result, headers, rows } = await exported();
    const copy = await reupload('my_copy.csv', headers, rows);
    expect(copy.id).toMatch(/^\d{6}-V$/);
    expect(copy.id).not.toBe(result.id);
    expect(copy).toMatchObject({ imported: true, sourceId: input.id, importedFrom: input.id });
    const stored = await exportOf(copy.id);
    expect(stored.rows.every((r) => r.file_id === input.id && r.result_id === copy.id)).toBe(true);
    // The original's own result is untouched, and re-running it still asks before replacing that result.
    expect((await rowsOf(result.id)).rows[0].result_id).toBe(result.id);
    const again = await processFile(input.id, 'validation');
    expect(again.statusCode).toBe(409);
    expect(again.json<ReplaceConflict>().existing.id).toBe(result.id);
  });

  it('links an export whose original columns are in another order', async () => {
    const { input, headers, rows } = await exported();
    const swapped = [headers[1], headers[0], ...headers.slice(2)];
    expect(await reupload('reordered.csv', swapped, rows)).toMatchObject({ sourceId: input.id, importedFrom: input.id });
  });

  it('links to an archived original', async () => {
    const { input, headers, rows } = await exported();
    await app.inject({ method: 'POST', url: '/api/files/archive', payload: { ids: [input.id], archived: true } });
    expect(await reupload('archived_source.csv', headers, rows)).toMatchObject({ sourceId: input.id, importedFrom: input.id });
  });

  it('keeps the named source but does not link when the data differs', async () => {
    const { input, headers, rows } = await exported();
    const column = headers[1]; // an original partner column
    const edited = await reupload('edited.csv', headers, rows.map((r, i) => (i === 0 ? { ...r, [column]: `${r[column]}0` } : r)));
    const shorter = await reupload('shorter.csv', headers, rows.slice(1));
    const wider = await reupload('wider.csv', ['notes', ...headers], rows.map((r) => ({ ...r, notes: 'x' })));
    for (const meta of [edited, shorter, wider]) {
      unlinked(meta);
      expect(meta.importedFrom).toBe(input.id);
      // Not linked, so file_id carries the copy's own new base ID.
      expect((await exportOf(meta.id)).rows.every((r) => r.file_id === meta.id.slice(0, 6))).toBe(true);
    }
  });

  it('does not link when file_id is mixed, unknown, a result ID or another input', async () => {
    const { input, result, headers, rows } = await exported();
    const other = (await upload('other_input.csv', sample('partner_b_baseline.csv'))).json<FileMeta>();
    const withFileId = (value: string) => rows.map((r) => ({ ...r, file_id: value }));
    const mixed = await reupload('mixed.csv', headers, rows.map((r, i) => ({ ...r, file_id: i === 0 ? other.id : input.id })));
    unlinked(mixed);
    expect(mixed.importedFrom).toBeUndefined();
    const cases: [string, string][] = [['999999', 'unknown.csv'], [result.id, 'result_id.csv'], [other.id, 'other.csv']];
    for (const [value, name] of cases) {
      const meta = await reupload(name, headers, withFileId(value));
      unlinked(meta);
      expect(meta.importedFrom).toBe(value);
    }
  });
});

const PROCESSOR_IDS = ['validation', 'mass', 'classification'] as const;
const listFiles = async () => (await app.inject('/api/files')).json<FileMeta[]>();
const fileNamed = async (name: string) => {
  const f = (await listFiles()).find((x) => x.name === name);
  if (!f) throw new Error(`no file named ${name}`);
  return f;
};
const rowsOf = async (id: string) => (await app.inject(`/api/files/${id}/rows`)).json<FileRows>();
const processFile = (fileId: string, processor: string, replace?: boolean) =>
  app.inject({ method: 'POST', url: '/api/process', payload: { fileId, processor, replace } });
// Samples are shared by many tests, so re-runs of them are confirmed; 'replacing a result' covers the refusal.
const processSample = async (name: string, processor: ProcessorId) => (await processFile((await fileNamed(name)).id, processor, true)).json<FileMeta>();
const compare = (...ids: string[]) => app.inject(`/api/compare?ids=${ids.join(',')}`);

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

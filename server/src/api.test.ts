// API tests: the real Fastify app, called in memory with app.inject(), using a throwaway data folder.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { FileMeta, FileRows, ProcessorId } from '../../shared/types';

// Storage reads RECLAIM_DATA_DIR when first imported, so set it before loading the app.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reclaim-api-'));
process.env.RECLAIM_DATA_DIR = dataDir;
const { buildApp } = await import('./app');

const SAMPLES = path.resolve(import.meta.dirname, '../../sample-data');
const sample = (name: string) => fs.readFileSync(path.join(SAMPLES, name), 'utf8');
const MASS_COLUMNS = ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status'];

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(false); });
afterAll(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
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

describe('loading files', () => {
  it('starts with the five sample files, ready to process', async () => {
    const files = await listFiles();
    expect(files.map((f) => f.name)).toEqual([
      'partner_a_baseline.csv', 'partner_a_followup.csv', 'partner_b_baseline.csv', 'partner_b_followup.csv', 'partner_c_baseline.csv',
    ]);
    for (const f of files) expect(f).toMatchObject({ status: 'Ready', rows: 25, columns: 6 });
  });

  it('accepts an upload, previews its rows and downloads it unchanged', async () => {
    const text = sample('partner_c_baseline.csv');
    const res = await upload('uploaded_c.csv', text);
    expect(res.statusCode).toBe(200);
    const meta = res.json<FileMeta>();
    expect(meta).toMatchObject({ name: 'uploaded_c.csv', status: 'Ready', rows: 25, columns: 6 });

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
    const flagged = out.flatMap((r, i) => (r.validation_status === 'ERROR' ? [i + 1] : []));
    expect(flagged).toEqual(rows);
    for (const row of rows) expect(out[row - 1].validation_message).toContain(message);
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
    expect(headers.slice(-4)).toEqual(MASS_COLUMNS);
    // Row 1: 266.713 lb x 37.09 % R-32
    expect(Number(rows[0].r32_mass_kg)).toBeCloseTo(266.713 * 0.45359237 * 0.3709, 2);
    expect(rows[4]).toMatchObject({ r32_mass_kg: '', mass_status: 'Skipped (invalid input)' });
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

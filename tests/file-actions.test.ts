// The file actions end to end: the shared file service over the browser's memory storage and the real sample
// CSVs, as the app calls them. reply() reports each action's outcome as a status code: 200, the 400 or 404 its
// error carries, or 409 for a re-run refused without replace.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { codeOf, isInputFile, PROCESSORS, type CompareResult, type FileMeta, type ReplaceConflict, type FileRows, type GeneratedBatch, type ProcessorId } from '../shared/types';
import { parseCsv, toCsv } from '../shared/csv';
import { processors } from '../shared/processing';
import { createFileService, PARSED_CACHE_FILES, seedSampleFiles } from '../shared/file-service';
import { createMemoryStorage } from '../client/src/lib/browser-storage';

const SAMPLES = path.resolve(import.meta.dirname, '../sample-data');
const sample = (name: string) => fs.readFileSync(path.join(SAMPLES, name), 'utf8');
const MASS_COLUMNS = ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'processing_status', 'validation_errors'];

// One workspace for the whole file, as in the app: the five samples first, then each test's own uploads.
const storage = createMemoryStorage();
await seedSampleFiles(storage, fs.readdirSync(SAMPLES).filter((name) => name.endsWith('.csv')).map((name) => ({ name, text: sample(name) })));
const service = createFileService(storage);

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

    const download = await service.download(meta.id);
    expect(download.name).toBe('uploaded_c.csv');
    expect(parseCsv(download.text)).toEqual(storedInput(text, meta.id)); // the upload plus its file_id
  });

  it.each(['報告.csv', 'café_ñ.csv', "it's (final) * draft!.csv", 'résumé "v2".csv'])('downloads %s under its own name', async (name) => {
    const text = sample('partner_a_baseline.csv');
    const meta = (await upload(name, text)).json<FileMeta>();
    const download = await service.download(meta.id);
    expect(download.name).toBe(name); // the browser saves it under exactly this name
    expect(parseCsv(download.text)).toEqual(storedInput(text, meta.id));
  });

  it.each([
    ['notes.txt', sample('partner_a_baseline.csv'), 'Only .csv files are supported'],
    ['broken.csv', 'batch_id,sample_date\nA-1,2026-09-01,extra\n', 'CSV parse error on data row 1'],
    ['empty.csv', 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct\n', 'at least one data row'],
  ])('rejects %s with a clear message', async (name, text, message) => {
    const res = await upload(name, text);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain(message);
    expect((await listFiles()).some((f) => f.name === name)).toBe(false);
  });

  it('returns 404 for a file that does not exist', async () => {
    const res = await reply(() => service.rows('nope', {}));
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('File not found');
  });
});

describe('large uploads', () => {
  // A valid partner A CSV of about 1.75 MB: more than a 1 MB limit, well under the 10 MB default.
  const header = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct';
  const big = [header, ...Array.from({ length: 55000 }, (_, i) => `X-${i + 1},2026-09-01,100,40,30,30`)].join('\n');

  it('accepts a CSV over 1.5 MB (the browser checks the 10 MB limit before upload)', async () => {
    expect(Buffer.byteLength(big)).toBeGreaterThan(1.5 * 1024 * 1024);
    expect((await upload('big_default.csv', big)).statusCode).toBe(200);
  });
});

describe('preview paging', () => {
  const bigCsv = (n: number) =>
    ['batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct', ...Array.from({ length: n }, (_, i) => `X-${i + 1},2026-09-01,100,40,30,30`)].join('\n');
  const page = (id: string, query: string) => reply(() => service.rows(id, Object.fromEntries(new URLSearchParams(query))));
  let id: string;
  beforeAll(async () => { id = (await upload('big.csv', bigCsv(250))).json<FileMeta>().id; });

  it('returns the first 100 rows and the total by default', async () => {
    const res = (await rowsOf(id));
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

  it('reads and parses a file once while paging through it', async () => {
    const fresh = (await upload('paged_once.csv', bigCsv(250))).json<FileMeta>().id;
    const read = vi.spyOn(storage, 'read');
    try {
      const pages = [];
      for (const offset of [0, 100, 200]) pages.push((await page(fresh, `offset=${offset}&limit=100`)).json<FileRows>());
      expect(pages.map((p) => p.rows[0].batch_id)).toEqual(['X-1', 'X-101', 'X-201']);
      expect(pages.every((p) => p.totalRows === 250 && p.problems.total === 0)).toBe(true);
      expect(read.mock.calls.filter(([fileId]) => fileId === fresh)).toHaveLength(1);
    } finally { read.mockRestore(); }
  });

  it('serves new rows once a file is saved again, never its cached ones', async () => {
    const input = (await upload('saved_again.csv', bigCsv(3))).json<FileMeta>();
    const result = (await processFile(input.id, 'validation')).json<FileMeta>();
    const preview = () => rowsOf(result.id);
    expect((await preview()).rows[0].processing_status).toBe('Valid');
    const text = await textOf(result.id);
    // Another tab saves the result again, a second later, so it has a new upload time.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 1000 });
    try {
      await storage.put(result.id, { ...result, text: text.replace(/,Valid,/g, ',STALE,') });
    } finally { vi.useRealTimers(); }
    expect((await preview()).rows[0].processing_status).toBe('STALE');
    // A confirmed re-run then shows its fresh rows (the next test covers a re-run within the same millisecond).
    expect((await processFile(input.id, 'validation', true)).statusCode).toBe(200);
    expect((await preview()).rows.map((r) => r.processing_status)).toEqual(['Valid', 'Valid', 'Valid']);
  });

  it('serves a confirmed re-run\'s new rows even when it saves within the same millisecond', async () => {
    // Browser storage is fast, so a re-run can keep the cached copy's upload time. Freeze the clock to make
    // every save in this test happen at the same moment.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-11-17T12:00:00.000Z') });
    try {
      const input = (await upload('same_moment.csv', bigCsv(3))).json<FileMeta>();
      const result = (await processFile(input.id, 'validation')).json<FileMeta>();
      // Another tab saves stale rows for the result at that same moment, and a preview caches them.
      await storage.put(result.id, { ...result, text: (await textOf(result.id)).replace(/,Valid,/g, ',STALE,') });
      expect((await rowsOf(result.id)).rows[0].processing_status).toBe('STALE');
      // The confirmed re-run saves fresh rows, still at that moment; the preview must show them, not the cache.
      expect((await processFile(input.id, 'validation', true)).json<FileMeta>().uploadedAt).toBe(result.uploadedAt);
      expect((await rowsOf(result.id)).rows.map((r) => r.processing_status)).toEqual(['Valid', 'Valid', 'Valid']);
    } finally { vi.useRealTimers(); }
  });

  it(`keeps at most ${PARSED_CACHE_FILES} parsed files, dropping the least recently used`, async () => {
    const ids: string[] = [];
    for (let i = 0; i <= PARSED_CACHE_FILES; i++) ids.push((await upload(`cached_${i}.csv`, bigCsv(2))).json<FileMeta>().id);
    const read = vi.spyOn(storage, 'read');
    try {
      const reads = (fileId: string) => read.mock.calls.filter(([x]) => x === fileId).length;
      await page(ids[0], 'limit=1');
      await page(ids[0], 'limit=1');
      expect(reads(ids[0])).toBe(1); // cached
      for (const other of ids.slice(1)) await page(other, 'limit=1'); // ten more files push it out
      await page(ids[0], 'limit=1');
      expect(reads(ids[0])).toBe(2);
    } finally { read.mockRestore(); }
  });
});

describe('processing', () => {
  it('accepts exactly the processing functions listed in PROCESSORS', async () => {
    expect(PROCESSORS.map((p) => p.id)).toEqual([...PROCESSOR_IDS]);
    const input = (await listFiles()).find(isInputFile)!;
    for (const { id } of PROCESSORS) expect((await processFile(input.id, id, true)).statusCode).toBe(200);
    expect((await processFile(input.id, 'sorting')).statusCode).toBe(400);
  });

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
    expect(problems).toEqual({ total: 1, items: [{ row: 13, batchId: expect.any(String), message: 'R-125 out of range', issues: [{ severity: 'blocking', code: 'component_out_of_range', field: 'r125', row: 13, reason: 'R-125 out of range' }] }] });
  });

  it('says which file of a comparison each problem row is in', async () => {
    const a = await processSample('partner_a_baseline.csv', 'validation');
    const c = await processSample('partner_c_baseline.csv', 'validation');
    const { files } = (await compare(a.id, c.id)).json<CompareResult>();
    expect(files[0].problems.items).toEqual([expect.objectContaining({ row: 8, message: 'mass missing' })]);
    expect(files[1].problems.items).toEqual([expect.objectContaining({ row: 18, message: expect.stringContaining('composition totals') })]);
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

  it('refuses a comparison over 50,000 rows in total, from the stored row counts, before reading any CSV', async () => {
    const a = await processSample('partner_a_baseline.csv', 'validation');
    const b = await processSample('partner_a_followup.csv', 'validation');
    await storage.patch(a.id, { rows: 30000 });
    await storage.patch(b.id, { rows: 32000 });
    const read = vi.spyOn(storage, 'read');
    try {
      const res = await compare(a.id, b.id);
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Too many rows to compare: these files have 62,000 rows in total, and the limit is 50,000. Compare fewer or smaller files.');
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('compares files with exactly 50,000 rows in total', async () => {
    const a = await processSample('partner_a_baseline.csv', 'mass');
    const b = await processSample('partner_a_followup.csv', 'mass');
    await storage.patch(a.id, { rows: 25000 });
    await storage.patch(b.id, { rows: 25000 });
    expect((await compare(a.id, b.id)).statusCode).toBe(200);
  });

  it('still answers 404 for an unknown file before counting rows', async () => {
    const a = await processSample('partner_c_baseline.csv', 'validation');
    const res = await compare(a.id, '999999-V');
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('File not found');
  });

  it('accepts result CSVs uploaded from disk, even when renamed', async () => {
    const result = await processSample('partner_b_followup.csv', 'validation');
    const text = await textOf(result.id);
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
    const download = (await textOf(result.id));
    expect(parseCsv(download)).toMatchObject({ headers: after.headers, rows: after.rows, duplicateHeaders: [] });
    const imported = (await upload(`renamed_${name}_${id}.csv`, download)).json<FileMeta>();
    // An unchanged export of a sample's result links back to that sample.
    expect(imported).toMatchObject({ status: 'Processed', processor: id, generatedColumns: result.generatedColumns, imported: true, sourceId: source.id, importedFrom: source.id });
    expect((await rowsOf(imported.id)).generatedColumns).toEqual(after.generatedColumns);
    // The copy is a new file with its own result_id; file_id still names its original, and every other value is unchanged.
    const copy = parseCsv((await textOf(imported.id)));
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
    expect(parseCsv((await textOf(input.id)))).toEqual(storedInput(csv, input.id));
  });

  it('compares actual CSV schemas even if stored generated-column metadata is stale', async () => {
    const result = await processSample('partner_a_baseline.csv', 'mass');
    const text = await textOf(result.id);
    const imported = (await upload('current_mass_stale_metadata.csv', text)).json<FileMeta>();
    await storage.patch(imported.id, { generatedColumns: ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status'] });
    const response = await compare(imported.id, result.id);
    expect(response.statusCode).toBe(200);
    // result_id is never compared: it always differs between files.
    expect(response.json().columns.map((c: { name: string }) => c.name)).toEqual(processors.mass.columns.filter((c) => c !== 'result_id'));
    expect(parseCsv((await textOf(imported.id))).rows[0].result_id).toBe(imported.id);
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
    const before = (await textOf(source.id));
    // A shared sample other tests also process, so the re-run is confirmed.
    const response = await processFile(source.id, processor, true);
    expect(response.statusCode).toBe(200);
    const result = response.json<FileMeta>();
    expect(result).toMatchObject({ status: 'Processed', problemRows: 2, processor });
    const imported = (await upload(`review_result_${processor}.csv`, (await textOf(result.id)))).json<FileMeta>();
    expect(imported).toMatchObject({ status: 'Processed', problemRows: 2, processor });
    expect((await fileNamed(source.name))).toEqual(source);
    expect((await textOf(source.id))).toBe(before);
  });

  it('keeps an invalid legacy result Processed and counts errors from its source columns', async () => {
    const text = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct,r32_mass_kg,r125_mass_kg,r134a_mass_kg,mass_status\nOLD,d,,40,30,30,,,,Skipped (invalid input)';
    const result = (await upload('legacy_invalid_status.csv', text)).json<FileMeta>();
    expect(result).toMatchObject({ status: 'Processed', processor: 'mass', problemRows: 1 });
    expect((await fileNamed(result.name))).toEqual(result);
    expect((await textOf(result.id))).toBe(text);
  });

  it('lists without reading a CSV or writing anything', async () => {
    await upload('list_only.csv', clean);
    const spies = (['read', 'patch', 'create', 'put', 'createAt'] as const).map((method) => vi.spyOn(storage, method));
    try {
      expect((await listFiles()).some((f) => f.name === 'list_only.csv')).toBe(true);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally { spies.forEach((spy) => spy.mockRestore()); }
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
    expect((await textOf(a.id))).toBe(text);
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
});

describe('R-32 + R-125 flag', () => {
  const PREVIOUS = ['result_id', 'blend_class', 'dominant_component', 'processing_status', 'validation_errors'];

  it('reads Yes on every valid sample row and stays blank on invalid ones', async () => {
    const result = await processSample('partner_a_baseline.csv', 'classification');
    const { rows } = await rowsOf(result.id);
    expect(rows.some((r) => r.processing_status === 'Invalid')).toBe(true);
    for (const r of rows) expect(r.r32_r125_over_50).toBe(r.processing_status === 'Valid' ? 'Yes' : '');
  });

  it('recognises, links and compares a Classification export made before the flag existed', async () => {
    const source = await fileNamed('partner_a_baseline.csv');
    const current = await processSample('partner_a_baseline.csv', 'classification');
    // The same export as today minus the flag column: what Classification wrote before 9.11.
    const exported = parseCsv((await textOf(current.id)));
    const headers = exported.headers.filter((h) => h !== 'r32_r125_over_50');
    const old = (await upload('pre_flag_classification.csv', toCsv(headers, exported.rows))).json<FileMeta>();
    expect(old).toMatchObject({ status: 'Processed', processor: 'classification', generatedColumns: PREVIOUS, imported: true, sourceId: source.id });
    for (const ids of [[old.id, current.id], [current.id, old.id]]) {
      const response = await compare(...ids);
      expect(response.statusCode).toBe(200);
      expect(response.json<CompareResult>().columns.map((c) => c.name)).toEqual(PREVIOUS.slice(1));
    }
    const other = await processSample('partner_a_followup.csv', 'classification');
    const both = (await compare(current.id, other.id)).json<CompareResult>();
    expect(both.columns.find((c) => c.name === 'r32_r125_over_50')).toMatchObject({ kind: 'category' });
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
    const text = await textOf(result.id);
    const imported = (await upload('my_copy.csv', text)).json<FileMeta>();
    expect(imported.id).toMatch(/^\d{6}-M$/);
    expect(Number(imported.id.slice(0, 6))).toBeGreaterThan(Number(input.id));
    expect(imported).toMatchObject({ status: 'Processed', processor: 'mass' });
  });

  it.each(['abc', '..%2Fmeta', '100000', '10101', '101010-m', '101010-X', '1010100'])('treats %s as an unknown file', async (id) => {
    expect((await reply(() => service.rows(id, {}))).statusCode).toBe(404);
    expect((await reply(() => service.download(id))).statusCode).toBe(404);
    expect((await processFile(id, 'mass')).statusCode).toBe(404);
    expect((await archiveFiles({ ids: [id], archived: true })).statusCode).toBe(404);
  });
});

describe('replacing a result', () => {
  const csv = sample('partner_a_baseline.csv');
  const download = async (id: string) => (await textOf(id));

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
  const download = async (id: string) => parseCsv((await textOf(id)));

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
    const exported = (await textOf(first.id));
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
    expect((await textOf(old.id))).toBe(oldText);
    const compared = await compare(result.id, old.id);
    expect(compared.statusCode).toBe(200);
    expect(compared.json<CompareResult>().columns.every((c) => c.rowsDiffering === 0)).toBe(true);
  });
});

describe('archiving', () => {
  const archive = (ids: string[], archived: boolean) => archiveFiles({ ids, archived });

  it('archives and restores several files, changing nothing else', async () => {
    const input = (await upload('archive_me.csv', sample('partner_a_baseline.csv'))).json<FileMeta>();
    const result = (await processFile(input.id, 'mass')).json<FileMeta>();
    const text = await textOf(result.id);

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
    expect((await textOf(result.id))).toBe(text);

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
    const res = await archiveFiles(payload);
    expect(res.statusCode).toBe(400);
  });
});

describe('generating CSVs', () => {
  const generate = (payload: object) => reply(() => service.generate(payload));

  it('returns a partner CSV and its planted errors without saving anything', async () => {
    const before = (await listFiles()).length;
    const res = await generate({ partner: 'B', rows: 10, errorRows: 2 });
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
    const [file] = (await generate({ partner: 'C', rows: 12, errorRows })).json<GeneratedBatch>().files;
    const meta = (await upload(file.name, file.text)).json<FileMeta>();
    expect(meta).toMatchObject({ name: file.name, rows: 12, columns: 7, problemRows: errorRows, status });
  });

  it('ignores a seed in the request, so every request makes new data', async () => {
    const make = async () => (await generate({ partner: 'A', rows: 20, errorRows: 1, seed: 4 })).json<GeneratedBatch>().files[0].text;
    expect(await make()).not.toBe(await make());
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
  return { headers: [...headers, 'file_id'], rows: rows.map((r) => ({ ...r, file_id: id })), duplicateHeaders: [] };
};
describe('file identity regression', () => {
  // One scenario per function, so every suffix (-V, -M, -C) is covered. Each run uploads its own files.
  const body = async (id: string) => (await textOf(id));
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
    await archiveFiles({ ids: [rb.id], archived: true });
    const named = (await listFiles()).filter((f) => f.name === `result_identity_${fn}.csv` && [ra.id, rb.id, rc.id].includes(f.id));
    expect(named.filter((f) => f.archived).map((f) => f.id)).toEqual([rb.id]);
    await archiveFiles({ ids: [rb.id], archived: false });
    expect((await metaOf(rb.id))[0].archived).toBeFalsy();
    expect(await body(rb.id)).toBe(before.b);

    // 6. Downloads share the filename label but each carries its own data and result_id.
    const downloads = await Promise.all([ra, rb].map((r) => service.download(r.id)));
    expect(downloads[0].name).toBe(downloads[1].name);
    expect(parseCsv(downloads[0].text).rows[0].result_id).toBe(ra.id);
    expect(parseCsv(downloads[1].text).rows[0].result_id).toBe(rb.id);

    // 7. Re-uploads follow the 11.7 rule: an unchanged copy links; an edited copy keeps its source but is not linked.
    const linked = (await upload(`result_identity_${fn}.csv`, downloads[0].text)).json<FileMeta>();
    expect(linked.id).toMatch(new RegExp(`^[0-9]{6}-${code}$`));
    expect(Number(linked.id.slice(0, 6))).toBeGreaterThan(Number(c.id));
    expect(linked.imported).toBe(true);
    expect(linked.sourceId).toBe(a.id);
    expect(linked.importedFrom).toBe(a.id);
    const copy = parseCsv(downloads[1].text);
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
    expect((await reply(() => service.rows('identity.csv', {}))).statusCode).toBe(404);
    expect((await reply(() => service.download('identity.csv'))).statusCode).toBe(404);
    expect((await processFile('identity.csv', fn)).statusCode).toBe(404);
  });
});

describe('linking imported results', () => {
  const csv = sample('partner_a_baseline.csv');
  const exportOf = async (id: string) => parseCsv((await textOf(id)));
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
    await archiveFiles({ ids: [input.id], archived: true });
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
const listFiles = () => service.list();
const fileNamed = async (name: string) => {
  const f = (await listFiles()).find((x) => x.name === name);
  if (!f) throw new Error(`no file named ${name}`);
  return f;
};
const rowsOf = (id: string): Promise<FileRows> => service.rows(id, {});
const textOf = async (id: string) => (await service.download(id)).text;
const archiveFiles = (body: unknown) => reply(() => service.archive(body));
const compare = (...ids: string[]) => reply(() => service.compare(ids));
const upload = (name: string, text: string) => reply(() => service.upload({ name, text }));

/** Processes one input; a re-run refused without replace answers 409 with the existing result. */
async function processFile(fileId: string, processor: string, replace?: boolean): Promise<Reply> {
  const outcome = await reply(() => service.process({ fileId, processor, replace }));
  if (outcome.statusCode !== 200) return outcome;
  const value = outcome.json<Awaited<ReturnType<typeof service.process>>>();
  return 'conflict' in value ? { statusCode: 409, json: () => value.conflict as never } : { statusCode: 200, json: () => value.file as never };
}
// Samples are shared by many tests, so re-runs of them are confirmed; 'replacing a result' covers the refusal.
const processSample = async (name: string, processor: ProcessorId) => (await processFile((await fileNamed(name)).id, processor, true)).json<FileMeta>();

/** An action's outcome: 200 with its value, or the status and message of the error the file service threw. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Reply { statusCode: number; json: <T = any>() => T }
async function reply(action: () => unknown): Promise<Reply> {
  try {
    const value = await action();
    return { statusCode: 200, json: () => value as never };
  } catch (error) {
    const { statusCode, message } = error as { statusCode?: number; message: string };
    if (!statusCode) throw error; // an unexpected failure fails the test
    return { statusCode, json: () => ({ message }) as never };
  }
}

describe('Needs Mapping, confirmMapping and the processing gate (19.4)', () => {
  const SUPPLIER = 'Batch ID,Sample Date,Net Mass,R32 %,R125,R134a\nX-1,2026-09-01,100,50,30,20\nX-2,2026-09-02,200,40,40,20\nX-3,2026-09-03,300,10,10,10\n';
  const columns = { batchId: 'Batch ID', sampleDate: 'Sample Date', massKg: 'Net Mass', r32: 'R32 %', r125: 'R125', r134a: 'R134a' };
  const units = { massKg: 'lb', r32: '%', r125: '%', r134a: '%' };
  const confirm = (fileId: string, over: Record<string, unknown> = {}) => reply(() => service.confirmMapping({ fileId, columns, units, ...over }));
  const metaOf = async (id: string) => (await listFiles()).find((f) => f.id === id)!;
  const mapped = async (name: string, text = SUPPLIER) => {
    const meta = (await upload(name, text)).json<FileMeta>();
    expect((await confirm(meta.id)).statusCode).toBe(200);
    return meta.id;
  };

  it('keeps a supplier CSV as Needs Mapping with its suggested mapping, adding only file_id', async () => {
    const meta = (await upload('supplier.csv', SUPPLIER)).json<FileMeta>();
    expect(meta).toMatchObject({ status: 'Needs Mapping', rows: 3, columns: 7, ingestion: { approved: false } });
    expect(meta.ingestion!.mappings.map((m) => [m.field, m.sourceColumn, m.origin])).toEqual([
      ['batchId', 'Batch ID', 'normalized'], ['sampleDate', 'Sample Date', 'normalized'], ['massKg', 'Net Mass', 'alias'],
      ['r32', 'R32 %', 'alias'], ['r125', 'R125', 'alias'], ['r134a', 'R134a', 'alias'],
    ]);
    expect(meta.ingestion!.issues.map((i) => `${i.code}:${i.field}`)).toEqual(['unit_unverified:massKg', 'unit_unverified:r125', 'unit_unverified:r134a']);
    expect(parseCsv(await textOf(meta.id))).toEqual(storedInput(SUPPLIER, meta.id));
    expect((await rowsOf(meta.id)).problems.total).toBe(0); // previews without row checks
  });
  it('keeps two-partner and repeated-column CSVs as Needs Mapping, but still refuses such a result file', async () => {
    const two = (await upload('two-partners.csv', 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct,lot_number,collected_on,weight_lb,hfc32_percent,hfc125_percent,hfc134a_percent\nA-1,d,1,2,3,4,B-1,d,1,2,3,4\n')).json<FileMeta>();
    expect(two.ingestion!.issues.map((i) => i.code)).toContain('mapping_ambiguous');
    const repeated = (await upload('repeated-column.csv', 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct,feed_mass_kg\nA-1,d,100,50,30,20,5\n')).json<FileMeta>();
    expect(repeated.ingestion).toMatchObject({ duplicateHeaders: ['feed_mass_kg'] });
    const result = await upload('result.csv', 'foo,bar,r32_mass_kg,r125_mass_kg,r134a_mass_kg,processing_status,validation_errors\n1,2,3,4,5,Valid,\n');
    expect([result.statusCode, result.json().message]).toEqual([400, expect.stringContaining('Unrecognized CSV schema')]);
  });

  it('refuses to process a file whose mapping is not confirmed, creating no result', async () => {
    const meta = (await upload('gate.csv', SUPPLIER)).json<FileMeta>();
    for (const fn of PROCESSOR_IDS) {
      const res = await processFile(meta.id, fn);
      expect([res.statusCode, res.json().message]).toEqual([400, `File ${meta.id} can't be processed yet: its columns and units have not been confirmed`]);
    }
    expect((await listFiles()).some((f) => f.id.startsWith(`${meta.id}-`))).toBe(false);
  });

  it.each([
    ['an unknown file', '999999', {}, 404, 'File not found'],
    ['a blank column choice', undefined, { columns: { ...columns, batchId: '' } }, 400, 'Choose a column for batch ID'],
    ['an unknown column', undefined, { columns: { ...columns, massKg: 'Nope' } }, 400, 'mass: there is no column "Nope"'],
    ['the file_id column', undefined, { columns: { ...columns, massKg: 'file_id' } }, 400, 'is the File ID column and cannot be mapped'],
    ['one column for two fields', undefined, { columns: { ...columns, r125: 'R32 %' } }, 400, 'column "R32 %" is chosen for R-32 and R-125'],
    ['an unsupported unit', undefined, { units: { ...units, r32: 'oz' } }, 400, 'Choose a unit for R-32'],
    ['a composition unit for mass', undefined, { units: { ...units, massKg: '%' } }, 400, 'mass: unit "%" is not supported; use kg, lb or g'],
    ['a unit that contradicts the column', undefined, { units: { ...units, r32: 'fraction' } }, 400, 'R-32: the column states % but fraction was confirmed'],
  ])('refuses %s and saves nothing', async (_what, fileId, over, status, message) => {
    const meta = (await upload('refuse.csv', SUPPLIER)).json<FileMeta>();
    const res = await confirm(fileId ?? meta.id, over);
    expect([res.statusCode, res.json().message]).toEqual([status, expect.stringContaining(message)]);
    expect(await metaOf(meta.id)).toEqual(meta);
  });
  it('refuses to map an exact partner input, a result and an archived file', async () => {
    const partner = await fileNamed('partner_a_baseline.csv');
    expect((await confirm(partner.id)).json().message).toBe(`File ${partner.id} already matches Partner A; its columns need no mapping`);
    const result = (await processFile(partner.id, 'validation', true)).json<FileMeta>();
    expect((await confirm(result.id)).json().message).toBe('Select an input file, not a result file');
    const meta = (await upload('archived-map.csv', SUPPLIER)).json<FileMeta>();
    await archiveFiles({ ids: [meta.id], archived: true });
    expect((await confirm(meta.id)).json().message).toBe('Restore archived-map.csv before mapping it');
  });

  it('confirms a mapping, counts and previews its problem rows, and processes like the same rows in Partner B format', async () => {
    const meta = (await upload('confirm.csv', SUPPLIER)).json<FileMeta>();
    await rowsOf(meta.id); // cached while it still Needs Mapping
    const done = (await confirm(meta.id)).json<FileMeta>();
    expect(done).toMatchObject({ status: 'Needs Review', problemRows: 1, ingestion: { approved: true } }); // X-3 totals 30%
    expect(done.ingestion!.units.map((u) => [u.field, u.unit, u.origin])).toEqual([['massKg', 'lb', 'confirmed'], ['r32', '%', 'header'], ['r125', '%', 'confirmed'], ['r134a', '%', 'confirmed']]);
    expect((await rowsOf(meta.id)).problems.items[0]).toMatchObject({ row: 3, batchId: 'X-3', message: 'composition totals 30%' });

    const b = (await upload('b-equivalent.csv', 'lot_number,collected_on,weight_lb,hfc32_percent,hfc125_percent,hfc134a_percent\nX-1,2026-09-01,100,50,30,20\nX-2,2026-09-02,200,40,40,20\nX-3,2026-09-03,300,10,10,10\n')).json<FileMeta>();
    for (const fn of PROCESSOR_IDS) {
      const ours = await rowsOf((await processFile(meta.id, fn)).json<FileMeta>().id);
      const theirs = await rowsOf((await processFile(b.id, fn)).json<FileMeta>().id);
      for (const [i, row] of ours.rows.entries()) for (const c of ours.generatedColumns.filter((g) => g !== 'result_id')) expect(row[c], `${fn} row ${i + 1} ${c}`).toBe(theirs.rows[i][c]);
    }
    const mass = await rowsOf(`${meta.id}-M`);
    expect(mass.rows[0].r32_mass_kg).toBe('22.68');
    expect(mass.rows[2]).toMatchObject({ r32_mass_kg: '', r125_mass_kg: '', r134a_mass_kg: '', processing_status: 'Invalid' }); // never a zero
    expect((await rowsOf(`${meta.id}-V`)).rows[2].composition_total_pct).toBe('30'); // Validation keeps its total
    expect((await metaOf(`${meta.id}-M`)).ingestion).toEqual(done.ingestion);
  });
  it('compares two mapped results by batch ID', async () => {
    const a = (await processFile(await mapped('first.csv'), 'validation')).json<FileMeta>();
    const b = (await processFile(await mapped('second.csv', SUPPLIER.replace('100,50,30,20', '110,50,30,20')), 'validation')).json<FileMeta>();
    const compared = (await compare(a.id, b.id)).json<CompareResult>();
    expect(compared).toMatchObject({ rowMatch: 'batch_id', files: [{ source: 'Mapped columns', rows: 3, validRows: 2 }, { source: 'Mapped columns', validRows: 2 }] });
    expect(compared.columns.find((c) => c.name === 'composition_total_pct')?.summary).toEqual([100, 100]); // X-3's 30% is left out
  });

  it('re-checks an approved record against the stored file on every run', async () => {
    const id = await mapped('tamper.csv');
    const good = (await metaOf(id)).ingestion!;
    const run = async (ingestion?: unknown) => {
      await storage.patch(id, { ingestion: ingestion as never });
      return processFile(id, 'mass');
    };
    const missing = await run({ ...good, mappings: good.mappings.map((m) => (m.field === 'massKg' ? { ...m, sourceColumn: 'Gone' } : m)) });
    expect([missing.statusCode, missing.json().message]).toEqual([400, `File ${id} can't be processed yet: the column "Gone" for mass is not in the file`]);
    expect((await run({ ...good, units: good.units.map((u) => (u.field === 'massKg' ? { ...u, factor: 1 } : u)) })).json().message).toContain('the unit for mass is not confirmed');
    expect((await run({ ...good, approved: false })).json().message).toContain('have not been confirmed');
    expect((await run(undefined)).json().message).toContain('not a known partner format'); // no record: read as a partner format, which this is not
    expect((await listFiles()).some((f) => f.id === `${id}-M`)).toBe(false);
    expect((await run(good)).statusCode).toBe(200);
  });

  it('saves a supplier profile that suggests for the next file with the same columns, which still needs confirming', async () => {
    const meta = (await upload('profiled.csv', SUPPLIER)).json<FileMeta>();
    expect((await confirm(meta.id, { profileName: ' Supplier X ' })).statusCode).toBe(200);
    expect((await storage.listProfiles()).filter((p) => p.name === 'Supplier X')).toHaveLength(1);
    const next = (await upload('profiled-2.csv', SUPPLIER.replace('X-1', 'Y-1'))).json<FileMeta>();
    expect(next).toMatchObject({ status: 'Needs Mapping', ingestion: { approved: false, issues: [] } });
    expect(next.ingestion!.mappings.map((m) => m.origin)).toEqual(Array(6).fill('profile'));
    expect(next.ingestion!.units.map((u) => [u.field, u.origin])).toEqual([['massKg', 'profile'], ['r32', 'header'], ['r125', 'profile'], ['r134a', 'profile']]);
    expect((await processFile(next.id, 'mass')).statusCode).toBe(400);
  });
  it('reports a profile that could not be saved after the mapping was saved', async () => {
    const meta = (await upload('profile-fails.csv', SUPPLIER)).json<FileMeta>();
    const spy = vi.spyOn(storage, 'saveProfile').mockRejectedValueOnce(new Error('disk full'));
    try {
      const res = await confirm(meta.id, { profileName: 'Supplier Y' });
      expect([res.statusCode, res.json().message]).toEqual([500, 'The mapping was saved, but the supplier profile could not be saved: disk full']);
    } finally { spy.mockRestore(); }
    expect(await metaOf(meta.id)).toMatchObject({ status: 'Needs Review', ingestion: { approved: true } });
  });
});

describe('original files and source references (19.8)', () => {
  const SUPPLIER = 'Batch ID,Sample Date,Net Mass,R32 %,R125,R134a\nX-1,2026-09-01,100,50,30,20\nX-2,2026-09-02,200,40,40,20\n';
  const bytesOf = (...n: number[]) => new Uint8Array(n).buffer;
  const excelSource = (over: Record<string, unknown> = {}) => ({
    kind: 'excel', original: { name: 'supplier.xlsx', mediaType: 'application/vnd.ms-excel', bytes: bytesOf(80, 75, 3, 4) },
    sheet: 'Q3', range: 'B3:G5', columns: ['B', 'C', 'D', 'E', 'F', 'G'],
    rows: [{ row: 4 }, { row: 5 }], checks: [], ...over,
  });
  const sourceOf = (id: string) => storage.readSource(id);

  it('keeps a CSV as its own original, and every stored byte as before', async () => {
    const meta = (await upload('kept.csv', SUPPLIER)).json<FileMeta>();
    expect(meta.source).toEqual({ kind: 'csv', name: 'kept.csv', size: SUPPLIER.length });
    const record = (await sourceOf(meta.id))!;
    expect(new TextDecoder().decode(record.original.bytes)).toBe(SUPPLIER);
    expect(record).toMatchObject({ kind: 'csv', rows: [], checks: [] });
    expect(parseCsv(await textOf(meta.id))).toEqual(storedInput(SUPPLIER, meta.id)); // the stored CSV is the upload plus file_id, as before
    expect(Object.keys(meta)).not.toContain('record');
  });
  it('keeps an original with every kind of upload: a partner file, an imported result and a sample', async () => {
    const partner = (await upload('partner.csv', sample('partner_a_baseline.csv'))).json<FileMeta>();
    expect((await sourceOf(partner.id))?.kind).toBe('csv');
    const result = await processFile('100001', 'mass', true);
    const exported = await textOf(result.json<FileMeta>().id);
    const imported = (await upload('imported-result.csv', exported)).json<FileMeta>();
    expect(imported).toMatchObject({ imported: true, source: { kind: 'csv' } });
    expect((await sourceOf(imported.id))?.kind).toBe('csv');
    expect((await sourceOf('100001'))?.kind).toBe('csv'); // seeded
    expect((await listFiles()).find((f) => f.id === '100001')!.source).toMatchObject({ kind: 'csv', name: 'partner_a_baseline.csv' });
  });
  it('keeps a converted file as Needs Mapping with its original, sheet, range and column letters', async () => {
    const res = await reply(() => service.upload({ name: 'supplier.csv', text: SUPPLIER, source: excelSource() }));
    const meta = res.json<FileMeta>();
    expect(meta).toMatchObject({ status: 'Needs Mapping', source: { kind: 'excel', name: 'supplier.xlsx', size: 4, sheet: 'Q3', range: 'B3:G5' } });
    const record = (await sourceOf(meta.id))!;
    expect(new Uint8Array(record.original.bytes)).toEqual(new Uint8Array([80, 75, 3, 4]));
    expect(record).toMatchObject({ columns: ['B', 'C', 'D', 'E', 'F', 'G'], rows: [{ row: 4 }, { row: 5 }] });
    expect(parseCsv(await textOf(meta.id))).toEqual(storedInput(SUPPLIER, meta.id));
  });
  it('refuses a source that does not match its table, storing nothing', async () => {
    const before = (await listFiles()).length;
    const refused = async (source: unknown) => {
      const res = await reply(() => service.upload({ name: 'bad.csv', text: SUPPLIER, source }));
      return [res.statusCode, res.json().message];
    };
    const mismatch = [400, 'The source record does not match the converted table'];
    expect(await refused(excelSource({ rows: [{ row: 4 }] }))).toEqual(mismatch); // one reference per data row
    expect(await refused(excelSource({ columns: ['B', 'C'] }))).toEqual(mismatch);
    expect(await refused(excelSource({ kind: 'pdf', columns: undefined, rows: [{ row: 1, page: 1 }, { row: 2, page: 1 }], checks: [{ row: 3, column: 0, asRead: '1O', reasons: ['x'], decision: 'keep' }] }))).toEqual(mismatch);
    expect(await refused(excelSource({ checks: [{ row: 1, column: 6, asRead: '1O', reasons: ['x'], decision: 'keep' }] }))).toEqual(mismatch);
    expect((await refused(excelSource({ kind: 'csv' })))[0]).toBe(400);
    expect((await refused(excelSource({ original: { name: 'x.xlsx', mediaType: 'x', bytes: 'not bytes' } })))[0]).toBe(400);
    expect((await refused(excelSource({ original: { name: 'x.xlsx', mediaType: 'x', bytes: new ArrayBuffer(20 * 1024 * 1024 + 1) } })))[1]).toContain('larger than the 20 MB limit');
    expect((await listFiles()).length).toBe(before);
  });
});

describe('result traces and explain (19.8)', () => {
  // Row 2 has no mass, so it is excluded from calculations.
  const SUPPLIER = 'Batch ID,Sample Date,Net Mass,R32 %,R125,R134a\nX-1,2026-09-01,100,50,30,20\nX-2,2026-09-02,,40,40,20\n';
  const columns = { batchId: 'Batch ID', sampleDate: 'Sample Date', massKg: 'Net Mass', r32: 'R32 %', r125: 'R125', r134a: 'R134a' };
  const units = { massKg: 'lb', r32: '%', r125: '%', r134a: '%' };
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const source = (over: Record<string, unknown>) => ({ original: { name: 'src', mediaType: 'x', bytes }, rows: [{ row: 4 }, { row: 5 }], checks: [], ...over });
  const explain = (fileId: string, row: number, column: string) => reply(() => service.explain({ fileId, row, column }));
  const locations = (res: { fields: { location?: string }[] }) => res.fields.map((f) => f.location);
  const mappedMass = async (text = SUPPLIER, src?: unknown) => {
    const meta = (await reply(() => service.upload({ name: 'trace.csv', text, source: src }))).json<FileMeta>();
    expect((await reply(() => service.confirmMapping({ fileId: meta.id, columns, units }))).statusCode).toBe(200);
    return { id: meta.id, result: (await processFile(meta.id, 'mass')).json<FileMeta>() };
  };

  it('records the trace of a partner result: its exact mapping, partner units and function version', async () => {
    const result = await processSample('partner_a_followup.csv', 'mass');
    expect(result.trace).toMatchObject({
      inputFileId: '100002', source: { kind: 'csv', name: 'partner_a_followup.csv' }, processor: 'mass', processorVersion: 1,
      validation: { approval: 'partner', rows: 25, excludedRows: 1, warnings: [] },
    });
    expect(result.trace!.mappings.every((m) => m.origin === 'exact' && m.approved)).toBe(true);
    expect(result.trace!.units.map((u) => [u.field, u.unit, u.factor])).toEqual([['massKg', 'kg', 1], ['r32', '%', 1], ['r125', '%', 1], ['r134a', '%', 1]]);
  });
  it('explains a calculated value from its raw cells, with the unit, the factor and the value used', async () => {
    const { result } = await mappedMass();
    expect(result.trace).toMatchObject({ validation: { approval: 'confirmed', rows: 2, excludedRows: 1 }, units: expect.arrayContaining([{ field: 'massKg', unit: 'lb', factor: 0.45359237, origin: 'confirmed' }]) });
    const res = (await explain(result.id, 1, 'r32_mass_kg')).json();
    expect(res).toMatchObject({ traced: true, value: '22.68', rowStatus: 'calculated', reasons: '', processor: { id: 'mass', version: 1, label: 'Component Mass Calculation' }, input: { name: 'trace.csv', source: { kind: 'csv' } } });
    const mass = res.fields.find((f: { field: string }) => f.field === 'massKg');
    expect(mass).toMatchObject({ column: 'Net Mass', raw: '100', unit: 'lb', factor: 0.45359237, normalized: 45.359237, location: 'row 2, column "Net Mass"' });
    expect(res.fields.map((f: { field: string }) => f.field)).toEqual(['batchId', 'sampleDate', 'massKg', 'r32', 'r125', 'r134a']);
  });
  it('explains an excluded row without a value, and a missing measurement as missing, never zero', async () => {
    const { result } = await mappedMass();
    const res = (await explain(result.id, 2, 'r32_mass_kg')).json();
    expect(res).toMatchObject({ rowStatus: 'excluded', value: '', reasons: 'mass missing' });
    expect(res.fields.find((f: { field: string }) => f.field === 'massKg')).toMatchObject({ raw: '', normalized: null, problem: 'missing' });
  });
  it('finds an Excel value by sheet and cell, and a PDF value by page and row, with the value as read', async () => {
    const excel = await mappedMass(SUPPLIER, source({ kind: 'excel', sheet: 'Q3 data', range: 'B3:G5', columns: ['B', 'C', 'E', 'F', 'G', 'H'] }));
    const cells = (await explain(excel.result.id, 1, 'r32_mass_kg')).json();
    expect(locations(cells)).toEqual(["'Q3 data'!B4", "'Q3 data'!C4", "'Q3 data'!E4", "'Q3 data'!F4", "'Q3 data'!G4", "'Q3 data'!H4"]);
    expect(cells.input.source).toMatchObject({ kind: 'excel', name: 'src', sheet: 'Q3 data' });

    const pdf = await mappedMass(SUPPLIER.replace(',100,', ',,'), source({
      kind: 'pdf', ocr: [2], rows: [{ row: 3, page: 1, pageRow: 3 }, { row: 2, page: 2, pageRow: 2 }],
      checks: [{ row: 1, column: 2, asRead: '1O0', reasons: ['letter O in a number'], decision: 'blank' }],
    }));
    const first = (await explain(pdf.result.id, 1, 'r32_mass_kg')).json();
    expect(first.fields.find((f: { field: string }) => f.field === 'massKg')).toMatchObject({ location: 'page 1, row 3', raw: '', confirmed: { asRead: '1O0', decision: 'blank' }, problem: 'missing' });
    expect(locations((await explain(pdf.result.id, 2, 'r32_mass_kg')).json())[0]).toBe('page 2, row 2');
  });
  it('still explains when the source record is missing, without locations', async () => {
    const meta = (await upload('no-record.csv', SUPPLIER)).json<FileMeta>();
    const { id: _id, uploadedAt: _at, ...rest } = meta;
    const bare = await storage.create({ ...rest, text: await textOf(meta.id) });
    expect(await storage.readSource(bare.id)).toBeUndefined();
    expect((await reply(() => service.confirmMapping({ fileId: bare.id, columns, units }))).statusCode).toBe(200);
    const result = (await processFile(bare.id, 'mass')).json<FileMeta>();
    const res = (await explain(result.id, 1, 'r32_mass_kg')).json();
    expect(res.traced).toBe(true);
    expect(locations(res).every((l) => l === undefined)).toBe(true);
    expect(res.fields.find((f: { field: string }) => f.field === 'massKg').raw).toBe('100');
  });
  it('replaces the trace when a result is re-run, and keeps the same File ID and CSV', async () => {
    const { id, result } = await mappedMass();
    const first = await textOf(result.id);
    const again = (await processFile(id, 'mass', true)).json<FileMeta>();
    expect(again.id).toBe(result.id);
    expect(again.trace).toEqual(result.trace);
    expect(await textOf(result.id)).toBe(first);
  });
  it('says an uploaded result or an older result has no trace, and refuses anything that cannot be explained', async () => {
    const partnerResult = await processSample('partner_a_baseline.csv', 'mass');
    const imported = (await upload('imported.csv', await textOf(partnerResult.id))).json<FileMeta>();
    expect((await explain(imported.id, 1, 'r32_mass_kg')).json()).toEqual({ traced: false, reason: 'This result was uploaded, so how it was calculated is not recorded.' });
    const traced = (await mappedMass()).result.id;
    const status = async (id: string, row: number, column: string) => (await explain(id, row, column)).statusCode;
    expect(await status('999999', 1, 'r32_mass_kg')).toBe(404);
    expect(await status('100001', 1, 'r32_mass_kg')).toBe(400); // an input
    expect(await status(traced, 3, 'r32_mass_kg')).toBe(400); // no such row
    expect(await status(traced, 0, 'r32_mass_kg')).toBe(400);
    expect(await status(traced, 1, 'result_id')).toBe(400);
    expect(await status(traced, 1, 'Net Mass')).toBe(400); // an original column
    await storage.patch(traced, { trace: undefined });
    expect((await explain(traced, 1, 'r32_mass_kg')).json()).toEqual({ traced: false, reason: expect.stringContaining('Run the function again') });
  });
  it('writes nothing when it explains', async () => {
    const { result } = await mappedMass();
    const before = JSON.stringify(await listFiles());
    await explain(result.id, 1, 'r32_mass_kg');
    await explain(result.id, 9, 'r32_mass_kg');
    expect(JSON.stringify(await listFiles())).toBe(before);
  });
});

describe('sample result regression (19.9)', () => {
  // tests/fixtures/sample-results holds each sample's three results exactly as release v2.4.1 (before M19) made them.
  const FIXTURES = path.resolve(import.meta.dirname, 'fixtures/sample-results');
  const samples = fs.readdirSync(SAMPLES).filter((name) => name.endsWith('.csv'));

  it.each(samples.flatMap((name) => (['validation', 'mass', 'classification'] as const).map((processor) => [name, processor] as const)))(
    '%s %s matches the pre-M19 result byte for byte', async (name, processor) => {
      const result = await processSample(name, processor);
      expect(await textOf(result.id)).toBe(fs.readFileSync(path.join(FIXTURES, `${name.replace('.csv', '')}.${processor}.csv`), 'utf8'));
    });
});

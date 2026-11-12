import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../shared/types';

const blobs = vi.hoisted(() => ({ files: new Map<string, { text: string; etag: string }>(), revision: 0 }));
vi.mock('@vercel/blob', async (original) => {
  const sdk = await original<typeof import('@vercel/blob')>();
  return {
    ...sdk,
    get: vi.fn(async (pathname: string, options: { useCache: boolean }) => {
      expect(options.useCache).toBe(false);
      const file = blobs.files.get(pathname);
      return file ? { statusCode: 200, stream: new Response(file.text).body, blob: { etag: file.etag } } : null;
    }),
    list: vi.fn(async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
      // Deliberately paginate at two records to exercise traversal.
      const paths = [...blobs.files.keys()].filter((p) => p.startsWith(prefix)).sort();
      const start = Number(cursor ?? 0);
      const hasMore = start + 2 < paths.length;
      return { blobs: paths.slice(start, start + 2).map((pathname) => ({ pathname })), hasMore, cursor: hasMore ? String(start + 2) : undefined };
    }),
    put: vi.fn(async (pathname: string, text: string, options: { access: string; ifMatch?: string; allowOverwrite?: boolean }) => {
      expect(options.access).toBe('private');
      const previous = blobs.files.get(pathname);
      if (options.ifMatch && previous?.etag !== options.ifMatch) throw new sdk.BlobPreconditionFailedError();
      if (previous && !options.allowOverwrite) throw new Error('Already exists');
      blobs.files.set(pathname, { text, etag: String(++blobs.revision) });
    }),
  };
});

import { get, put } from '@vercel/blob';
import { createBlobStorage } from './lib/blob-storage';
import { createStorage, openLocalStorage, reconcileMetadata, type Storage } from './lib/storage';
import { buildApp } from './app';

const input = (name: string) => ({ name, text: 'batch_id,value\nA,unchanged', rows: 1, columns: 2, status: 'Ready' as const, problemRows: 0 });
beforeEach(() => { blobs.files.clear(); blobs.revision = 0; vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('durable Blob storage', () => {
  it('shares files and metadata across fresh instances and paginated listings', async () => {
    const writer = createBlobStorage('test/shared');
    const saved: FileMeta[] = [];
    for (let i = 0; i < 5; i++) saved.push(await writer.create(input(`${i}.csv`)));
    expect(saved.map((m) => m.id)).toEqual(['100001', '100002', '100003', '100004', '100005']);
    const reader = createBlobStorage('test/shared');
    expect((await reader.list()).map((m) => m.id).sort()).toEqual(saved.map((m) => m.id).sort());
    expect(await reader.read(saved[0].id)).toBe(input('0.csv').text);
    const changed = await reader.patch(saved[0].id, { status: 'Needs Review', problemRows: 1 });
    expect(changed).toMatchObject({ id: saved[0].id, uploadedAt: saved[0].uploadedAt, status: 'Needs Review', problemRows: 1 });
    expect(await writer.get(saved[0].id)).toEqual(changed);
    expect(await writer.read(saved[0].id)).toBe(input('0.csv').text);
    expect(await createBlobStorage('test/other').list()).toEqual([]);
  });

  it('replaces a result in place, keeping its File ID, without changing its input', async () => {
    const storage = createBlobStorage('test/replace');
    const source = await storage.create(input('source.csv'));
    const first = await storage.put(`${source.id}-M`, { ...input('result_source_mass.csv'), status: 'Processed' });
    const second = await createBlobStorage('test/replace').put(`${source.id}-M`, { ...input(first.name), text: 'new result', status: 'Processed' });
    expect(second.id).toBe(first.id);
    expect((await storage.list()).filter((f) => f.id === first.id)).toEqual([second]);
    expect(await storage.read(second.id)).toBe('new result');
    expect(await storage.read(source.id)).toBe(input('source.csv').text);
  });

  it('creates a result at an exact ID only once, leaving an existing one unchanged', async () => {
    const storage = createBlobStorage('test/create-at');
    const source = await storage.create(input('source.csv'));
    const id = `${source.id}-M`;
    const first = await storage.createAt(id, { ...input('result_source_mass.csv'), status: 'Processed' });
    expect(first).toMatchObject({ id, status: 'Processed' });
    const before = blobs.files.get(`test/create-at/files/${id}.json`);
    expect(await storage.createAt(id, { ...input('other.csv'), text: 'overwritten', status: 'Processed' })).toBeUndefined();
    expect(blobs.files.get(`test/create-at/files/${id}.json`)).toEqual(before); // same bytes, same ETag
    expect(await storage.get(id)).toEqual(first);
  });

  it('lets only one of two servers create the same result at once', async () => {
    const [a, b] = [createBlobStorage('test/create-race'), createBlobStorage('test/create-race')];
    const source = await a.create(input('source.csv'));
    const id = `${source.id}-V`;
    const made = await Promise.all([a, b].map((s, i) => s.createAt(id, { ...input(`${i}.csv`), text: `run ${i}`, status: 'Processed' })));
    const winner = made.findIndex((m) => m);
    expect(made.filter((m) => m)).toHaveLength(1);
    expect(await a.read(id)).toBe(`run ${winner}`);
  });

  it('reports a failed result create as an error, not as already existing', async () => {
    const storage = createBlobStorage('test/create-fail');
    vi.mocked(put).mockRejectedValueOnce(new Error('Store unavailable'));
    await expect(storage.createAt('100001-V', { ...input('r.csv'), status: 'Processed' })).rejects.toThrow('Store unavailable');
  });

  it('never gives the same File ID to uploads on two servers at once', async () => {
    const [a, b] = [createBlobStorage('test/claims'), createBlobStorage('test/claims')];
    const made = await Promise.all([a, b, a, b, a, b].map((s, i) => s.create(input(`${i}.csv`))));
    expect(made.map((m) => m.id).sort()).toEqual(['100001', '100002', '100003', '100004', '100005', '100006']);
    expect(await a.list()).toHaveLength(6);
    const imported = await b.create({ ...input('copy.csv'), status: 'Processed' }, 'M');
    expect(imported.id).toBe('100007-M'); // an uploaded result claims its own new base number
    expect((await a.create(input('next.csv'))).id).toBe('100008');
  });

  it('looks up a file directly by its ID and treats anything else as missing', async () => {
    const storage = createBlobStorage('test/lookup');
    const file = await storage.create(input('one.csv'));
    vi.mocked(get).mockClear();
    expect(await storage.get(file.id)).toEqual(file);
    expect(vi.mocked(get)).toHaveBeenCalledTimes(1); // one read, no listing
    for (const id of ['../claims/100001', 'abc', '100001-x'])
      await expect(storage.get(id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('seeds samples idempotently even when two instances start together', async () => {
    const a = createBlobStorage('test/seed');
    const b = createBlobStorage('test/seed');
    await Promise.all([a.seed('100001', input('sample.csv')), b.seed('100001', input('sample.csv'))]);
    const original = await a.list();
    expect(original).toHaveLength(1);
    expect(original[0].id).toBe('100001');
    await b.seed('100001', { ...input('sample.csv'), text: 'must not replace' });
    expect(await b.list()).toEqual(original);
    expect(await b.read(original[0].id)).toBe(input('sample.csv').text);
    expect((await a.create(input('upload.csv'))).id).toBe('100002'); // a seeded number is never reused
  });

  it('rejects a metadata update when another instance changes the object', async () => {
    const storage = createBlobStorage('test/conflict');
    const file = await storage.create(input('conflict.csv'));
    const originalGet = vi.mocked(get).getMockImplementation()!;
    vi.mocked(get).mockImplementationOnce(async (...args) => {
      const result = await originalGet(...args);
      const stored = [...blobs.files].find(([pathname]) => pathname.endsWith(`/files/${file.id}.json`))![1];
      stored.etag = 'changed-by-other-instance';
      return result;
    });
    await expect(storage.patch(file.id, { status: 'Needs Review' })).rejects.toMatchObject({ statusCode: 409 });
    expect(await storage.get(file.id)).toEqual(file);
  });

  it('propagates service failures rather than silently falling back to local disk', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('Store unavailable'));
    await expect(createBlobStorage('test/failure').create(input('fail.csv'))).rejects.toThrow('Store unavailable');
  });

  it('serves a processed result from a fresh API instance using shared durable storage', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RECLAIM_DATA_DIR', undefined);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only-token');
    vi.stubEnv('RECLAIM_BLOB_PREFIX', 'test/api');
    const first = await buildApp(false);
    let second: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      const files = (await first.inject('/api/files')).json<FileMeta[]>();
      expect(files).toHaveLength(5);
      const processed = await first.inject({ method: 'POST', url: '/api/process', payload: { fileId: files[0].id, processor: 'mass' } });
      expect(processed.statusCode).toBe(200);
      const result = processed.json<FileMeta>();
        second = await buildApp(false);
      expect((await second.inject('/api/files')).json<FileMeta[]>()).toHaveLength(6);
      const preview = await second.inject(`/api/files/${result.id}/rows`);
      expect(preview.statusCode).toBe(200);
      expect(preview.json().rows).toHaveLength(25);
      const download = await second.inject(`/api/files/${result.id}/download`);
      expect(download.statusCode).toBe(200);
      expect(download.body).toContain('processing_status,validation_errors');
      expect((await second.inject('/api/not-found')).statusCode).toBe(404);
    } finally { await first.close(); await second?.close(); }
  });

  it('keeps same-named uploads and their results apart by File ID across fresh API instances', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RECLAIM_DATA_DIR', undefined);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only-token');
    vi.stubEnv('RECLAIM_BLOB_PREFIX', 'test/identity');
    const first = await buildApp(false);
    let second: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      // Two different partner A files uploaded under one name, as the browser's file chooser sends them.
      const samples = (await first.inject('/api/files')).json<FileMeta[]>().filter((f) => f.name.startsWith('partner_a_'));
      const texts = await Promise.all(samples.map(async (f) => (await first.inject(`/api/files/${f.id}/download`)).body));
      const uploads: FileMeta[] = [];
      for (const text of texts) {
        const form = new FormData();
        form.append('file', new Blob([text], { type: 'text/csv' }), 'same.csv');
        const req = new Request('http://localhost/', { method: 'POST', body: form });
        const res = await first.inject({ method: 'POST', url: '/api/files', headers: { 'content-type': req.headers.get('content-type')! }, payload: Buffer.from(await req.arrayBuffer()) });
        uploads.push(res.json<FileMeta>());
      }
      expect(uploads.map((u) => u.name)).toEqual(['same.csv', 'same.csv']);
      expect(uploads[0].id).not.toBe(uploads[1].id);
      const results: FileMeta[] = [];
      for (const u of uploads) results.push((await first.inject({ method: 'POST', url: '/api/process', payload: { fileId: u.id, processor: 'validation' } })).json<FileMeta>());
      expect(results.map((r) => r.id)).toEqual(uploads.map((u) => `${u.id}-V`));

      // A fresh instance reads each file back by its ID alone.
        second = await buildApp(false);
      const listed = (await second.inject('/api/files')).json<FileMeta[]>();
      for (const id of [...uploads, ...results].map((f) => f.id)) expect(listed.filter((f) => f.id === id)).toHaveLength(1);
      const bodies = [];
      for (const r of results) {
        const download = await second.inject(`/api/files/${r.id}/download`);
        expect(download.statusCode).toBe(200);
        expect(download.body).toContain(r.id); // its own result_id
        bodies.push(download.body);
      }
      expect(bodies[0]).not.toBe(bodies[1]);
    } finally { await first.close(); await second?.close(); }
  });

  it('reconciles stale metadata when two servers start together, without failing either', async () => {
    const csv = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct\nA-1,2026-09-01,,40,30,30\n';
    const stale = await createBlobStorage('test/reconcile').create({ name: 'old.csv', text: csv, rows: 1, columns: 6, status: 'Ready' });
    const [a, b] = [createBlobStorage('test/reconcile'), createBlobStorage('test/reconcile')];
    await expect(Promise.all([reconcileMetadata(a), reconcileMetadata(b)])).resolves.toHaveLength(2);
    expect(await a.get(stale.id)).toMatchObject({ status: 'Needs Review', problemRows: 1 });
    // Listing on either server is a read and never conflicts.
    await expect(Promise.all([a.list(), b.list(), a.list()])).resolves.toHaveLength(3);
  });

  it('treats a 409 during reconciliation as already done, but surfaces other failures', async () => {
    const meta = { id: 'x', name: 'x.csv', rows: 1, columns: 6, uploadedAt: '', status: 'Ready', problemRows: 3 } as FileMeta;
    const store = (statusCode: number) => ({
      list: async () => [meta],
      read: async () => '',
      patch: async () => { throw Object.assign(new Error('conflict'), { statusCode }); },
    });
    await expect(reconcileMetadata(store(409))).resolves.toEqual({ updated: [], skipped: [] });
    await expect(reconcileMetadata(store(500))).rejects.toThrow('conflict');
  });

  it('refuses a Vercel startup without durable storage configuration', async () => {
    await expect(createStorage({ VERCEL: '1' })).rejects.toThrow('Connect a private Vercel Blob store');
    await expect(createStorage({ VERCEL: '1', BLOB_READ_WRITE_TOKEN: '' })).rejects.toThrow('Connect a private Vercel Blob store');
  });
});

// The same rules for both backends: the local folder (a fresh temp folder) and Blob (the mocked SDK above).
const tempDirs: string[] = [];
const tempDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reclaim-storage-')); tempDirs.push(dir); return dir; };
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe.each([
  ['local folder', () => openLocalStorage(tempDir())],
  ['Vercel Blob', async () => createBlobStorage(`test/contract-${Math.random()}`)],
] as const)('storage contract: %s', (_, open: () => Promise<Storage>) => {
  it('numbers new uploads from 100001 and gives an uploaded result its code', async () => {
    const storage = await open();
    expect((await storage.create(input('a.csv'))).id).toBe('100001');
    expect((await storage.create(input('b.csv'))).id).toBe('100002');
    expect((await storage.create({ ...input('r.csv'), status: 'Processed' }, 'M')).id).toBe('100003-M');
    expect((await storage.create({ ...input('c.csv'), text: (id) => `file_id\n${id}` })).id).toBe('100004');
    expect(await storage.read('100004')).toBe('file_id\n100004');
  });

  it('hands out copies, so changing a returned file never changes what is stored', async () => {
    const storage = await open();
    const file = await storage.create(input('a.csv'));
    (await storage.get(file.id)).name = 'changed.csv';
    (await storage.list())[0].status = 'Processed';
    file.rows = 99;
    expect(await storage.get(file.id)).toMatchObject({ name: 'a.csv', status: 'Ready', rows: 1 });
  });

  it('replaces a file in place with put, and refuses createAt on a taken ID', async () => {
    const storage = await open();
    const source = await storage.create(input('source.csv'));
    const id = `${source.id}-V`;
    const first = await storage.createAt(id, { ...input('r.csv'), text: 'first', status: 'Processed' });
    expect(first?.id).toBe(id);
    expect(await storage.createAt(id, { ...input('other.csv'), text: 'second', status: 'Processed' })).toBeUndefined();
    expect(await storage.read(id)).toBe('first');
    await storage.put(id, { ...input('r.csv'), text: 'replaced', status: 'Processed' });
    expect(await storage.read(id)).toBe('replaced');
    expect((await storage.list()).filter((f) => f.id === id)).toHaveLength(1);
  });

  it('updates metadata fields with patch, keeping the ID and upload time', async () => {
    const storage = await open();
    const file = await storage.create(input('a.csv'));
    const changed = await storage.patch(file.id, { archived: true, archivedAt: '2026-11-11T00:00:00Z' });
    expect(changed).toEqual({ ...file, archived: true, archivedAt: '2026-11-11T00:00:00Z' });
    expect(await storage.get(file.id)).toEqual(changed);
  });

  it('seeds a sample once and never overwrites it', async () => {
    const storage = await open();
    await storage.seed('100001', input('sample.csv'));
    await storage.seed('100001', { ...input('sample.csv'), text: 'must not replace' });
    expect(await storage.read('100001')).toBe(input('sample.csv').text);
    expect((await storage.create(input('upload.csv'))).id).toBe('100002');
  });

  it('treats anything that is not a stored File ID as missing', async () => {
    const storage = await open();
    for (const id of ['100009', '../meta', 'x'])
      await expect(storage.get(id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('local folder storage', () => {
  it('gives two uploads at the same time different File IDs, and lets only one create a result', async () => {
    const storage = await openLocalStorage(tempDir());
    const ids = (await Promise.all([1, 2, 3].map((n) => storage.create(input(`${n}.csv`))))).map((f) => f.id);
    expect(new Set(ids).size).toBe(3);
    const both = await Promise.all([1, 2].map((n) => storage.createAt('100001-M', { ...input(`r${n}.csv`), status: 'Processed' })));
    expect(both.filter(Boolean)).toHaveLength(1);
  });

  it('keeps the previous meta.json when a metadata write is interrupted, and still starts', async () => {
    const dir = tempDir();
    const storage = await openLocalStorage(dir);
    const file = await storage.create(input('a.csv'));
    const before = fs.readFileSync(path.join(dir, 'meta.json'), 'utf8');
    fs.mkdirSync(path.join(dir, 'meta.json.tmp')); // the temporary file cannot be written
    await expect(storage.patch(file.id, { status: 'Needs Review' })).rejects.toThrow();
    expect(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
    expect(await storage.get(file.id)).toEqual(file); // the failed change is undone in memory too
    await expect(storage.create(input('b.csv'))).rejects.toThrow();
    expect((await storage.list()).map((f) => f.id)).toEqual([file.id]);

    fs.rmdirSync(path.join(dir, 'meta.json.tmp'));
    const reopened = await openLocalStorage(dir);
    expect(await reopened.list()).toEqual([file]);
    expect((await reopened.create(input('b.csv'))).id).toBe('100002');
  });

  it('creates its folder when opened', async () => {
    const dir = path.join(tempDir(), 'new');
    expect(fs.existsSync(dir)).toBe(false);
    await openLocalStorage(dir);
    expect(fs.existsSync(path.join(dir, 'files'))).toBe(true);
  });
});

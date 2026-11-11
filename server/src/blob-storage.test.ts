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

const input = (name: string) => ({ name, text: 'batch_id,value\nA,unchanged', rows: 1, columns: 2, status: 'Ready' as const, problemRows: 0 });
beforeEach(() => { blobs.files.clear(); blobs.revision = 0; vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('durable Blob storage', () => {
  it('shares files and metadata across fresh instances and paginated listings', async () => {
    const writer = createBlobStorage('test/shared');
    const saved: FileMeta[] = [];
    for (let i = 0; i < 5; i++) saved.push(await writer.save(input(`${i}.csv`)));
    const reader = createBlobStorage('test/shared');
    expect((await reader.list()).map((m) => m.id).sort()).toEqual(saved.map((m) => m.id).sort());
    expect(await reader.read(saved[0].id)).toBe(input('0.csv').text);
    const changed = await reader.patch(saved[0].id, { status: 'Needs Review', problemRows: 1 });
    expect(changed).toMatchObject({ id: saved[0].id, uploadedAt: saved[0].uploadedAt, status: 'Needs Review', problemRows: 1 });
    expect(await writer.get(saved[0].id)).toEqual(changed);
    expect(await writer.read(saved[0].id)).toBe(input('0.csv').text);
    expect(await createBlobStorage('test/other').list()).toEqual([]);
  });

  it('atomically replaces a named result with a fresh ID without changing its input', async () => {
    const storage = createBlobStorage('test/replace');
    const source = await storage.save(input('source.csv'));
    const first = await storage.save({ ...input('result_source_mass.csv'), status: 'Processed' }, true);
    const second = await createBlobStorage('test/replace').save({ ...input(first.name), text: 'new result', status: 'Processed' }, true);
    expect(second.id).not.toBe(first.id);
    expect((await storage.list()).filter((f) => f.name === first.name)).toEqual([second]);
    await expect(storage.get(first.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await storage.read(second.id)).toBe('new result');
    expect(await storage.read(source.id)).toBe(input('source.csv').text);
  });

  it('seeds samples idempotently even when two instances start together', async () => {
    const a = createBlobStorage('test/seed');
    const b = createBlobStorage('test/seed');
    await Promise.all([a.seed(input('sample.csv')), b.seed(input('sample.csv'))]);
    const original = await a.list();
    expect(original).toHaveLength(1);
    await b.seed({ ...input('sample.csv'), text: 'must not replace' });
    expect(await b.list()).toEqual(original);
    expect(await b.read(original[0].id)).toBe(input('sample.csv').text);
  });

  it('rejects a metadata update when another instance changes the object', async () => {
    const storage = createBlobStorage('test/conflict');
    const file = await storage.save(input('conflict.csv'));
    const originalGet = vi.mocked(get).getMockImplementation()!;
    vi.mocked(get).mockImplementationOnce(async (...args) => {
      const result = await originalGet(...args);
      const stored = [...blobs.files.values()][0];
      stored.etag = 'changed-by-other-instance';
      return result;
    });
    await expect(storage.patch(file.id, { status: 'Needs Review' })).rejects.toMatchObject({ statusCode: 409 });
    expect(await storage.get(file.id)).toEqual(file);
  });

  it('propagates service failures rather than silently falling back to local disk', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('Store unavailable'));
    await expect(createBlobStorage('test/failure').save(input('fail.csv'))).rejects.toThrow('Store unavailable');
  });

  it('serves a processed result from a fresh API instance using shared durable storage', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RECLAIM_DATA_DIR', undefined);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only-token');
    vi.stubEnv('RECLAIM_BLOB_PREFIX', 'test/api');
    vi.resetModules();
    const first = await (await import('./app')).buildApp(false);
    let second: Awaited<ReturnType<typeof import('./app')['buildApp']>> | undefined;
    try {
      const files = (await first.inject('/api/files')).json<FileMeta[]>();
      expect(files).toHaveLength(5);
      const processed = await first.inject({ method: 'POST', url: '/api/process', payload: { fileId: files[0].id, processor: 'mass' } });
      expect(processed.statusCode).toBe(200);
      const result = processed.json<FileMeta>();
      vi.resetModules();
      second = await (await import('./app')).buildApp(false);
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

  it('reconciles stale metadata when two servers start together, without failing either', async () => {
    const csv = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct\nA-1,2026-09-01,,40,30,30\n';
    const stale = await createBlobStorage('test/reconcile').save({ name: 'old.csv', text: csv, rows: 1, columns: 6, status: 'Ready' });
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RECLAIM_DATA_DIR', undefined);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only-token');
    vi.resetModules();
    const { reconcileMetadata } = await import('./lib/storage');
    const [a, b] = [createBlobStorage('test/reconcile'), createBlobStorage('test/reconcile')];
    await expect(Promise.all([reconcileMetadata(a), reconcileMetadata(b)])).resolves.toHaveLength(2);
    expect(await a.get(stale.id)).toMatchObject({ status: 'Needs Review', problemRows: 1 });
    // Listing on either server is a read and never conflicts.
    await expect(Promise.all([a.list(), b.list(), a.list()])).resolves.toHaveLength(3);
  });

  it('treats a 409 during reconciliation as already done, but surfaces other failures', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RECLAIM_DATA_DIR', undefined);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-only-token');
    vi.resetModules();
    const { reconcileMetadata } = await import('./lib/storage');
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
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RECLAIM_DATA_DIR', undefined);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', undefined);
    vi.resetModules();
    await expect(import('./lib/storage')).rejects.toThrow('Connect a private Vercel Blob store');
  });
});

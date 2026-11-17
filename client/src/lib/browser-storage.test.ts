import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewFile } from '../../../shared/storage';
import { createMemoryStorage, openBrowserStorage, STORAGE_FULL_MESSAGE, type BrowserStorage } from './browser-storage';

// IndexedDB is simulated with fake-indexeddb, since jsdom has none.

let databases = 0;
const freshName = () => `storage-test-${++databases}`;

const input = (name: string, text = 'batch_id\nA-1\n'): NewFile => ({ name, text, rows: 1, columns: 1, status: 'Ready', problemRows: 0 });

describe.each<[string, () => Promise<BrowserStorage>]>([
  ['IndexedDB', () => openBrowserStorage(freshName())],
  ['memory', async () => createMemoryStorage()],
])('%s storage', (_kind, open) => {
  it('gives each upload the next base ID, plus a function code for a result', async () => {
    const store = await open();
    expect((await store.create(input('a.csv'))).id).toBe('100001');
    expect((await store.create(input('b.csv'), 'M')).id).toBe('100002-M');
    expect((await store.create({ ...input('c.csv'), text: (id) => `file_id\n${id}\n` })).id).toBe('100003');
    expect(await store.read('100003')).toBe('file_id\n100003\n');
  });

  it('replaces a file with put and keeps its ID', async () => {
    const store = await open();
    await store.put('100001-V', input('first.csv', 'one'));
    const replaced = await store.put('100001-V', input('second.csv', 'two'));
    expect(replaced).toMatchObject({ id: '100001-V', name: 'second.csv' });
    expect(await store.read('100001-V')).toBe('two');
    expect(await store.list()).toHaveLength(1);
  });

  it('refuses createAt for a taken ID and changes nothing', async () => {
    const store = await open();
    expect(await store.createAt('100001-M', input('first.csv', 'one'))).toMatchObject({ id: '100001-M' });
    expect(await store.createAt('100001-M', input('second.csv', 'two'))).toBeUndefined();
    expect(await store.read('100001-M')).toBe('one');
  });

  it('patches metadata and drops a field set to undefined', async () => {
    const store = await open();
    const { id } = await store.create(input('a.csv'));
    expect(await store.patch(id, { archived: true, archivedAt: '2026-11-17T00:00:00.000Z' })).toMatchObject({ archived: true, archivedAt: '2026-11-17T00:00:00.000Z' });
    const restored = await store.patch(id, { archived: false, archivedAt: undefined });
    expect(restored.archived).toBe(false);
    expect('archivedAt' in restored).toBe(false);
    expect('archivedAt' in (await store.get(id))).toBe(false);
  });

  it('seeds a sample only when its ID is free', async () => {
    const store = await open();
    await store.seed('100001', input('sample.csv', 'one'));
    await store.seed('100001', input('changed.csv', 'two'));
    expect(await store.get('100001')).toMatchObject({ name: 'sample.csv' });
    expect(await store.read('100001')).toBe('one');
  });

  it('lists files oldest upload first', async () => {
    const store = await open();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
      await store.put('100002', input('later.csv'));
      vi.setSystemTime(new Date('2026-11-17T09:00:00Z'));
      await store.put('100001', input('earlier.csv'));
    } finally {
      vi.useRealTimers();
    }
    expect((await store.list()).map((f) => f.name)).toEqual(['earlier.csv', 'later.csv']);
  });

  it('answers 404 for a missing file or a value that is not a File ID', async () => {
    const store = await open();
    for (const id of ['100009', 'not-an-id', '../x']) {
      await expect(store.get(id)).rejects.toMatchObject({ statusCode: 404, message: 'File not found' });
      await expect(store.read(id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(store.patch(id, { archived: true })).rejects.toMatchObject({ statusCode: 404 });
    }
  });

  it('clears every file, so numbering starts again', async () => {
    const store = await open();
    await store.create(input('a.csv'));
    await store.create(input('b.csv'));
    await store.clear();
    expect(await store.list()).toEqual([]);
    expect((await store.create(input('c.csv'))).id).toBe('100001');
  });
});

describe('IndexedDB storage only', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps files when the database is opened again, as after a refresh', async () => {
    const name = freshName();
    const before = await openBrowserStorage(name);
    const saved = await before.create(input('kept.csv', 'kept'));
    const after = await openBrowserStorage(name);
    expect(await after.list()).toEqual([saved]);
    expect(await after.read(saved.id)).toBe('kept');
  });

  it('gives uploads made at the same time different IDs', async () => {
    const store = await openBrowserStorage(freshName());
    const made = await Promise.all(['a', 'b', 'c'].map((n) => store.create(input(`${n}.csv`))));
    expect(made.map((f) => f.id).sort()).toEqual(['100001', '100002', '100003']);
  });

  it('says browser storage is full when a save runs out of space, and saves nothing', async () => {
    const store = await openBrowserStorage(freshName());
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    await expect(store.create(input('big.csv'))).rejects.toMatchObject({ statusCode: 507, message: STORAGE_FULL_MESSAGE });
    expect(await store.list()).toEqual([]);
  });
});

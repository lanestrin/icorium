import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileService, seedSampleFiles } from '../../../shared/file-service';
import { createBrowserExport } from './browser-export';
import { openBrowserStorage } from './browser-storage';
import { BROWSER_DB } from './demo';
import { SAMPLE_FILES } from './samples';

const names = async () => (await indexedDB.databases()).map((db) => db.name);
const listBrowserFiles = () => createBrowserExport().list();
const readBrowserFile = (id: string) => createBrowserExport().read(id);

afterEach(() => vi.unstubAllGlobals());

describe('browser file export', () => {
  it('finds nothing, and creates nothing, when this browser has no workspace database', async () => {
    expect(await listBrowserFiles()).toEqual([]);
    expect(await names()).not.toContain(BROWSER_DB);
    await expect(readBrowserFile('100001')).rejects.toThrow(/no longer in this browser/);
  });

  it('lists active and archived files and reads their CSV, without changing the database', async () => {
    const storage = await openBrowserStorage(BROWSER_DB);
    await seedSampleFiles(storage, SAMPLE_FILES);
    const service = createFileService(storage);
    const before = await service.list();
    await service.archive({ ids: [before[0].id], archived: true });
    const expected = await service.list();

    const listed = await listBrowserFiles();
    expect(listed).toEqual(expected);
    expect(listed.some((file) => file.archived)).toBe(true);
    const { name, text } = await readBrowserFile(listed[0].id);
    expect(name).toBe(listed[0].name);
    expect(text.length).toBeGreaterThan(0);
    expect(await listBrowserFiles()).toEqual(expected); // reading changed nothing
  });

  it('opens the database once for a whole dialog, however many files are listed and read', async () => {
    const storage = await openBrowserStorage(BROWSER_DB);
    await seedSampleFiles(storage, SAMPLE_FILES);
    const real = indexedDB;
    const open = vi.fn(real.open.bind(real));
    vi.stubGlobal('indexedDB', { open, databases: real.databases.bind(real) });
    const session = createBrowserExport();
    const files = await session.list();
    for (const file of files) await session.read(file.id);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('where the browser cannot list databases it opens the existing one without seeding samples', async () => {
    const real = indexedDB;
    await new Promise((resolve) => { const request = real.deleteDatabase(BROWSER_DB); request.onsuccess = request.onerror = () => resolve(undefined); });
    vi.stubGlobal('indexedDB', { open: real.open.bind(real) }); // no databases()
    expect(await createBrowserExport().list()).toEqual([]); // opened empty; the five samples were not added
    vi.unstubAllGlobals();
    expect(await createFileService(await openBrowserStorage(BROWSER_DB)).list()).toEqual([]);
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createFileService, seedSampleFiles } from '../../../shared/file-service';
import { listBrowserFiles, readBrowserFile } from './browser-export';
import { openBrowserStorage } from './browser-storage';
import { BROWSER_DB } from './demo';
import { SAMPLE_FILES } from './samples';

const names = async () => (await indexedDB.databases()).map((db) => db.name);

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
});

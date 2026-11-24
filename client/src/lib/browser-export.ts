import { createFileService } from '../../../shared/file-service';
import type { FileMeta } from '../../../shared/types';
import { openBrowserStorage } from './browser-storage';
import { BROWSER_DB } from './demo';

// Export of the files kept in this browser before sign-in was required (17.5). Read-only: it never seeds the five
// samples, never changes or deletes anything in the browser database, and never uploads to an account.

/** Opens the browser workspace's files, or null when this browser has none (no database to read). */
async function openExisting(idb: Pick<IDBFactory, 'databases'> | undefined = globalThis.indexedDB) {
  // Where the browser can list databases, a missing one is not created just to be read.
  if (idb && typeof idb.databases === 'function') {
    const names = (await idb.databases()).map((db) => db.name);
    if (!names.includes(BROWSER_DB)) return null;
  }
  return createFileService(await openBrowserStorage(BROWSER_DB));
}

/**
 * A reader for one export dialog. It opens the browser database once and reuses it for every list and download,
 * and tries again after a failed open.
 */
export function createBrowserExport() {
  let opened: ReturnType<typeof openExisting> | undefined;
  const open = () => {
    opened ??= openExisting().catch((error) => { opened = undefined; throw error; });
    return opened;
  };
  return {
    /** Every file kept in this browser, active and archived, inputs and results; empty when there is none. */
    async list(): Promise<FileMeta[]> {
      const files = await open();
      return files ? files.list() : [];
    },
    /** One browser file's name and CSV text, exactly as the workspace's own download gives it. */
    async read(id: string): Promise<{ name: string; text: string }> {
      const files = await open();
      if (!files) throw new Error('This file is no longer in this browser.');
      return files.download(id);
    },
  };
}

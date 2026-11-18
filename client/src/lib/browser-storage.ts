import { httpError } from '../../../shared/csv';
import { nextBaseId, parseFileId, type FileMeta } from '../../../shared/types';
import type { NewFile, Storage } from '../../../shared/storage';

// Where the workspace's files live in the browser: IndexedDB, so files survive a refresh on this device,
// or memory when the browser won't open IndexedDB. Both implement the same Storage as the server's.

/** A browser storage, which can also be emptied (Clear my data). */
export interface BrowserStorage extends Storage {
  /** Deletes every file and its metadata. */
  clear(): Promise<void>;
}

export const STORAGE_FULL_MESSAGE = 'Browser storage is full. Download the results you need, then use Clear my data to make room.';

/** A full browser storage becomes a clear message; any other error is passed on unchanged. */
function storageError(error: unknown) {
  return (error as { name?: string } | null)?.name === 'QuotaExceededError' ? httpError(507, STORAGE_FULL_MESSAGE) : error;
}

const notFound = () => httpError(404, 'File not found');

/** The metadata and text to save for this file. Fields set to undefined (archivedAt on restore) are left out. */
function toSaved(id: string, input: NewFile) {
  const { text, ...rest } = input;
  return { meta: withoutUndefined({ ...rest, id, uploadedAt: new Date().toISOString() }), text };
}

function withoutUndefined(meta: FileMeta): FileMeta {
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined)) as FileMeta;
}

const byUploadTime = (a: FileMeta, b: FileMeta) => a.uploadedAt.localeCompare(b.uploadedAt);

/** The result of one IndexedDB request. */
function promised<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Opens (or creates) this IndexedDB database. Store "meta" holds each file's FileMeta keyed by its File ID,
 * store "files" holds its CSV text under the same key. Every operation is one transaction over both stores,
 * and IndexedDB runs read-write transactions one at a time, even across tabs, so picking a new File ID and
 * saving it can never race another upload.
 */
export async function openBrowserStorage(name = 'reclaim-studio'): Promise<BrowserStorage> {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('meta', { keyPath: 'id' });
    request.result.createObjectStore('files');
  };
  const db = await promised(request);

  /** Runs work in one transaction and resolves with its result once the transaction has committed. */
  async function transact<T>(mode: IDBTransactionMode, work: (meta: IDBObjectStore, files: IDBObjectStore) => Promise<T>): Promise<T> {
    const tx = db.transaction(['meta', 'files'], mode);
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('The browser stopped saving this file.'));
    });
    let result: T;
    try {
      result = await work(tx.objectStore('meta'), tx.objectStore('files'));
    } catch (error) {
      committed.catch(() => {}); // the abort below is the reason, already being thrown
      try { tx.abort(); } catch { /* already finished */ }
      throw storageError(error);
    }
    try {
      await committed;
    } catch (error) {
      throw storageError(error);
    }
    return result;
  }

  async function findMeta(meta: IDBObjectStore, id: string) {
    const found = parseFileId(id) ? await promised(meta.get(id) as IDBRequest<FileMeta | undefined>) : undefined;
    if (!found) throw notFound();
    return found;
  }

  async function save(meta: IDBObjectStore, files: IDBObjectStore, id: string, input: NewFile) {
    if (!parseFileId(id)) throw new Error(`Not a File ID: ${id}`);
    const saved = toSaved(id, input);
    await promised(meta.put(saved.meta));
    await promised(files.put(saved.text, id));
    return saved.meta;
  }

  const store: BrowserStorage = {
    list: () => transact('readonly', async (meta) => (await promised(meta.getAll() as IDBRequest<FileMeta[]>)).sort(byUploadTime)),
    get: (id) => transact('readonly', (meta) => findMeta(meta, id)),
    read: (id) => transact('readonly', async (meta, files) => {
      await findMeta(meta, id);
      return promised(files.get(id) as IDBRequest<string>);
    }),
    patch: (id, fields) => transact('readwrite', async (meta) => {
      const updated = withoutUndefined({ ...(await findMeta(meta, id)), ...fields });
      await promised(meta.put(updated));
      return updated;
    }),
    // Picking the number and saving it happen in the same transaction, so two uploads never get the same one.
    create: (input, code) => transact('readwrite', async (meta, files) => {
      const base = nextBaseId((await promised(meta.getAllKeys())).map(String));
      const id = code ? `${base}-${code}` : base;
      return save(meta, files, id, { ...input, text: typeof input.text === 'function' ? input.text(id) : input.text });
    }),
    put: (id, input) => transact('readwrite', (meta, files) => save(meta, files, id, input)),
    createAt: (id, input) => transact('readwrite', async (meta, files) => {
      if (await promised(meta.getKey(id))) return undefined;
      return save(meta, files, id, input);
    }),
    seed: (id, input) => transact('readwrite', async (meta, files) => {
      if (!(await promised(meta.getKey(id)))) await save(meta, files, id, input);
    }),
    clear: () => transact('readwrite', async (meta, files) => {
      await promised(meta.clear());
      await promised(files.clear());
    }),
  };
  return store;
}

/** The same storage kept in memory, for a browser that won't open IndexedDB. Everything is gone on refresh. */
export function createMemoryStorage(): BrowserStorage {
  const saved = new Map<string, { meta: FileMeta; text: string }>();
  const find = (id: string) => {
    const file = parseFileId(id) ? saved.get(id) : undefined;
    if (!file) throw notFound();
    return file;
  };
  const put = (id: string, input: NewFile) => {
    if (!parseFileId(id)) throw new Error(`Not a File ID: ${id}`);
    const file = toSaved(id, input);
    saved.set(id, file);
    return structuredClone(file.meta);
  };

  return {
    list: async () => [...saved.values()].map((f) => structuredClone(f.meta)).sort(byUploadTime),
    get: async (id) => structuredClone(find(id).meta),
    read: async (id) => find(id).text,
    patch: async (id, fields) => {
      const file = find(id);
      file.meta = withoutUndefined({ ...file.meta, ...fields });
      return structuredClone(file.meta);
    },
    create: async (input, code) => {
      const base = nextBaseId([...saved.keys()]);
      const id = code ? `${base}-${code}` : base;
      return put(id, { ...input, text: typeof input.text === 'function' ? input.text(id) : input.text });
    },
    put: async (id, input) => put(id, input),
    createAt: async (id, input) => (saved.has(id) ? undefined : put(id, input)),
    seed: async (id, input) => { if (!saved.has(id)) put(id, input); },
    clear: async () => { saved.clear(); },
  };
}

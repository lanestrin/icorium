import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FIRST_FILE_ID, nextBaseId, parseFileId, type FileMeta, type ProcessorCode } from '../../../shared/types';
import { httpError, parseCsv, toCsv } from './csv';
import { findProblems, stampFileIds } from '../processing';
import { createBlobStorage } from './blob-storage';

// Storage: the only code that touches the disk (local folder) or Vercel Blob. Nothing happens when this
// module is imported; buildApp opens storage with createStorage() at startup.

const DEFAULT_DATA = path.join(import.meta.dirname, '../../data');
const SAMPLES = path.resolve(import.meta.dirname, '../../../sample-data');

/** What saving a file needs; the ID and upload time are set by storage. */
export type NewFile = Omit<FileMeta, 'id' | 'uploadedAt'> & { text: string };
/** For create(): the text may depend on the new File ID, which is written into the CSV's ID columns. */
export type NewUpload = Omit<NewFile, 'text'> & { text: string | ((id: string) => string) };

/** What both backends (local folder and Vercel Blob) provide. Files are keyed by File ID. */
export interface Storage {
  /** Every file's metadata, oldest upload first. */
  list(): Promise<FileMeta[]>;
  /** One file's metadata; 404 when there is none, or when the ID is not a File ID. */
  get(id: string): Promise<FileMeta>;
  /** One file's CSV text. */
  read(id: string): Promise<string>;
  /** Updates stored metadata fields of one file. */
  patch(id: string, fields: Partial<Omit<FileMeta, 'id'>>): Promise<FileMeta>;
  /** Saves a new upload under the next base ID (101010), or that ID plus a function code for an uploaded result (101010-M). */
  create(input: NewUpload, code?: ProcessorCode): Promise<FileMeta>;
  /** Saves a file under exactly this ID, replacing any file already there (a re-run result keeps its ID). */
  put(id: string, input: NewFile): Promise<FileMeta>;
  /** Saves a file under exactly this ID only if no file has it yet; undefined, changing nothing, when one does. */
  createAt(id: string, input: NewFile): Promise<FileMeta | undefined>;
  /** Saves a sample under its fixed ID unless that ID is already taken. */
  seed(id: string, input: NewFile): Promise<void>;
}

/**
 * Picks storage from the environment: private Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise
 * a local folder (RECLAIM_DATA_DIR, or server/data). On Vercel, starting without Blob is refused,
 * because its local disk is temporary.
 */
export async function createStorage(env: NodeJS.ProcessEnv = process.env): Promise<Storage> {
  const useBlob = !!env.BLOB_READ_WRITE_TOKEN && !env.RECLAIM_DATA_DIR;
  if (env.VERCEL && !useBlob && !env.RECLAIM_DATA_DIR)
    throw new Error('Connect a private Vercel Blob store with BLOB_READ_WRITE_TOKEN before running the API on Vercel.');
  if (useBlob) return createBlobStorage(env.RECLAIM_BLOB_PREFIX ?? `icorium/${env.VERCEL_ENV ?? 'development'}`);
  return openLocalStorage(path.resolve(env.RECLAIM_DATA_DIR ?? DEFAULT_DATA));
}

/**
 * Local-folder storage: each CSV is files/<id>.csv and all metadata is one meta.json, kept in memory.
 * meta.json is written to meta.json.tmp and then renamed over the old one, so a crash mid-write
 * leaves the previous meta.json intact.
 */
export async function openLocalStorage(dataDir: string): Promise<Storage> {
  const filesDir = path.join(dataDir, 'files');
  const metaPath = path.join(dataDir, 'meta.json');
  await mkdir(filesDir, { recursive: true });
  let metas: FileMeta[] = [];
  try {
    metas = JSON.parse(await readFile(metaPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // Data saved before File IDs used random IDs. It is demo data, so it is reset rather than migrated,
  // and never deleted automatically.
  if (metas.some((m) => !parseFileId(m.id)))
    throw new Error(`${dataDir} was created before File IDs. Stop the server, delete that folder (it holds demo data only) and start again.`);

  const filePath = (id: string) => path.join(filesDir, `${id}.csv`);

  // Metadata writes run one at a time, and each writes the metadata as it is when its turn comes,
  // so the last write always holds the newest state.
  let writing: Promise<void> = Promise.resolve();
  function persist() {
    const done = writing.then(async () => {
      await writeFile(`${metaPath}.tmp`, JSON.stringify(metas, null, 2));
      await rename(`${metaPath}.tmp`, metaPath);
    });
    writing = done.catch(() => {}); // a failed write must not block the next one
    return done;
  }

  /** Anything that is not a File ID is never looked up, so it cannot reach a file path. */
  function find(id: string) {
    const m = parseFileId(id) && metas.find((m) => m.id === id);
    if (!m) throw httpError(404, 'File not found');
    return m;
  }

  /**
   * Records this file's metadata in memory straight away, before any await, so a request running at
   * the same time sees the File ID as taken. Returns a function that undoes it if saving then fails.
   */
  function record(meta: FileMeta) {
    const previous = metas.find((m) => m.id === meta.id);
    metas = previous ? metas.map((m) => (m.id === meta.id ? meta : m)) : [...metas, meta];
    return () => {
      metas = previous ? metas.map((m) => (m.id === meta.id ? previous : m)) : metas.filter((m) => m.id !== meta.id);
    };
  }

  const store: Storage = {
    async list() {
      return structuredClone([...metas].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)));
    },

    async get(id) {
      return structuredClone(find(id));
    },

    async read(id) {
      return readFile(filePath(find(id).id), 'utf8');
    },

    async patch(id, fields) {
      const meta = { ...find(id), ...fields };
      const undo = record(meta);
      try {
        await persist();
      } catch (error) {
        undo();
        throw error;
      }
      return structuredClone(meta);
    },

    create(input, code) {
      // Picking the number and recording it happen before any await, so two uploads never get the same one.
      const base = nextBaseId(metas.map((m) => m.id));
      const id = code ? `${base}-${code}` : base;
      return store.put(id, { ...input, text: typeof input.text === 'function' ? input.text(id) : input.text });
    },

    async put(id, input) {
      if (!parseFileId(id)) throw new Error(`Not a File ID: ${id}`);
      const { text, ...rest } = input;
      const meta: FileMeta = { ...rest, id, uploadedAt: new Date().toISOString() };
      const undo = record(meta);
      try {
        await writeFile(filePath(id), text);
        await persist();
      } catch (error) {
        undo();
        throw error;
      }
      return structuredClone(meta);
    },

    async createAt(id, input) {
      // The check and put()'s in-memory record run before any await, so a request running at the same
      // time can never overwrite a result this one created, or the other way round.
      if (metas.some((m) => m.id === id)) return undefined;
      return store.put(id, input);
    },

    async seed(id, input) {
      if (!metas.some((m) => m.id === id)) await store.put(id, input);
    },
  };
  return store;
}

type Store = Pick<Storage, 'list' | 'read' | 'patch'>;

/**
 * Startup step: brings metadata saved by older versions up to date, so listing files never has to
 * write. Fills in missing problem-row counts (reading only those files) and sets inputs to Ready or
 * Needs Review from their count. Results stay Processed. Safe when several servers start together:
 * a 409 means another server updated that file first. A file whose CSV cannot be read is skipped
 * and reported rather than stopping startup.
 */
export async function reconcileMetadata(store: Store) {
  const updated: string[] = [];
  const skipped: string[] = [];
  for (const m of await store.list()) {
    let problemRows = m.problemRows;
    if (problemRows === undefined) {
      try {
        const { headers, rows } = parseCsv(await store.read(m.id));
        problemRows = findProblems(headers, rows).total;
      } catch {
        skipped.push(m.name);
        continue;
      }
    }
    const status = m.status === 'Processed' ? 'Processed' : problemRows > 0 ? 'Needs Review' : 'Ready';
    if (m.problemRows === problemRows && m.status === status) continue;
    try {
      await store.patch(m.id, { problemRows, status });
      updated.push(m.name);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 409) throw error;
    }
  }
  return { updated, skipped };
}

/**
 * Loads the synthetic CSVs as 100001–100005, in name order, each stored with its file_id column (the
 * files in sample-data are never changed). seed() skips an ID that is already taken, so this is safe
 * on every start. Delete server/data to reset.
 */
export async function seedSamples(store: Pick<Storage, 'seed'>) {
  const names = (await readdir(SAMPLES)).filter((f) => f.endsWith('.csv')).sort();
  for (const [i, name] of names.entries()) {
    const id = String(FIRST_FILE_ID + i);
    const { headers, rows } = parseCsv(await readFile(path.join(SAMPLES, name), 'utf8'));
    const problemRows = findProblems(headers, rows).total;
    const stored = stampFileIds(headers, rows, id, false);
    const input = { name, text: toCsv(stored.headers, stored.rows), rows: rows.length, columns: stored.headers.length,
      status: problemRows > 0 ? 'Needs Review' as const : 'Ready' as const, problemRows };
    await store.seed(id, input);
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { FIRST_FILE_ID, nextBaseId, parseFileId, type FileMeta, type ProcessorCode } from '../../../shared/types';
import { httpError, parseCsv } from './csv';
import { findProblems } from '../processing';
import { createBlobStorage } from './blob-storage';

// Local-file storage. Swap this module to change persistence; nothing else touches the disk.
// RECLAIM_DATA_DIR lets tests use their own throwaway folder.
const DATA = path.resolve(process.env.RECLAIM_DATA_DIR ?? path.join(import.meta.dirname, '../../data'));
const FILES = path.join(DATA, 'files');
const META = path.join(DATA, 'meta.json');
const SAMPLES = path.resolve(import.meta.dirname, '../../../sample-data');

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN && !process.env.RECLAIM_DATA_DIR;
if (process.env.VERCEL && !useBlob && !process.env.RECLAIM_DATA_DIR)
  throw new Error('Connect a private Vercel Blob store with BLOB_READ_WRITE_TOKEN before running the API on Vercel.');
if (!useBlob) fs.mkdirSync(FILES, { recursive: true });
let metas: FileMeta[] = !useBlob && fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : [];
// Data saved before File IDs used random IDs. It is demo data, so it is reset rather than migrated,
// and never deleted automatically.
if (metas.some((m) => !parseFileId(m.id)))
  throw new Error(`${DATA} was created before File IDs. Stop the server, delete that folder (it holds demo data only) and start again.`);
const persist = () => fs.writeFileSync(META, JSON.stringify(metas, null, 2));
const filePath = (id: string) => path.join(FILES, `${id}.csv`);

/** What saving a file needs; the ID and upload time are set by storage. */
export type NewFile = Omit<FileMeta, 'id' | 'uploadedAt'> & { text: string };

const localStorage = {
  list: () => [...metas].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),

  /** Anything that is not a File ID is never looked up, so it cannot reach a file path. */
  get(id: string) {
    const m = parseFileId(id) && metas.find((m) => m.id === id);
    if (!m) throw httpError(404, 'File not found');
    return m;
  },

  read: (id: string) => fs.readFileSync(filePath(localStorage.get(id).id), 'utf8'),

  /** Updates stored metadata fields of one file. */
  patch(id: string, fields: Partial<Omit<FileMeta, 'id'>>) {
    const meta = Object.assign(localStorage.get(id), fields);
    persist();
    return meta;
  },

  /**
   * Saves a new upload under the next base ID (101010), or, for an uploaded result, that base ID plus
   * its function's code (101010-M). One process runs these steps without interruption, so two uploads
   * can never get the same number.
   */
  create(input: NewFile, code?: ProcessorCode) {
    const base = nextBaseId(metas.map((m) => m.id));
    return localStorage.put(code ? `${base}-${code}` : base, input);
  },

  /** Saves a file under exactly this ID, replacing any file already there (a re-run result keeps its ID). */
  put(id: string, input: NewFile) {
    if (!parseFileId(id)) throw new Error(`Not a File ID: ${id}`);
    const { text, ...rest } = input;
    const meta: FileMeta = { ...rest, id, uploadedAt: new Date().toISOString() };
    fs.writeFileSync(filePath(id), text);
    metas = [...metas.filter((m) => m.id !== id), meta];
    persist();
    return meta;
  },

  /** Saves a sample under its fixed ID unless that ID is already taken. */
  seed(id: string, input: NewFile) {
    if (!metas.some((m) => m.id === id)) localStorage.put(id, input);
  },
};

export const storage = useBlob
  ? createBlobStorage(process.env.RECLAIM_BLOB_PREFIX ?? `icorium/${process.env.VERCEL_ENV ?? 'development'}`)
  : localStorage;

type Store = Pick<typeof storage, 'list' | 'read' | 'patch'>;

/**
 * Startup step: brings metadata saved by older versions up to date, so listing files never has to
 * write. Fills in missing problem-row counts (reading only those files) and sets inputs to Ready or
 * Needs Review from their count. Results stay Processed. Safe when several servers start together:
 * a 409 means another server updated that file first. A file whose CSV cannot be read is skipped
 * and reported rather than stopping startup.
 */
export async function reconcileMetadata(store: Store = storage) {
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

/** First run only: load the synthetic CSVs as 100001–100005, in name order. Delete server/data to reset. */
export async function seedSamples() {
  if (!useBlob && fs.existsSync(META)) return;
  const names = fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.csv')).sort();
  for (const [i, name] of names.entries()) {
    const text = fs.readFileSync(path.join(SAMPLES, name), 'utf8');
    const { headers, rows } = parseCsv(text);
    const problemRows = findProblems(headers, rows).total;
    const input = { name, text, rows: rows.length, columns: headers.length,
      status: problemRows > 0 ? 'Needs Review' as const : 'Ready' as const, problemRows };
    await storage.seed(String(FIRST_FILE_ID + i), input);
  }
}

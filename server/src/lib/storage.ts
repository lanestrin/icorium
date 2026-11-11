import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileMeta } from '../../../shared/types';
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
const persist = () => fs.writeFileSync(META, JSON.stringify(metas, null, 2));
const filePath = (id: string) => path.join(FILES, `${id}.csv`);

const localStorage = {
  list: () => [...metas].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),

  get(id: string) {
    const m = metas.find((m) => m.id === id);
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

  /** replaceByName: re-running the same processing overwrites the previous result. */
  save(input: Omit<FileMeta, 'id' | 'uploadedAt'> & { text: string }, replaceByName = false) {
    const { text, ...rest } = input;
    if (replaceByName) {
      metas.filter((m) => m.name === rest.name).forEach((m) => fs.rmSync(filePath(m.id), { force: true }));
      metas = metas.filter((m) => m.name !== rest.name);
    }
    const meta: FileMeta = { ...rest, id: randomUUID(), uploadedAt: new Date().toISOString() };
    fs.writeFileSync(filePath(meta.id), text);
    metas.push(meta);
    persist();
    return meta;
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

/** First run only: load the synthetic CSVs so the demo has data. Delete server/data to reset. */
export async function seedSamples() {
  if (!useBlob && fs.existsSync(META)) return;
  for (const name of fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.csv')).sort()) {
    const text = fs.readFileSync(path.join(SAMPLES, name), 'utf8');
    const { headers, rows } = parseCsv(text);
    const problemRows = findProblems(headers, rows).total;
    const input = { name, text, rows: rows.length, columns: headers.length,
      status: problemRows > 0 ? 'Needs Review' as const : 'Ready' as const, problemRows };
    if ('seed' in storage) await storage.seed(input);
    else await storage.save(input);
  }
}

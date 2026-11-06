import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileMeta } from '../../../shared/types';
import { httpError, parseCsv } from './csv';

// Local-file storage. Swap this module to change persistence; nothing else touches the disk.
// RECLAIM_DATA_DIR lets tests use their own throwaway folder.
const DATA = path.resolve(process.env.RECLAIM_DATA_DIR ?? path.join(import.meta.dirname, '../../data'));
const FILES = path.join(DATA, 'files');
const META = path.join(DATA, 'meta.json');
const SAMPLES = path.resolve(import.meta.dirname, '../../../sample-data');

fs.mkdirSync(FILES, { recursive: true });
let metas: FileMeta[] = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : [];
const persist = () => fs.writeFileSync(META, JSON.stringify(metas, null, 2));
const filePath = (id: string) => path.join(FILES, `${id}.csv`);

export const storage = {
  list: () => [...metas].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),

  get(id: string) {
    const m = metas.find((m) => m.id === id);
    if (!m) throw httpError(404, 'File not found');
    return m;
  },

  read: (id: string) => fs.readFileSync(filePath(storage.get(id).id), 'utf8'),

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

/** First run only: load the synthetic CSVs so the demo has data. Delete server/data to reset. */
export function seedSamples() {
  if (fs.existsSync(META)) return;
  for (const name of fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.csv')).sort()) {
    const text = fs.readFileSync(path.join(SAMPLES, name), 'utf8');
    const { headers, rows } = parseCsv(text);
    storage.save({ name, text, rows: rows.length, columns: headers.length, status: 'Ready' });
  }
}

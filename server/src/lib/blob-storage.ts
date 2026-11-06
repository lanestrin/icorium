import { createHash, randomUUID } from 'node:crypto';
import { BlobPreconditionFailedError, get, list, put } from '@vercel/blob';
import type { FileMeta } from '../../../shared/types';
import { httpError } from './csv';

type StoredFile = { meta: FileMeta; text: string };
type NewFile = Omit<FileMeta, 'id' | 'uploadedAt'> & { text: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** One private object per file: no instance-local index or shared manifest to lose updates. */
export function createBlobStorage(prefix: string) {
  const root = `${prefix.replace(/\/+$/, '')}/records/`;
  async function load(pathname: string) {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return undefined;
    return { file: await new Response(result.stream).json() as StoredFile, etag: result.blob.etag, pathname };
  }

  async function records() {
    const files: Awaited<ReturnType<typeof load>>[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: root, cursor, limit: 1000 });
      for (const blob of page.blobs) files.push(await load(blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return files.filter((f): f is NonNullable<typeof f> => !!f);
  }

  async function find(id: string) {
    const record = (await records()).find((r) => r.file.meta.id === id);
    if (!record) throw httpError(404, 'File not found');
    return record;
  }

  return {
    async list() {
      return (await records()).map((r) => r.file.meta).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    },
    async get(id: string) { return (await find(id)).file.meta; },
    async read(id: string) { return (await find(id)).file.text; },
    async patch(id: string, fields: Partial<Omit<FileMeta, 'id'>>) {
      const record = await find(id);
      const meta = { ...record.file.meta, ...fields };
      try {
        await put(record.pathname, JSON.stringify({ ...record.file, meta }), {
          access: 'private', addRandomSuffix: false, allowOverwrite: true,
          contentType: 'application/json', ifMatch: record.etag,
        });
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw httpError(409, 'File changed while updating metadata. Refresh and try again.');
        throw error;
      }
      return meta;
    },
    async save(input: NewFile, replaceByName = false) {
      const { text, ...fields } = input;
      const meta: FileMeta = { ...fields, id: randomUUID(), uploadedAt: new Date().toISOString() };
      // A stable result key atomically replaces that result, including its ID, across instances.
      const key = replaceByName ? `result-${hash(meta.name)}` : `upload-${meta.id}`;
      await put(`${root}${key}.json`, JSON.stringify({ meta, text }), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: replaceByName,
      });
      return meta;
    },
    async seed(input: NewFile) {
      const pathname = `${root}sample-${hash(input.name)}.json`;
      if (await load(pathname)) return;
      const { text, ...fields } = input;
      const meta: FileMeta = { ...fields, id: randomUUID(), uploadedAt: new Date().toISOString() };
      try {
        await put(pathname, JSON.stringify({ meta, text }), { access: 'private', contentType: 'application/json', addRandomSuffix: false });
      } catch (error) {
        // Another cold start may seed the same sample first. Never overwrite it.
        if (!(await load(pathname))) throw error;
      }
    },
  };
}

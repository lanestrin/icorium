import { BlobPreconditionFailedError, get, list, put } from '@vercel/blob';
import { nextBaseId, parseFileId, type FileMeta, type ProcessorCode } from '../../../shared/types';
import { httpError } from './csv';
import type { NewFile, NewUpload, Storage } from './storage';

type StoredFile = { meta: FileMeta; text: string };
/** How many times create() tries the next number when another server claims it first. */
const CLAIM_ATTEMPTS = 20;

/**
 * Private Vercel Blob storage, keyed by File ID: each file is one object at `files/<id>.json`, so a
 * file is read directly by its ID. A new base number is claimed by creating `claims/<base>` with
 * "fail if it exists", so servers running at the same time never hand out the same ID. Objects
 * saved before File IDs (under `records/`) are not read; that demo data is reset, not migrated.
 */
export function createBlobStorage(prefix: string): Storage {
  const base = prefix.replace(/\/+$/, '');
  const filesRoot = `${base}/files/`;
  const claimsRoot = `${base}/claims/`;

  /** The object for a File ID. Anything that is not a File ID is a 404 and never becomes a path. */
  function pathOf(id: string) {
    if (!parseFileId(id)) throw httpError(404, 'File not found');
    return `${filesRoot}${id}.json`;
  }

  async function load(pathname: string) {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return undefined;
    return { file: await new Response(result.stream).json() as StoredFile, etag: result.blob.etag, pathname };
  }

  async function exists(pathname: string) {
    const result = await get(pathname, { access: 'private', useCache: false });
    return !!result && result.statusCode === 200;
  }

  async function names(prefixPath: string) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: prefixPath, cursor, limit: 1000 });
      for (const blob of page.blobs) out.push(blob.pathname.slice(prefixPath.length).replace(/\.json$/, ''));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }

  async function find(id: string) {
    const record = await load(pathOf(id));
    if (!record) throw httpError(404, 'File not found');
    return record;
  }

  /** Writes a new object, failing if it already exists. Returns false when it already existed. */
  async function createOnce(pathname: string, body: string) {
    try {
      await put(pathname, body, { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
      return true;
    } catch (error) {
      if (await exists(pathname)) return false;
      throw error;
    }
  }

  const store: Storage = {
    async list() {
      const files = await Promise.all((await names(filesRoot)).map((id) => load(`${filesRoot}${id}.json`)));
      return files.filter((f): f is NonNullable<typeof f> => !!f).map((f) => f.file.meta)
        .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
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
    /** Saves a new upload under the next unclaimed base ID, or that ID plus a code for an uploaded result. */
    async create(input: NewUpload, code?: ProcessorCode) {
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        const baseId = nextBaseId(await names(claimsRoot));
        if (!(await createOnce(`${claimsRoot}${baseId}.json`, '{}'))) continue; // another server took it
        const id = code ? `${baseId}-${code}` : baseId;
        return store.put(id, { ...input, text: typeof input.text === 'function' ? input.text(id) : input.text });
      }
      throw httpError(503, 'Could not reserve a File ID; please try again.');
    },
    /** Saves a file under exactly this ID, replacing any earlier version (a re-run result keeps its ID). */
    async put(id: string, input: NewFile) {
      const { text, ...fields } = input;
      const meta: FileMeta = { ...fields, id, uploadedAt: new Date().toISOString() };
      await put(pathOf(id), JSON.stringify({ meta, text }), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
      });
      return meta;
    },
    /**
     * Saves a file under exactly this ID only if no object has it yet ("fail if it exists"), so a
     * request on another server can never overwrite it. Returns undefined, changing nothing, when it exists.
     */
    async createAt(id: string, input: NewFile) {
      const { text, ...fields } = input;
      const meta: FileMeta = { ...fields, id, uploadedAt: new Date().toISOString() };
      return (await createOnce(pathOf(id), JSON.stringify({ meta, text }))) ? meta : undefined;
    },
    /** Saves a sample under its fixed ID once; another server starting at the same time never overwrites it. */
    async seed(id: string, input: NewFile) {
      const parsed = parseFileId(id);
      if (!parsed) throw new Error(`Not a File ID: ${id}`);
      await createOnce(`${claimsRoot}${parsed.base}.json`, '{}');
      const { text, ...fields } = input;
      const meta: FileMeta = { ...fields, id, uploadedAt: new Date().toISOString() };
      await createOnce(pathOf(id), JSON.stringify({ meta, text }));
    },
  };
  return store;
}

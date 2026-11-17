import { BlobPreconditionFailedError, del, get, list, put } from '@vercel/blob';
import { nextBaseId, parseFileId, type FileMeta, type ProcessorCode } from '../../../shared/types';
import { httpError } from './csv';
import type { NewFile, NewUpload, Storage } from './storage';

/** Most objects one Blob listing request returns; longer listings are read page by page. */
const BLOB_LIST_PAGE = 1000;
/** How many times create() tries the next number when another server claims it first. */
const CLAIM_ATTEMPTS = 20;

/** The folders inside a storage namespace. */
function roots(prefix: string) {
  const base = prefix.replace(/\/+$/, '');
  return {
    meta: `${base}/meta/`, // <id>.json: the file's metadata, read by every listing
    text: `${base}/text/`, // <id>.csv: the CSV itself, read only to preview, process or download
    claims: `${base}/claims/`, // <base>.json: one per base number handed out
    combined: `${base}/files/`, // <id>.json: the older layout, { meta, text } in one object, converted at startup
  };
}

/** The File ID a stored object is named after: its file name without the extension. */
const idOf = (pathname: string, folder: string) => pathname.slice(folder.length).replace(/\.(json|csv)$/, '');

/** Reads an object with an origin read, or undefined when it does not exist. */
async function fetchObject(pathname: string) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return undefined;
  return { body: await new Response(result.stream).text(), etag: result.blob.etag };
}

/** The names, without extension, of every object in a folder, read page by page. */
async function names(folder: string) {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: folder, cursor, limit: BLOB_LIST_PAGE });
    for (const blob of page.blobs) out.push(idOf(blob.pathname, folder));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Writes a new object, failing if it already exists. Returns false when it already existed. */
async function createOnce(pathname: string, body: string, contentType: string) {
  try {
    await put(pathname, body, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: false });
    return true;
  } catch (error) {
    if (await fetchObject(pathname)) return false;
    throw error;
  }
}

const JSON_TYPE = 'application/json';
const CSV_TYPE = 'text/csv';

/**
 * Private Vercel Blob storage, keyed by File ID. Each file is two objects: its metadata at
 * `meta/<id>.json` and its CSV at `text/<id>.csv`, so listing files and changing a flag never move a
 * CSV. A new base number is claimed by creating `claims/<base>.json` with "fail if it exists", so
 * servers running at the same time never hand out the same ID. Objects saved before File IDs (under
 * `records/`) are not read; that demo data is reset, not migrated.
 */
export function createBlobStorage(prefix: string): Storage {
  const folders = roots(prefix);

  /** The metadata and CSV objects for a File ID. Anything that is not a File ID is a 404 and never becomes a path. */
  function pathsOf(id: string) {
    if (!parseFileId(id)) throw httpError(404, 'File not found');
    return { meta: `${folders.meta}${id}.json`, text: `${folders.text}${id}.csv` };
  }

  async function findMeta(id: string) {
    const object = await fetchObject(pathsOf(id).meta);
    if (!object) throw httpError(404, 'File not found');
    return { meta: JSON.parse(object.body) as FileMeta, etag: object.etag };
  }

  const writeText = (id: string, text: string) =>
    put(pathsOf(id).text, text, { access: 'private', contentType: CSV_TYPE, addRandomSuffix: false, allowOverwrite: true });

  const newMeta = (id: string, input: NewFile): { meta: FileMeta; text: string } => {
    const { text, ...fields } = input;
    return { meta: { ...fields, id, uploadedAt: new Date().toISOString() }, text };
  };

  const store: Storage = {
    async list() {
      const metas = await Promise.all((await names(folders.meta)).map((id) => fetchObject(`${folders.meta}${id}.json`)));
      return metas.filter((m): m is NonNullable<typeof m> => !!m).map((m) => JSON.parse(m.body) as FileMeta)
        .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    },
    async get(id: string) { return (await findMeta(id)).meta; },
    async read(id: string) {
      const object = await fetchObject(pathsOf(id).text);
      if (!object) throw httpError(404, 'File not found');
      return object.body;
    },
    async patch(id: string, fields: Partial<Omit<FileMeta, 'id'>>) {
      const { meta: current, etag } = await findMeta(id);
      const meta = { ...current, ...fields };
      try {
        await put(pathsOf(id).meta, JSON.stringify(meta), {
          access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: JSON_TYPE, ifMatch: etag,
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
        const baseId = nextBaseId(await names(folders.claims));
        if (!(await createOnce(`${folders.claims}${baseId}.json`, '{}', JSON_TYPE))) continue; // another server took it
        const id = code ? `${baseId}-${code}` : baseId;
        return store.put(id, { ...input, text: typeof input.text === 'function' ? input.text(id) : input.text });
      }
      throw httpError(503, 'Could not reserve a File ID; please try again.');
    },
    /**
     * Saves a file under exactly this ID, replacing any earlier version (a re-run result keeps its ID).
     * The CSV is written first, so a listed file always has its CSV.
     */
    async put(id: string, input: NewFile) {
      const { meta, text } = newMeta(id, input);
      await writeText(id, text);
      await put(pathsOf(id).meta, JSON.stringify(meta), { access: 'private', contentType: JSON_TYPE, addRandomSuffix: false, allowOverwrite: true });
      return meta;
    },
    /**
     * Saves a file under exactly this ID only if no file has it yet: the metadata object is claimed with
     * "fail if it exists" first, and the CSV is written only by the server that claimed it, so a request
     * on another server can never overwrite it. Returns undefined, changing nothing, when it exists.
     * If the CSV can't be written, the claim is removed again, so no file is listed without its CSV.
     */
    async createAt(id: string, input: NewFile) {
      const { meta, text } = newMeta(id, input);
      const paths = pathsOf(id);
      if (!(await createOnce(paths.meta, JSON.stringify(meta), JSON_TYPE))) return undefined;
      try {
        await writeText(id, text);
      } catch (error) {
        await del(paths.meta).catch(() => {}); // best effort; the write error is the one to report
        throw error;
      }
      return meta;
    },
    /**
     * Saves a sample under its fixed ID once; another server starting at the same time never overwrites
     * it. Its CSV is written whenever it is missing, so a start that failed after claiming the sample is
     * repaired by the next one.
     */
    async seed(id: string, input: NewFile) {
      const parsed = parseFileId(id);
      if (!parsed) throw new Error(`Not a File ID: ${id}`);
      await createOnce(`${folders.claims}${parsed.base}.json`, '{}', JSON_TYPE);
      const { meta, text } = newMeta(id, input);
      const paths = pathsOf(id);
      await createOnce(paths.meta, JSON.stringify(meta), JSON_TYPE);
      if (!(await fetchObject(paths.text))) await createOnce(paths.text, text, CSV_TYPE);
    },
  };
  return store;
}

/**
 * Converts files saved in the older one-object layout (`files/<id>.json` holding `{ meta, text }`) to
 * the two-object layout, once, at startup. For each old object:
 * - No metadata in the new layout yet: write the CSV, create the metadata ("fail if it exists"), check
 *   both exist, then delete the old object.
 * - Metadata already in the new layout (it wins): never overwrite its CSV. Write the old CSV only when
 *   the new one is missing; delete the old object only when the stored CSV then equals it. A different
 *   CSV means both layouts were written to separately, so the old object is kept and reported.
 * A file that can't be converted is left in place and named in `skipped`. Safe when two servers start
 * together: the CSV is the same, creates can't overwrite, and deleting a missing object is harmless.
 */
export async function migrateCombinedFiles(prefix: string) {
  const folders = roots(prefix);
  const converted: string[] = [];
  const skipped: string[] = [];
  for (const id of await names(folders.combined)) {
    const oldPath = `${folders.combined}${id}.json`;
    try {
      if (!parseFileId(id)) throw new Error('not a File ID');
      const old = await fetchObject(oldPath);
      if (!old) continue; // another server converted it already
      const { meta, text } = JSON.parse(old.body) as { meta: FileMeta; text: string };
      if (meta?.id !== id || typeof text !== 'string') throw new Error('not a stored file');
      const metaPath = `${folders.meta}${id}.json`;
      const textPath = `${folders.text}${id}.csv`;
      if (await fetchObject(metaPath)) {
        // Already in the new layout: keep its CSV, filling it in only if it is missing.
        if (!(await fetchObject(textPath))) await createOnce(textPath, text, CSV_TYPE);
        if ((await fetchObject(textPath))?.body !== text) throw new Error('both layouts hold different CSVs');
      } else {
        await put(textPath, text, { access: 'private', contentType: CSV_TYPE, addRandomSuffix: false, allowOverwrite: true });
        await createOnce(metaPath, JSON.stringify(meta), JSON_TYPE);
        if (!(await fetchObject(metaPath)) || !(await fetchObject(textPath))) throw new Error('new objects not found after writing');
      }
      await del(oldPath);
      converted.push(id);
    } catch {
      skipped.push(id);
    }
  }
  return { converted, skipped };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { httpError } from '../../../shared/csv';
import type { SourceRecord, SupplierProfile } from '../../../shared/ingestion';
import type { NewFile, Storage } from '../../../shared/storage';
import { parseFileId, type FileMeta } from '../../../shared/types';

// A signed-in, active account's files, kept in its private Supabase workspace: file metadata and supplier
// profiles in Postgres, the CSV and original in the private "workspace-files" bucket. Implements Storage from
// shared/storage.ts. The database rules from 17.4a (supabase/migrations/20261123000000_cloud_files.sql) decide
// who may read, write and how much fits; nothing here is a substitute for them.

export const BUCKET = 'workspace-files';
export const CAPACITY_MESSAGE =
  "Cloud storage is full, so new files and results can't be saved or replaced. Your existing files are still available. Ask an administrator for help.";
export const INACTIVE_MESSAGE = "This account isn't active, so its cloud files can't be opened or changed. Ask an administrator for help.";
export const UNAVAILABLE_FILES_MESSAGE = 'Your cloud workspace is temporarily unavailable. Your files are not lost; try again in a few minutes.';
export const IDS_EXHAUSTED_MESSAGE = 'No more File IDs are available in this workspace.';
export const NOT_PROCESSABLE_MESSAGE = 'The input must be Ready or Needs Review, and not archived, before it can be processed.';
export const TOO_LARGE_MESSAGE = "This file's details are too large to save.";
export const NO_SAMPLES_MESSAGE = "Samples aren't added to a cloud workspace.";

/** The API returns at most this many rows per request, so lists are read a page at a time. */
const PAGE = 1000;
const COLUMNS = 'id, file_id, source_id, uploaded_at, meta';

type StoredMeta = Omit<FileMeta, 'id' | 'uploadedAt' | 'sourceId'>;
interface Row { id: string; file_id: string; source_id: string | null; uploaded_at: string; meta: StoredMeta }
interface Result<T> { data: T; error: unknown; /** postgrest-js puts the HTTP status here, not on the error. */ status?: number }
interface ErrorLike { code?: string; message?: string; status?: number | string; statusCode?: number | string }

const notFound = () => httpError(404, 'File not found');

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The files of one account, over a Supabase client that is signed in as that account. */
export function createCloudStorage(supabase: SupabaseClient, userId: string): Storage {
  const bucket = () => supabase.storage.from(BUCKET);

  /** Turns a failed call into the message the person should see. */
  async function cloudError(error: unknown): Promise<Error> {
    if (typeof (error as { statusCode?: unknown })?.statusCode === 'number' && error instanceof Error) return error; // already ours
    const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
    const text = `${e.message ?? ''}`;
    if (/storage_full/.test(text)) return httpError(507, CAPACITY_MESSAGE);
    if (/not_active/.test(text)) return httpError(403, INACTIVE_MESSAGE);
    if (/file_ids_exhausted/.test(text)) return httpError(507, IDS_EXHAUSTED_MESSAGE);
    if (/processing_not_allowed/.test(text)) return httpError(400, NOT_PROCESSABLE_MESSAGE);
    if (e.code === '23505') return httpError(409, 'That file already exists.');
    if (e.code === '23514') return httpError(400, TOO_LARGE_MESSAGE);
    const status = Number(e.status ?? e.statusCode);
    if (error instanceof TypeError || status >= 500 || (!e.code && /failed to fetch|network|fetch failed|load failed/i.test(text))) {
      return httpError(503, UNAVAILABLE_FILES_MESSAGE);
    }
    if (e.code === '42501' || status === 403 || /row-level security/i.test(text)) {
      // The database refuses a full workspace and an inactive account the same way, so ask which it is.
      try {
        const { data, error: roomError } = await supabase.rpc('file_storage_has_room');
        if (roomError) return httpError(503, UNAVAILABLE_FILES_MESSAGE);
        return data === false ? httpError(507, CAPACITY_MESSAGE) : httpError(403, INACTIVE_MESSAGE);
      } catch {
        return httpError(503, UNAVAILABLE_FILES_MESSAGE);
      }
    }
    if (/not found/i.test(text) || status === 404) return notFound();
    console.error('Unexpected cloud workspace error', error);
    return new Error('Something went wrong with your cloud workspace. Try again.');
  }

  /** A failed result's error, with the HTTP status the library reported beside it. */
  const failure = (result: Result<unknown>): ErrorLike => {
    const e = (typeof result.error === 'object' && result.error !== null ? result.error : {}) as ErrorLike;
    return { code: e.code, message: e.message, status: e.status ?? e.statusCode ?? result.status };
  };

  /** The data of a Supabase call, or a thrown, mapped error. */
  async function ok<T>(call: PromiseLike<Result<T>>): Promise<T> {
    let result: Result<T>;
    try {
      result = await call;
    } catch (error) {
      throw await cloudError(error);
    }
    if (result.error) throw await cloudError(failure(result));
    return result.data;
  }

  async function allRows<T>(page: (from: number, to: number) => PromiseLike<Result<T[] | null>>): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = (await ok(page(from, from + PAGE - 1))) ?? [];
      all.push(...rows);
      if (rows.length < PAGE) return all;
    }
  }

  const toMeta = (row: Row, sourceId?: string): FileMeta => ({
    ...row.meta,
    id: row.file_id,
    uploadedAt: new Date(row.uploaded_at).toISOString(),
    ...(sourceId ? { sourceId } : {}),
  });

  async function findRow(id: string): Promise<Row> {
    const row = parseFileId(id) ? await ok(supabase.from('files').select(COLUMNS).eq('file_id', id).maybeSingle<Row>()) : null;
    if (!row) throw notFound();
    return row;
  }

  async function fileIdOf(uuid: string | null) {
    if (!uuid) return undefined;
    const row = await ok(supabase.from('files').select('file_id').eq('id', uuid).maybeSingle<{ file_id: string }>());
    return row?.file_id;
  }

  async function uuidOf(fileId: string | undefined) {
    if (!fileId) return null;
    const row = await ok(supabase.from('files').select('id').eq('file_id', fileId).maybeSingle<{ id: string }>());
    if (!row) throw notFound();
    return row.id;
  }

  /** The objects one file keeps: its CSV, and, when a source record came with it, the original and the record. */
  function objects(uuid: string, input: NewFile) {
    const base = `${userId}/${uuid}`;
    const list: { path: string; body: Blob; contentType: string }[] = [
      { path: `${base}.csv`, body: new Blob([input.text], { type: 'text/csv' }), contentType: 'text/csv;charset=utf-8' },
    ];
    const record = input.record;
    if (record) {
      const { bytes, ...original } = record.original;
      list.push({ path: `${base}.original`, body: new Blob([bytes], { type: original.mediaType }), contentType: original.mediaType || 'application/octet-stream' });
      const json = JSON.stringify({ ...record, original });
      list.push({ path: `${base}.source.json`, body: new Blob([json], { type: 'application/json' }), contentType: 'application/json' });
    }
    return list;
  }

  async function removeObjects(paths: string[]) {
    if (!paths.length) return;
    try { await bucket().remove(paths); } catch { /* the original failure is the one to report */ }
  }

  /** Objects first, the row last, so a listed file always has its objects. A failure removes what was just written. */
  async function insertFile(fileId: string, input: NewFile): Promise<FileMeta | 'exists'> {
    const uuid = crypto.randomUUID();
    const written: string[] = [];
    try {
      for (const object of objects(uuid, input)) {
        await ok(bucket().upload(object.path, object.body, { contentType: object.contentType, upsert: false }));
        written.push(object.path);
      }
      const { text: _text, record: _record, sourceId, ...rest } = input;
      let result: Result<Row | null>;
      try {
        result = await supabase.from('files').insert({ id: uuid, file_id: fileId, source_id: await uuidOf(sourceId), meta: withoutUndefined(rest) }).select(COLUMNS).single<Row>();
      } catch (error) {
        throw await cloudError(error);
      }
      if (result.error && failure(result).code === '23505') {
        await removeObjects(written);
        return 'exists';
      }
      if (result.error) throw await cloudError(failure(result));
      return toMeta(result.data!, sourceId);
    } catch (error) {
      await removeObjects(written);
      throw error;
    }
  }

  /** Replaces an object with Storage update (not upsert, which would also need the insert policy). */
  async function replaceObject(object: { path: string; body: Blob; contentType: string }) {
    try {
      await ok(bucket().update(object.path, object.body, { contentType: object.contentType, upsert: false }));
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error;
      await ok(bucket().upload(object.path, object.body, { contentType: object.contentType, upsert: false })); // a result that had no record before
    }
  }

  async function download(path: string): Promise<Blob> {
    const blob = await ok(bucket().download(path));
    if (!blob) throw notFound();
    return blob;
  }

  return {
    async list() {
      // Paged by the internal ID, which never changes: a replace on another device moves uploaded_at and could
      // otherwise list a file twice or skip one between two pages.
      const rows = await allRows<Row>((from, to) => supabase.from('files').select(COLUMNS).order('id').range(from, to));
      const names = new Map(rows.map((row) => [row.id, row.file_id]));
      return rows.map((row) => toMeta(row, row.source_id ? names.get(row.source_id) : undefined)).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt) || a.id.localeCompare(b.id));
    },

    async get(id) {
      const row = await findRow(id);
      return toMeta(row, await fileIdOf(row.source_id));
    },

    async read(id) {
      const row = await findRow(id);
      return (await download(`${userId}/${row.id}.csv`)).text();
    },

    async readSource(id) {
      const row = await findRow(id);
      if (!row.meta.source) return undefined;
      const [json, bytes] = await Promise.all([download(`${userId}/${row.id}.source.json`), download(`${userId}/${row.id}.original`)]);
      const record = JSON.parse(await json.text()) as Omit<SourceRecord, 'original'> & { original: Omit<SourceRecord['original'], 'bytes'> };
      return { ...record, original: { ...record.original, bytes: await bytes.arrayBuffer() } };
    },

    async patch(id, fields) {
      const row = await findRow(id);
      const { sourceId, uploadedAt, ...changed } = fields;
      const update: Record<string, unknown> = { meta: withoutUndefined({ ...row.meta, ...changed }) };
      if ('sourceId' in fields) update.source_id = await uuidOf(sourceId);
      if (uploadedAt) update.uploaded_at = uploadedAt;
      const saved = await ok(supabase.from('files').update(update).eq('id', row.id).select(COLUMNS).maybeSingle<Row>());
      if (!saved) throw httpError(403, INACTIVE_MESSAGE); // no row changed: the account is no longer active
      return toMeta(saved, 'sourceId' in fields ? sourceId : await fileIdOf(saved.source_id));
    },

    async create(input, code) {
      const base = await ok(supabase.rpc('allocate_file_id') as PromiseLike<Result<string>>);
      const id = code ? `${base}-${code}` : base;
      const made = await insertFile(id, { ...input, text: typeof input.text === 'function' ? input.text(id) : input.text });
      if (made === 'exists') throw httpError(409, `File ${id} already exists`);
      return made;
    },

    async createAt(id, input) {
      if (!parseFileId(id)) throw new Error(`Not a File ID: ${id}`);
      if (await ok(supabase.from('files').select('id').eq('file_id', id).maybeSingle())) return undefined;
      const made = await insertFile(id, input);
      return made === 'exists' ? undefined : made;
    },

    async put(id, input) {
      if (!parseFileId(id)) throw new Error(`Not a File ID: ${id}`);
      const existing = await ok(supabase.from('files').select('id').eq('file_id', id).maybeSingle<{ id: string }>());
      if (!existing) {
        const made = await insertFile(id, input);
        if (made === 'exists') throw httpError(409, `File ${id} already exists`);
        return made;
      }
      // Replacing keeps the File ID and internal ID. The CSV is replaced first, so a failure here changes no metadata.
      for (const object of objects(existing.id, input)) await replaceObject(object);
      const { text: _text, record: _record, sourceId, ...rest } = input;
      const saved = await ok(
        supabase.from('files')
          .update({ meta: withoutUndefined(rest), source_id: await uuidOf(sourceId), uploaded_at: new Date().toISOString() })
          .eq('id', existing.id).select(COLUMNS).maybeSingle<Row>(),
      );
      if (!saved) throw httpError(403, INACTIVE_MESSAGE);
      return toMeta(saved, sourceId);
    },

    async seed() {
      throw httpError(400, NO_SAMPLES_MESSAGE);
    },

    async listProfiles() {
      const rows = await allRows<{ profile: SupplierProfile }>((from, to) => supabase.from('supplier_profiles').select('profile').order('key').range(from, to));
      return rows.map((row) => row.profile);
    },

    // Update, then insert: an upsert would also write `key`, which has no update grant.
    async saveProfile(profile) {
      const fields = { profile, saved_at: profile.savedAt };
      const updated = await ok(supabase.from('supplier_profiles').update(fields).eq('key', profile.key).select('key'));
      if (updated?.length) return;
      try {
        await ok(supabase.from('supplier_profiles').insert({ key: profile.key, ...fields }));
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 409) throw error;
        await ok(supabase.from('supplier_profiles').update(fields).eq('key', profile.key));
      }
    },
  };
}

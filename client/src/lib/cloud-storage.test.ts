import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceRecord } from '../../../shared/ingestion';
import type { NewFile } from '../../../shared/storage';
import { CAPACITY_MESSAGE, createCloudStorage, IDS_EXHAUSTED_MESSAGE, INACTIVE_MESSAGE, NOT_PROCESSABLE_MESSAGE, NO_SAMPLES_MESSAGE, TOO_LARGE_MESSAGE, UNAVAILABLE_FILES_MESSAGE } from './cloud-storage';

const USER = '11111111-1111-1111-1111-111111111111';
type Row = Record<string, unknown>;
type Failure = { code?: string; message?: string; status?: number } | Error;

/** A small in-memory stand-in for the parts of supabase-js the cloud storage uses. It proves the client's calls, not the database rules. */
function fake() {
  const tables: Record<string, Row[]> = { files: [], supplier_profiles: [] };
  const objects = new Map<string, Blob>();
  const log: string[] = [];
  const state = {
    counter: 100000,
    room: true,
    fail: {} as Record<string, Failure | undefined>, // keyed by "op:name", e.g. "upload:.original" or "insert:files"
    blind: 0, // the next N reads and updates see no rows, as when another device writes in between
    inactive: false, // updates match no row
  };
  const failure = (key: string) => {
    const hit = Object.entries(state.fail).find(([k, v]) => v && key.includes(k));
    return hit?.[1];
  };
  /** A failed table or RPC call as postgrest-js returns it: the HTTP status beside the error, never on it. */
  const rejected = (f: { code?: string; message?: string; status?: number }) => {
    const { status, ...error } = f;
    return { data: null, error, status };
  };

  function query(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const filters: [string, unknown][] = [];
    let range: [number, number] | undefined;
    let order: string[] = [];
    let one: 'single' | 'maybe' | undefined;
    const run = () => {
      log.push(`${op}:${table}`);
      const failed = failure(`${op}:${table}`);
      if (failed instanceof Error) throw failed;
      if (failed) return rejected(failed);
      let rows = tables[table].filter((r) => filters.every(([k, v]) => r[k] === v));
      if (state.blind > 0 && op !== 'insert') { state.blind--; rows = []; }
      if (op === 'insert') {
        const dup = tables[table].some((r) => (table === 'files' ? r.file_id === payload.file_id : r.key === payload.key));
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const row = { uploaded_at: new Date().toISOString(), source_id: null, ...payload };
        tables[table].push(row);
        rows = [row];
      } else if (op === 'update') {
        if (state.inactive) rows = [];
        rows.forEach((r) => Object.assign(r, payload));
      } else {
        for (const key of [...order].reverse()) rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
        if (range) rows = rows.slice(range[0], range[1] + 1);
      }
      if (one) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (p: Row) => { op = 'insert'; payload = p; return builder; },
      update: (p: Row) => { op = 'update'; payload = p; return builder; },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return builder; },
      order: (k: string) => { order.push(k); return builder; },
      range: (a: number, b: number) => { range = [a, b]; return builder; },
      single: () => { one = 'single'; return builder; },
      maybeSingle: () => { one = 'maybe'; return builder; },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => { try { return Promise.resolve(run()).then(ok, bad); } catch (e) { return Promise.reject(e).then(ok, bad); } },
    };
    return builder;
  }

  const bucket = {
    upload: async (path: string, body: Blob) => {
      log.push(`upload:${path}`);
      const failed = failure(`upload:${path}`);
      if (failed) return { data: null, error: failed };
      objects.set(path, body);
      return { data: {}, error: null };
    },
    update: async (path: string, body: Blob) => {
      log.push(`update:${path}`);
      const failed = failure(`update:${path}`);
      if (failed) return { data: null, error: failed };
      if (!objects.has(path)) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
      objects.set(path, body);
      return { data: {}, error: null };
    },
    download: async (path: string) => {
      log.push(`download:${path}`);
      const blob = objects.get(path);
      return blob ? { data: blob, error: null } : { data: null, error: { message: 'Object not found', statusCode: '404' } };
    },
    remove: async (paths: string[]) => { log.push(`remove:${paths.join(',')}`); paths.forEach((p) => objects.delete(p)); return { data: [], error: null }; },
  };

  const client = {
    from: (table: string) => query(table),
    storage: { from: () => bucket },
    rpc: async (name: string) => {
      log.push(`rpc:${name}`);
      const failed = failure(`rpc:${name}`);
      if (failed instanceof Error) throw failed;
      if (failed) return rejected(failed);
      if (name === 'allocate_file_id') return { data: String(++state.counter), error: null };
      return { data: state.room, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, tables, objects, log, state };
}

const meta = { name: 'a.csv', rows: 2, columns: 3, status: 'Ready' as const };
const upload = (extra: Partial<NewFile> = {}): NewFile & { text: string } => ({ ...meta, text: 'a,b\n1,2\n', ...extra });
const record: SourceRecord = {
  kind: 'excel',
  original: { name: 'a.xlsx', mediaType: 'application/vnd.ms-excel', bytes: new Uint8Array([1, 2, 3]).buffer },
  sheet: 'S1', rows: [{ row: 2 }], checks: [],
};
const withSource = { source: { kind: 'excel' as const, name: 'a.xlsx', size: 3 }, record };

let f: ReturnType<typeof fake>;
let store: ReturnType<typeof createCloudStorage>;
beforeEach(() => {
  f = fake();
  store = createCloudStorage(f.client, USER);
});

describe('create', () => {
  it('allocates the ID, writes the objects, then inserts the row last', async () => {
    const saved = await store.create({ ...upload(), ...withSource });
    expect(saved).toMatchObject({ id: '100001', name: 'a.csv', status: 'Ready' });
    expect(saved).not.toHaveProperty('sourceId');
    expect(f.log.filter((l) => /^(rpc|upload|insert)/.test(l)).map((l) => l.replace(/[0-9a-f-]{36}/g, 'UUID'))).toEqual([
      'rpc:allocate_file_id', 'upload:UUID/UUID.csv', 'upload:UUID/UUID.original', 'upload:UUID/UUID.source.json', 'insert:files',
    ]);
    const row = f.tables.files[0];
    expect(row).not.toHaveProperty('owner_id'); // the owner always comes from the session
    expect(row).toMatchObject({ file_id: '100001', source_id: null });
    expect(await store.read('100001')).toBe('a,b\n1,2\n');
  });

  it('puts the new ID into the CSV when the text depends on it, and adds the function code to a result', async () => {
    const saved = await store.create({ ...upload(), text: (id) => `id=${id}` }, 'M');
    expect(saved.id).toBe('100001-M');
    expect(await store.read('100001-M')).toBe('id=100001-M');
  });

  it('links a result to its input by File ID, keeping the internal ID out of the metadata', async () => {
    await store.create(upload());
    const result = (await store.createAt('100001-M', upload({ status: 'Processed', sourceId: '100001' })))!;
    expect(result.sourceId).toBe('100001');
    expect(f.tables.files[1].source_id).toBe(f.tables.files[0].id);
    expect((await store.get('100001-M')).sourceId).toBe('100001');
    expect(JSON.stringify(await store.list())).not.toContain(String(f.tables.files[0].id));
  });

  it('removes the objects it wrote when the row cannot be inserted', async () => {
    f.state.fail['insert:files'] = { message: 'boom', status: 500 };
    await expect(store.create({ ...upload(), ...withSource })).rejects.toMatchObject({ statusCode: 503 });
    expect(f.objects.size).toBe(0);
    expect(f.tables.files).toHaveLength(0);
  });

  it('removes the objects already written when a later upload fails', async () => {
    f.state.fail['upload:'] = undefined;
    f.state.fail['.source.json'] = { message: 'x', status: 500 };
    await expect(store.create({ ...upload(), ...withSource })).rejects.toMatchObject({ statusCode: 503 });
    expect(f.objects.size).toBe(0);
    expect(f.tables.files).toHaveLength(0);
  });

  it('keeps the gap when an upload fails, so an allocated ID is never reused', async () => {
    f.state.fail['upload:'] = { message: 'x', status: 500 };
    await expect(store.create(upload())).rejects.toBeDefined();
    f.state.fail['upload:'] = undefined;
    expect((await store.create(upload())).id).toBe('100002');
  });

  it('refuses with the capacity message when the ID allocation says storage is full', async () => {
    f.state.fail['rpc:allocate_file_id'] = { message: 'storage_full' };
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 507, message: CAPACITY_MESSAGE });
    expect(f.objects.size).toBe(0);
  });

  it('tells a full workspace from an inactive account when the database refuses with row-level security', async () => {
    f.state.fail['upload:'] = { message: 'new row violates row-level security policy', status: 403 };
    f.state.room = false;
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 507, message: CAPACITY_MESSAGE });
    f.state.room = true;
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 403, message: INACTIVE_MESSAGE });
  });

  it('reports an unreachable project as temporarily unavailable', async () => {
    f.state.fail['rpc:allocate_file_id'] = new TypeError('Failed to fetch');
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 503, message: UNAVAILABLE_FILES_MESSAGE });
    f.state.fail['rpc:allocate_file_id'] = undefined;
    f.state.fail['insert:files'] = { message: 'Service unavailable', status: 503 };
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 503, message: UNAVAILABLE_FILES_MESSAGE });
  });

  it('maps the processing gate to a message', async () => {
    f.state.fail['insert:files'] = { message: 'processing_not_allowed' };
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 400, message: NOT_PROCESSABLE_MESSAGE });
  });

  it('maps an inactive account, an exhausted File ID range and an oversized metadata check', async () => {
    f.state.fail['rpc:allocate_file_id'] = { message: 'not_active' };
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 403, message: INACTIVE_MESSAGE });
    f.state.fail['rpc:allocate_file_id'] = { message: 'file_ids_exhausted' };
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 507, message: IDS_EXHAUSTED_MESSAGE });
    f.state.fail['rpc:allocate_file_id'] = undefined;
    f.state.fail['insert:files'] = { code: '23514', message: 'violates check constraint' };
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 400, message: TOO_LARGE_MESSAGE });
    expect(f.objects.size).toBe(0);
  });

  it('reports the workspace unavailable when the room check itself cannot be made after a refusal', async () => {
    f.state.fail['upload:'] = { message: 'new row violates row-level security policy', status: 403 };
    f.state.fail['rpc:file_storage_has_room'] = { message: 'down', status: 503 };
    await expect(store.create(upload())).rejects.toMatchObject({ statusCode: 503, message: UNAVAILABLE_FILES_MESSAGE });
  });

  it('reports a database answer with a 5xx status as unavailable, as postgrest-js puts the status beside the error', async () => {
    for (const status of [502, 503, 504]) {
      f.state.fail['select:files'] = { code: 'PGRST002', message: 'Could not query the database for the schema cache', status };
      await expect(store.list()).rejects.toMatchObject({ statusCode: 503, message: UNAVAILABLE_FILES_MESSAGE });
    }
    f.state.fail['select:files'] = { message: 'something odd', status: 400 };
    await expect(store.list()).rejects.not.toMatchObject({ statusCode: 503 });
  });
});

describe('createAt', () => {
  it('returns undefined without writing anything when the File ID exists', async () => {
    await store.create(upload());
    const before = f.objects.size;
    expect(await store.createAt('100001', upload())).toBeUndefined();
    expect(f.objects.size).toBe(before);
  });

  it('removes its objects and returns undefined when another device inserted the ID after the check', async () => {
    await store.create(upload());
    const objectsBefore = f.objects.size;
    f.state.blind = 1; // the existence check sees nothing, so the insert is what collides
    expect(await store.createAt('100001', upload({ name: 'late.csv' }))).toBeUndefined();
    expect(f.objects.size).toBe(objectsBefore);
    expect(f.tables.files).toHaveLength(1);
  });

  it('creates the file under exactly that ID', async () => {
    expect(await store.createAt('100009-M', upload({ status: 'Processed' }))).toMatchObject({ id: '100009-M' });
  });
});

describe('put', () => {
  it('replaces an existing result with Storage update, keeping its File ID and internal ID', async () => {
    await store.create(upload());
    await store.createAt('100001-M', upload({ status: 'Processed', sourceId: '100001' }));
    const row = f.tables.files[1];
    const uuid = row.id;
    f.log.length = 0;
    const replaced = await store.put('100001-M', upload({ text: 'new\n', name: 'new.csv', status: 'Processed', sourceId: '100001' }));
    expect(replaced).toMatchObject({ id: '100001-M', name: 'new.csv', sourceId: '100001' });
    expect(row.id).toBe(uuid);
    expect(f.log).toContain(`update:${USER}/${uuid}.csv`);
    expect(f.log.some((l) => l.startsWith('upload:'))).toBe(false);
    expect(await store.read('100001-M')).toBe('new\n');
  });

  it('changes no metadata when replacing the CSV is refused, and reports capacity', async () => {
    await store.create(upload());
    f.state.fail['update:'] = { message: 'row-level security', status: 403 };
    f.state.room = false;
    await expect(store.put('100001', upload({ name: 'other.csv' }))).rejects.toMatchObject({ statusCode: 507, message: CAPACITY_MESSAGE });
    expect((await store.get('100001')).name).toBe('a.csv');
  });

  it('reports an inactive account when replacing changes no row', async () => {
    await store.create(upload());
    f.state.inactive = true;
    await expect(store.put('100001', upload({ name: 'other.csv' }))).rejects.toMatchObject({ statusCode: 403, message: INACTIVE_MESSAGE });
  });

  it('inserts when there is no such file yet', async () => {
    expect(await store.put('100003', upload())).toMatchObject({ id: '100003' });
  });
});

describe('reads', () => {
  it('lists every file past one page, oldest first', async () => {
    for (let i = 0; i < 1205; i++) {
      f.tables.files.push({ id: `u${String(i).padStart(5, '0')}`, file_id: String(100001 + i), source_id: null, uploaded_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), meta: { name: `${i}.csv`, status: 'Ready' } });
    }
    const all = await store.list();
    expect(all).toHaveLength(1205);
    expect(all[0].id).toBe('100001');
    expect(all[1204].id).toBe('101205');
  });

  it('orders the list by upload time even though it pages by internal ID', async () => {
    f.tables.files.push(
      { id: 'a', file_id: '100001', source_id: null, uploaded_at: '2026-01-03T00:00:00.000Z', meta: { name: 'late.csv', status: 'Ready' } },
      { id: 'b', file_id: '100002', source_id: null, uploaded_at: '2026-01-01T00:00:00.000Z', meta: { name: 'early.csv', status: 'Ready' } },
    );
    expect((await store.list()).map((m) => m.name)).toEqual(['early.csv', 'late.csv']);
  });

  it('normalises the upload time to ISO', async () => {
    f.tables.files.push({ id: 'u', file_id: '100001', source_id: null, uploaded_at: '2026-01-01T00:00:00+00:00', meta: { name: 'a.csv', status: 'Ready' } });
    expect((await store.get('100001')).uploadedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('gives 404 for an unknown ID, an invalid ID and a missing object', async () => {
    await expect(store.get('100001')).rejects.toMatchObject({ statusCode: 404 });
    await expect(store.get('abc')).rejects.toMatchObject({ statusCode: 404 });
    await expect(store.read('000001')).rejects.toMatchObject({ statusCode: 404 });
    await store.create(upload());
    f.objects.clear();
    await expect(store.read('100001')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rebuilds a source record from its two objects, and has none for a file without a source', async () => {
    await store.create({ ...upload(), ...withSource });
    await store.create(upload());
    const back = await store.readSource('100001');
    expect(back).toMatchObject({ kind: 'excel', sheet: 'S1', original: { name: 'a.xlsx', mediaType: 'application/vnd.ms-excel' } });
    expect(Array.from(new Uint8Array(back!.original.bytes))).toEqual([1, 2, 3]);
    expect(await store.readSource('100002')).toBeUndefined();
    await expect(store.readSource('100099')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('patch', () => {
  it('merges fields into the metadata and returns the file', async () => {
    await store.create(upload());
    expect(await store.patch('100001', { archived: true, archivedAt: 'T' })).toMatchObject({ id: '100001', archived: true, archivedAt: 'T', name: 'a.csv' });
    expect(await store.patch('100001', { archived: false, archivedAt: undefined })).not.toHaveProperty('archivedAt');
  });

  it('reports an inactive account when no row was changed', async () => {
    await store.create(upload());
    f.state.inactive = true;
    await expect(store.patch('100001', { archived: true })).rejects.toMatchObject({ statusCode: 403, message: INACTIVE_MESSAGE });
  });

  it('gives 404 for an unknown file', async () => {
    await expect(store.patch('100001', { archived: true })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('seed', () => {
  it('always refuses', async () => {
    await expect(store.seed('100001', upload())).rejects.toMatchObject({ message: NO_SAMPLES_MESSAGE });
  });
});

describe('supplier profiles', () => {
  const profile = { key: 'a|b', name: 'Supplier', columns: {}, units: {}, savedAt: '2026-01-01T00:00:00.000Z' } as never;
  it('inserts a new profile, then updates it in place without an upsert', async () => {
    await store.saveProfile(profile);
    await store.saveProfile({ ...(profile as object), name: 'Renamed' } as never);
    expect(f.tables.supplier_profiles).toHaveLength(1);
    expect(await store.listProfiles()).toEqual([expect.objectContaining({ name: 'Renamed' })]);
    expect(f.tables.supplier_profiles[0]).not.toHaveProperty('owner_id');
  });

  it('updates again when another device inserted the key first', async () => {
    f.tables.supplier_profiles.push({ key: 'a|b', profile: { name: 'Other' }, saved_at: 'x' });
    f.state.blind = 1; // the first update sees nothing, so the insert collides
    await store.saveProfile(profile);
    expect(f.tables.supplier_profiles).toHaveLength(1);
    expect(f.tables.supplier_profiles[0].profile).toMatchObject({ name: 'Supplier' });
  });
});

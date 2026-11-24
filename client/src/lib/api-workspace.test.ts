import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createApi, openWorkspace } from './api';
import { createMemoryStorage } from './browser-storage';
import { demoDbName } from './demo';
import { SAMPLE_FILES } from './samples';
import type { WorkspaceChoice } from './workspace';

// Which workspace the file actions use for each account state. The cloud workspace here is an in-memory
// storage marked "cloud"; the real cloud storage has its own tests.

let databases = 0;
const sample = (name: string) => SAMPLE_FILES.find((f) => f.name === name)!.text;
const csvFile = (name: string, text: string) => new File([text], name, { type: 'text/csv' });
const cloudWorkspace = () => ({ storage: createMemoryStorage(), mode: 'cloud' as const });
const choose = (initial: WorkspaceChoice, openCloud = vi.fn(async (_userId: string) => cloudWorkspace())) => ({
  openCloud,
  api: createApi(() => openWorkspace(`api-workspace-test-${++databases}`), openCloud, initial),
});

describe('workspace choice', () => {
  it('keeps every action waiting while the account is pending, then uses the browser samples', async () => {
    const { api } = choose({ kind: 'pending' });
    const listing = vi.fn();
    const pending = api.list().then(listing);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listing).not.toHaveBeenCalled();
    api.setWorkspace({ kind: 'browser' });
    await pending;
    expect(listing.mock.calls[0][0]).toHaveLength(5);
  });

  it('opens the cloud workspace for the signed-in user, empty and with no samples seeded', async () => {
    const { api, openCloud } = choose({ kind: 'cloud', userId: 'user-1' });
    expect(await api.list()).toEqual([]);
    expect(openCloud).toHaveBeenCalledWith('user-1');
    expect(await api.storageMode()).toBe('cloud');
    expect(await api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')))).toMatchObject({ id: '100001', name: 'mine.csv' });
  });

  it("starts a fresh file service for each workspace, so one never shows the other's files", async () => {
    const { api, openCloud } = choose({ kind: 'browser' });
    expect(await api.list()).toHaveLength(5);
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    expect(await api.list()).toEqual([]);
    api.setWorkspace({ kind: 'cloud', userId: 'user-2' });
    await api.list();
    expect(openCloud).toHaveBeenCalledTimes(2);
    api.setWorkspace({ kind: 'browser' });
    expect(await api.list()).toHaveLength(5);
    expect(await api.storageMode()).toBe('saved');
  });

  it('does not reopen the workspace when the same choice is set again', async () => {
    const { api, openCloud } = choose({ kind: 'cloud', userId: 'user-1' });
    await api.list();
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    await api.list();
    expect(openCloud).toHaveBeenCalledTimes(1);
  });

  it('changes its workspace id with every switch, so a loop can tell its workspace is gone', async () => {
    const { api } = choose({ kind: 'browser' });
    const first = api.workspaceId();
    api.setWorkspace({ kind: 'browser' });
    expect(api.workspaceId()).toBe(first);
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    expect(api.workspaceId()).not.toBe(first);
    const second = api.workspaceId();
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    expect(api.workspaceId()).toBe(second);
  });

  it('opens no workspace when the account could not be confirmed', async () => {
    const { api, openCloud } = choose({ kind: 'unavailable', message: 'Workspace unavailable' });
    await expect(api.list()).rejects.toMatchObject({ statusCode: 503, message: 'Workspace unavailable' });
    expect(openCloud).not.toHaveBeenCalled();
  });

  it('retries a cloud workspace that failed to open on the next call', async () => {
    const openCloud = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Your cloud workspace is temporarily unavailable.'), { statusCode: 503 }))
      .mockResolvedValue(cloudWorkspace());
    const { api } = choose({ kind: 'cloud', userId: 'user-1' }, openCloud);
    await expect(api.list()).rejects.toThrow('temporarily unavailable');
    expect(await api.list()).toEqual([]);
  });

  it('refuses Clear my data in the cloud workspace and leaves its files alone', async () => {
    const { api } = choose({ kind: 'cloud', userId: 'user-1' });
    await api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')));
    await expect(api.clearData()).rejects.toMatchObject({ statusCode: 400 });
    expect(await api.list()).toHaveLength(1);
  });
});

describe('demo workspace', () => {
  const ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ID_4 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const ID_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const databaseNames = async () => (await indexedDB.databases()).map((db) => db.name);

  it("seeds a demo's own database and leaves the browser workspace and other demos alone", async () => {
    const api = createApi((name) => openWorkspace(name), vi.fn(), { kind: 'demo', sessionId: ID_1 });
    expect(await api.list()).toHaveLength(5);
    expect(await api.storageMode()).toBe('demo');
    await api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')));
    expect(await api.list()).toHaveLength(6);

    api.setWorkspace({ kind: 'demo', sessionId: ID_2 });
    expect(await api.list()).toHaveLength(5); // a second demo does not see the first demo's upload
    api.setWorkspace({ kind: 'browser' });
    expect(await api.list()).toHaveLength(5);
    expect(await api.storageMode()).toBe('saved');
    const names = await databaseNames();
    expect(names).toEqual(expect.arrayContaining([demoDbName(ID_1), demoDbName(ID_2), 'reclaim-studio']));

    api.setWorkspace({ kind: 'demo', sessionId: ID_1 });
    expect(await api.list()).toHaveLength(6); // the first demo continues, as after a refresh
  });

  it('clears only the demo database, back to the five samples', async () => {
    const api = createApi((name) => openWorkspace(name), vi.fn(), { kind: 'browser' });
    const before = await api.list();
    await api.upload(csvFile('kept.csv', sample('partner_a_baseline.csv')));
    api.setWorkspace({ kind: 'demo', sessionId: ID_4 });
    await api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')));
    expect(await api.list()).toHaveLength(6);
    await api.clearData();
    expect(await api.list()).toHaveLength(5);
    api.setWorkspace({ kind: 'browser' });
    expect(await api.list()).toHaveLength(before.length + 1); // the browser workspace kept its upload
  });

  it("never shows a demo's files in the cloud workspace, or the cloud's files in the demo", async () => {
    const openCloud = vi.fn(async (_userId: string) => cloudWorkspace());
    const api = createApi((name) => openWorkspace(name), openCloud, { kind: 'demo', sessionId: ID_3 });
    expect(await api.list()).toHaveLength(5);
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    expect(await api.list()).toEqual([]);
    expect(await api.storageMode()).toBe('cloud');
    api.setWorkspace({ kind: 'demo', sessionId: ID_3 });
    expect(await api.list()).toHaveLength(5);
    expect(await api.storageMode()).toBe('demo');
    expect(openCloud).toHaveBeenCalledTimes(1);
  });

  it("keeps a demo's memory fallback as memory when the browser blocks IndexedDB", async () => {
    const api = createApi(async () => ({ storage: createMemoryStorage(), mode: 'memory' as const }), vi.fn(), { kind: 'demo', sessionId: ID_1 });
    expect(await api.storageMode()).toBe('memory');
    expect(await api.list()).toHaveLength(5);
  });
});

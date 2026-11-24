import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createApi, openWorkspace } from './api';
import { createFileService } from '../../../shared/file-service';
import type { AccountState, Profile } from '../hooks/useAccount';
import { createMemoryStorage, openBrowserStorage } from './browser-storage';
import { BROWSER_DB, demoDbName } from './demo';
import { SAMPLE_FILES } from './samples';
import { CLOSED_MESSAGE, workspaceChoice, type WorkspaceChoice } from './workspace';

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
  it('keeps every action waiting while the account is pending, then opens the demo it was given', async () => {
    const { api } = choose({ kind: 'pending' });
    const listing = vi.fn();
    const pending = api.list().then(listing);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listing).not.toHaveBeenCalled();
    api.setWorkspace({ kind: 'demo', sessionId: 's1' });
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
    const { api, openCloud } = choose({ kind: 'demo', sessionId: 's1' });
    expect(await api.list()).toHaveLength(5);
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    expect(await api.list()).toEqual([]);
    api.setWorkspace({ kind: 'cloud', userId: 'user-2' });
    await api.list();
    expect(openCloud).toHaveBeenCalledTimes(2);
    api.setWorkspace({ kind: 'demo', sessionId: 's1' });
    expect(await api.list()).toHaveLength(5);
    expect(await api.storageMode()).toBe('demo');
  });

  it('does not reopen the workspace when the same choice is set again', async () => {
    const { api, openCloud } = choose({ kind: 'cloud', userId: 'user-1' });
    await api.list();
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    await api.list();
    expect(openCloud).toHaveBeenCalledTimes(1);
  });

  it('changes its workspace id with every switch, so a loop can tell its workspace is gone', async () => {
    const { api } = choose({ kind: 'closed' });
    const first = api.workspaceId();
    api.setWorkspace({ kind: 'closed' });
    expect(api.workspaceId()).toBe(first);
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    expect(api.workspaceId()).not.toBe(first);
    const second = api.workspaceId();
    api.setWorkspace({ kind: 'cloud', userId: 'user-1' });
    expect(api.workspaceId()).toBe(second);
  });

  it('starts closed and opens, creates and seeds nothing until an allowed workspace is set', async () => {
    const open = vi.fn((name: string) => openWorkspace(name));
    const openCloud = vi.fn(async (_userId: string) => cloudWorkspace());
    const api = createApi(open, openCloud);
    const account = (profile: Profile | null): AccountState => ({ status: 'signed-in', userId: 'u1', email: 'a@b.c', profile });
    await expect(api.list()).rejects.toMatchObject({ statusCode: 403, message: CLOSED_MESSAGE });
    const denied: AccountState[] = [
      { status: 'unconfigured' }, { status: 'signed-out' }, { status: 'error', message: 'x' },
      account(null), account({ name: null, role: 'Admin', active: false }),
    ];
    for (const state of denied) {
      api.setWorkspace(workspaceChoice(state));
      await expect(api.list()).rejects.toThrow();
      await expect(api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')))).rejects.toThrow();
      await expect(api.clearData()).rejects.toThrow();
    }
    expect(open).not.toHaveBeenCalled();
    expect(openCloud).not.toHaveBeenCalled();
    expect((await indexedDB.databases()).map((db) => db.name)).not.toContain(BROWSER_DB);
  });

  it('closes an open workspace when access is lost', async () => {
    const { api } = choose({ kind: 'cloud', userId: 'user-1' });
    await api.list();
    api.setWorkspace({ kind: 'closed' });
    await expect(api.list()).rejects.toMatchObject({ statusCode: 403 });
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
    const names = await databaseNames();
    expect(names).toEqual(expect.arrayContaining([demoDbName(ID_1), demoDbName(ID_2)]));
    expect(names).not.toContain(BROWSER_DB); // the older browser files are never opened or seeded

    api.setWorkspace({ kind: 'demo', sessionId: ID_1 });
    expect(await api.list()).toHaveLength(6); // the first demo continues, as after a refresh
  });

  it('clears only the demo database, back to the five samples', async () => {
    const older = createFileService(await openBrowserStorage(BROWSER_DB)); // files kept in this browser before sign-in
    await older.upload({ name: 'kept.csv', text: sample('partner_a_baseline.csv') });
    const before = await older.list();
    const api = createApi((name) => openWorkspace(name), vi.fn(), { kind: 'demo', sessionId: ID_4 });
    await api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')));
    expect(await api.list()).toHaveLength(6);
    await api.clearData();
    expect(await api.list()).toHaveLength(5);
    expect(await older.list()).toEqual(before); // the older browser files are unchanged
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

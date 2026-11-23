import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createApi, openWorkspace } from './api';
import { createMemoryStorage } from './browser-storage';
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

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openBrowserStorage } from './browser-storage';
import {
  BROWSER_DB, claimDemoLock, currentDemoId, DEMO_EMAIL, DEMO_PASSWORD, DEMO_SESSION_KEY, DEMO_STORAGE_MESSAGE, demoDbName, deleteDemoDatabase, endDemo,
  isDemoCredentials, isDemoDbName, startDemo, sweepStaleDemos, type LockManagerLike,
} from './demo';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

function fakeStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}

/**
 * A lock manager like the browser's: the callback runs later (so two overlapping requests both see the name free),
 * and the lock is held until the callback's promise settles.
 */
function fakeLocks(initiallyHeld: string[] = []): LockManagerLike & { held: Set<string>; requests: string[] } {
  const held = new Set(initiallyHeld);
  const requests: string[] = [];
  return {
    held,
    requests,
    request: (name, _options, callback) => new Promise((resolve) => setTimeout(async () => {
      requests.push(name);
      if (held.has(name)) return resolve(await callback(null));
      held.add(name);
      try { resolve(await callback({})); } finally { held.delete(name); }
    }, 0)),
  };
}

const names = async () => (await indexedDB.databases()).map((db) => db.name);

// Each test starts with no databases, so what one leaves behind can't change another's sweep.
afterEach(async () => {
  for (const name of await names()) await new Promise((resolve) => { const request = indexedDB.deleteDatabase(name!); request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined); });
});

describe('demo credentials', () => {
  it('match the public pair, ignoring email case and spaces, but not the password', () => {
    expect(isDemoCredentials(DEMO_EMAIL, DEMO_PASSWORD)).toBe(true);
    expect(isDemoCredentials(`  ${DEMO_EMAIL.toUpperCase()} `, DEMO_PASSWORD)).toBe(true);
    expect(isDemoCredentials(DEMO_EMAIL, DEMO_PASSWORD.toUpperCase())).toBe(false);
    expect(isDemoCredentials('someone@example.com', DEMO_PASSWORD)).toBe(false);
  });
});

describe('demo session', () => {
  it('starts, continues and ends in this tab, and ignores a stored value that is not a UUID', async () => {
    const store = fakeStore();
    expect(currentDemoId(store)).toBeNull();
    const id = startDemo(store);
    expect(currentDemoId(store)).toBe(id);
    await endDemo(id, store, indexedDB);
    expect(currentDemoId(store)).toBeNull();
    store.setItem(DEMO_SESSION_KEY, 'reclaim-studio');
    expect(currentDemoId(store)).toBeNull();
    expect(store.data.has(DEMO_SESSION_KEY)).toBe(false);
  });

  it('names databases so that only a prefix plus a UUID counts as a demo', () => {
    expect(isDemoDbName(demoDbName(ID_A))).toBe(true);
    expect(isDemoDbName(BROWSER_DB)).toBe(false);
    expect(isDemoDbName('reclaim-studio-demo-')).toBe(false);
    expect(isDemoDbName('reclaim-studio-demo-not-a-uuid')).toBe(false);
  });

  it('lets a duplicated tab see that another tab holds the demo', async () => {
    expect(await claimDemoLock(ID_A, fakeLocks([demoDbName(ID_A)]), 2, 1)).toBe(false); // another tab holds it
    const locks = fakeLocks();
    expect(await claimDemoLock(ID_B, locks)).toBe(true);
    expect(await claimDemoLock(ID_B, locks)).toBe(true); // this tab's own re-run
    expect(await claimDemoLock(ID_A, null)).toBe(true); // no Web Locks: nothing to check
    await endDemo(ID_B, fakeStore(), indexedDB);
  });

  it('shares one claim between overlapping calls, as React does when it runs an effect twice', async () => {
    const locks = fakeLocks();
    const [first, second] = await Promise.all([claimDemoLock(ID_C, locks), claimDemoLock(ID_C, locks)]);
    expect([first, second]).toEqual([true, true]);
    expect(locks.requests).toEqual([demoDbName(ID_C)]); // one request, not two
    await endDemo(ID_C, fakeStore(), indexedDB);
  });

  it('waits for an old document to let go before deciding the tab was duplicated', async () => {
    const name = demoDbName(ID_A);
    const locks = fakeLocks([name]);
    setTimeout(() => locks.held.delete(name), 20); // a refresh's previous document releases a moment later
    expect(await claimDemoLock(ID_A, locks, 5, 15)).toBe(true);
    await endDemo(ID_A, fakeStore(), indexedDB);
  });

  it('releases its lock and deletes only its own database when the demo ends', async () => {
    const locks = fakeLocks();
    const name = demoDbName(ID_B);
    await openBrowserStorage(name);
    await openBrowserStorage(BROWSER_DB);
    expect(await claimDemoLock(ID_B, locks)).toBe(true);
    expect(locks.held.has(name)).toBe(true);
    expect(await endDemo(ID_B, fakeStore(), indexedDB)).toBe(true);
    await vi.waitFor(() => expect(locks.held.has(name)).toBe(false));
    expect(await names()).not.toContain(name);
    expect(await names()).toContain(BROWSER_DB);
  });

  it('survives a browser that blocks site storage: no demo ID, and a clear message when starting one', async () => {
    const blocked = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    try {
      expect(currentDemoId()).toBeNull();
      expect(() => startDemo()).toThrow(DEMO_STORAGE_MESSAGE);
      expect(() => startDemo({ setItem: () => { throw new Error('full'); } })).toThrow(DEMO_STORAGE_MESSAGE);
      await expect(endDemo(ID_A)).resolves.toBe(true);
    } finally { blocked.mockRestore(); }
  });

  it('refuses to delete a database that is not a demo database', async () => {
    await (await openBrowserStorage(BROWSER_DB)).clear();
    expect(await deleteDemoDatabase(BROWSER_DB)).toBe(false);
    expect(await names()).toContain(BROWSER_DB);
  });
});

describe('sweepStaleDemos', () => {
  it('deletes only unlocked demo databases, never the browser workspace or the current tab', async () => {
    for (const name of [BROWSER_DB, demoDbName(ID_A), demoDbName(ID_B), demoDbName(ID_C)]) await openBrowserStorage(name);
    const removed = await sweepStaleDemos(ID_B, indexedDB, fakeLocks([demoDbName(ID_C)]));
    expect(removed).toEqual([demoDbName(ID_A)]);
    const left = await names();
    expect(left).toContain(BROWSER_DB);
    expect(left).toContain(demoDbName(ID_B));
    expect(left).toContain(demoDbName(ID_C));
    expect(left).not.toContain(demoDbName(ID_A));
  });

  it('never deletes a demo whose lock another tab takes while the sweep is running', async () => {
    await openBrowserStorage(demoDbName(ID_A));
    const locks = fakeLocks();
    const listing = { databases: async () => { locks.held.add(demoDbName(ID_A)); return indexedDB.databases(); }, deleteDatabase: indexedDB.deleteDatabase.bind(indexedDB) };
    expect(await sweepStaleDemos(null, listing, locks)).toEqual([]);
    expect(await names()).toContain(demoDbName(ID_A));
  });

  it('deletes each stale database while holding its lock, and lets go afterwards', async () => {
    await openBrowserStorage(demoDbName(ID_C));
    const locks = fakeLocks();
    const during: boolean[] = [];
    const remove = indexedDB.deleteDatabase.bind(indexedDB);
    const idb = { databases: indexedDB.databases.bind(indexedDB), deleteDatabase: (name: string) => { during.push(locks.held.has(name)); return remove(name); } };
    expect(await sweepStaleDemos(null, idb, locks)).toContain(demoDbName(ID_C));
    expect(during).toEqual([true]);
    expect(locks.held.size).toBe(0);
  });

  it('does nothing when the browser has no Web Locks or database listing', async () => {
    await openBrowserStorage(demoDbName(ID_A));
    expect(await sweepStaleDemos(null, indexedDB, null)).toEqual([]);
    expect(await sweepStaleDemos(null, indexedDB, { request: async () => undefined })).toEqual([]);
    const noList = { deleteDatabase: indexedDB.deleteDatabase.bind(indexedDB) } as Pick<IDBFactory, 'databases' | 'deleteDatabase'>;
    expect(await sweepStaleDemos(null, noList, fakeLocks())).toEqual([]);
    expect(await names()).toContain(demoDbName(ID_A));
  });
});

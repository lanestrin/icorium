import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openBrowserStorage } from './browser-storage';
import {
  BROWSER_DB, claimDemoLock, currentDemoId, DEMO_EMAIL, DEMO_PASSWORD, DEMO_SESSION_KEY, DEMO_STORAGE_MESSAGE, demoDbName, deleteDemoDatabase, endDemo,
  ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD, currentDemoKind, DEMO_ADMIN_DATA_KEY, DEMO_KIND_KEY, demoKindFor, dropDemoId,
  isDemoCredentials, isDemoDbName, leaveDemo, startDemo, sweepStaleDemos, type LockManagerLike,
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
      expect(() => startDemo({ setItem: () => { throw new Error('full'); }, removeItem: () => undefined })).toThrow(DEMO_STORAGE_MESSAGE);
      await expect(endDemo(ID_A)).resolves.toBe(true);
    } finally { blocked.mockRestore(); }
  });

  it('refuses to delete a database that is not a demo database', async () => {
    await (await openBrowserStorage(BROWSER_DB)).clear();
    expect(await deleteDemoDatabase(BROWSER_DB)).toBe(false);
    expect(await names()).toContain(BROWSER_DB);
  });
});

describe('the Admin demo (17.10)', () => {
  afterEach(() => sessionStorage.clear());

  it('starts only for its own exact credentials; a mix of the two is neither', () => {
    expect(demoKindFor(DEMO_EMAIL, DEMO_PASSWORD)).toBe('standard');
    expect(demoKindFor(` ${ADMIN_DEMO_EMAIL.toUpperCase()} `, ADMIN_DEMO_PASSWORD)).toBe('admin');
    expect(demoKindFor(ADMIN_DEMO_EMAIL, DEMO_PASSWORD)).toBeNull();
    expect(demoKindFor(DEMO_EMAIL, ADMIN_DEMO_PASSWORD)).toBeNull();
    expect(demoKindFor(ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD + ' ')).toBeNull();
    expect(isDemoCredentials(ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD)).toBe(true);
    expect(isDemoCredentials('ada@example.com', ADMIN_DEMO_PASSWORD)).toBe(false);
  });

  it('records the kind against this session only, and treats anything else as a standard demo', () => {
    const store = fakeStore();
    const id = startDemo(store, () => ID_A, 'admin');
    expect(store.data.get(DEMO_KIND_KEY)).toBe(`${id}:admin`);
    expect(currentDemoKind(store)).toBe('admin');
    store.data.set(DEMO_KIND_KEY, `${ID_B}:admin`); // another session's value
    expect(currentDemoKind(store)).toBe('standard');
    for (const value of ['admin', `${ID_A}:Admin`, `${ID_A}:admin:x`, '']) {
      store.data.set(DEMO_KIND_KEY, value);
      expect(currentDemoKind(store), value).toBe('standard');
    }
    store.data.delete(DEMO_KIND_KEY);
    expect(currentDemoKind(store)).toBe('standard');
    expect(currentDemoKind(null)).toBe('standard');
    store.data.set(DEMO_KIND_KEY, `${ID_A}:admin`);
    store.data.delete(DEMO_SESSION_KEY); // no session: the kind alone counts for nothing
    expect(currentDemoKind(store)).toBe('standard');
  });

  it('a new demo replaces the earlier kind and fictional data', () => {
    const store = fakeStore();
    startDemo(store, () => ID_A, 'admin');
    store.data.set(DEMO_ADMIN_DATA_KEY, '{}');
    startDemo(store, () => ID_B);
    expect(currentDemoKind(store)).toBe('standard');
    expect(store.data.has(DEMO_ADMIN_DATA_KEY)).toBe(false);
  });

  it('does not start when the kind cannot be saved, and leaves no session behind', () => {
    const data = new Map<string, string>();
    const store = {
      setItem: (k: string, v: string) => { if (k === DEMO_KIND_KEY) throw new Error('full'); data.set(k, v); },
      removeItem: (k: string) => void data.delete(k),
    };
    expect(() => startDemo(store, () => ID_A, 'admin')).toThrow(DEMO_STORAGE_MESSAGE);
    expect(data.size).toBe(0);
  });

  it('ends with the demo: dropping the session removes the kind and the fictional data', async () => {
    const store = fakeStore();
    startDemo(store, () => ID_A, 'admin');
    store.data.set(DEMO_ADMIN_DATA_KEY, '{}');
    dropDemoId(store);
    expect([...store.data.keys()]).toEqual([]);
    startDemo(store, () => ID_B, 'admin');
    store.data.set(DEMO_ADMIN_DATA_KEY, '{}');
    await endDemo(ID_B, store, indexedDB);
    expect([...store.data.keys()]).toEqual([]);
  });

  it('leaving it, or a duplicated tab giving it up, removes the kind too', async () => {
    startDemo(undefined, () => ID_C, 'admin');
    await leaveDemo(fakeLocks([demoDbName(ID_C)]));
    expect(sessionStorage.getItem(DEMO_KIND_KEY)).toBeNull();
    expect(currentDemoKind()).toBe('standard');
  });
});

describe('leaveDemo', () => {
  afterEach(() => sessionStorage.clear());

  it('deletes only the demo this tab holds, and does nothing without one', async () => {
    const id = '44444444-4444-4444-8444-444444444444';
    await leaveDemo(fakeLocks());
    startDemo(undefined, () => id);
    for (const name of [demoDbName(id), demoDbName(ID_B), BROWSER_DB]) await openBrowserStorage(name);
    await leaveDemo(fakeLocks());
    expect(currentDemoId()).toBeNull();
    const left = (await indexedDB.databases()).map((db) => db.name);
    expect(left).not.toContain(demoDbName(id));
    expect(left).toEqual(expect.arrayContaining([demoDbName(ID_B), BROWSER_DB]));
  });

  it('only forgets a demo another tab holds', async () => {
    const id = '55555555-5555-4555-8555-555555555555';
    startDemo(undefined, () => id);
    await openBrowserStorage(demoDbName(id));
    await leaveDemo(fakeLocks([demoDbName(id)]));
    expect(currentDemoId()).toBeNull();
    expect((await indexedDB.databases()).map((db) => db.name)).toContain(demoDbName(id));
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

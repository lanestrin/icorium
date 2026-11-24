import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openBrowserStorage } from './browser-storage';
import {
  BROWSER_DB, claimDemoLock, currentDemoId, DEMO_EMAIL, DEMO_PASSWORD, DEMO_SESSION_KEY, demoDbName, deleteDemoDatabase, endDemo,
  isDemoCredentials, isDemoDbName, startDemo, sweepStaleDemos, type LockManagerLike,
} from './demo';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

function fakeStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}

/** A lock manager that remembers which names are held. */
function fakeLocks(initiallyHeld: string[] = []): LockManagerLike & { held: Set<string> } {
  const held = new Set(initiallyHeld);
  return {
    held,
    request: async (name, _options, callback) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      return callback({});
    },
    query: async () => ({ held: [...held].map((name) => ({ name })) }),
  };
}

const names = async () => (await indexedDB.databases()).map((db) => db.name);

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
    expect(await claimDemoLock(ID_A, fakeLocks([demoDbName(ID_A)]))).toBe(false); // another tab holds it
    const locks = fakeLocks();
    expect(await claimDemoLock(ID_B, locks)).toBe(true);
    expect(await claimDemoLock(ID_B, locks)).toBe(true); // this tab's own re-run
    expect(await claimDemoLock(ID_A, null)).toBe(true); // no Web Locks: nothing to check
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

  it('does nothing when the browser has no Web Locks query or database listing', async () => {
    await openBrowserStorage(demoDbName(ID_A));
    expect(await sweepStaleDemos(null, indexedDB, null)).toEqual([]);
    expect(await sweepStaleDemos(null, indexedDB, { request: async () => undefined })).toEqual([]);
    const noList = { deleteDatabase: indexedDB.deleteDatabase.bind(indexedDB) } as Pick<IDBFactory, 'databases' | 'deleteDatabase'>;
    expect(await sweepStaleDemos(null, noList, fakeLocks())).toEqual([]);
    expect(await names()).toContain(demoDbName(ID_A));
  });
});

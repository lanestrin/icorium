// The guest demo (build-plan 17.5): public credentials, and one temporary browser workspace per tab. The demo is
// browser-only: it has no Supabase session and never reaches the cloud. Its data lives in its own IndexedDB
// database, named after a random session ID kept in sessionStorage, so a refresh continues it, another tab
// can't see it, and signing out deletes it.

export const DEMO_EMAIL = 'demo@reclaim-studio.example';
export const DEMO_PASSWORD = 'try-the-demo';
/** The Admin demo's public credentials (17.10). */
export const ADMIN_DEMO_EMAIL = 'admin-demo@reclaim-studio.example';
export const ADMIN_DEMO_PASSWORD = 'try-the-admin-demo';

/** A standard demo opens the file workspace; an Admin demo also opens the Admin-only pages, with fictional data. */
export type DemoKind = 'standard' | 'admin';

/** The database of the browser workspace that existed before the demo. The demo never touches it. */
export const BROWSER_DB = 'reclaim-studio';
export const DEMO_DB_PREFIX = 'reclaim-studio-demo-';
export const DEMO_SESSION_KEY = 'reclaim-studio-demo-session';
/** Holds `<session id>:admin` for an Admin demo. Only a value naming the current session counts. */
export const DEMO_KIND_KEY = 'reclaim-studio-demo-kind';
/** The Admin demo's fictional accounts and invitations (lib/demo-admin.ts). */
export const DEMO_ADMIN_DATA_KEY = 'reclaim-studio-demo-admin-data';

/** Added to /sign-in's address when a demo is signed out, so the page offers the demo again with its details filled in. */
export const DEMO_ENDED_PARAM = 'demo-ended';
/** The value that param has after an Admin demo, so the page fills the Admin demo's details. Any other value fills the standard demo's. */
export const ADMIN_DEMO_ENDED = 'admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The parts of the Web Locks API this file uses, so tests can pass their own. */
export interface LockManagerLike {
  request(name: string, options: { ifAvailable: true }, callback: (lock: object | null) => Promise<void> | undefined): Promise<unknown>;
}

export const DEMO_STORAGE_MESSAGE = "The demo needs this browser to allow site storage, and it's blocked. Allow it, then try again.";

/** This tab's session storage, or null where the browser blocks site storage (reading it then throws). */
function tabStorage(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}

/** The demo these exact public credentials start (the email ignores case and surrounding spaces), or null. */
export function demoKindFor(email: string, password: string): DemoKind | null {
  const clean = email.trim().toLowerCase();
  if (clean === DEMO_EMAIL && password === DEMO_PASSWORD) return 'standard';
  if (clean === ADMIN_DEMO_EMAIL && password === ADMIN_DEMO_PASSWORD) return 'admin';
  return null;
}

/** True for either demo's credentials. */
export const isDemoCredentials = (email: string, password: string) => demoKindFor(email, password) !== null;

export const demoDbName = (sessionId: string) => `${DEMO_DB_PREFIX}${sessionId}`;

/** True only for a demo database name: the prefix and a UUID, so it can never match the browser workspace. */
export function isDemoDbName(name: string): boolean {
  return name.startsWith(DEMO_DB_PREFIX) && UUID.test(name.slice(DEMO_DB_PREFIX.length));
}

/** This tab's demo session ID, or null. Anything that isn't a UUID is removed. */
export function currentDemoId(store: Pick<Storage, 'getItem' | 'removeItem'> | null = tabStorage()): string | null {
  if (!store) return null;
  let id: string | null = null;
  try { id = store.getItem(DEMO_SESSION_KEY); } catch { return null; }
  if (id === null) return null;
  if (UUID.test(id)) return id;
  try { store.removeItem(DEMO_SESSION_KEY); } catch { /* nothing to clean */ }
  return null;
}

/**
 * This tab's demo kind. Anything but an exact `<current session id>:admin` is standard, so a missing, malformed or
 * leftover value never grants more. The kind only chooses what is shown; trusted code never reads it.
 */
export function currentDemoKind(store: Pick<Storage, 'getItem' | 'removeItem'> | null = tabStorage()): DemoKind {
  const id = currentDemoId(store);
  if (!id || !store) return 'standard';
  try { return store.getItem(DEMO_KIND_KEY) === `${id}:admin` ? 'admin' : 'standard'; } catch { return 'standard'; }
}

/**
 * Starts a new demo in this tab and returns its ID. Throws DEMO_STORAGE_MESSAGE where site storage is blocked, and
 * then no demo has started. Starting a demo of either kind replaces any earlier kind and Admin data.
 */
export function startDemo(
  store: Pick<Storage, 'setItem' | 'removeItem'> | null = tabStorage(),
  newId: () => string = () => crypto.randomUUID(),
  kind: DemoKind = 'standard',
): string {
  const id = newId();
  try {
    if (!store) throw new Error('no storage');
    store.removeItem(DEMO_KIND_KEY);
    store.removeItem(DEMO_ADMIN_DATA_KEY);
    store.setItem(DEMO_SESSION_KEY, id);
    if (kind === 'admin') store.setItem(DEMO_KIND_KEY, `${id}:admin`);
  } catch {
    try { store?.removeItem(DEMO_SESSION_KEY); store?.removeItem(DEMO_KIND_KEY); } catch { /* nothing to clean */ }
    throw new Error(DEMO_STORAGE_MESSAGE);
  }
  return id;
}

const releases = new Map<string, () => void>();

function defaultLocks(): LockManagerLike | null {
  return (typeof navigator !== "undefined" && (navigator as { locks?: LockManagerLike }).locks) || null;
}

const claims = new Map<string, Promise<boolean>>();

/** One attempt to take the lock. False when another document holds it; without a lock answer it counts as taken. */
function tryLock(name: string, locks: LockManagerLike): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return undefined; }
      resolve(true);
      return new Promise<void>((release) => releases.set(name, release));
    }).catch(() => resolve(true));
  });
}

/**
 * Holds this demo's lock for the life of the tab. False means another tab still holds it after a few short
 * retries (a refresh's old document can take a moment to let go), so this tab was duplicated, which copies
 * sessionStorage, and must not use the demo. Overlapping claims (React runs an effect twice in development)
 * share one attempt. Without Web Locks it is true.
 */
export function claimDemoLock(id: string, locks: LockManagerLike | null = defaultLocks(), attempts = 5, delayMs = 200): Promise<boolean> {
  if (!locks) return Promise.resolve(true);
  const name = demoDbName(id);
  if (releases.has(name)) return Promise.resolve(true); // this tab already holds it
  const pending = claims.get(name);
  if (pending) return pending;
  const claim = (async () => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (await tryLock(name, locks)) return true;
    }
    return false;
  })().finally(() => claims.delete(name));
  claims.set(name, claim);
  return claim;
}

/** Forgets this tab's demo ID without deleting any data (a duplicated tab giving the demo up). */
export function dropDemoId(store: Pick<Storage, 'removeItem'> | null = tabStorage()) {
  for (const key of [DEMO_SESSION_KEY, DEMO_KIND_KEY, DEMO_ADMIN_DATA_KEY]) {
    try { store?.removeItem(key); } catch { /* nothing to clean */ }
  }
}

/** Deletes one demo database. False when the browser blocked or failed it; the next sweep tries again. */
export function deleteDemoDatabase(name: string, idb: Pick<IDBFactory, 'deleteDatabase'> | undefined = globalThis.indexedDB): Promise<boolean> {
  if (!idb || !isDemoDbName(name)) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    try {
      const request = idb.deleteDatabase(name);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Ends this tab's demo: forgets the ID, releases the lock and deletes the database. */
export async function endDemo(id: string, store: Pick<Storage, 'removeItem'> | null = tabStorage(), idb: Pick<IDBFactory, 'deleteDatabase'> | undefined = globalThis.indexedDB) {
  dropDemoId(store);
  const name = demoDbName(id);
  const deleted = await deleteDemoDatabase(name, idb);
  releases.get(name)?.();
  releases.delete(name);
  return deleted;
}

/**
 * Leaves the demo because the person has signed in to an account. A duplicated tab, whose demo another tab holds,
 * only forgets the ID, so the other tab's files stay.
 */
export async function leaveDemo(locks: LockManagerLike | null = defaultLocks()): Promise<void> {
  const id = currentDemoId();
  if (!id) return;
  if (await claimDemoLock(id, locks)) await endDemo(id);
  else dropDemoId();
}

/**
 * Deletes demo databases whose tab is gone: each candidate is deleted while holding its own lock, so a tab that
 * has just taken it is never deleted. Never deletes the browser workspace or the current tab's demo. Skipped when
 * the browser can't list databases or take locks.
 */
export async function sweepStaleDemos(
  currentId: string | null,
  idb: Pick<IDBFactory, 'databases' | 'deleteDatabase'> | undefined = globalThis.indexedDB,
  locks: LockManagerLike | null = defaultLocks(),
): Promise<string[]> {
  if (!idb || !locks || typeof idb.databases !== 'function') return [];
  const removed: string[] = [];
  try {
    const names = (await idb.databases()).map((db) => db.name ?? '');
    for (const name of names) {
      if (!isDemoDbName(name) || name === (currentId ? demoDbName(currentId) : '')) continue;
      await locks.request(name, { ifAvailable: true }, async (lock) => {
        if (lock && await deleteDemoDatabase(name, idb)) removed.push(name); // a null lock means a tab holds it
      });
    }
  } catch {
    /* the next sweep tries again */
  }
  return removed;
}

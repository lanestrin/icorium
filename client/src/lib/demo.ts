// The guest demo (build-plan 17.5): public credentials, and one temporary browser workspace per tab. The demo is
// browser-only: it has no Supabase session and never reaches the cloud. Its data lives in its own IndexedDB
// database, named after a random session ID kept in sessionStorage, so a refresh continues it, another tab
// can't see it, and signing out deletes it.

export const DEMO_EMAIL = 'demo@reclaim-studio.example';
export const DEMO_PASSWORD = 'try-the-demo';

/** The database of the browser workspace that existed before the demo. The demo never touches it. */
export const BROWSER_DB = 'reclaim-studio';
export const DEMO_DB_PREFIX = 'reclaim-studio-demo-';
export const DEMO_SESSION_KEY = 'reclaim-studio-demo-session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The parts of the Web Locks API this file uses, so tests can pass their own. */
export interface LockManagerLike {
  request(name: string, options: { ifAvailable: true }, callback: (lock: object | null) => Promise<void> | undefined): Promise<unknown>;
  query?(): Promise<{ held?: { name?: string }[] }>;
}

/** True for exactly the public demo email and password (the email ignores case and surrounding spaces). */
export function isDemoCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}

export const demoDbName = (sessionId: string) => `${DEMO_DB_PREFIX}${sessionId}`;

/** True only for a demo database name: the prefix and a UUID, so it can never match the browser workspace. */
export function isDemoDbName(name: string): boolean {
  return name.startsWith(DEMO_DB_PREFIX) && UUID.test(name.slice(DEMO_DB_PREFIX.length));
}

/** This tab's demo session ID, or null. Anything that isn't a UUID is removed. */
export function currentDemoId(store: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage): string | null {
  let id: string | null = null;
  try { id = store.getItem(DEMO_SESSION_KEY); } catch { return null; }
  if (id === null) return null;
  if (UUID.test(id)) return id;
  try { store.removeItem(DEMO_SESSION_KEY); } catch { /* nothing to clean */ }
  return null;
}

/** Starts a new demo in this tab and returns its ID. */
export function startDemo(store: Pick<Storage, 'setItem'> = sessionStorage, newId: () => string = () => crypto.randomUUID()): string {
  const id = newId();
  store.setItem(DEMO_SESSION_KEY, id);
  return id;
}

const releases = new Map<string, () => void>();

function defaultLocks(): LockManagerLike | null {
  return (typeof navigator !== "undefined" && (navigator as { locks?: LockManagerLike }).locks) || null;
}

/**
 * Holds this demo's lock for the life of the tab. False means another tab already holds it (this tab was
 * duplicated, which copies sessionStorage), so this tab must not use the demo. Without Web Locks it is true.
 */
export function claimDemoLock(id: string, locks: LockManagerLike | null = defaultLocks()): Promise<boolean> {
  if (!locks) return Promise.resolve(true);
  const name = demoDbName(id);
  if (releases.has(name)) return Promise.resolve(true); // this tab already holds it (an effect ran twice)
  return new Promise<boolean>((resolve) => {
    locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return undefined; }
      resolve(true);
      return new Promise<void>((release) => releases.set(name, release));
    }).catch(() => resolve(true));
  });
}

/** Forgets this tab's demo ID without deleting any data (a duplicated tab giving the demo up). */
export function dropDemoId(store: Pick<Storage, 'removeItem'> = sessionStorage) {
  try { store.removeItem(DEMO_SESSION_KEY); } catch { /* nothing to clean */ }
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
export async function endDemo(id: string, store: Pick<Storage, 'removeItem'> = sessionStorage, idb: Pick<IDBFactory, 'deleteDatabase'> | undefined = globalThis.indexedDB) {
  dropDemoId(store);
  const name = demoDbName(id);
  const deleted = await deleteDemoDatabase(name, idb);
  releases.get(name)?.();
  releases.delete(name);
  return deleted;
}

/**
 * Deletes demo databases whose tab is gone: a demo database is stale when no tab holds its lock. Never deletes
 * the browser workspace or the current tab's demo. Skipped when the browser can't list databases or locks.
 */
export async function sweepStaleDemos(
  currentId: string | null,
  idb: Pick<IDBFactory, 'databases' | 'deleteDatabase'> | undefined = globalThis.indexedDB,
  locks: LockManagerLike | null = defaultLocks(),
): Promise<string[]> {
  if (!idb || !locks?.query || typeof idb.databases !== 'function') return [];
  try {
    const held = new Set(((await locks.query()).held ?? []).map((lock) => lock.name));
    const names = (await idb.databases()).map((db) => db.name ?? '');
    const stale = names.filter((name) => isDemoDbName(name) && !held.has(name) && name !== (currentId ? demoDbName(currentId) : ''));
    const removed: string[] = [];
    for (const name of stale) if (await deleteDemoDatabase(name, idb)) removed.push(name);
    return removed;
  } catch {
    return [];
  }
}

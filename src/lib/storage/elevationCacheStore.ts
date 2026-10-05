/**
 * Elevation cache store (Phase 22.3 — §EE 22.3) — the IndexedDB home
 * of the persistent elevation LRU.
 *
 * One small database, one object store, nothing else. The LRU
 * semantics, capacity, and eviction math live in
 * features/elevation/persistent-cache.ts (pure); this module is the
 * browser glue the app layer injects — the same seam
 * lib/storage/sessionStore.ts established in Phase 10.
 *
 * Layout — `gpx-repair-studio.elevation` v1:
 *   - `points` — one { ele, at } per rounded "lat,lon" key
 *     (out-of-line). What is stored is exactly what the egress table
 *     already discloses leaving the browser for Open-Meteo; here it
 *     stays on the device, capped at ELEVATION_CACHE_CAPACITY
 *     entries, cleared from the privacy pane's button.
 *
 * Failure contract (the sessionStore precedent): every operation is
 * guarded. No `indexedDB` (SSR/jsdom), blocked databases (private
 * mode), quota errors, or corrupt low-level failures throw to the
 * caller — the first failure latches the backend off, later calls
 * become no-ops, one console.warn explains why, and the in-memory
 * LRU keeps the app fully functional without persistence.
 */

import type {
  ElevationCacheBackend,
  ElevationCacheEntry,
} from "@/features/elevation/persistent-cache";

const DB_NAME = "gpx-repair-studio.elevation";
const DB_VERSION = 1;
const STORE = "points";

/**
 * Whether `indexedDB` is reachable at all. A plain `typeof` probe — but
 * private-mode browsers can install a THROWING getter on window, so the
 * access itself is guarded (the blocked-storage contract).
 */
function canUseIndexedDB(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

/** Latched once any backend operation fails — everything after no-ops. */
let unavailable = false;
let warned = false;

function warnOnce(context: string, error: unknown): void {
  if (warned) return;
  warned = true;
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `[gpx-repair-studio] Persistent elevation cache is unavailable (${context}: ${reason}). ` +
      "Terrain fetched once per session still applies; it just will not survive a reload.",
  );
}

function fail(context: string, error: unknown): void {
  unavailable = true;
  warnOnce(context, error);
}

/** Open (and upgrade) the database once, on first use. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database open blocked"));
  });
}

/** Promisify one IDBRequest. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Run one transaction to completion (its request + txn close). */
async function run<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  body: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const txn = db.transaction(store, mode);
  const request = body(txn.objectStore(store));
  const result = await done(request);
  await new Promise<void>((resolve, reject) => {
    txn.oncomplete = () => resolve();
    txn.onerror = () => reject(txn.error);
    txn.onabort = () => reject(txn.error ?? new Error("transaction aborted"));
  });
  return result;
}

/**
 * The browser backend. `null` while the lazy open is pending and
 * forever after the first failure — the pure cache treats null as
 * "skip this operation", never as an error.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> | null {
  if (unavailable) return null;
  if (dbPromise !== null) return dbPromise;
  if (!canUseIndexedDB()) {
    // jsdom / SSR / blocked private mode — persistence simply off.
    unavailable = true;
    return null;
  }
  dbPromise = openDatabase();
  // An open that never settles (permanently blocked) must latch too.
  void dbPromise.catch((error: unknown) => fail("open", error));
  return dbPromise;
}

/** Wrap one backend operation: latch + warn on failure, and THROW so
 * the pure cache's guard can latch persistence off (a null-returning
 * backend would read as "zero points", which would be a lie). The
 * no-IndexedDB case (SSR/jsdom) throws SILENTLY, the sessionStore
 * precedent — it is an environment, not a failure.
 */
async function attempt<T>(
  context: string,
  body: (db: IDBDatabase) => Promise<T>,
): Promise<T> {
  if (!canUseIndexedDB()) {
    unavailable = true;
    throw new Error("elevation cache storage unavailable");
  }
  const db = getDatabase();
  if (db === null) {
    // Latched earlier (a real open/txn failure — already warned).
    throw new Error("elevation cache storage unavailable");
  }
  try {
    return await body(await db);
  } catch (error) {
    fail(context, error);
    throw error;
  }
}

/** The record shape on disk. */
interface StoredPoint {
  ele: number;
  at: number;
}

/**
 * The IndexedDB backend for PersistentElevationCache. Constructed once
 * by the app layer (hooks/use-elevation.ts) and injected — nothing
 * here is global state beyond the latched, warn-once connection.
 */
export function createElevationCacheBackend(): ElevationCacheBackend {
  return {
    async entries(): Promise<readonly ElevationCacheEntry[]> {
      return attempt("entries", async (db) => {
        const keys = await run<string[]>(db, STORE, "readonly", (store) =>
          store.getAllKeys() as IDBRequest<string[]>,
        );
        const records = await run<StoredPoint[]>(db, STORE, "readonly", (store) =>
          store.getAll() as IDBRequest<StoredPoint[]>,
        );
        const entries: ElevationCacheEntry[] = [];
        for (let i = 0; i < keys.length; i += 1) {
          const record = records[i];
          if (record && Number.isFinite(record.ele) && Number.isFinite(record.at)) {
            entries.push({ key: String(keys[i]), record: { ele: record.ele, at: record.at } });
          }
        }
        return entries;
      });
    },
    async putMany(entries: readonly ElevationCacheEntry[]): Promise<void> {
      await attempt("putMany", async (db) => {
        const txn = db.transaction(STORE, "readwrite");
        const store = txn.objectStore(STORE);
        for (const entry of entries) {
          store.put({ ele: entry.record.ele, at: entry.record.at }, entry.key);
        }
        await new Promise<void>((resolve, reject) => {
          txn.oncomplete = () => resolve();
          txn.onerror = () => reject(txn.error);
          txn.onabort = () => reject(txn.error ?? new Error("transaction aborted"));
        });
      });
    },
    async deleteMany(keys: readonly string[]): Promise<void> {
      await attempt("deleteMany", async (db) => {
        const txn = db.transaction(STORE, "readwrite");
        const store = txn.objectStore(STORE);
        for (const key of keys) {
          store.delete(key);
        }
        await new Promise<void>((resolve, reject) => {
          txn.oncomplete = () => resolve();
          txn.onerror = () => reject(txn.error);
          txn.onabort = () => reject(txn.error ?? new Error("transaction aborted"));
        });
      });
    },
    async clear(): Promise<void> {
      await attempt("clear", async (db) => {
        await run(db, STORE, "readwrite", (store) => store.clear());
      });
    },
  };
}

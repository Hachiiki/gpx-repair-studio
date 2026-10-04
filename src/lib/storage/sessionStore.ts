/**
 * Session storage (Phase 10 — docs/MASTER_PLAN.md Phase 10, §M-1/M-3) —
 * the IndexedDB home of crash/reload recovery, and (Phase 18 §EE 18.4)
 * of the user's named saved sessions.
 *
 * What this module owns: opening one small database and reading/writing
 * records. NOTHING else. Records are validated, captured and
 * hydrated by `lib/storage/session-record.ts` (pure); the autosave/restore
 * orchestration lives in `hooks/use-session-recovery.ts`, and the
 * saved-session orchestration in `hooks/use-saved-sessions.ts`.
 *
 * Layout — `gpx-repair-studio.sessions` v2, three object stores:
 *   - `state` — one SMALL record per section ("repair" | "recovery" |
 *     "create" | "plan"): the drawn vertices, settings, spans, resolved
 *     road legs. A geometry edit rewrites ~10–50 KB.
 *   - `files` — one { name, type, blob } per FILE-BACKED section, written
 *     ONCE per session (the bytes never change after upload). Splitting
 *     the blob out keeps the debounced autosave cheap even for a 24 MB
 *     250k-point file.
 *   - `saved` (Phase 18, DB v2) — the named-session snapshots: one entry
 *     per user save, keyed by generated id, holding the same record
 *     shape (plus the section's original blob, so a named save is
 *     self-sufficient). Explicit snapshots coexist with the `state`
 *     autosave by design: the autosave is the crash net, the named save
 *     is the user's own shelf.
 *
 * Single record per section in `state` (no history — the plan's explicit
 * non-goal); the `saved` store holds as many as the user keeps. At most
 * 4 autosave records + 2 autosave blobs + N saved sessions exist.
 *
 * Failure contract (the phase's "app functions identically with storage
 * disabled/blocked" criterion): every operation is guarded. No
 * `indexedDB` (SSR/jsdom), blocked databases (private mode), quota
 * errors, or corrupt low-level failures throw to the caller — the first
 * failure latches `unavailable`, later calls become silent no-ops, and
 * one console.warn explains why. Recovery is a reload away.
 *
 * Phase 10 — Session Recovery. Browser glue only; the injectable
 * backend keeps the semantics unit-testable without IndexedDB.
 */

/** The sections whose in-progress work is autosaved (merge excluded by design). */
export type SessionSection = "repair" | "recovery" | "create" | "plan";

/** Every section key — iteration order is the prompt's display order. */
export const SESSION_SECTIONS: readonly SessionSection[] = [
  "repair",
  "recovery",
  "create",
  "plan",
];

export function isSessionSection(value: unknown): value is SessionSection {
  return (
    value === "repair" ||
    value === "recovery" ||
    value === "create" ||
    value === "plan"
  );
}

/** A stored original file — the bytes plus what a `File` needs to rebuild. */
export interface StoredSessionFile {
  name: string;
  type: string;
  blob: Blob;
}

/**
 * Refuse to persist files past this size: a >64 MB activity is far outside
 * anything the app's own budgets describe (the 250k-point stress fixture
 * is 24 MB), and quota behavior for blobs that large varies wildly across
 * browsers. The session simply stays unrecoverable, as it is today.
 */
export const MAX_SESSION_FILE_BYTES = 64 * 1024 * 1024;

const DB_NAME = "gpx-repair-studio.sessions";
const DB_VERSION = 2;
const STATE_STORE = "state";
const FILE_STORE = "files";
const SAVED_STORE = "saved";

/**
 * The async key/value seam the public functions operate on. The real
 * implementation wraps IndexedDB below; tests inject an in-memory (or
 * throwing) backend so quota/blocking semantics are testable without a
 * database.
 */
export interface SessionStorageBackend {
  get(store: string, key: string): Promise<unknown>;
  put(store: string, key: string, value: unknown): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  keys(store: string): Promise<string[]>;
  clear(store: string): Promise<void>;
}

/** Latched once any backend operation fails — everything after no-ops. */
let unavailable = false;
let warned = false;
let backend: SessionStorageBackend | null = null;

/**
 * Whether `indexedDB` is reachable at all. A plain `typeof` probe — but
 * private-mode browsers can install a THROWING getter on window, so the
 * access itself is guarded (the phase's blocked-storage contract).
 */
function canUseIndexedDB(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function warnOnce(context: string, error: unknown): void {
  if (warned) return;
  warned = true;
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `[gpx-repair-studio] Session recovery is unavailable (${context}: ${reason}). ` +
      "Unsaved work will not survive a reload.",
  );
}

function fail(context: string, error: unknown): void {
  unavailable = true;
  warnOnce(context, error);
}

/** The real IndexedDB backend (created lazily, once, on first use). */
function getBackend(): SessionStorageBackend | null {
  if (unavailable) return null;
  if (backend !== null) return backend;
  if (!canUseIndexedDB()) {
    // jsdom / SSR / blocked private mode — recovery simply off, silently.
    unavailable = true;
    return null;
  }
  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // v1 — both stores keyed out-of-line by section.
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
      // v2 (Phase 18) — the named saved sessions, keyed by generated id.
      if (!db.objectStoreNames.contains(SAVED_STORE)) {
        db.createObjectStore(SAVED_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database open blocked"));
  });

  /** Promisify one IDBRequest into the backend's promise world. */
  const done = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  backend = {
    async get(store, key) {
      const db = await dbPromise;
      return done(
        db.transaction(store, "readonly").objectStore(store).get(key),
      ) as Promise<unknown>;
    },
    async put(store, key, value) {
      const db = await dbPromise;
      await done(
        db.transaction(store, "readwrite").objectStore(store).put(value, key),
      );
    },
    async delete(store, key) {
      const db = await dbPromise;
      await done(
        db.transaction(store, "readwrite").objectStore(store).delete(key),
      );
    },
    async keys(store) {
      const db = await dbPromise;
      return done(
        db.transaction(store, "readonly").objectStore(store).getAllKeys(),
      ) as Promise<string[]>;
    },
    async clear(store) {
      const db = await dbPromise;
      await done(db.transaction(store, "readwrite").objectStore(store).clear());
    },
  };
  // An open that never settles (permanently blocked) must latch too.
  void dbPromise.catch((error: unknown) => fail("open", error));
  return backend;
}

// ---------------------------------------------------------------------------
// Public operations — every one silent, boolean/null-typed, never throwing.
// ---------------------------------------------------------------------------

/** Read one section's raw stored record (validation is the caller's job). */
export async function readSessionState(
  section: SessionSection,
): Promise<unknown> {
  const active = getBackend();
  if (!active) return null;
  try {
    return await active.get(STATE_STORE, section);
  } catch (error) {
    fail("read", error);
    return null;
  }
}

/** Persist one section's state record (overwrites — one record per section). */
export async function writeSessionState(
  section: SessionSection,
  record: object,
): Promise<boolean> {
  const active = getBackend();
  if (!active) return false;
  try {
    await active.put(STATE_STORE, section, record);
    return true;
  } catch (error) {
    // Quota exceeded lives here — the common real-world failure.
    fail("write", error);
    return false;
  }
}

/** Read one section's stored original file (null when none/unknown). */
export async function readSessionFile(
  section: SessionSection,
): Promise<StoredSessionFile | null> {
  const active = getBackend();
  if (!active) return null;
  try {
    const raw: unknown = await active.get(FILE_STORE, section);
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as StoredSessionFile).name !== "string" ||
      typeof (raw as StoredSessionFile).type !== "string" ||
      !((raw as StoredSessionFile).blob instanceof Blob)
    ) {
      return null;
    }
    return raw as StoredSessionFile;
  } catch (error) {
    fail("read file", error);
    return null;
  }
}

/** Persist one section's original file bytes (written once per session). */
export async function writeSessionFile(
  section: SessionSection,
  file: StoredSessionFile,
): Promise<boolean> {
  if (file.blob.size > MAX_SESSION_FILE_BYTES) return false;
  const active = getBackend();
  if (!active) return false;
  try {
    await active.put(FILE_STORE, section, file);
    return true;
  } catch (error) {
    fail("write file", error);
    return false;
  }
}

/** Delete one section's state record AND file blob ("start over", discard). */
export async function deleteSessionSection(
  section: SessionSection,
): Promise<boolean> {
  const active = getBackend();
  if (!active) return false;
  try {
    await active.delete(STATE_STORE, section);
    await active.delete(FILE_STORE, section);
    return true;
  } catch (error) {
    fail("delete", error);
    return false;
  }
}

/** The "clear stored data" control: empty both object stores entirely. */
export async function clearAllSessionData(): Promise<boolean> {
  const active = getBackend();
  if (!active) return false;
  try {
    await active.clear(STATE_STORE);
    await active.clear(FILE_STORE);
    return true;
  } catch (error) {
    fail("clear", error);
    return false;
  }
}

/** Which sections currently hold a state record (for prompts + tests). */
export async function storedSessionSections(): Promise<SessionSection[]> {
  const active = getBackend();
  if (!active) return [];
  try {
    const keys = await active.keys(STATE_STORE);
    return keys.filter(isSessionSection);
  } catch (error) {
    fail("list", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Named saved sessions (Phase 18 §EE 18.4) — the `saved` store (DB v2).
// Same failure contract as above: silent, null/[]-typed, never throwing.
// Record validation is the ORCHESTRATOR's job (hooks/use-saved-sessions)
// — this layer only moves entries, exactly like the section records.
// ---------------------------------------------------------------------------

/** One named saved session as it sits in IndexedDB. */
export interface SavedSessionEntry {
  /** Generated id (`crypto.randomUUID` when available, else time+counter). */
  id: string;
  /** The user's name (never empty — the writer enforces it). */
  name: string;
  /** When the snapshot was first saved (epoch ms). */
  createdAt: number;
  /** When the snapshot was last renamed/overwritten (epoch ms). */
  updatedAt: number;
  /** Which section's work this holds (record.section mirrored). */
  section: SessionSection;
  /** The same validated record shape the autosave persists. */
  record: object;
  /** The repair session's workspace view, when it matters. */
  view?: "repair" | "share";
  /** The section's original file (file-backed sections: repair/recovery). */
  source?: StoredSessionFile;
}

/** Generate an id without depending on crypto.randomUUID's availability. */
function generateSavedId(): string {
  const uuid =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function" &&
    crypto.randomUUID();
  if (uuid) return uuid;
  return `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Save (or overwrite, when `id` matches) one named session. */
export async function saveSessionEntry(
  entry: Omit<SavedSessionEntry, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: number;
  },
): Promise<string | null> {
  const active = getBackend();
  if (!active) return null;
  const now = Date.now();
  const id = entry.id ?? generateSavedId();
  const full: SavedSessionEntry = {
    id,
    name: entry.name,
    createdAt: entry.createdAt ?? now,
    updatedAt: now,
    section: entry.section,
    record: entry.record,
    ...(entry.view !== undefined ? { view: entry.view } : {}),
    ...(entry.source !== undefined ? { source: entry.source } : {}),
  };
  try {
    await active.put(SAVED_STORE, id, full);
    return id;
  } catch (error) {
    fail("save session", error);
    return null;
  }
}

/** Read one saved session by id (null when absent, unreadable, or shaped wrong). */
export async function readSavedSession(
  id: string,
): Promise<SavedSessionEntry | null> {
  const active = getBackend();
  if (!active) return null;
  try {
    const raw: unknown = await active.get(SAVED_STORE, id);
    if (typeof raw !== "object" || raw === null) return null;
    const entry = raw as SavedSessionEntry;
    if (
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      !isSessionSection(entry.section) ||
      typeof entry.record !== "object" ||
      entry.record === null ||
      typeof entry.createdAt !== "number" ||
      typeof entry.updatedAt !== "number"
    ) {
      return null;
    }
    return entry;
  } catch (error) {
    fail("read session", error);
    return null;
  }
}

/**
 * List every saved session, newest-updated first (the manager's order).
 * Entries whose shape drifted are skipped, never guessed into place.
 */
export async function listSavedSessions(): Promise<SavedSessionEntry[]> {
  const active = getBackend();
  if (!active) return [];
  try {
    const keys = await active.keys(SAVED_STORE);
    const entries: SavedSessionEntry[] = [];
    for (const key of keys) {
      const raw: unknown = await active.get(SAVED_STORE, key);
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as SavedSessionEntry;
      if (
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        !isSessionSection(entry.section) ||
        typeof entry.record !== "object" ||
        entry.record === null ||
        typeof entry.updatedAt !== "number"
      ) {
        continue;
      }
      entries.push(entry);
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return entries;
  } catch (error) {
    fail("list sessions", error);
    return [];
  }
}

/** Rename one saved session (a plain patch — returns whether it landed). */
export async function renameSavedSession(
  id: string,
  name: string,
): Promise<boolean> {
  const current = await readSavedSession(id);
  if (current === null) return false;
  const active = getBackend();
  if (!active) return false;
  try {
    await active.put(SAVED_STORE, id, { ...current, name, updatedAt: Date.now() });
    return true;
  } catch (error) {
    fail("rename session", error);
    return false;
  }
}

/** Delete one saved session. */
export async function deleteSavedSession(id: string): Promise<boolean> {
  const active = getBackend();
  if (!active) return false;
  try {
    await active.delete(SAVED_STORE, id);
    return true;
  } catch (error) {
    fail("delete session", error);
    return false;
  }
}

/**
 * Whether recovery storage is alive: false once any operation failed
 * (the latch), true while an injected test backend is installed, and
 * for the real path true exactly when `indexedDB` exists at all.
 */
export function isSessionStorageAvailable(): boolean {
  if (unavailable) return false;
  if (backend !== null) return true;
  return canUseIndexedDB();
}

// ---------------------------------------------------------------------------
// Test seam — swap the backend (or reset the latch) from unit tests.
// ---------------------------------------------------------------------------

/**
 * @internal Test-only: inject a backend (in-memory, throwing, …) or pass
 * null to return to the real IndexedDB, re-arming the failure latch.
 */
export function __setSessionBackendForTests(
  replacement: SessionStorageBackend | null,
): void {
  backend = replacement;
  unavailable = false;
  warned = false;
}

/** @internal Test-only: force the unavailable latch (blocked storage). */
export function __forceSessionStorageUnavailableForTests(): void {
  unavailable = true;
}

/**
 * PersistentElevationCache (Phase 22.3 — §EE 22.3) — the durable half
 * of the elevation LRU.
 *
 * The Phase 6 `ElevationCache` is a synchronous in-memory LRU keyed by
 * rounded coordinates; it dies with the tab. This subclass mirrors
 * every resolved point into an injected async backend (IndexedDB in
 * the browser, `lib/storage/elevationCacheStore.ts`; anything else in
 * tests) and rehydrates from it on boot — so a hillside fetched once
 * is never fetched again, across sessions and reloads.
 *
 * Semantics, honestly stated:
 *   - The memory LRU stays the hot layer: `get`/`has` never await,
 *     exactly as before (the `withCache` decorator is unchanged).
 *   - `set` writes through, buffered and debounced — one `putMany`
 *     per quiet moment, not one transaction per point.
 *   - Persistence recency is WRITE order (`at`), not read order: a
 *     memory hit refreshes the LRU but not the stored timestamp.
 *     Both layers cap at the same capacity and both evict oldest
 *     first, so what survives is the same neighborhood of "recently
 *     resolved terrain".
 *   - Failure contract (the sessionStore precedent): the first
 *     backend error latches `persistent` off and every later
 *     operation becomes a silent no-op. The in-memory cache — and
 *     therefore every feature — keeps working exactly as in Phase 6.
 *   - Only positive knowledge is ever persisted (the decorator
 *     already refuses to `set` void points), and failures are never
 *     written, so a hydrate can only ever add honest terrain.
 *
 * Pure TypeScript; no DOM, no IndexedDB — the backend is injected
 * (docs/MASTER_PLAN.md §F-3, the same seam Open-Meteo's fetch uses).
 */

import { ElevationCache, ELEVATION_CACHE_CAPACITY } from "./cache";

/** What one persisted point looks like on disk. */
export interface ElevationCacheRecord {
  /** The resolved elevation, meters. */
  ele: number;
  /** Write time, ms since epoch — the persistence recency order. */
  at: number;
}

/** A backend entry: the rounded-coord key plus its record. */
export interface ElevationCacheEntry {
  key: string;
  record: ElevationCacheRecord;
}

/**
 * The async key/value seam (the sessionStore pattern). The browser
 * implementation wraps IndexedDB; tests inject fakes so eviction,
 * ordering and latch semantics are unit-testable without a database.
 */
export interface ElevationCacheBackend {
  /** Every stored entry (the cache is capped, so this is small). */
  entries(): Promise<readonly ElevationCacheEntry[]>;
  /** Insert or overwrite entries in one transaction. */
  putMany(entries: readonly ElevationCacheEntry[]): Promise<void>;
  /** Delete entries by key in one transaction. */
  deleteMany(keys: readonly string[]): Promise<void>;
  /** Wipe the store. */
  clear(): Promise<void>;
}

/** Injectable clocks and timers — deterministic tests, no globals. */
export interface PersistentElevationCacheOptions {
  backend: ElevationCacheBackend;
  /** In-memory AND persisted capacity. Defaults to the Phase 6 cap. */
  capacity?: number;
  /** Write-through debounce, ms. Default 1500. */
  debounceMs?: number;
  /** Clock for `at` stamps. Default Date.now. */
  now?: () => number;
  /** Scheduler — injectable so tests can fire or fast-forward. */
  schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

const DEFAULT_DEBOUNCE_MS = 1500;

export class PersistentElevationCache extends ElevationCache {
  readonly #backend: ElevationCacheBackend;
  readonly #debounceMs: number;
  readonly #now: () => number;
  readonly #schedule: (
    callback: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;

  /** Buffered write-through entries, keyed by cache key. */
  readonly #buffer = new Map<string, ElevationCacheRecord>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #flushing: Promise<void> = Promise.resolve();
  #hydrated = false;
  #hydrating: Promise<void> | null = null;
  /** Latched on the first backend failure (the sessionStore contract). */
  #persistentOff = false;

  constructor(options: PersistentElevationCacheOptions) {
    super(options.capacity ?? ELEVATION_CACHE_CAPACITY);
    this.#backend = options.backend;
    this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#now = options.now ?? (() => Date.now());
    this.#schedule =
      options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  }

  /** Store a resolved elevation: memory LRU now, disk shortly. */
  set(lat: number, lon: number, ele: number): void {
    super.set(lat, lon, ele);
    if (this.#persistentOff || !Number.isFinite(ele)) return;
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    this.#buffer.set(key, { ele, at: this.#now() });
    if (this.#timer !== null) {
      clearTimeout(this.#timer as unknown as ReturnType<typeof setTimeout>);
    }
    this.#timer = this.#schedule(() => {
      this.#timer = null;
      void this.#drain();
    }, this.#debounceMs);
  }

  /** Wipe both layers (the privacy pane's Clear button). */
  clear(): void {
    super.clear();
    this.#buffer.clear();
    if (this.#timer !== null) {
      clearTimeout(this.#timer as unknown as ReturnType<typeof setTimeout>);
      this.#timer = null;
    }
    if (this.#persistentOff) return;
    void this.#guard(async () => {
      await this.#backend.clear();
    });
  }

  /**
   * Load the persisted terrain into the memory LRU, newest first.
   * Idempotent; entries already in memory win (they are fresher or
   * equally fresh — the buffer may have written them this session).
   */
  hydrate(): Promise<void> {
    if (this.#hydrated) return Promise.resolve();
    if (this.#hydrating !== null) return this.#hydrating;
    this.#hydrating = this.#guard(async () => {
      const entries = await this.#backend.entries();
      // Newest write first: feeding the LRU in this order means the
      // overflow that evicts is the oldest terrain, and Map insertion
      // order afterwards mirrors persisted recency.
      const sorted = [...entries].sort((a, b) => b.record.at - a.record.at);
      const capacity = this.capacity;
      let loaded = 0;
      for (const entry of sorted) {
        if (loaded >= capacity) break;
        if (!Number.isFinite(entry.record?.ele)) continue;
        const [latText, lonText] = entry.key.split(",");
        const lat = Number(latText);
        const lon = Number(lonText);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (this.has(lat, lon)) continue; // memory is fresher
        super.set(lat, lon, entry.record.ele);
        loaded += 1;
      }
      this.#hydrated = true;
    }).catch(() => {
      /* latched inside #guard; hydrate never throws */
    });
    return this.#hydrating;
  }

  /** Flush pending writes now (pagehide, tests, before a clear). */
  flush(): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer as unknown as ReturnType<typeof setTimeout>);
      this.#timer = null;
    }
    // Serialize with any in-flight drain so order is preserved.
    this.#flushing = this.#flushing.then(() => this.#drain());
    return this.#flushing;
  }

  /** Whether persistence has latched off (diagnostics/tests). */
  get persistentOff(): boolean {
    return this.#persistentOff;
  }

  /** The persisted-entry count (the privacy pane's disclosure). */
  async persistedCount(): Promise<number | null> {
    if (this.#persistentOff) return null;
    try {
      return (await this.#backend.entries()).length;
    } catch {
      return null;
    }
  }

  /** Drain the buffer into the backend, then enforce the cap. */
  async #drain(): Promise<void> {
    if (this.#persistentOff || this.#buffer.size === 0) return;
    const batch = [...this.#buffer.entries()].map(([key, record]) => ({
      key,
      record,
    }));
    this.#buffer.clear();
    await this.#guard(async () => {
      await this.#backend.putMany(batch);
      // Cap the store: keep the newest `capacity` by write time.
      const all = await this.#backend.entries();
      if (all.length > this.capacity) {
        const overflow = [...all]
          .sort((a, b) => a.record.at - b.record.at)
          .slice(0, all.length - this.capacity)
          .map((entry) => entry.key);
        await this.#backend.deleteMany(overflow);
      }
    });
  }

  /**
   * The latch: run `body` once; on failure, persist is off forever
   * (memory keeps working — the Phase 6 behavior is the floor).
   */
  async #guard(body: () => Promise<void>): Promise<void> {
    if (this.#persistentOff) return;
    try {
      await body();
    } catch {
      this.#persistentOff = true;
    }
  }
}

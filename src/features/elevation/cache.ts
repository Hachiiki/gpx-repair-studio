/**
 * Elevation cache — in-memory LRU keyed by rounded coordinates
 * (docs/MASTER_PLAN.md §K-2, Phase 6).
 *
 * Keys round to 5 decimals (~1.1 m — finer than the 30 m DEM grid, so
 * a rounded hit is the same terrain cell). Re-edits, re-fetches, and
 * retries of nearby geometry are free; only genuinely new positions go
 * over the wire. Values are only POSITIVE knowledge: a failed/void
 * point is never cached, so it is honestly retried next time.
 *
 * `withCache` decorates any provider: cache hits short-circuit, misses
 * batch through, and defined results are written back. Progress
 * callbacks are rebased so the UI's counters still reflect the FULL
 * query, not just the uncached remainder.
 *
 * Phase 6 — Elevation. Pure TypeScript.
 */

import type {
  ElevationFetchOptions,
  ElevationProvider,
  ElevationQueryPoint,
} from "./provider";

/** Coordinate rounding (5 decimals ≈ 1.1 m; §K-2). */
const r5 = (value: number): string => value.toFixed(5);

/** Cache key: `"lat,lon"` on the 5-decimal grid. */
export function elevationCacheKey(lat: number, lon: number): string {
  return `${r5(lat)},${r5(lon)}`;
}

/** Default capacity — far above any realistic session's unique points. */
export const ELEVATION_CACHE_CAPACITY = 5000;

export class ElevationCache {
  readonly #map = new Map<string, number>();
  readonly #capacity: number;

  constructor(capacity: number = ELEVATION_CACHE_CAPACITY) {
    if (capacity < 1) throw new Error("capacity must be >= 1");
    this.#capacity = capacity;
  }

  /** Cached elevation, or undefined (also refreshes recency). */
  get(lat: number, lon: number): number | undefined {
    const key = elevationCacheKey(lat, lon);
    const value = this.#map.get(key);
    if (value === undefined) return undefined;
    // LRU refresh: re-insert at the end (most-recent).
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  has(lat: number, lon: number): boolean {
    return this.#map.has(elevationCacheKey(lat, lon));
  }

  /** Store a resolved elevation (failures are never written). */
  set(lat: number, lon: number, ele: number): void {
    if (!Number.isFinite(ele)) return;
    const key = elevationCacheKey(lat, lon);
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, ele);
    while (this.#map.size > this.#capacity) {
      // Evict the least-recently-used entry (Map insertion order).
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#map.delete(oldest);
    }
  }

  get size(): number {
    return this.#map.size;
  }

  clear(): void {
    this.#map.clear();
  }
}

/**
 * Cache decorator around any provider. Cache hits never touch the
 * network; misses are forwarded with the caller's options, and progress
 * counts include the pre-resolved points.
 */
export function withCache(
  provider: ElevationProvider,
  cache: ElevationCache,
): ElevationProvider {
  return {
    id: provider.id,
    name: provider.name,
    attribution: provider.attribution,
    privacyNote: provider.privacyNote,
    async getElevations(
      coords: readonly ElevationQueryPoint[],
      options?: ElevationFetchOptions,
    ): Promise<readonly (number | undefined)[]> {
      if (coords.length === 0) return [];
      const values: (number | undefined)[] = new Array(coords.length).fill(undefined);
      const misses: { index: number; point: ElevationQueryPoint }[] = [];
      let cachedResolved = 0;

      for (let i = 0; i < coords.length; i += 1) {
        const hit = cache.get(coords[i].lat, coords[i].lon);
        if (hit !== undefined) {
          values[i] = hit;
          cachedResolved += 1;
        } else {
          misses.push({ index: i, point: coords[i] });
        }
      }
      if (misses.length === 0) return values;

      const fetched = await provider.getElevations(
        misses.map((m) => m.point),
        options?.onProgress
          ? {
              ...options,
              onProgress: (answered, resolved) => {
                options.onProgress!(cachedResolved + answered, cachedResolved + resolved);
              },
            }
          : options,
      );
      for (let i = 0; i < misses.length; i += 1) {
        const value = fetched[i];
        values[misses[i].index] = value;
        if (value !== undefined) {
          cache.set(misses[i].point.lat, misses[i].point.lon, value);
        }
      }
      return values;
    },
  };
}

/**
 * Unit tests — features/elevation/cache.ts (Phase 6): the coordinate LRU
 * and the provider decorator.
 */

import { describe, expect, it, vi } from "vitest";
import {
  ElevationCache,
  elevationCacheKey,
  withCache,
} from "@/features/elevation/cache";
import type { ElevationProvider } from "@/features/elevation/provider";

describe("ElevationCache", () => {
  it("stores and retrieves by the 5-decimal grid (~1.1 m)", () => {
    const cache = new ElevationCache();
    cache.set(52.123456, 13.654321, 42.5);
    expect(cache.get(52.123456, 13.654321)).toBe(42.5);
    // Sub-grid jitter hits the same cell.
    expect(cache.get(52.1234571, 13.6543204)).toBe(42.5);
    expect(cache.has(52.123459, 13.65432)).toBe(true);
    // A different cell misses.
    expect(cache.get(52.125, 13.654321)).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it("ignores non-finite values (failures are never positive knowledge)", () => {
    const cache = new ElevationCache();
    cache.set(1, 2, Number.NaN);
    cache.set(1, 2, Infinity);
    expect(cache.size).toBe(0);
  });

  it("evicts the least-recently-used entry beyond capacity", () => {
    const cache = new ElevationCache(2);
    cache.set(1, 1, 10);
    cache.set(2, 2, 20);
    expect(cache.size).toBe(2);
    cache.set(3, 3, 30); // evicts (1,1)
    expect(cache.get(1, 1)).toBeUndefined();
    expect(cache.get(2, 2)).toBe(20);
    expect(cache.get(3, 3)).toBe(30);
  });

  it("refreshes recency on get", () => {
    const cache = new ElevationCache(2);
    cache.set(1, 1, 10);
    cache.set(2, 2, 20);
    cache.get(1, 1); // (1,1) is now most recent
    cache.set(3, 3, 30); // evicts (2,2)
    expect(cache.get(1, 1)).toBe(10);
    expect(cache.get(2, 2)).toBeUndefined();
  });

  it("clears", () => {
    const cache = new ElevationCache();
    cache.set(1, 1, 10);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("exposes the key format for disclosure/debug copy", () => {
    expect(elevationCacheKey(52.5, 13.4)).toBe("52.50000,13.40000");
  });
});

describe("withCache (provider decorator)", () => {
  const point = (lat: number) => ({ lat, lon: 13.4 });

  function innerProvider(
    getElevations: ElevationProvider["getElevations"],
  ): ElevationProvider {
    return {
      id: "test",
      name: "Test DEM",
      attribution: "test",
      privacyNote: "test",
      getElevations,
    };
  }

  it("short-circuits fully cached queries without touching the network", async () => {
    const cache = new ElevationCache();
    cache.set(1, 13.4, 11);
    cache.set(2, 13.4, 22);
    const spy = vi.fn().mockResolvedValue([33]);
    const provider = withCache(innerProvider(spy), cache);

    const values = await provider.getElevations([point(1), point(2)]);
    expect(values).toEqual([11, 22]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches only misses and writes defined results back", async () => {
    const cache = new ElevationCache();
    cache.set(1, 13.4, 11);
    const spy = vi.fn().mockResolvedValue([undefined, 26]);
    const provider = withCache(innerProvider(spy), cache);

    const values = await provider.getElevations([point(1), point(2), point(3)]);
    // Only the two misses were sent.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual([point(2), point(3)]);
    // Values land back in query order.
    expect(values).toEqual([11, undefined, 26]);
    // The defined miss is cached; the undefined one is not (failures are
    // honestly retried next time).
    expect(cache.has(3, 13.4)).toBe(true);
    expect(cache.has(2, 13.4)).toBe(false);
  });

  it("rebases progress counters to include pre-resolved points", async () => {
    const cache = new ElevationCache();
    cache.set(1, 13.4, 11);
    const progress = vi.fn();
    const spy = vi.fn().mockImplementation(
      (
        _coords: unknown,
        options?: { onProgress?: (answered: number, resolved: number) => void },
      ) => {
        options?.onProgress?.(1, 1); // the inner provider's own tick
        return Promise.resolve([26]);
      },
    );
    const provider = withCache(innerProvider(spy as never), cache);

    await provider.getElevations([point(1), point(2)], { onProgress: progress });
    // Inner reported (1 answered, 1 resolved) for the single miss — the
    // decorator adds the cached point.
    expect(progress).toHaveBeenCalledWith(2, 2);
  });

  it("passes the signal through untouched", async () => {
    const cache = new ElevationCache();
    const controller = new AbortController();
    const spy = vi.fn().mockImplementation(
      (_coords: unknown, options?: { signal?: AbortSignal }) => {
        expect(options?.signal?.aborted).toBe(false);
        return Promise.resolve([5]);
      },
    );
    const provider = withCache(innerProvider(spy as never), cache);
    await provider.getElevations([point(9)], { signal: controller.signal });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

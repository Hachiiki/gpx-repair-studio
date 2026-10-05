/**
 * Unit tests — features/elevation/persistent-cache.ts (Phase 22.3):
 * the durable half of the elevation LRU — write-through, hydration
 * order, the persisted cap, and the latched-failure contract. The
 * backend is a controllable in-memory fake (the IDB glue is e2e
 * territory, the sessionStore precedent).
 */

import { describe, expect, it, vi } from "vitest";
import { ELEVATION_CACHE_CAPACITY } from "@/features/elevation/cache";
import {
  PersistentElevationCache,
  type ElevationCacheBackend,
  type ElevationCacheEntry,
} from "@/features/elevation/persistent-cache";

/** A controllable in-memory backend with failure injection. */
function fakeBackend(initial: readonly ElevationCacheEntry[] = []) {
  const store = new Map<string, { ele: number; at: number }>(
    initial.map((entry) => [entry.key, { ...entry.record }]),
  );
  let failNext: string | null = null;
  const calls: string[] = [];
  const backend: ElevationCacheBackend & {
    dump(): ElevationCacheEntry[];
    failOnce(operation: string): void;
    calls: string[];
  } = {
    calls,
    async entries() {
      calls.push("entries");
      if (failNext === "entries") {
        failNext = null;
        throw new Error("entries failed");
      }
      return [...store.entries()].map(([key, record]) => ({
        key,
        record: { ...record },
      }));
    },
    async putMany(entries) {
      calls.push("putMany");
      if (failNext === "putMany") {
        failNext = null;
        throw new Error("putMany failed");
      }
      for (const entry of entries) {
        store.set(entry.key, { ...entry.record });
      }
    },
    async deleteMany(keys) {
      calls.push("deleteMany");
      if (failNext === "deleteMany") {
        failNext = null;
        throw new Error("deleteMany failed");
      }
      for (const key of keys) {
        store.delete(key);
      }
    },
    async clear() {
      calls.push("clear");
      if (failNext === "clear") {
        failNext = null;
        throw new Error("clear failed");
      }
      store.clear();
    },
    dump() {
      return [...store.entries()].map(([key, record]) => ({
        key,
        record: { ...record },
      }));
    },
    failOnce(operation) {
      failNext = operation;
    },
  };
  return backend;
}

/** Immediate schedule — the debounce collapses to a microtask tick. */
const immediate = (callback: () => void) =>
  setTimeout(callback, 0) as unknown as ReturnType<typeof setTimeout>;

describe("PersistentElevationCache — write-through", () => {
  it("buffers sets and writes them through on flush", async () => {
    const backend = fakeBackend();
    const cache = new PersistentElevationCache({
      backend,
      debounceMs: 60_000,
      now: () => 1_000,
      schedule: immediate,
    });
    cache.set(52.1, 13.1, 10);
    cache.set(52.2, 13.2, 20);
    // Nothing written before the debounce/flush.
    expect(backend.dump()).toHaveLength(0);
    await cache.flush();
    const entries = backend.dump();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.key).sort()).toEqual(
      ["52.10000,13.10000", "52.20000,13.20000"].sort(),
    );
    expect(entries.every((e) => e.record.at === 1_000)).toBe(true);
  });

  it("coalesces re-writes of the same key into one record", async () => {
    const backend = fakeBackend();
    const cache = new PersistentElevationCache({
      backend,
      now: () => 2_000,
      schedule: immediate,
    });
    cache.set(52.1, 13.1, 10);
    cache.set(52.100004, 13.100004, 11); // same 5-decimal cell
    await cache.flush();
    expect(backend.dump()).toHaveLength(1);
    expect(backend.dump()[0].record.ele).toBe(11);
  });

  it("never writes non-finite values through", async () => {
    const backend = fakeBackend();
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    cache.set(52.1, 13.1, Number.NaN);
    await cache.flush();
    expect(backend.dump()).toHaveLength(0);
    expect(cache.size).toBe(0);
  });
});

describe("PersistentElevationCache — hydrate", () => {
  it("loads persisted terrain newest-first into the memory LRU", async () => {
    const backend = fakeBackend([
      { key: "10.00000,10.00000", record: { ele: 1, at: 100 } },
      { key: "20.00000,20.00000", record: { ele: 2, at: 300 } },
      { key: "30.00000,30.00000", record: { ele: 3, at: 200 } },
    ]);
    const cache = new PersistentElevationCache({
      backend,
      now: () => 400,
      schedule: immediate,
    });
    await cache.hydrate();
    expect(cache.size).toBe(3);
    expect(cache.get(10, 10)).toBe(1);
    expect(cache.get(20, 20)).toBe(2);
    expect(cache.get(30, 30)).toBe(3);
  });

  it("memory wins over a stale persisted copy of the same key", async () => {
    const backend = fakeBackend([
      { key: "52.10000,13.10000", record: { ele: 111, at: 1 } },
    ]);
    const cache = new PersistentElevationCache({
      backend,
      now: () => 99,
      schedule: immediate,
    });
    cache.set(52.1, 13.1, 42); // fresher, pre-hydrate
    await cache.hydrate();
    expect(cache.get(52.1, 13.1)).toBe(42);
  });

  it("drops corrupt entries instead of failing the hydrate", async () => {
    const backend = fakeBackend([
      { key: "not-a-point", record: { ele: 5, at: 1 } },
      { key: "40.00000,40.00000", record: { ele: Number.NaN, at: 2 } },
      { key: "50.00000,50.00000", record: { ele: 7, at: 3 } },
    ]);
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    await cache.hydrate();
    expect(cache.size).toBe(1);
    expect(cache.get(50, 50)).toBe(7);
  });

  it("is idempotent — a second hydrate is a no-op", async () => {
    const backend = fakeBackend([
      { key: "60.00000,60.00000", record: { ele: 9, at: 1 } },
    ]);
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    await cache.hydrate();
    backend.clear();
    await cache.hydrate();
    expect(cache.size).toBe(1); // still there — not re-read
  });

  it("hydrates at most `capacity` points, dropping the oldest writes", async () => {
    const initial: ElevationCacheEntry[] = Array.from(
      { length: 8 },
      (_, i) => ({
        key: `${(i + 1).toFixed(5)},${(i + 1).toFixed(5)}`,
        record: { ele: i, at: i },
      }),
    );
    const backend = fakeBackend(initial);
    const cache = new PersistentElevationCache({
      backend,
      capacity: 5,
      now: () => 100,
      schedule: immediate,
    });
    await cache.hydrate();
    expect(cache.size).toBe(5);
    // The five NEWEST writes (at 7..3) survive; at 0..1 are dropped.
    expect(cache.get(8, 8)).toBe(7);
    expect(cache.get(4, 4)).toBe(3);
    expect(cache.has(1, 1)).toBe(false);
    expect(cache.has(2, 2)).toBe(false);
  });
});

describe("PersistentElevationCache — the persisted cap (§EE 22.3)", () => {
  it("trims the store to capacity after a drain, evicting the oldest writes", async () => {
    const backend = fakeBackend();
    let now = 0;
    const cache = new PersistentElevationCache({
      backend,
      capacity: 3,
      now: () => now,
      schedule: immediate,
    });
    for (let i = 1; i <= 5; i += 1) {
      now = i;
      cache.set(i, i, i * 10);
    }
    await cache.flush();
    const entries = backend.dump();
    expect(entries).toHaveLength(3);
    // The three newest (writes 3, 4, 5) survive.
    expect(entries.map((e) => e.record.ele).sort()).toEqual([30, 40, 50]);
    expect(entries.some((e) => e.key === "1.00000,1.00000")).toBe(false);
    expect(entries.some((e) => e.key === "2.00000,2.00000")).toBe(false);
  });

  it("keeps the in-memory LRU cap in step (inherited behavior)", () => {
    const cache = new PersistentElevationCache({
      backend: fakeBackend(),
      capacity: 2,
      now: () => 0,
      schedule: immediate,
    });
    cache.set(1, 1, 1);
    cache.set(2, 2, 2);
    cache.set(3, 3, 3);
    expect(cache.size).toBe(2);
    expect(cache.has(1, 1)).toBe(false);
    expect(cache.has(3, 3)).toBe(true);
  });

  it("defaults to the Phase 6 capacity on both layers", () => {
    const cache = new PersistentElevationCache({
      backend: fakeBackend(),
      now: () => 0,
      schedule: immediate,
    });
    expect(cache.capacity).toBe(ELEVATION_CACHE_CAPACITY);
  });
});

describe("PersistentElevationCache — clear", () => {
  it("wipes the memory LRU, the buffer, and the store", async () => {
    const backend = fakeBackend([
      { key: "70.00000,70.00000", record: { ele: 70, at: 1 } },
    ]);
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    cache.set(52.1, 13.1, 10); // buffered, never flushed
    cache.clear();
    await cache.flush();
    expect(cache.size).toBe(0);
    expect(backend.dump()).toHaveLength(0);
    expect(backend.calls).toContain("clear");
  });
});

describe("PersistentElevationCache — the failure latch", () => {
  it("latches on the first backend failure; later ops no-op, memory keeps working", async () => {
    const backend = fakeBackend();
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    backend.failOnce("putMany");
    cache.set(52.1, 13.1, 10);
    await cache.flush(); // fails, latches
    expect(cache.persistentOff).toBe(true);

    // Everything after is a silent no-op — no throw, no further writes
    // (the post-latch set() skips the buffer entirely, and the drain
    // guards on the latch too).
    cache.set(52.2, 13.2, 20);
    await cache.flush();
    await cache.hydrate();
    expect(backend.calls.filter((c) => c === "putMany")).toHaveLength(1);

    // The memory LRU still behaves exactly like Phase 6.
    expect(cache.get(52.1, 13.1)).toBe(10);
    expect(cache.get(52.2, 13.2)).toBe(20);
    expect(cache.size).toBe(2);
  });

  it("a failing hydrate latches too (never throws)", async () => {
    const backend = fakeBackend();
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    backend.failOnce("entries");
    await expect(cache.hydrate()).resolves.toBeUndefined();
    expect(cache.persistentOff).toBe(true);
  });

  it("persistedCount reads the store, null when unavailable", async () => {
    const backend = fakeBackend([
      { key: "80.00000,80.00000", record: { ele: 80, at: 1 } },
    ]);
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    expect(await cache.persistedCount()).toBe(1);
    backend.failOnce("entries");
    expect(await cache.persistedCount()).toBeNull();
  });
});

describe("PersistentElevationCache — withCache decorator compatibility", () => {
  it("slots into withCache unchanged (hits short-circuit, misses batch)", async () => {
    const { withCache } = await import("@/features/elevation/cache");
    const backend = fakeBackend();
    const cache = new PersistentElevationCache({
      backend,
      now: () => 0,
      schedule: immediate,
    });
    const fetchMock = vi.fn(async () => [101, 102] as const);
    const provider = withCache(
      {
        id: "test",
        name: "Test",
        attribution: "",
        privacyNote: "",
        privacyNoteKey: "x",
        getElevations: async (coords: readonly { lat: number; lon: number }[]) => {
          void coords;
          return fetchMock();
        },
      },
      cache,
    );
    const first = await provider.getElevations([
      { lat: 1.5, lon: 1.5 },
      { lat: 2.5, lon: 2.5 },
    ]);
    expect(first).toEqual([101, 102]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call: both points are cache hits — the provider is never
    // contacted, and the write-through is pending.
    const second = await provider.getElevations([
      { lat: 1.5, lon: 1.5 },
      { lat: 2.5, lon: 2.5 },
    ]);
    expect(second).toEqual([101, 102]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await cache.flush();
    expect(backend.dump()).toHaveLength(2);
  });
});

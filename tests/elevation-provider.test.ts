/**
 * Unit tests — features/elevation/opentopodata.ts (§N-1: provider against
 * mocked fetch — success, batching, throttle, 429 backoff, partial
 * failure, network error; FR-6.2).
 *
 * The provider's clock and sleep are injected, so timing behavior is
 * asserted as recorded sleep calls — no real timers, no real network.
 */

import { describe, expect, it, vi } from "vitest";
import {
  ELEVATION_BATCH_SIZE,
  ELEVATION_MIN_REQUEST_INTERVAL_MS,
  OpenTopoDataProvider,
} from "@/features/elevation/opentopodata";
import type { ElevationFetch } from "@/features/elevation/provider";

/** A test harness: fake clock + sleep recorder + scripted fetch. */
function harness(fetchImpl: ElevationFetch) {
  let now = 0;
  const sleeps: number[] = [];
  const provider = new OpenTopoDataProvider({
    fetch: fetchImpl,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
      sleeps.push(ms);
    },
  });
  return { provider, sleeps };
}

const ok = (results: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ status: "OK", results }),
});
const ele = (value: number | null) => ({ elevation: value });

const P = (lat: number, lon = 13.4) => ({ lat, lon });

describe("OpenTopoDataProvider — success paths", () => {
  it("resolves elevations in query order and builds the documented URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      ok([ele(41.5), ele(null), ele(43)]),
    );
    const { provider, sleeps } = harness(fetchSpy);

    const values = await provider.getElevations([P(52.52), P(52.53), P(52.54)]);

    expect(values).toEqual([41.5, undefined, 43]); // null = void → undefined
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://api.opentopodata.org/v1/srtm30m?locations=");
    expect(url).toContain("52.520000,13.400000");
    expect(url).toContain("|52.530000,13.400000");
    // Single batch → no throttle sleep.
    expect(sleeps).toEqual([]);
  });

  it("returns an empty array for an empty query without fetching", async () => {
    const fetchSpy = vi.fn();
    const { provider } = harness(fetchSpy);
    expect(await provider.getElevations([])).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats shape surprises as undefined (never throws, never 0)", async () => {
    const bad = {
      ok: true,
      status: 200,
      json: async () => ({ status: "OK", results: "nope" }),
    };
    const { provider } = harness(vi.fn().mockResolvedValue(bad));
    const values = await provider.getElevations([P(1), P(2)]);
    expect(values).toEqual([undefined, undefined]);

    const mismatch = {
      ok: true,
      status: 200,
      json: async () => ({ status: "OK", results: [ele(5)] }), // length ≠ 2
    };
    const again = harness(vi.fn().mockResolvedValue(mismatch));
    expect(await again.provider.getElevations([P(1), P(2)])).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe("OpenTopoDataProvider — batching + throttling (FR-6.2)", () => {
  it("splits queries into ≤100-point batches, in order", async () => {
    const responses: unknown[][] = [];
    const fetchSpy = vi.fn().mockImplementation(() => {
      const results = responses.shift() ?? [];
      return Promise.resolve(ok(results));
    });
    const { provider } = harness(fetchSpy);

    const coords = Array.from({ length: 250 }, (_, i) => P(50 + i * 0.001));
    // Preload per-batch answers of the right length.
    for (let b = 0; b < 3; b += 1) {
      responses.push(
        Array.from({ length: Math.min(100, 250 - b * 100) }, (_, i) =>
          ele(b * 100 + i),
        ),
      );
    }

    const values = await provider.getElevations(coords);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(values).toHaveLength(250);
    expect(values[0]).toBe(0);
    expect(values[99]).toBe(99);
    expect(values[100]).toBe(100);
    expect(values[249]).toBe(249);
    // Every batch URL carries at most 100 locations.
    for (const call of fetchSpy.mock.calls) {
      const locations = ((call[0] as string).match(/\|/g) ?? []).length + 1;
      expect(locations).toBeLessThanOrEqual(ELEVATION_BATCH_SIZE);
    }
  });

  it("throttles to one request per second across batches", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(ok([ele(1)]));
    const { provider, sleeps } = harness(fetchSpy);

    // Two single-point calls = two batches.
    await provider.getElevations([P(1)]);
    await provider.getElevations([P(2)]);

    // The first request leaves immediately; the second waits out the
    // 1 s window (shared throttle state across calls).
    expect(sleeps).toEqual([ELEVATION_MIN_REQUEST_INTERVAL_MS]);
  });

  it("waits between the batches of ONE call", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(ok(Array.from({ length: 100 }, () => ele(1))));
    const { provider, sleeps } = harness(fetchSpy);

    await provider.getElevations(Array.from({ length: 201 }, (_, i) => P(i)));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 1000]);
  });
});

describe("OpenTopoDataProvider — retry with backoff (FR-6.2)", () => {
  it("retries a 429 and succeeds after the backoff", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(ok([ele(12)]));
    const { provider, sleeps } = harness(fetchSpy);

    const values = await provider.getElevations([P(1)]);
    expect(values).toEqual([12]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]); // first backoff step
  });

  it("retries a 5xx with the full backoff schedule, then gives up", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const { provider, sleeps } = harness(fetchSpy);

    const values = await provider.getElevations([P(1), P(2)]);
    // 1 attempt + 3 retries (1 s, 2 s, 4 s) = 4 calls, then undefined.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(values).toEqual([undefined, undefined]);
  });

  it("fails a non-retryable 4xx immediately", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const { provider, sleeps } = harness(fetchSpy);

    expect(await provider.getElevations([P(1)])).toEqual([undefined]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("retries network errors (fetch rejects) with backoff", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(ok([ele(7)]));
    const { provider, sleeps } = harness(fetchSpy);

    expect(await provider.getElevations([P(1)])).toEqual([7]);
    expect(sleeps).toEqual([1000]);
  });

  it("reports progress per batch with answered and resolved counts", async () => {
    // 101 points = two batches (100 + 1).
    const batch1 = Array.from({ length: 100 }, (_, i) =>
      ele(i === 0 ? null : i),
    ); // 99 defined + 1 void
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(ok(batch1))
      .mockResolvedValueOnce(ok([ele(500)]));
    const { provider } = harness(fetchSpy);
    const progress = vi.fn();

    const coords = Array.from({ length: 101 }, (_, i) => P(i * 0.001));
    await provider.getElevations(coords, { onProgress: progress });

    expect(progress.mock.calls).toEqual([
      [100, 99], // batch 1: all answered, 99 defined
      [101, 100], // batch 2: cumulative
    ]);
  });
});

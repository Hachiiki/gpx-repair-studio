/**
 * OpenTopoData provider — the Phase 6 primary DEM source
 * (docs/MASTER_PLAN.md §K-1/§K-2, FR-6.2).
 *
 * `https://api.opentopodata.org/v1/srtm30m?locations=lat,lon|…` — free,
 * keyless, CORS-enabled; documented limits: ≤ 100 locations per request,
 * 1 request/second, 1000/day. Accuracy ±5–10 m on a 30 m grid — plenty
 * for running/cycling gain-loss statistics.
 *
 * Behavior (§K-2, all unit-tested against an injected fetch):
 *   - batching: ≤ `ELEVATION_BATCH_SIZE` points per request;
 *   - throttling: ≥ 1 s between requests, ACROSS calls (the instance
 *     tracks the next-allowed time on an injected clock);
 *   - retry: 429/5xx/network errors back off exponentially
 *     (1 s → 2 s → 4 s), then the batch fails honestly (undefined for
 *     its points — partial results are tolerated, §K-2);
 *   - per-request timeout via AbortController;
 *   - `null`/non-finite elevations in an otherwise-OK response become
 *     `undefined` (void cells), never 0.
 *
 * Purity contract (ESLint §F-3): `fetch`, `now`, and `sleep` are all
 * injected. The React binding passes the browser implementations; tests
 * pass doubles — no real timers, no real network, ever.
 *
 * Phase 6 — Elevation. Pure TypeScript plus injected I/O.
 */

import type {
  ElevationFetch,
  ElevationFetchOptions,
  ElevationProvider,
  ElevationQueryPoint,
} from "./provider";

/** The elevation API host (the privacy disclosure names it verbatim). */
export const OPEN_TOPO_DATA_HOST = "api.opentopodata.org";

const ENDPOINT = `https://${OPEN_TOPO_DATA_HOST}/v1/srtm30m`;

/** API limit: maximum locations per request (§K-1). */
export const ELEVATION_BATCH_SIZE = 100;

/** Public-API courtesy limit: ≥ 1 s between requests (§K-1). */
export const ELEVATION_MIN_REQUEST_INTERVAL_MS = 1000;

/** Per-request timeout; a timed-out batch fails (undefined), never hangs. */
export const ELEVATION_REQUEST_TIMEOUT_MS = 10_000;

/** Backoff schedule per batch: 1 s → 2 s → 4 s, then give up (§K-2). */
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000] as const;

/** Wire-format precision (~0.1 m — below the 30 m DEM grid). */
const r6 = (value: number): string => value.toFixed(6);

/** Sleep function shape (injected for tests). */
export type Sleep = (ms: number) => Promise<void>;

/** A minimal success body (defensively parsed, never trusted blind). */
interface ProviderResponse {
  results?: { elevation?: unknown }[];
}

export class OpenTopoDataProvider implements ElevationProvider {
  readonly id = "opentopodata" as const;
  readonly name = "OpenTopoData";
  readonly attribution =
    "Elevation: OpenTopoData (SRTM 30 m; NASA / USGS / CGIAR-CSI)";
  readonly privacyNote =
    "The coordinates of your reconstructed points are sent to api.opentopodata.org (OpenTopoData public API) in the request URL. Only reconstructed points are sent — never the full file, never the recorded route. The service logs requests like any web server.";

  readonly #fetchImpl: ElevationFetch;
  readonly #now: () => number;
  readonly #sleep: Sleep;
  /** Next time a request may leave (throttle state, shared per instance). */
  #nextAllowedAt = 0;

  constructor(options: {
    fetch: ElevationFetch;
    /** Monotonic clock in ms (defaults to Date.now). */
    now?: () => number;
    /** Awaitable sleep (defaults to a real timeout). */
    sleep?: Sleep;
  }) {
    this.#fetchImpl = options.fetch;
    this.#now = options.now ?? (() => Date.now());
    this.#sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async getElevations(
    coords: readonly ElevationQueryPoint[],
    options?: ElevationFetchOptions,
  ): Promise<readonly (number | undefined)[]> {
    const out: (number | undefined)[] = coords.map(() => undefined);
    if (coords.length === 0) return out;

    let answered = 0;
    let resolved = 0;

    for (let start = 0; start < coords.length; start += ELEVATION_BATCH_SIZE) {
      if (options?.signal?.aborted) break;
      const batch = coords.slice(start, start + ELEVATION_BATCH_SIZE);
      const values = await this.#fetchBatch(batch, options?.signal);
      for (let i = 0; i < batch.length; i += 1) {
        const value = values[i];
        out[start + i] = value;
        if (value !== undefined) resolved += 1;
        answered += 1;
      }
      options?.onProgress?.(answered, resolved);
    }
    return out;
  }

  /** One batch with retry/backoff; resolves undefined-per-point on failure. */
  async #fetchBatch(
    batch: readonly ElevationQueryPoint[],
    signal?: AbortSignal,
  ): Promise<(number | undefined)[]> {
    const locations = batch.map((p) => `${r6(p.lat)},${r6(p.lon)}`).join("|");
    const url = `${ENDPOINT}?locations=${locations}`;

    let attempt = 0;
    for (;;) {
      await this.#throttle();
      let response: Response;
      try {
        response = await this.#fetchWithTimeout(url, signal);
      } catch {
        if (signal?.aborted) return batch.map(() => undefined);
        const backoff = BACKOFF_SCHEDULE_MS[attempt];
        if (backoff === undefined) return batch.map(() => undefined);
        attempt += 1;
        await this.#sleep(backoff);
        continue;
      }
      if (response.ok) {
        return this.#parse(response, batch.length);
      }
      // 429 (rate limit) and 5xx (server) are retryable with backoff;
      // any other status (4xx — our request is wrong) fails the batch
      // immediately: retrying the same malformed request cannot help.
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) return batch.map(() => undefined);
      const backoff = BACKOFF_SCHEDULE_MS[attempt];
      if (backoff === undefined) return batch.map(() => undefined);
      attempt += 1;
      await this.#sleep(backoff);
    }
  }

  /** Honor the 1 req/s limit across calls; no wait before the first. */
  async #throttle(): Promise<void> {
    const wait = this.#nextAllowedAt - this.#now();
    if (wait > 0) await this.#sleep(wait);
    this.#nextAllowedAt = this.#now() + ELEVATION_MIN_REQUEST_INTERVAL_MS;
  }

  async #fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
    // Merge the cooperative signal and the timeout into one controller.
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), ELEVATION_REQUEST_TIMEOUT_MS);
    try {
      return await this.#fetchImpl(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  /** Parse an OK response; holes and shape surprises become undefined. */
  async #parse(
    response: Response,
    expected: number,
  ): Promise<(number | undefined)[]> {
    let body: ProviderResponse | null = null;
    try {
      body = (await response.json()) as ProviderResponse | null;
    } catch {
      return new Array<number | undefined>(expected).fill(undefined);
    }
    const results = body?.results;
    if (!Array.isArray(results) || results.length !== expected) {
      return new Array<number | undefined>(expected).fill(undefined);
    }
    return results.map((entry) => {
      const elevation = entry?.elevation;
      return typeof elevation === "number" && Number.isFinite(elevation)
        ? elevation
        : undefined;
    });
  }
}

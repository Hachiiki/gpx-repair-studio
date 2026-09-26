/**
 * Open-Meteo Elevation provider — the Phase 6 primary DEM source
 * (docs/MASTER_PLAN.md §K-1/§K-2, FR-6.2).
 *
 * `https://api.open-meteo.com/v1/elevation?latitude=a,b,c&longitude=x,y,z`
 * → `{"elevation":[h1,h2,…]}` — free, keyless, and genuinely
 * CORS-open (`access-control-allow-origin: *`, verified). Data:
 * Copernicus DEM GLO-90 — a 90 m global grid; coarser than SRTM 30 m
 * but amply accurate for gain/loss statistics (the hysteresis and
 * smoothing layers absorb the noise). Documented free-tier limits:
 * ≤ 100 coordinates per request, 600 requests/minute, 10,000/day
 * per IP — each user burns their own budget, not a shared one.
 *
 * Provider history: Phase 6 originally shipped OpenTopoData, whose
 * public API turned out to send NO `Access-Control-Allow-Origin`
 * header on any response (200s included — verified 2026-09-26), so
 * every browser fetch was CORS-blocked and the feature could never
 * work client-side. Open-Meteo replaces it; the provider interface
 * is unchanged.
 *
 * Behavior (§K-2, all unit-tested against an injected fetch):
 *   - batching: ≤ `ELEVATION_BATCH_SIZE` points per request;
 *   - throttling: ≥ `ELEVATION_MIN_REQUEST_INTERVAL_MS` between
 *     requests, ACROSS calls (the instance tracks the next-allowed
 *     time on an injected clock);
 *   - retry: 429/5xx/network errors back off exponentially
 *     (1 s → 2 s → 4 s), then the batch fails honestly (undefined
 *     for its points — partial results are tolerated, §K-2) and
 *     reports WHY via `onBatchFailure` so the UI never guesses;
 *   - per-request timeout via AbortController;
 *   - `null`/non-finite elevations in an otherwise-OK response
 *     become `undefined` (void cells), never 0.
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
  ElevationFailureReason,
  ElevationProvider,
  ElevationQueryPoint,
} from "./provider";

/** The elevation API host (the privacy disclosure names it verbatim). */
export const OPEN_METEO_HOST = "api.open-meteo.com";

const ENDPOINT = `https://${OPEN_METEO_HOST}/v1/elevation`;

/** API limit: maximum coordinates per request (§K-1). */
export const ELEVATION_BATCH_SIZE = 100;

/**
 * Public-API courtesy interval (§K-1). Open-Meteo allows 600 req/min
 * (10/s); 250 ms (4/s sustained) keeps a multi-batch gap well inside
 * that while staying faster than the old one-per-second provider.
 */
export const ELEVATION_MIN_REQUEST_INTERVAL_MS = 250;

/** Per-request timeout; a timed-out batch fails (undefined), never hangs. */
export const ELEVATION_REQUEST_TIMEOUT_MS = 10_000;

/** Backoff schedule per batch: 1 s → 2 s → 4 s, then give up (§K-2). */
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000] as const;

/** Wire-format precision (~0.1 m — below the 90 m DEM grid). */
const r6 = (value: number): string => value.toFixed(6);

/** Sleep function shape (injected for tests). */
export type Sleep = (ms: number) => Promise<void>;

/** A minimal success body (defensively parsed, never trusted blind). */
interface ProviderResponse {
  elevation?: unknown;
}

export class OpenMeteoProvider implements ElevationProvider {
  readonly id = "open-meteo" as const;
  readonly name = "Open-Meteo";
  readonly attribution =
    "Elevation: Open-Meteo (Copernicus DEM GLO-90). Credit: © Open-Meteo.com — contains modified Copernicus data.";
  readonly privacyNote =
    "The coordinates of your reconstructed points are sent to api.open-meteo.com (Open-Meteo Elevation API) in the request URL. Only reconstructed points are sent — never the full file, never the recorded route. The service logs requests like any web server.";

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
      const values = await this.#fetchBatch(
        batch,
        options?.signal,
        options?.onBatchFailure,
      );
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
    signal: AbortSignal | undefined,
    onBatchFailure: ((reason: ElevationFailureReason) => void) | undefined,
  ): Promise<(number | undefined)[]> {
    const url =
      `${ENDPOINT}?latitude=${batch.map((p) => r6(p.lat)).join(",")}` +
      `&longitude=${batch.map((p) => r6(p.lon)).join(",")}`;

    let attempt = 0;
    for (;;) {
      await this.#throttle();
      let response: Response;
      try {
        response = await this.#fetchWithTimeout(url, signal);
      } catch {
        // Cancellation is not a failure — no report, just stop.
        if (signal?.aborted) return batch.map(() => undefined);
        const backoff = BACKOFF_SCHEDULE_MS[attempt];
        if (backoff === undefined) {
          onBatchFailure?.("network");
          return batch.map(() => undefined);
        }
        attempt += 1;
        await this.#sleep(backoff);
        continue;
      }
      if (response.ok) {
        const parsed = await this.#parse(response, batch.length);
        if (parsed === null) {
          onBatchFailure?.("bad-response");
          return batch.map(() => undefined);
        }
        return parsed;
      }
      // 429 (rate limit) and 5xx (server) are retryable with backoff;
      // any other status (4xx — our request is wrong) fails the batch
      // immediately: retrying the same malformed request cannot help.
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) {
        onBatchFailure?.("bad-response");
        return batch.map(() => undefined);
      }
      const backoff = BACKOFF_SCHEDULE_MS[attempt];
      if (backoff === undefined) {
        onBatchFailure?.(response.status === 429 ? "throttled" : "server");
        return batch.map(() => undefined);
      }
      attempt += 1;
      await this.#sleep(backoff);
    }
  }

  /** Honor the request interval across calls; no wait before the first. */
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

  /**
   * Parse an OK response. `null` marks a shape surprise (unparseable
   * body or a wrong-length array) — distinct from a well-formed
   * all-`null` answer, which is legitimate void terrain.
   */
  async #parse(
    response: Response,
    expected: number,
  ): Promise<(number | undefined)[] | null> {
    let body: ProviderResponse | null = null;
    try {
      body = (await response.json()) as ProviderResponse | null;
    } catch {
      return null;
    }
    const elevations = body?.elevation;
    if (!Array.isArray(elevations) || elevations.length !== expected) {
      return null;
    }
    return elevations.map((entry) =>
      typeof entry === "number" && Number.isFinite(entry) ? entry : undefined,
    );
  }
}

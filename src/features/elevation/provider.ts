/**
 * Elevation provider interface + registry (docs/MASTER_PLAN.md §K-2,
 * FR-6.1, Phase 6).
 *
 * A provider resolves elevations for a batch of coordinates. The
 * abstraction is deliberately tiny — name/attribution/privacy copy for
 * the disclosure, plus one method. Everything batchy/throttly/retry-y
 * lives in the concrete implementation (`openmeteo.ts` — OpenTopoData
 * was swapped out 2026-09-26: its public API sends no CORS headers, so
 * browser fetches can never read its responses), and caching is a
 * decorator (`cache.ts`), so the interface stays implementable by the
 * reserved Terrarium tile decoder (§K-2 secondary) without change.
 *
 * Purity contract (ESLint §F-3): providers take an INJECTED fetch and
 * injected timers — no global fetch, no globals. The React binding
 * supplies the browser implementations; tests supply doubles.
 *
 * Phase 6 — Elevation. Pure TypeScript except the injected I/O.
 */

/** Coordinates a provider accepts — reconstructed points only (§M-2). */
export interface ElevationQueryPoint {
  lat: number;
  lon: number;
}

/** Injected fetch shape (the browser implementation, or a test double). */
export type ElevationFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Optional per-call progress/behavior knobs. */
export interface ElevationFetchOptions {
  /**
   * Called after each internal batch resolves. `answered` counts points
   * with a final answer (defined or failed); `resolved` counts defined
   * values. UI progress only — never affects the result.
   */
  onProgress?: (answered: number, resolved: number) => void;
  /** Cooperative cancellation between batches (abort = stop, keep partials). */
  signal?: AbortSignal;
  /**
   * Called when a wire batch terminally fails (retries exhausted or the
   * response was unusable). Purely informational — the failed points
   * stay `undefined` either way — so callers can show an honest reason
   * instead of guessing "no data".
   */
  onBatchFailure?: (reason: ElevationFailureReason) => void;
}

/**
 * Why a wire batch terminally failed (§K-2 honesty: the UI's failure
 * copy names the actual cause instead of a generic "no data").
 *
 *   - `network` — fetch rejected: offline, blocked, or a CORS-masked
 *     throttle; the service was never successfully read.
 *   - `throttled` — HTTP 429 after the full backoff schedule.
 *   - `server` — HTTP 5xx after the full backoff schedule.
 *   - `bad-response` — non-retryable 4xx or an unparseable body.
 *
 * A well-formed all-null answer is NOT a failure (void terrain) —
 * no callback fires for that.
 */
export type ElevationFailureReason =
  | "network"
  | "throttled"
  | "server"
  | "bad-response";

/** A DEM elevation source. */
export interface ElevationProvider {
  /** Registry id (settings/attachment key). */
  id: string;
  /** Human-readable name for status lines. */
  name: string;
  /** Attribution shown in UI and embedded in export metadata. */
  attribution: string;
  /** One-paragraph privacy note for the disclosure dialog. */
  privacyNote: string;
  /**
   * Resolve elevations for the coordinates, in order. `undefined` marks
   * a point the provider could not resolve (void, ocean, or failure) —
   * partial results are expected and tolerated (§K-2).
   */
  getElevations(
    coords: readonly ElevationQueryPoint[],
    options?: ElevationFetchOptions,
  ): Promise<readonly (number | undefined)[]>;
}

/** Provider ids known to the registry (Terrarium reserved, §K-2). */
export type ElevationProviderId = "open-meteo";

/** The provider Phase 6 ships with (single implementation for now). */
export const DEFAULT_ELEVATION_PROVIDER_ID: ElevationProviderId =
  "open-meteo";

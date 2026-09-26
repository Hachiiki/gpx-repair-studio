/**
 * Elevation provider interface + registry (docs/MASTER_PLAN.md §K-2,
 * FR-6.1, Phase 6).
 *
 * A provider resolves elevations for a batch of coordinates. The
 * abstraction is deliberately tiny — name/attribution/privacy copy for
 * the disclosure, plus one method. Everything batchy/throttly/retry-y
 * lives in the concrete implementation (`opentopodata.ts`), and caching
 * is a decorator (`cache.ts`), so the interface stays implementable by
 * the reserved Terrarium tile decoder (§K-2 secondary) without change.
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
}

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
export type ElevationProviderId = "opentopodata";

/** The provider Phase 6 ships with (single implementation for now). */
export const DEFAULT_ELEVATION_PROVIDER_ID: ElevationProviderId =
  "opentopodata";

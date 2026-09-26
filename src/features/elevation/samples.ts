/**
 * Elevation samples — the per-gap fetch result and its consumers
 * (docs/MASTER_PLAN.md §K-2, Phase 6).
 *
 * A fetch resolves elevations for a SAMPLED subset of one repair's
 * interior path points (per-gap cap, §K-2 "data minimization"). The
 * result is stored as ordered samples keyed by **cumulative distance
 * along the chain** — the one metric that survives resample-spacing
 * changes (the chain nodes and road legs are unchanged; only the fill
 * density between them moves). Consumers interpolate samples onto
 * whatever path the merge/chart builds at read time.
 *
 * Staleness (§D-3 "stale elevation is flagged after geometry edits"):
 * every vertex edit bumps `geometryRevision`, and road-leg resolutions
 * change the chain curve without a revision bump — so the fetch records
 * BOTH the revision and a signature of the resolved road legs. A result
 * is fresh only when both match the current state.
 *
 * Phase 6 — Elevation. Pure TypeScript: no React, no DOM, no fetch.
 */

import type { RoadLeg } from "@/types/domain";
import { hysteresisGainLoss } from "./smoothing";

/** One resolved elevation sample, anchored on the chain's distance metric. */
export interface ElevationSample {
  /** Meters from the chain's near anchor, along the fetch-time path. */
  cumDistanceM: number;
  /** Meters above sea level, as reported by the provider. */
  ele: number;
}

/** Per-gap fetch metadata the merge/export consumes. */
export interface GapElevationResult {
  /** Provider display name (attribution copy). */
  providerName: string;
  /** The `geometryRevision` the chain had when the fetch started. */
  fetchedAtRevision: number;
  /** Signature of the resolved road legs at fetch time (see below). */
  fetchedAtRoadSignature: string;
  /** Ordered samples (ascending `cumDistanceM`). */
  samples: readonly ElevationSample[];
}

/** Per-gap cap on points sent per fetch (§K-2 data minimization). */
export const ELEVATION_POINT_CAP = 400;

/**
 * The interior path points to send for one fetch: every point when under
 * the cap; otherwise every k-th point, ALWAYS keeping the first and last
 * (interpolation must bracket the whole interior). Pure — the caller
 * owns disclosure copy built from `(sent, total)`.
 */
export function pickFetchPoints<T>(interior: readonly T[]): readonly T[] {
  if (interior.length <= ELEVATION_POINT_CAP) return interior;
  const stride = Math.ceil(interior.length / ELEVATION_POINT_CAP);
  const picked: T[] = [];
  for (let i = 0; i < interior.length; i += stride) {
    picked.push(interior[i]);
  }
  // The stride may skip past the final interior point — interpolation
  // needs the chain's end bracketed. Replace (not append) so the cap
  // still holds: the last picked point and the true last are within one
  // stride of each other.
  if (
    picked.length > 0 &&
    picked[picked.length - 1] !== interior[interior.length - 1]
  ) {
    picked[picked.length - 1] = interior[interior.length - 1];
  }
  return picked;
}

/**
 * Interpolate one path point's elevation from the samples.
 *
 * Exact sample hits return the sampled value (`method: "elevation-api"`);
 * points between two samples are linearly interpolated
 * (`method: "interpolated"` — honest about what the number is). Outside
 * the sampled span → `undefined` (the caller renders/exports no `<ele>`);
 * with first/last sampling this is unreachable for interior points, but
 * the function stays total for partial results whose ends failed.
 */
export function interpolateSample(
  samples: readonly ElevationSample[],
  cumDistanceM: number,
):
  | { value: number; method: "elevation-api" | "interpolated" }
  | undefined {
  if (samples.length === 0) return undefined;
  if (cumDistanceM <= samples[0].cumDistanceM) {
    return { value: samples[0].ele, method: "elevation-api" };
  }
  const last = samples[samples.length - 1];
  if (cumDistanceM >= last.cumDistanceM) {
    return { value: last.ele, method: "elevation-api" };
  }
  // Binary search for the bracketing pair (samples are ascending).
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].cumDistanceM <= cumDistanceM) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.cumDistanceM - a.cumDistanceM;
  if (span <= 0) return { value: a.ele, method: "elevation-api" };
  const t = (cumDistanceM - a.cumDistanceM) / span;
  // Exact sample hits are direct provider values, not interpolations.
  if (t === 0) return { value: a.ele, method: "elevation-api" };
  if (t === 1) return { value: b.ele, method: "elevation-api" };
  return { value: a.ele + (b.ele - a.ele) * t, method: "interpolated" };
}

/** Round to the precision grid used by signatures (5 dp ≈ 1.1 m). */
const r5 = (value: number): string => value.toFixed(5);

/**
 * Signature of a gap's resolved road legs: leg endpoints plus geometry
 * length. Two chains with the same signature have identical road curves,
 * so elevation samples keep their meaning; any change (a leg resolving,
 * clearing, or re-routing after a drag) produces a different signature
 * and the fetch goes stale. Vertex moves are covered separately by
 * `geometryRevision`.
 */
export function roadLegsSignature(legs: readonly RoadLeg[]): string {
  if (legs.length === 0) return "none";
  return legs
    .map(
      (leg) =>
        `${r5(leg.a.lat)},${r5(leg.a.lon)}>${r5(leg.b.lat)},${r5(leg.b.lon)}#${leg.coordinates.length}`,
    )
    .join("|");
}

/**
 * Min/max/gain/loss of one gap's samples (the editor panel's summary
 * line). Gain/loss uses the same hysteresis routine as the file-level
 * statistics so the per-gap numbers add up to the table's repaired rows.
 */
export function gapElevationSummary(
  samples: readonly ElevationSample[],
  hysteresisThresholdM: number,
): { minEleM: number; maxEleM: number; gainM: number; lossM: number } | null {
  if (samples.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  const eles: number[] = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample.ele)) continue;
    min = Math.min(min, sample.ele);
    max = Math.max(max, sample.ele);
    eles.push(sample.ele);
  }
  if (eles.length === 0) return null;
  const { gainM, lossM } = hysteresisGainLoss(eles, hysteresisThresholdM);
  return { minEleM: min, maxEleM: max, gainM, lossM };
}

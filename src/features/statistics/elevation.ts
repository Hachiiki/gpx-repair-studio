/**
 * Elevation statistics + profile — the §L-1 elevation rows and the
 * FR-6.4 profile series, derived from the merge (Phase 6).
 *
 * Everything here is a pure function of the `MergeResult` the export
 * pipeline already builds (one merge serves export, statistics, and the
 * chart — the populations can never disagree). Walks:
 *
 *   - **gain/loss** — hysteresis (§K-2) over original `ele` (as
 *     recorded) and reconstructed `ele` (estimated) SEPARATELY, plus a
 *     mixed sum, all in route order;
 *   - **coverage** — share of merged points carrying usable elevation;
 *     below 60% the totals are withheld ("insufficient elevation data")
 *     per §L-1 — the app would rather show "—" than a misleading number;
 *   - **profile** — the merged route as (distance, elevation) samples,
 *     recorded and reconstructed interleaved in route order, decimated
 *     to a bounded point count (§E-5) and smoothed per same-source run
 *     for display only (§K-2).
 *
 * Phase 6 — Elevation. Pure TypeScript: no React, no DOM, no fetch.
 */

import { hysteresisGainLoss, movingAverage } from "@/features/elevation/smoothing";
import {
  DEFAULT_HYSTERESIS_THRESHOLD_M,
  DEFAULT_PROFILE_SMOOTHING_WINDOW,
} from "@/features/elevation/smoothing";
import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { OriginalTrackPoint, ReconstructedPoint } from "@/types/domain";

/** §L-1: below this coverage the totals are withheld. */
export const ELEVATION_COVERAGE_MIN = 0.6;

/** §E-5: bounded profile point count fed to the chart. */
export const ELEVATION_PROFILE_MAX_POINTS = 600;

// ---------------------------------------------------------------------------
// Statistics rows
// ---------------------------------------------------------------------------

export interface ElevationGainLoss {
  gainM: number;
  lossM: number;
}

/** What the stats panel renders (§L-1 elevation rows + honesty notes). */
export interface ElevationStatsRows {
  /** Hysteresis gain/loss over recorded `<ele>`, route order. */
  original: ElevationGainLoss | null;
  /** Hysteresis gain/loss over estimated elevation, route order. */
  reconstructed: ElevationGainLoss | null;
  /** Sum of both (labeled mixed). */
  mixed: ElevationGainLoss | null;
  /** Merged points carrying usable elevation / merged points. */
  coverage: number;
  /** §L-1 rule: coverage < 60% → rows render "—" with the reason. */
  insufficient: boolean;
  pointsWithEle: number;
  pointsTotal: number;
  /** Committed repairs whose points carry no elevation at all. */
  repairsWithoutElevation: number;
  /** Hysteresis threshold used (the tooltips disclose it). */
  hysteresisThresholdM: number;
  /** Provider names behind the estimated elevation (the note names them). */
  estimatedFrom: readonly string[];
}

export interface ElevationStatsOptions {
  hysteresisThresholdM?: number;
}

/** Elevations of the merged route, split by provenance, in route order. */
function collectElevations(merge: MergeResult): {
  original: (number | undefined)[];
  reconstructed: (number | undefined)[];
  pointsWithEle: number;
  pointsTotal: number;
  repairsWithoutElevation: number;
} {
  const original: (number | undefined)[] = [];
  const reconstructed: (number | undefined)[] = [];
  let pointsWithEle = 0;
  let pointsTotal = 0;
  let repairsWithoutElevation = 0;

  for (const track of merge.tracks) {
    // Run-level bookkeeping: a reconstructed run with zero defined ele
    // counts as a repair without elevation (the honesty note).
    let runHasEle = false;
    let inReconstructedRun = false;
    const closeRun = () => {
      if (inReconstructedRun && !runHasEle) repairsWithoutElevation += 1;
      inReconstructedRun = false;
      runHasEle = false;
    };

    for (const view of track.points) {
      const point = view.point;
      const usable =
        point.source === "reconstructed" ||
        isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;
      pointsTotal += 1;

      let ele: number | undefined;
      if (point.source === "reconstructed") {
        ele = finiteOrUndefined((point as ReconstructedPoint).ele?.value);
        reconstructed.push(ele);
        if (!inReconstructedRun) {
          closeRun();
          inReconstructedRun = true;
        }
      } else {
        ele = finiteOrUndefined((point as OriginalTrackPoint).ele);
        original.push(ele);
        closeRun();
      }
      if (ele !== undefined) {
        pointsWithEle += 1;
        runHasEle = true;
      }
    }
    closeRun();
  }

  return {
    original,
    reconstructed,
    pointsWithEle,
    pointsTotal,
    repairsWithoutElevation,
  };
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/**
 * The §L-1 elevation rows from a merge. `null` merge (no file) yields
 * the empty view (all rows "—", zero coverage).
 */
export function buildElevationStats(
  merge: MergeResult | null,
  options: ElevationStatsOptions = {},
): ElevationStatsRows {
  const hysteresisThresholdM =
    options.hysteresisThresholdM ?? DEFAULT_HYSTERESIS_THRESHOLD_M;

  if (!merge) {
    return {
      original: null,
      reconstructed: null,
      mixed: null,
      coverage: 0,
      insufficient: true,
      pointsWithEle: 0,
      pointsTotal: 0,
      repairsWithoutElevation: 0,
      hysteresisThresholdM,
      estimatedFrom: [],
    };
  }

  const {
    original,
    reconstructed,
    pointsWithEle,
    pointsTotal,
    repairsWithoutElevation,
  } = collectElevations(merge);

  const coverage = pointsTotal > 0 ? pointsWithEle / pointsTotal : 0;
  const originalHas = original.some((ele) => ele !== undefined);
  const reconstructedHas = reconstructed.some((ele) => ele !== undefined);

  const originalRows = originalHas
    ? hysteresisGainLoss(original, hysteresisThresholdM)
    : null;
  const reconstructedRows = reconstructedHas
    ? hysteresisGainLoss(reconstructed, hysteresisThresholdM)
    : null;
  const mixed =
    originalRows !== null || reconstructedRows !== null
      ? {
          gainM: (originalRows?.gainM ?? 0) + (reconstructedRows?.gainM ?? 0),
          lossM: (originalRows?.lossM ?? 0) + (reconstructedRows?.lossM ?? 0),
        }
      : null;

  return {
    original: originalRows,
    reconstructed: reconstructedRows,
    mixed,
    coverage,
    insufficient: pointsTotal === 0 || coverage < ELEVATION_COVERAGE_MIN,
    pointsWithEle,
    pointsTotal,
    repairsWithoutElevation,
    hysteresisThresholdM,
    estimatedFrom: merge.elevationProviders,
  };
}

// ---------------------------------------------------------------------------
// Profile series
// ---------------------------------------------------------------------------

/** One profile sample; `ele === undefined` is a hole (no elevation). */
export interface ElevationProfilePoint {
  /** Route distance from the file's first merged point, meters. */
  xM: number;
  ele?: number;
  kind: "recorded" | "reconstructed";
}

/** The chart's input series (bounded, smoothed for display). */
export interface ElevationProfile {
  points: readonly ElevationProfilePoint[];
  minEleM: number;
  maxEleM: number;
  totalDistanceM: number;
  /** Whether at least one point carries elevation. */
  hasAnyEle: boolean;
  recordedCount: number;
  reconstructedCount: number;
}

export interface ElevationProfileOptions {
  smoothingWindow?: number;
  maxPoints?: number;
}

/**
 * The merged-route elevation profile. Same usable-points walk the merge
 * uses for the Case-3 spread, so distances line up with every other
 * statistic. Decimation and smoothing are DISPLAY-ONLY (§K-2/§E-5):
 * per same-source run, first/last always kept.
 */
export function buildElevationProfile(
  merge: MergeResult | null,
  options: ElevationProfileOptions = {},
): ElevationProfile | null {
  if (!merge) return null;
  const smoothingWindow =
    options.smoothingWindow ?? DEFAULT_PROFILE_SMOOTHING_WINDOW;
  const maxPoints = options.maxPoints ?? ELEVATION_PROFILE_MAX_POINTS;

  // --- route walk: (x, ele, kind) over usable points ----------------------
  let cumulative = 0;
  let previous: { lat: number; lon: number } | null = null;
  const raw: ElevationProfilePoint[] = [];
  for (const track of merge.tracks) {
    for (const view of track.points) {
      const point = view.point;
      const usable =
        point.source === "reconstructed" ||
        isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;
      if (previous !== null) {
        const legM = geodesicDistanceMeters(previous, point);
        if (Number.isFinite(legM)) cumulative += legM;
      }
      previous = point;
      const ele =
        point.source === "reconstructed"
          ? finiteOrUndefined((point as ReconstructedPoint).ele?.value)
          : finiteOrUndefined((point as OriginalTrackPoint).ele);
      raw.push({
        xM: cumulative,
        ...(ele !== undefined ? { ele } : {}),
        kind: point.source === "reconstructed" ? "reconstructed" : "recorded",
      });
    }
  }
  if (raw.length === 0) return null;

  // --- decimate to maxPoints, per same-source run -------------------------
  const stride = Math.ceil(raw.length / maxPoints);
  const decimated: ElevationProfilePoint[] =
    stride <= 1
      ? raw
      : (() => {
          const out: ElevationProfilePoint[] = [];
          let runStart = 0;
          const flushRun = (endExclusive: number) => {
            for (let i = runStart; i < endExclusive; i += stride) {
              out.push(raw[i]);
            }
            const last = raw[endExclusive - 1];
            if (out[out.length - 1] !== last) out.push(last);
          };
          for (let i = 1; i <= raw.length; i += 1) {
            if (i === raw.length || raw[i].kind !== raw[runStart].kind) {
              flushRun(i);
              runStart = i;
            }
          }
          return out;
        })();

  // --- display smoothing per same-source run (holes preserved) ------------
  const smoothed: ElevationProfilePoint[] = [];
  let runStart = 0;
  const smoothRun = (endExclusive: number) => {
    const run = decimated.slice(runStart, endExclusive);
    const smoothedValues = movingAverage(
      run.map((p) => p.ele),
      smoothingWindow,
    );
    run.forEach((point, i) => {
      const ele = smoothedValues[i];
      smoothed.push({
        xM: point.xM,
        ...(ele !== undefined ? { ele } : {}),
        kind: point.kind,
      });
    });
  };
  for (let i = 1; i <= decimated.length; i += 1) {
    if (i === decimated.length || decimated[i].kind !== decimated[runStart].kind) {
      smoothRun(i);
      runStart = i;
    }
  }

  let min = Infinity;
  let max = -Infinity;
  let hasAnyEle = false;
  let recordedCount = 0;
  let reconstructedCount = 0;
  for (const point of smoothed) {
    if (point.kind === "recorded") recordedCount += 1;
    else reconstructedCount += 1;
    if (point.ele !== undefined) {
      hasAnyEle = true;
      min = Math.min(min, point.ele);
      max = Math.max(max, point.ele);
    }
  }

  return {
    points: smoothed,
    minEleM: hasAnyEle ? min : 0,
    maxEleM: hasAnyEle ? max : 0,
    totalDistanceM: smoothed[smoothed.length - 1]?.xM ?? 0,
    hasAnyEle,
    recordedCount,
    reconstructedCount,
  };
}

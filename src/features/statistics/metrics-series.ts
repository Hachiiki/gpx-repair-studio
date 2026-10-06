/**
 * The metrics profile — Phase 23.3 (docs/plans/v3/phase-23-fitness-
 * zones-metrics.md): hr/cadence/power over distance, the series the
 * metrics charts draw over a faint elevation backdrop (Strava's own
 * documented chart pattern for all three metrics).
 *
 * Same walk, decimation, and display-smoothing recipe as the elevation
 * profile (§K-2/§E-5): usable points only, cumulative distance
 * continuous across track boundaries, per-same-source-run decimation
 * to a bounded count, and a light centered moving average that is
 * DISPLAY-ONLY — the smoothing window ships with the result so every
 * surface that renders it can disclose it. Holes are preserved: a
 * point without the metric breaks the line rather than dropping to
 * zero, and metrics NEVER exist on reconstructed points (§EE 14 — the
 * passthrough is recorded-only), so reconstructed stretches are
 * metric holes while their estimated elevation still draws the
 * backdrop.
 *
 * Phase 23 — Fitness zones & metrics. Pure TypeScript: no React, no DOM.
 */

import { movingAverage } from "@/features/elevation/smoothing";
import { DEFAULT_PROFILE_SMOOTHING_WINDOW } from "@/features/elevation/smoothing";
import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  OriginalTrackPoint,
  ReconstructedPoint,
  TrackPointMetrics,
} from "@/types/domain";

/** §E-5: bounded profile point count fed to the chart (elevation's). */
export const METRICS_PROFILE_MAX_POINTS = 600;

/** One display sample; absent values are holes (never zero). */
export interface MetricsProfilePoint {
  /** Route distance from the file's first merged point, meters. */
  xM: number;
  /** Elevation of the backdrop series (recorded or estimated). */
  ele?: number;
  hr?: number;
  cad?: number;
  watts?: number;
  kind: "recorded" | "reconstructed";
}

/** The metrics charts' input series (bounded, smoothed for display). */
export interface MetricsProfile {
  points: readonly MetricsProfilePoint[];
  totalDistanceM: number;
  /** Display-series extents (post-smoothing, like the elevation chart). */
  minEleM: number;
  maxEleM: number;
  hasAnyEle: boolean;
  hasHr: boolean;
  hasCad: boolean;
  hasPower: boolean;
  minHr: number;
  maxHr: number;
  minCad: number;
  maxCad: number;
  minWatts: number;
  maxWatts: number;
  /** The window every surface must disclose (§K-2). */
  smoothingWindow: number;
}

export interface MetricsProfileOptions {
  smoothingWindow?: number;
  maxPoints?: number;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/**
 * The merged-route metrics profile. `null` without a merge or usable
 * geometry; a profile with every metric flag false when the file
 * carries none (the caller renders its honest "—").
 */
export function buildMetricsProfile(
  merge: MergeResult | null,
  options: MetricsProfileOptions = {},
): MetricsProfile | null {
  if (!merge) return null;
  const smoothingWindow =
    options.smoothingWindow ?? DEFAULT_PROFILE_SMOOTHING_WINDOW;
  const maxPoints = options.maxPoints ?? METRICS_PROFILE_MAX_POINTS;

  // --- route walk: (x, ele, metrics, kind) over usable points -----------
  let cumulative = 0;
  let previous: { lat: number; lon: number } | null = null;
  const raw: MetricsProfilePoint[] = [];
  for (const track of merge.tracks) {
    for (const view of track.points) {
      const point = view.point;
      const isReconstructed = point.source === "reconstructed";
      const usable =
        isReconstructed || isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;
      if (previous !== null) {
        const legM = geodesicDistanceMeters(previous, point);
        if (Number.isFinite(legM)) cumulative += legM;
      }
      previous = point;
      const ele = isReconstructed
        ? finiteOrUndefined((point as ReconstructedPoint).ele?.value)
        : finiteOrUndefined((point as OriginalTrackPoint).ele);
      const metrics: TrackPointMetrics | undefined = isReconstructed
        ? undefined
        : (point as OriginalTrackPoint).metrics;
      raw.push({
        xM: cumulative,
        ...(ele !== undefined ? { ele } : {}),
        ...(metrics?.hr !== undefined ? { hr: metrics.hr } : {}),
        ...(metrics?.cad !== undefined ? { cad: metrics.cad } : {}),
        ...(metrics?.watts !== undefined ? { watts: metrics.watts } : {}),
        kind: isReconstructed ? "reconstructed" : "recorded",
      });
    }
  }
  if (raw.length === 0) return null;

  // --- decimate to maxPoints, per same-source run ------------------------
  const stride = Math.ceil(raw.length / maxPoints);
  const decimated: MetricsProfilePoint[] =
    stride <= 1
      ? raw
      : (() => {
          const out: MetricsProfilePoint[] = [];
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

  // --- display smoothing per same-source run (holes preserved) ----------
  const smoothed: MetricsProfilePoint[] = [];
  let runStart = 0;
  const smoothRun = (endExclusive: number) => {
    // Fresh copies — the display series never mutates the decimated
    // points (holes stay absent keys, exactly where they were).
    const run = decimated
      .slice(runStart, endExclusive)
      .map((point) => ({ ...point }));
    const keys = ["ele", "hr", "cad", "watts"] as const;
    for (const key of keys) {
      const values = movingAverage(
        run.map((p) => p[key]),
        smoothingWindow,
      );
      run.forEach((point, i) => {
        const value = values[i];
        if (value !== undefined) point[key] = value;
      });
    }
    smoothed.push(...run);
  };
  for (let i = 1; i <= decimated.length; i += 1) {
    if (
      i === decimated.length ||
      decimated[i].kind !== decimated[runStart].kind
    ) {
      smoothRun(i);
      runStart = i;
    }
  }

  // --- extents over the display series ------------------------------------
  let minEle = Infinity;
  let maxEle = -Infinity;
  let hasAnyEle = false;
  let hasHr = false;
  let hasCad = false;
  let hasPower = false;
  let minHr = Infinity;
  let maxHr = -Infinity;
  let minCad = Infinity;
  let maxCad = -Infinity;
  let minWatts = Infinity;
  let maxWatts = -Infinity;
  for (const point of smoothed) {
    if (point.ele !== undefined) {
      hasAnyEle = true;
      minEle = Math.min(minEle, point.ele);
      maxEle = Math.max(maxEle, point.ele);
    }
    if (point.hr !== undefined) {
      hasHr = true;
      minHr = Math.min(minHr, point.hr);
      maxHr = Math.max(maxHr, point.hr);
    }
    if (point.cad !== undefined) {
      hasCad = true;
      minCad = Math.min(minCad, point.cad);
      maxCad = Math.max(maxCad, point.cad);
    }
    if (point.watts !== undefined) {
      hasPower = true;
      minWatts = Math.min(minWatts, point.watts);
      maxWatts = Math.max(maxWatts, point.watts);
    }
  }

  return {
    points: smoothed,
    totalDistanceM: smoothed[smoothed.length - 1]?.xM ?? 0,
    minEleM: hasAnyEle ? minEle : 0,
    maxEleM: hasAnyEle ? maxEle : 0,
    hasAnyEle,
    hasHr,
    hasCad,
    hasPower,
    minHr: hasHr ? minHr : 0,
    maxHr: hasHr ? maxHr : 0,
    minCad: hasCad ? minCad : 0,
    maxCad: hasCad ? maxCad : 0,
    minWatts: hasPower ? minWatts : 0,
    maxWatts: hasPower ? maxWatts : 0,
    smoothingWindow,
  };
}

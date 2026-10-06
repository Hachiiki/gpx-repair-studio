/**
 * Grade-adjusted pace — Phase 23.6 (docs/plans/v3/phase-23-fitness-zones-
 * metrics.md): GAP as a first-class running metric, per split and for
 * the whole run, from the published Minetti grade-energy curve.
 *
 * Model (ours, named in place — Strava's GAP curve is proprietary; the
 * public-science stand-in is Minetti et al. 2002, J Appl Physiol 92:
 * the metabolic cost of running per meter, as a function of grade):
 *
 *   C(i) = 155.4·i⁵ − 30.4·i⁴ − 43.3·i³ + 46.3·i² + 19.5·i + 3.6
 *          [J·kg⁻¹·m⁻¹],  i = tan(slope) = Δele / horizontal distance
 *
 *   C(0) = 3.6 J·kg⁻¹·m⁻¹ (the flat running cost). The GAP factor of a
 *   leg is C(i)/C(0): uphill > 1 (a flat-equivalent effort is FASTER
 *   than the actual pace), downhill < 1 (slower), and the downhill
 *   adjustment peaks where the curve bottoms out (around −10…−15% —
 *   both Strava's doc and Minetti's fit agree the extreme-downhill
 *   benefit saturates). The fit was measured on |grade| ≤ 45%; beyond
 *   that the factor is CLAMPED to the boundary value and the clamp is
 *   part of this module's disclosed model.
 *
 * Leg semantics (the same vocabulary every stats walk uses):
 *   - a GAP leg is a same-track leg with 0 < Δt ≤ `timeGapMs` and a
 *     finite length — the moving-time population, nothing else;
 *   - the leg's flat-equivalent time is Δt · C(0)/C(i) (the time that
 *     covers the same distance on flat ground at the same power);
 *   - a leg missing elevation at either endpoint has no grade — it
 *     contributes its actual time at factor 1 and is COUNTED in
 *     `flatLegs`, never silently guessed;
 *   - whole-run GAP pace = Σ flat-equivalent time / Σ leg distance —
 *     the energy-equivalence definition, ours, disclosed in place.
 *
 * Phase 23 — Fitness zones & metrics. Pure TypeScript: no React, no DOM.
 */

import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  OriginalTrackPoint,
  ReconstructedPoint,
} from "@/types/domain";

/** Minetti's flat running cost, J·kg⁻¹·m⁻¹ — the curve's own C(0). */
export const MINETTI_FLAT_COST_J_PER_KG_M = 3.6;

/** The fit was measured on |grade| ≤ 0.45; steeper legs clamp to it. */
export const MINETTI_GRADE_CLAMP = 0.45;

/**
 * The Minetti metabolic cost of running at a grade, J·kg⁻¹·m⁻¹.
 * `grade` is clamped to ±`MINETTI_GRADE_CLAMP` (the fit's range).
 */
export function minettiCost(grade: number): number {
  const i = Math.max(-MINETTI_GRADE_CLAMP, Math.min(MINETTI_GRADE_CLAMP, grade));
  const i2 = i * i;
  const i3 = i2 * i;
  const i4 = i3 * i;
  const i5 = i4 * i;
  return 155.4 * i5 - 30.4 * i4 - 43.3 * i3 + 46.3 * i2 + 19.5 * i + 3.6;
}

/**
 * The GAP factor of a grade: C(i)/C(0). Divide a pace by it (or
 * multiply a time) to get the flat-equivalent.
 */
export function minettiGapFactor(grade: number): number {
  return minettiCost(grade) / MINETTI_FLAT_COST_J_PER_KG_M;
}

/**
 * The grade of one leg (Δele over HORIZONTAL distance — Minetti's i is
 * tan of the slope angle, not the sine). `null` when an endpoint lacks
 * elevation or the geometry is degenerate.
 */
export function legGrade(
  eleA: number | undefined,
  eleB: number | undefined,
  legM: number,
): number | null {
  if (eleA === undefined || eleB === undefined) return null;
  if (!Number.isFinite(eleA) || !Number.isFinite(eleB)) return null;
  if (!(legM > 0) || !Number.isFinite(legM)) return null;
  const dEle = eleB - eleA;
  // Guard the sqrt against fp underflow (dEle ≈ legM at ~90° cliffs).
  const horizontal2 = legM * legM - dEle * dEle;
  if (!(horizontal2 > 0)) return null;
  return dEle / Math.sqrt(horizontal2);
}

/** One leg's flat-equivalent time + whether a real grade was applied. */
export interface LegGapTime {
  /** Δt · C(0)/C(i) — ms (equal to Δt when the grade is unknown). */
  gapMs: number;
  /** True when both endpoints carried elevation (a real grade). */
  graded: boolean;
}

/**
 * The flat-equivalent duration of one timed leg. Legs without a grade
 * (a missing endpoint elevation) pass through at factor 1 — counted,
 * never guessed.
 */
export function legGapTimeMs(
  dtMs: number,
  legM: number,
  eleA: number | undefined,
  eleB: number | undefined,
): LegGapTime {
  const grade = legGrade(eleA, eleB, legM);
  if (grade === null) return { gapMs: dtMs, graded: false };
  const factor = minettiGapFactor(grade);
  // factor > 0 always (the curve never crosses zero inside the clamp);
  // guard anyway so a pathological polynomial value can never produce
  // a negative duration.
  if (!(factor > 0)) return { gapMs: dtMs, graded: false };
  return { gapMs: dtMs / factor, graded: true };
}

/** Whole-run GAP summary over the merged route. */
export interface GapSummary {
  /** Σ Δt of the moving-time legs the walk considered. */
  movingMs: number;
  /** Σ flat-equivalent time over the same legs. */
  gapTimeMs: number;
  /** Σ distance of the same legs, meters. */
  distanceM: number;
  /** GAP pace, ms per meter (Σ gapTime / Σ distance). `null` without legs. */
  gapPaceMsPerMeter: number | null;
  /** Actual pace over the same legs, ms per meter. `null` without legs. */
  actualPaceMsPerMeter: number | null;
  /** Legs counted at factor 1 (an endpoint had no elevation). */
  flatLegs: number;
  /** Legs that carried a real grade. */
  gradedLegs: number;
  /** Whether any usable timing exists anywhere in the route. */
  hasTimingData: boolean;
  /** Whether any usable elevation exists anywhere in the route. */
  hasElevationData: boolean;
}

/**
 * The whole-run GAP over a merged route. `null` without a merge; a
 * summary with `gapPaceMsPerMeter: null` when no timed leg exists
 * (there is no honest pace of nothing).
 */
export function gapSummary(
  merge: MergeResult | null,
  options: { timeGapMs?: number } = {},
): GapSummary | null {
  if (!merge) return null;
  const timeGapMs = options.timeGapMs ?? Number.POSITIVE_INFINITY;

  let movingMs = 0;
  let gapTimeMs = 0;
  let distanceM = 0;
  let flatLegs = 0;
  let gradedLegs = 0;
  let hasTimingData = false;
  let hasElevationData = false;

  let cumulative = 0;
  let previous: {
    lat: number;
    lon: number;
    time?: number;
    ele?: number;
    trackIndex: number;
  } | null = null;

  for (const track of merge.tracks) {
    for (const view of track.points) {
      const point = view.point;
      const isReconstructed = point.source === "reconstructed";
      const usable =
        isReconstructed || isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;

      const time = isReconstructed
        ? (point as ReconstructedPoint).time?.value
        : (point as OriginalTrackPoint).time;
      const ele = isReconstructed
        ? (point as ReconstructedPoint).ele?.value
        : (point as OriginalTrackPoint).ele;
      if (ele !== undefined && Number.isFinite(ele)) {
        hasElevationData = true;
      }
      // Presence semantics (the shared walk's): any timestamp anywhere.
      if (time !== undefined) hasTimingData = true;

      if (previous !== null) {
        const legM = geodesicDistanceMeters(previous, point);
        const sameTrack = previous.trackIndex === track.trackIndex;
        const dt =
          sameTrack && previous.time !== undefined && time !== undefined
            ? time - previous.time
            : null;

        if (Number.isFinite(legM) && legM > 0) {
          cumulative += legM;
          if (dt !== null && dt > 0 && dt <= timeGapMs) {
            movingMs += dt;
            distanceM += legM;
            const { gapMs, graded } = legGapTimeMs(dt, legM, previous.ele, ele);
            gapTimeMs += gapMs;
            if (graded) gradedLegs += 1;
            else flatLegs += 1;
          }
        }
      }

      previous = {
        lat: point.lat,
        lon: point.lon,
        ...(time !== undefined ? { time } : {}),
        ...(ele !== undefined && Number.isFinite(ele) ? { ele } : {}),
        trackIndex: track.trackIndex,
      };
    }
  }

  return {
    movingMs,
    gapTimeMs,
    distanceM,
    // GAP requires at least one GRADED leg — an elevation-free route
    // has nothing to adjust and renders the honest "—" instead.
    gapPaceMsPerMeter:
      gradedLegs > 0 && gapTimeMs > 0 && distanceM > 0
        ? gapTimeMs / distanceM
        : null,
    actualPaceMsPerMeter:
      movingMs > 0 && distanceM > 0 ? movingMs / distanceM : null,
    flatLegs,
    gradedLegs,
    hasTimingData,
    hasElevationData,
  };
}

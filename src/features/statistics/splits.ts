/**
 * Splits engine (docs/MASTER_PLAN.md §EE 15.1) — per-split distance,
 * time, and elevation gain over the merged route.
 *
 * Everything here is a pure function of the `MergeResult` the export
 * pipeline already builds (one merge serves export, statistics, the
 * elevation profile, AND the splits — the populations can never
 * disagree). The route walk mirrors `buildElevationProfile`: usable
 * points only, cumulative distance continuous across track boundaries
 * (a multi-track file is one plotting bench, the single-track norm
 * unchanged); TIME legs never span track boundaries (the `time.ts`
 * boundary — different `<trk>` elements are separate activities).
 *
 * Attribution rules (the honesty core of this module):
 *
 *   - **Distance** — each leg contributes to every split it overlaps,
 *     proportionally to the overlap. A leg straddling a split boundary
 *     is split; the last split is partial by construction.
 *   - **Time** — a leg's Δt is attributed to the splits it overlaps in
 *     the SAME proportion as its distance (linear time-over-distance
 *     interpolation inside one leg — the standard splits convention,
 *     disclosed here). The leg-time vocabulary mirrors `time.ts`:
 *     reversed legs (Δt < 0), gap legs (Δt > `timeGapMs`), untimed legs
 *     (a missing endpoint time, or a track boundary) contribute
 *     distance but NO time and are counted per split — a split crossed
 *     by them carries a partial-time flag, never a fabricated value.
 *   - **Elevation gain/loss** — the SAME hysteresis deadband the file
 *     totals use (§K-2), run CONTINUOUSLY across the whole route, with
 *     each committed step attributed to the split containing the point
 *     where the climb/descent realizes. Σ split gains = the file's
 *     hysteresis gain; per-split numbers can never double-count.
 *   - **Grade-adjusted time (Phase 23.6)** — each timed leg's
 *     flat-equivalent duration (Δt · C(0)/C(grade), the Minetti curve
 *     from `gap.ts`) is attributed exactly like its time: splits the
 *     leg overlaps, proportionally. Legs missing elevation at an
 *     endpoint pass through at factor 1 and are counted (`gapFlatLegs`),
 *     never guessed; Σ split GAP time is the whole-run GAP numerator.
 *   - **Provenance** — a split is `recorded` when every point inside is
 *     plain recorded data, `estimated` when every point is
 *     reconstructed/marked, `mixed` when both appear (§L-2 vocabulary;
 *     §EE 15.1 "splits crossing reconstructed segments flagged
 *     estimated" — a mixed split still carries the estimate warning).
 *
 * Units are deliberately absent: meters and milliseconds only. The
 * split LENGTH follows the caller's pace unit (km/mi); formatting and
 * pace derivation live in the UI layer.
 *
 * Phase 15 — Stats dashboard. Pure TypeScript: no React, no DOM.
 */

import { DEFAULT_HYSTERESIS_THRESHOLD_M } from "@/features/elevation/smoothing";
import type { MergeResult } from "@/features/reconstruction/merge";
import { legGapTimeMs } from "@/features/statistics/gap";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  OriginalTrackPoint,
  ReconstructedPoint,
} from "@/types/domain";

/** §EE 15.1 default split length when the caller passes none (1 km). */
export const DEFAULT_SPLIT_LENGTH_M = 1000;

/** Provenance vocabulary of a split (mirrors ProvenanceBadge kinds). */
export type SplitProvenance = "recorded" | "estimated" | "mixed";

/** One split row: attributed distance/time/elevation + honesty flags. */
export interface SplitRow {
  /** 1-based ordinal (Split 1 = the first `splitLengthM` of route). */
  index: number;
  /** Nominal start of the split's distance window, meters. */
  fromM: number;
  /** Actual end of the window (the partial last split ends early). */
  toM: number;
  /** Distance attributed to this split, meters (Σ across rows = total). */
  distanceM: number;
  /** Moving time attributed, ms (0 when nothing contributed). */
  timeMs: number;
  /** Legs that contributed time (0 + missing flags = "—" in the UI). */
  timedLegs: number;
  /** Legs inside this split whose Δt exceeded the gap threshold. */
  gapLegs: number;
  /** Legs with a missing endpoint time (or spanning a track boundary). */
  untimedLegs: number;
  /** Legs with Δt < 0 (time-reversed recording) — the leg ends here. */
  reversedLegs: number;
  /**
   * Hysteresis gain attributed to this split, meters. `null` when no
   * point inside carried usable elevation.
   */
  eleGainM: number | null;
  /** Hysteresis loss attributed to this split, meters (`null` as above). */
  eleLossM: number | null;
  /** Points inside this split carrying usable elevation. */
  elePoints: number;
  /** Any elevation contribution was estimated (reconstructed/marked). */
  eleEstimated: boolean;
  /**
   * Grade-adjusted (flat-equivalent) time attributed, ms — Phase
   * 23.6. Legs without elevation pass through at factor 1. 0 when
   * nothing contributed.
   */
  gapTimeMs: number;
  /** Any GAP-attributed leg sat in a reconstructed/marked stretch. */
  gapEstimated: boolean;
  provenance: SplitProvenance;
}

/** File-level splits result (rows + the walk's honest bookkeeping). */
export interface SplitsResult {
  rows: readonly SplitRow[];
  /** The split length used, meters. */
  splitLengthM: number;
  /** Total merged-route distance, meters (Σ rows' distanceM). */
  totalDistanceM: number;
  /** Whether any leg anywhere contributed time. */
  hasTimingData: boolean;
  /** Whether any point anywhere carried usable elevation. */
  hasElevationData: boolean;
  /** Total hysteresis gain/loss over the route (Σ rows; mixed source). */
  totalGainM: number;
  totalLossM: number;
  /** The hysteresis threshold used (tooltips disclose it). */
  hysteresisThresholdM: number;
  /** Phase 23.6 — any timed leg anywhere carried elevation on both
   * endpoints (GAP is computable at all). */
  hasGradeData: boolean;
  /** Σ split GAP time, ms (the whole-run GAP numerator). */
  totalGapTimeMs: number;
  /** Timed legs counted at factor 1 (an endpoint lacked elevation). */
  gapFlatLegs: number;
  /** Any GAP-attributed leg sat in a reconstructed/marked stretch. */
  gapEstimated: boolean;
}

export interface SplitsOptions {
  splitLengthM?: number;
  timeGapMs?: number;
  hysteresisThresholdM?: number;
  /**
   * Point ids marked as reconstructed by a re-imported repair export
   * (§H-7): their stretches count as estimated the same way live
   * reconstructed runs do. Optional — most files carry none.
   */
  markedPointIds?: ReadonlySet<string>;
}

interface SplitAccumulator {
  distanceM: number;
  timeMs: number;
  timedLegs: number;
  gapLegs: number;
  untimedLegs: number;
  reversedLegs: number;
  eleGainM: number;
  eleLossM: number;
  elePoints: number;
  eleEstimated: boolean;
  gapTimeMs: number;
  gapEstimated: boolean;
  /** 1 when only recorded points, 2 when only estimated points. */
  recordedMask: number; // bit 0 = recorded seen, bit 1 = estimated seen
}

function newAccumulator(): SplitAccumulator {
  return {
    distanceM: 0,
    timeMs: 0,
    timedLegs: 0,
    gapLegs: 0,
    untimedLegs: 0,
    reversedLegs: 0,
    eleGainM: 0,
    eleLossM: 0,
    elePoints: 0,
    eleEstimated: false,
    gapTimeMs: 0,
    gapEstimated: false,
    recordedMask: 0,
  };
}

function accumulatorToRow(
  acc: SplitAccumulator,
  index: number,
  fromM: number,
  toM: number,
): SplitRow {
  const hasEle = acc.elePoints > 0;
  const provenance: SplitProvenance =
    acc.recordedMask === 1
      ? "recorded"
      : acc.recordedMask === 2
        ? "estimated"
        : "mixed";
  return {
    index,
    fromM,
    toM,
    distanceM: acc.distanceM,
    timeMs: acc.timeMs,
    timedLegs: acc.timedLegs,
    gapLegs: acc.gapLegs,
    untimedLegs: acc.untimedLegs,
    reversedLegs: acc.reversedLegs,
    eleGainM: hasEle ? acc.eleGainM : null,
    eleLossM: hasEle ? acc.eleLossM : null,
    elePoints: acc.elePoints,
    eleEstimated: acc.eleEstimated,
    gapTimeMs: acc.gapTimeMs,
    gapEstimated: acc.gapEstimated,
    provenance,
  };
}

/** Route distance → 0-based split index (a point ON a boundary starts
 * the next split; the very last point of an exactly-n-split route is
 * clamped by the caller's final fixup). */
function splitIndexOf(distanceM: number, splitLengthM: number): number {
  return Math.floor(distanceM / splitLengthM);
}

/**
 * Build the splits of a merged route. `null` merge (no file) yields
 * `null`; an empty/position-less route yields `null` too (there is no
 * honest split of nothing).
 */
export function buildSplits(
  merge: MergeResult | null,
  options: SplitsOptions = {},
): SplitsResult | null {
  if (!merge) return null;
  const splitLengthM = options.splitLengthM ?? DEFAULT_SPLIT_LENGTH_M;
  if (!(splitLengthM > 0)) return null;
  const timeGapMs = options.timeGapMs ?? Number.POSITIVE_INFINITY;
  const hysteresisThresholdM =
    options.hysteresisThresholdM ?? DEFAULT_HYSTERESIS_THRESHOLD_M;
  const marked = options.markedPointIds;

  const accumulators: SplitAccumulator[] = [newAccumulator()];

  // --- one continuous route walk -------------------------------------------
  let cumulative = 0;
  let previous: {
    lat: number;
    lon: number;
    time?: number;
    ele?: number;
    trackIndex: number;
    /** This point is reconstructed or re-import-marked. */
    estimated: boolean;
  } | null = null;
  let hasTimingData = false;
  let hasElevationData = false;
  let hasGradeData = false;
  let gapFlatLegs = 0;
  let gapEstimatedAny = false;

  // Hysteresis state persists across splits and holes (the §K-2 rule —
  // the integrator continues from the last committed reference).
  let reference: number | null = null;
  let referenceEstimated = false;

  for (const track of merge.tracks) {
    for (const view of track.points) {
      const point = view.point;
      const isReconstructed = point.source === "reconstructed";
      const usable =
        isReconstructed || isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;

      const lat = point.lat;
      const lon = point.lon;
      const time = isReconstructed
        ? (point as ReconstructedPoint).time?.value
        : (point as OriginalTrackPoint).time;
      const ele = isReconstructed
        ? (point as ReconstructedPoint).ele?.value
        : (point as OriginalTrackPoint).ele;
      const estimatedPoint =
        isReconstructed ||
        (marked !== undefined &&
          !isReconstructed &&
          marked.has((point as OriginalTrackPoint).id));

      // --- the leg ending at this point --------------------------------
      if (previous !== null) {
        const legM = geodesicDistanceMeters(previous, point);
        // §H-7 rule: a leg is estimated when BOTH endpoints are
        // (anchor-adjacent legs are recorded-adjacent geometry — the
        // same semantics reimportStats uses for marked stretches).
        const legEstimated = previous.estimated && estimatedPoint;
        if (Number.isFinite(legM) && legM > 0) {
          const d0 = cumulative;
          const d1 = cumulative + legM;
          const sameTrack = previous.trackIndex === track.trackIndex;
          let dt: number | null = null;
          if (sameTrack && previous.time !== undefined && time !== undefined) {
            dt = time - previous.time;
          }

          // Attribute the leg's distance (and time, when it has any)
          // to every split the leg overlaps, proportionally. The loop
          // tolerates a floating-point boundary landing exactly on d0
          // (floor may then point one window early — an empty leading
          // window advances instead of aborting the attribution).
          let lastOverlapK = -1;
          let sawOverlap = false;
          // Phase 23.6 — the leg's flat-equivalent duration, computed
          // once (legs without elevation pass through at factor 1).
          const legGap =
            dt !== null && dt >= 0 && dt <= timeGapMs
              ? legGapTimeMs(dt, legM, previous.ele, ele)
              : null;
          for (let k = splitIndexOf(d0, splitLengthM); ; k += 1) {
            if (k * splitLengthM >= d1) break;
            const lo = Math.max(d0, k * splitLengthM);
            const hi = Math.min(d1, (k + 1) * splitLengthM);
            if (hi <= lo) {
              if (sawOverlap) break;
              continue;
            }
            sawOverlap = true;
            lastOverlapK = k;
            const share = (hi - lo) / legM;
            while (accumulators.length <= k) accumulators.push(newAccumulator());
            const acc = accumulators[k];
            acc.distanceM += hi - lo;
            // Provenance rides the LEG too: a split whose only content
            // is pieces of legs (no sample point inside) still carries
            // those legs' provenance — a fully-recorded stretch must
            // never read "mixed" merely for lacking a point.
            acc.recordedMask |= legEstimated ? 2 : 1;
            if (dt !== null && dt >= 0 && dt <= timeGapMs) {
              acc.timeMs += dt * share;
              if (legGap !== null && dt > 0) {
                acc.gapTimeMs += legGap.gapMs * share;
                if (legGap.graded) hasGradeData = true;
                else gapFlatLegs += 1;
                if (legEstimated) {
                  acc.gapEstimated = true;
                  gapEstimatedAny = true;
                }
              }
            }
          }

          // Leg-class flags count once, in the split that received the
          // leg's LAST overlap (a straddling leg's anomalies belong
          // where it lands).
          if (lastOverlapK >= 0) {
            const acc = accumulators[lastOverlapK];
            if (dt === null) {
              acc.untimedLegs += 1;
            } else if (dt < 0) {
              acc.reversedLegs += 1;
            } else if (dt > timeGapMs) {
              acc.gapLegs += 1;
            } else if (dt > 0) {
              acc.timedLegs += 1;
              hasTimingData = true;
            }
          }

          cumulative = d1;
        } else if (Number.isFinite(legM)) {
          // Zero-length leg (duplicate point): no distance to attribute;
          // time still elapses between the two fixes (and its
          // flat-equivalent twin rides along — same rule, same place).
          const sameTrack = previous.trackIndex === track.trackIndex;
          if (
            sameTrack &&
            previous.time !== undefined &&
            time !== undefined
          ) {
            const dt = time - previous.time;
            const endSplit = Math.min(
              splitIndexOf(cumulative, splitLengthM),
              accumulators.length - 1,
            );
            if (dt < 0) {
              accumulators[endSplit].reversedLegs += 1;
            } else if (dt > timeGapMs) {
              accumulators[endSplit].gapLegs += 1;
            } else if (dt > 0) {
              accumulators[endSplit].timeMs += dt;
              accumulators[endSplit].timedLegs += 1;
              const legGap = legGapTimeMs(dt, legM, previous.ele, ele);
              accumulators[endSplit].gapTimeMs += legGap.gapMs;
              if (legGap.graded) hasGradeData = true;
              else gapFlatLegs += 1;
              if (legEstimated) {
                accumulators[endSplit].gapEstimated = true;
                gapEstimatedAny = true;
              }
              hasTimingData = true;
            }
          } else {
            const endSplit = Math.min(
              splitIndexOf(cumulative, splitLengthM),
              accumulators.length - 1,
            );
            accumulators[endSplit].untimedLegs += 1;
          }
        }
        // Non-finite legM (damaged coordinates): nothing to attribute —
        // the point itself was already screened by `usable`.
      }

      // --- the point itself --------------------------------------------
      const pointSplit = Math.min(
        splitIndexOf(cumulative, splitLengthM),
        accumulators.length - 1,
      );
      const acc = accumulators[pointSplit];
      acc.recordedMask |= estimatedPoint ? 2 : 1;

      if (ele !== undefined && Number.isFinite(ele)) {
        hasElevationData = true;
        acc.elePoints += 1;
        if (estimatedPoint) acc.eleEstimated = true;
        if (reference === null) {
          reference = ele;
          referenceEstimated = estimatedPoint;
        } else {
          const delta = ele - reference;
          if (delta >= hysteresisThresholdM) {
            acc.eleGainM += delta;
            if (estimatedPoint || referenceEstimated) acc.eleEstimated = true;
            reference = ele;
            referenceEstimated = estimatedPoint;
          } else if (delta <= -hysteresisThresholdM) {
            acc.eleLossM += -delta;
            if (estimatedPoint || referenceEstimated) acc.eleEstimated = true;
            reference = ele;
            referenceEstimated = estimatedPoint;
          }
          // Inside the deadband: nothing committed, reference persists.
        }
      }

      previous = {
        lat,
        lon,
        ...(time !== undefined ? { time } : {}),
        ...(ele !== undefined ? { ele } : {}),
        trackIndex: track.trackIndex,
        estimated: estimatedPoint,
      };
    }
  }

  const totalDistanceM = cumulative;
  if (totalDistanceM <= 0) return null;

  // Exact-boundary fixup: the final point of a route that ends exactly
  // on a split boundary opened an empty trailing accumulator — fold it
  // away (its distance/time were attributed to the earlier splits by
  // the overlap loop; only the mask/flags could have landed there).
  while (
    accumulators.length > 1 &&
    accumulators[accumulators.length - 1].distanceM === 0 &&
    accumulators[accumulators.length - 1].elePoints === 0 &&
    accumulators[accumulators.length - 1].recordedMask === 0
  ) {
    accumulators.pop();
  }

  const rows = accumulators.map((acc, i) =>
    accumulatorToRow(
      acc,
      i + 1,
      i * splitLengthM,
      Math.min((i + 1) * splitLengthM, totalDistanceM),
    ),
  );

  const totalGainM = rows.reduce((sum, r) => sum + (r.eleGainM ?? 0), 0);
  const totalLossM = rows.reduce((sum, r) => sum + (r.eleLossM ?? 0), 0);
  const totalGapTimeMs = rows.reduce((sum, r) => sum + r.gapTimeMs, 0);

  return {
    rows,
    splitLengthM,
    totalDistanceM,
    hasTimingData,
    hasElevationData,
    totalGainM,
    totalLossM,
    hysteresisThresholdM,
    hasGradeData,
    totalGapTimeMs,
    gapFlatLegs,
    gapEstimated: gapEstimatedAny,
  };
}

/**
 * The split-math self-check the table's footnote discloses: the sum of
 * per-split distances must equal the merged total (floating-point
 * tolerance aside). Exported for the tests and the CSV builder.
 */
export function splitsDistanceTotal(result: SplitsResult): number {
  return result.rows.reduce((sum, row) => sum + row.distanceM, 0);
}

/**
 * Average pace of one split in ms per meter (multiply by the unit's
 * meters-per-unit for the display pace). `undefined` when the split
 * has no time or no distance — the UI's "—".
 */
export function splitPaceMsPerMeter(row: SplitRow): number | undefined {
  if (row.timeMs <= 0 || row.distanceM <= 0) return undefined;
  return row.timeMs / row.distanceM;
}

/**
 * Grade-adjusted pace of one split, ms per meter — Phase 23.6
 * (flat-equivalent time over distance; the Minetti curve, ours).
 * `undefined` when the split has no attributed time or distance.
 */
export function splitGapPaceMsPerMeter(row: SplitRow): number | undefined {
  if (row.gapTimeMs <= 0 || row.distanceM <= 0) return undefined;
  return row.gapTimeMs / row.distanceM;
}

/**
 * Personal records & best efforts — Phase 24.2/24.5 (docs/plans/v3/
 * phase-24-activity-library-records.md): the Strava benchmark ladder,
 * elapsed-time best efforts over the merged route, lifetime records,
 * and the Riegel race-time prediction.
 *
 * Best-effort semantics (the plan's rules, each stated where it bites):
 *   - ELAPSED TIME — the clock does not stop. A window's time is the
 *     difference of its endpoint timestamps; GPS dropouts inside the
 *     window count, exactly as Strava documents for best efforts.
 *   - RECONSTRUCTED STRETCHES ARE EXCLUDED — a window that touches a
 *     drawn-in point (including either end of the leg a boundary lands
 *     on) is not an effort. A record set on a repaired gap is not a
 *     record; this is a rule, not a footnote.
 *   - INTERPOLATED MARKERS — the fastest window's ends land between
 *     samples; both boundary times are interpolated by distance and
 *     the effort is flagged when either end moved.
 *   - ONE TRACK — a window never spans a track boundary (separate
 *     <trk> elements are separate activities).
 *   - Monotone time — a window containing a time-reversed leg is not
 *     an effort (never clamped, never guessed).
 *
 * The optimum is exact: elapsed time is piecewise-linear along the
 * route, so its minimum over all windows of length D sits at a
 * breakpoint — a start ON a sample or an end ON a sample. Two
 * monotone two-pointer sweeps (end-snapped, start-snapped) enumerate
 * exactly those candidates; no O(n²) scan is ever paid.
 *
 * Riegel (24.5): t₂ = t₁ · (d₂/d₁)^1.06 — the public 1977/1981
 * exponent model, the honest local alternative to cloud predictions:
 * no cohort, no upload, the formula shown, the caveats stated.
 *
 * Phase 24 — Activity library, records & trends. Pure TypeScript.
 */

import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { RIEGEL_EXPONENT } from "@/features/statistics/zones";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  OriginalTrackPoint,
  ReconstructedPoint,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// The ladder (§RR — Strava's documented benchmark distances)
// ---------------------------------------------------------------------------

export interface LadderDistance {
  id: string;
  distanceM: number;
}

/**
 * The fourteen benchmark distances best efforts are measured over,
 * Strava's documented ladder, in their documented display order:
 * 400 m, 1 k, 1/2 mi, 1 mi, 2 mi, 5 k, 10 k, 15 k, 10 mi, 20 k,
 * half marathon, 30 k, marathon, 50 k. (Display order is not ascending
 * — 1/2 mi sits between 1 k and 1 mi; the engine scans an ascending
 * copy so the early-exit stays sound.)
 */
export const EFFORT_LADDER: readonly LadderDistance[] = [
  { id: "400m", distanceM: 400 },
  { id: "1k", distanceM: 1000 },
  { id: "halfmi", distanceM: 804.672 },
  { id: "1mi", distanceM: 1609.344 },
  { id: "2mi", distanceM: 3218.688 },
  { id: "5k", distanceM: 5000 },
  { id: "10k", distanceM: 10_000 },
  { id: "15k", distanceM: 15_000 },
  { id: "10mi", distanceM: 16_093.44 },
  { id: "20k", distanceM: 20_000 },
  { id: "hm", distanceM: 21_097.5 },
  { id: "30k", distanceM: 30_000 },
  { id: "marathon", distanceM: 42_195 },
  { id: "50k", distanceM: 50_000 },
];

/** The same distances, ascending (the engine's scan order). */
const LADDER_ASCENDING: readonly LadderDistance[] = [...EFFORT_LADDER].sort(
  (a, b) => a.distanceM - b.distanceM,
);

// ---------------------------------------------------------------------------
// Best efforts over one merged route
// ---------------------------------------------------------------------------

/** One session's best effort at a ladder distance. */
export interface SessionEffort {
  distanceM: number;
  /** Elapsed time, ms (the clock does not stop). */
  timeMs: number;
  /** The start boundary fell between samples (interpolated by distance). */
  startInterpolated: boolean;
  /** The end boundary fell between samples (interpolated by distance). */
  endInterpolated: boolean;
}

/** One usable point of one track, flattened for the two-pointer sweeps. */
interface EffortPoint {
  /** Cumulative distance within the track from the first usable point. */
  cum: number;
  /** Epoch ms; null when the point carries no timestamp. */
  time: number | null;
  recon: boolean;
}

/** Prefix sums making window validity an O(1) check. */
interface TrackPrefix {
  /** Points [0, i) that are untimed or reconstructed. */
  untimedOrRecon: number[];
  /** Legs (m-1, m) for m ≤ i that are untimed, reconstructed, or reversed. */
  badLegs: number[];
}

function buildPrefix(pts: readonly EffortPoint[]): TrackPrefix {
  const untimedOrRecon: number[] = [0];
  for (const p of pts) {
    untimedOrRecon.push(
      untimedOrRecon[untimedOrRecon.length - 1] +
        (p.time === null || p.recon ? 1 : 0),
    );
  }
  const badLegs: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const bad =
      prev.time === null ||
      cur.time === null ||
      prev.recon ||
      cur.recon ||
      cur.time < prev.time;
    badLegs.push(badLegs[badLegs.length - 1] + (bad ? 1 : 0));
  }
  return { untimedOrRecon, badLegs };
}

function windowValid(prefix: TrackPrefix, from: number, to: number): boolean {
  if (from > to) return false;
  if (prefix.untimedOrRecon[to + 1] - prefix.untimedOrRecon[from] !== 0) {
    return false;
  }
  return prefix.badLegs[to] - prefix.badLegs[from] === 0;
}

/**
 * The snap epsilon, meters: a crossing within 1 µm of a sample IS on
 * the sample. Geodesic arithmetic carries ~1e-10 relative error (a
 * 5e-8 m wobble at 400 m), and GPS data is meter-resolution — a
 * micron is exact by any physical standard while staying far under
 * the shortest interesting time difference.
 */
const SNAP_EPSILON_M = 1e-6;

/**
 * The best elapsed time for `distanceM` over one track's flattened
 * points, or null when no valid window exists. Both breakpoint
 * families (end-snapped, start-snapped) — the exact optimum.
 */
function bestEffortForDistance(
  pts: readonly EffortPoint[],
  prefix: TrackPrefix,
  distanceM: number,
): SessionEffort | null {
  const n = pts.length;
  const total = pts[n - 1]!.cum;
  if (!(total >= distanceM)) return null;

  let best: SessionEffort | null = null;
  const consider = (effort: SessionEffort): void => {
    if (best === null || effort.timeMs < best.timeMs) best = effort;
  };

  // Family A — the END lands on sample j; the start is the crossing
  // distanceM back (interpolated unless it lands on a sample).
  let k = 0; // lower bound of the crossing position
  for (let j = 0; j < n; j += 1) {
    const end = pts[j]!;
    if (end.time === null) continue;
    const start = end.cum - distanceM;
    if (start < -SNAP_EPSILON_M) continue;
    while (k < n && pts[k]!.cum < start - SNAP_EPSILON_M) k += 1;
    if (k >= n) break;
    let startTime: number;
    let startInterpolated: boolean;
    let windowFrom: number;
    if (Math.abs(pts[k]!.cum - start) <= SNAP_EPSILON_M) {
      // Exactly on a sample — nothing moved.
      if (pts[k]!.time === null) continue;
      startTime = pts[k]!.time!;
      startInterpolated = false;
      windowFrom = k;
    } else {
      // Strictly inside the leg (k-1, k).
      if (k === 0) continue;
      const a = pts[k - 1]!;
      const b = pts[k]!;
      if (a.time === null) continue;
      const span = b.cum - a.cum;
      if (span <= 0) continue;
      const fraction = (start - a.cum) / span;
      startTime = a.time! + fraction * (b.time! - a.time!);
      startInterpolated = true;
      windowFrom = k - 1;
    }
    if (!windowValid(prefix, windowFrom, j)) continue;
    const elapsed = end.time! - startTime;
    if (elapsed <= 0) continue;
    consider({
      distanceM,
      timeMs: elapsed,
      startInterpolated,
      endInterpolated: false,
    });
  }

  // Family B — the START lands on sample i; the end is the crossing
  // distanceM ahead (interpolated unless it lands on a sample).
  let m = 0;
  for (let i = 0; i < n; i += 1) {
    const startPt = pts[i]!;
    if (startPt.time === null) continue;
    const target = startPt.cum + distanceM;
    if (target > total + SNAP_EPSILON_M) break;
    while (m < n && pts[m]!.cum < target - SNAP_EPSILON_M) m += 1;
    if (m >= n) break;
    let endTime: number;
    let endInterpolated: boolean;
    let windowTo: number;
    if (Math.abs(pts[m]!.cum - target) <= SNAP_EPSILON_M) {
      if (pts[m]!.time === null) continue;
      endTime = pts[m]!.time!;
      endInterpolated = false;
      windowTo = m;
    } else {
      if (m === 0) continue;
      const a = pts[m - 1]!;
      const b = pts[m]!;
      if (a.time === null || b.time === null) continue;
      const span = b.cum - a.cum;
      if (span <= 0) continue;
      const fraction = (target - a.cum) / span;
      endTime = a.time! + fraction * (b.time! - a.time!);
      endInterpolated = true;
      windowTo = m;
    }
    if (!windowValid(prefix, i, windowTo)) continue;
    const elapsed = endTime - startPt.time!;
    if (elapsed <= 0) continue;
    consider({
      distanceM,
      timeMs: elapsed,
      startInterpolated: false,
      endInterpolated,
    });
  }

  return best;
}

/**
 * Every ladder distance this merged route covers, with its best
 * elapsed-time effort. One pass flattens each track; the sweeps are
 * monotone two-pointers. Empty when the route has no usable points.
 */
export function bestEfforts(
  merge: MergeResult | null,
): readonly SessionEffort[] {
  if (!merge) return [];
  const best = new Map<number, SessionEffort>();
  for (const track of merge.tracks) {
    const pts: EffortPoint[] = [];
    let cum = 0;
    let prev: { lat: number; lon: number } | null = null;
    for (const view of track.points) {
      const point = view.point;
      const recon = point.source === "reconstructed";
      if (!recon && !isUsableStatsPoint(point as OriginalTrackPoint)) {
        // Same skip rule as every stats walk — unusable points carry
        // no geometry; the leg spans from the previous usable point.
        continue;
      }
      const time = recon
        ? ((point as ReconstructedPoint).time?.value ?? null)
        : ((point as OriginalTrackPoint).time ?? null);
      if (prev !== null) {
        const legM = geodesicDistanceMeters(prev, point);
        if (Number.isFinite(legM) && legM > 0) cum += legM;
      }
      pts.push({ cum, time, recon });
      prev = point;
    }
    if (pts.length < 2) continue;
    const prefix = buildPrefix(pts);
    for (const { distanceM } of LADDER_ASCENDING) {
      const effort = bestEffortForDistance(pts, prefix, distanceM);
      if (effort === null) break; // ascending; nothing longer exists
      const existing = best.get(distanceM);
      if (existing === undefined || effort.timeMs < existing.timeMs) {
        best.set(distanceM, effort);
      }
    }
  }
  return EFFORT_LADDER.flatMap(({ distanceM }) => {
    const effort = best.get(distanceM);
    return effort === undefined ? [] : [effort];
  });
}

// ---------------------------------------------------------------------------
// Lifetime records over the indexed library
// ---------------------------------------------------------------------------

/**
 * One indexed session as the records/trends aggregations see it — a
 * structural subset of the persisted `SessionIndex` (index-session.ts
 * satisfies it without either module importing the other).
 */
export interface LibraryIndexRow {
  id: string;
  name: string;
  index: {
    activityStartMs: number | null;
    hasTimingData: boolean;
    /** Whole-route (the card number, repairs included). */
    distanceM: number;
    /** Whole-route moving time, ms. */
    movingTimeMs: number;
    recordedDistanceM: number;
    recordedMovingTimeMs: number;
    recordedGainM: number | null;
    efforts: readonly SessionEffort[];
  };
}

/** One of the top-three efforts at a ladder distance. */
export interface LibraryEffortEntry extends SessionEffort {
  sessionId: string;
  sessionName: string;
  activityStartMs: number | null;
}

/** A ladder distance's top three, fastest first. */
export interface LadderRecord {
  distanceM: number;
  efforts: readonly LibraryEffortEntry[];
}

/** A single-value record (farthest / longest / most gain). */
export interface ValueRecord {
  sessionId: string;
  sessionName: string;
  activityStartMs: number | null;
  value: number;
}

export interface LifetimeRecords {
  farthest: ValueRecord | null;
  longest: ValueRecord | null;
  mostGain: ValueRecord | null;
  ladder: readonly LadderRecord[];
  /** Sessions eligible for records (indexed, with timing where needed). */
  eligibleCount: number;
  /** Sessions excluded from records because they carry no timestamps. */
  untimedCount: number;
}

/**
 * Aggregate the lifetime records over the indexed library. Farthest,
 * longest, and most gain read the RECORDED-ONLY numbers (a drawn-in
 * gap is not a record); best efforts are already per-session bests —
 * this ranks them across sessions, top three per distance. Ties keep
 * the earlier activity (deterministic).
 */
export function lifetimeRecords(
  rows: readonly LibraryIndexRow[],
): LifetimeRecords {
  let farthest: ValueRecord | null = null;
  let longest: ValueRecord | null = null;
  let mostGain: ValueRecord | null = null;
  let untimedCount = 0;

  const byDistance = new Map<number, LibraryEffortEntry[]>();
  for (const row of rows) {
    const { index } = row;
    if (!index.hasTimingData) untimedCount += 1;
    const entry = (value: number): ValueRecord => ({
      sessionId: row.id,
      sessionName: row.name,
      activityStartMs: index.activityStartMs,
      value,
    });
    const better = (
      candidate: ValueRecord,
      current: ValueRecord | null,
    ): boolean =>
      current === null ||
      candidate.value > current.value ||
      (candidate.value === current.value &&
        (candidate.activityStartMs ?? Number.POSITIVE_INFINITY) <
          (current.activityStartMs ?? Number.POSITIVE_INFINITY));

    if (index.recordedDistanceM > 0) {
      const candidate = entry(index.recordedDistanceM);
      if (better(candidate, farthest)) farthest = candidate;
    }
    if (index.recordedMovingTimeMs > 0) {
      const candidate = entry(index.recordedMovingTimeMs);
      if (better(candidate, longest)) longest = candidate;
    }
    if (index.recordedGainM !== null && index.recordedGainM > 0) {
      const candidate = entry(index.recordedGainM);
      if (better(candidate, mostGain)) mostGain = candidate;
    }
    for (const effort of index.efforts) {
      const bucket = byDistance.get(effort.distanceM) ?? [];
      bucket.push({
        ...effort,
        sessionId: row.id,
        sessionName: row.name,
        activityStartMs: index.activityStartMs,
      });
      byDistance.set(effort.distanceM, bucket);
    }
  }

  const ladder: LadderRecord[] = [];
  for (const { distanceM } of EFFORT_LADDER) {
    const bucket = byDistance.get(distanceM);
    if (bucket === undefined) continue;
    bucket.sort((a, b) =>
      a.timeMs !== b.timeMs
        ? a.timeMs - b.timeMs
        : (a.activityStartMs ?? Number.POSITIVE_INFINITY) -
          (b.activityStartMs ?? Number.POSITIVE_INFINITY),
    );
    ladder.push({ distanceM, efforts: bucket.slice(0, 3) });
  }

  return {
    farthest,
    longest,
    mostGain,
    ladder,
    eligibleCount: rows.length,
    untimedCount,
  };
}

// ---------------------------------------------------------------------------
// Riegel race-time predictions (24.5, opt-in)
// ---------------------------------------------------------------------------

/**
 * Predict the time for `targetDistanceM` from a seed effort with
 * Riegel's exponent model: t₂ = t₁ · (d₂/d₁)^1.06. Null on degenerate
 * input (never guessed).
 */
export function riegelPredictionMs(
  seedDistanceM: number,
  seedTimeMs: number,
  targetDistanceM: number,
): number | null {
  if (!(seedDistanceM > 0) || !(seedTimeMs > 0) || !(targetDistanceM > 0)) {
    return null;
  }
  return seedTimeMs * Math.pow(targetDistanceM / seedDistanceM, RIEGEL_EXPONENT);
}

/**
 * The full prediction set from one seed effort over the ladder: every
 * OTHER distance (the seed's own distance is the input, not an
 * output), ascending by distance.
 */
export function riegelLadder(seed: {
  distanceM: number;
  timeMs: number;
}): readonly { distanceM: number; timeMs: number }[] {
  const out: { distanceM: number; timeMs: number }[] = [];
  for (const { distanceM } of LADDER_ASCENDING) {
    if (distanceM === seed.distanceM) continue;
    const timeMs = riegelPredictionMs(seed.distanceM, seed.timeMs, distanceM);
    if (timeMs === null) continue;
    out.push({ distanceM, timeMs });
  }
  return out;
}

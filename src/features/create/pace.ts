/**
 * Create pace — the "create from activity stats" workflow's pace plan
 * (Task 73): the user marks stretches of the drawn route and states the
 * average pace each stretch should run at, so the generated file's
 * timestamps vary along the route the way a real run does (uphills
 * slower, downhills faster, planned surges faster) instead of one flat
 * constant pace from a distance-proportional spread.
 *
 * The model, disclosed in place:
 *   - A pace segment is the INCLUSIVE span between two drawn points
 *     (vertex ids, route order) at a stated average pace, stored as
 *     ms per meter (unit-free; the UI converts at its edges).
 *   - The pace at a spot is `base × gradeFactor`: the base is the
 *     segment's stated pace inside a planned stretch, or the derived
 *     remainder pace outside them; the grade factor is Minetti's
 *     metabolic cost curve (`statistics/gap.ts` — C(i)/C(0)), the same
 *     published-science stand-in the app's GAP metric uses. A route
 *     without an elevation estimate runs at factor 1 (flat model).
 *   - The recorded DURATION is preserved exactly, always: planned
 *     segments keep their stated pace (grade breathing around it), and
 *     the unplanned remainder absorbs the difference. Only when the
 *     remainder cannot absorb it (its pace would leave the plausible
 *     window of 0.3–3× the activity average) are the planned paces
 *     scaled to fit — and the timeline says so (`clamped`), so the UI
 *     can disclose it. The watch's total time is the file's total time.
 *
 * Everything reuses the existing machinery: `resamplePath`'s path points
 * (vertices carry their ids), the elevation attachment's cumulative-
 * distance samples, Minetti's grade factor, and the `Estimated<number>`
 * method vocabulary (`pace-estimated` — the honest label for a timestamp
 * derived from a stated pace rather than a spread).
 *
 * Task 73. Pure TypeScript: no React, no DOM, no stores.
 */

import { minettiGapFactor, legGrade } from "@/features/statistics/gap";
import type { ElevationSample } from "@/features/elevation/samples";
import type { CreateTrack } from "@/features/create/track";
import type { DrawVertex, Estimated, VertexId } from "@/types/domain";

// ---------------------------------------------------------------------------
// Pace segments
// ---------------------------------------------------------------------------

/** One planned pace stretch: the inclusive span between two drawn points. */
export interface PaceSegment {
  /** Stable id (`ps{N}`, allocated by the store's monotonic sequence). */
  id: string;
  /** The earlier drawn point (route order). */
  fromVertexId: VertexId;
  /** The later drawn point (route order) — the span is inclusive. */
  toVertexId: VertexId;
  /** The stated average pace, ms per METER (unit-free). */
  paceMsPerMeter: number;
}

/** The plausible remainder window, as a factor of the activity average. */
export const REMAINDER_PACE_MIN_FACTOR = 0.3;
export const REMAINDER_PACE_MAX_FACTOR = 3;

/** Grade-factor clamp — DEM noise on short legs must not stall a file. */
export const GRADE_FACTOR_MIN = 0.3;
export const GRADE_FACTOR_MAX = 5;

/**
 * The contiguous selection span the pace input can plan: at least two
 * selected vertices that form an unbroken run of the chain. Null when
 * the selection is scattered, a single point, or stale.
 */
export interface PaceSelectionSpan {
  fromVertexId: VertexId;
  toVertexId: VertexId;
  fromIndex: number;
  toIndex: number;
}

/** Resolve the selection into a plannable contiguous run (null if not). */
export function contiguousSelectionSpan(
  vertices: readonly DrawVertex[],
  selection: ReadonlySet<VertexId>,
): PaceSelectionSpan | null {
  if (selection.size < 2) return null;
  // Indices of the selected vertices, in chain order.
  const indices: number[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    if (selection.has(vertices[i].id)) indices.push(i);
  }
  if (indices.length < 2) return null;
  for (let j = 1; j < indices.length; j += 1) {
    if (indices[j] !== indices[j - 1] + 1) return null; // scattered
  }
  return {
    fromVertexId: vertices[indices[0]].id,
    toVertexId: vertices[indices[indices.length - 1]].id,
    fromIndex: indices[0],
    toIndex: indices[indices.length - 1],
  };
}

/**
 * Make room for a new segment: existing segments that overlap the new
 * span are absorbed (fully covered) or trimmed (partially covered),
 * keeping the kept part only while it still spans two vertices. The
 * LAST assignment wins where spans overlap — the paint-over rule.
 */
export function makeRoomForSegment(
  segments: readonly PaceSegment[],
  fromVertexId: VertexId,
  toVertexId: VertexId,
  vertices: readonly DrawVertex[],
): PaceSegment[] {
  const indexOf = (id: VertexId): number =>
    vertices.findIndex((v) => v.id === id);
  const from = indexOf(fromVertexId);
  const to = indexOf(toVertexId);
  if (from === -1 || to === -1 || from >= to) return [...segments];

  const kept: PaceSegment[] = [];
  for (const segment of segments) {
    const a = indexOf(segment.fromVertexId);
    const b = indexOf(segment.toVertexId);
    if (a === -1 || b === -1) continue; // stale — dropped by pruning anyway
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi < from || lo > to) {
      kept.push(segment); // disjoint
      continue;
    }
    if (lo >= from && hi <= to) continue; // fully absorbed
    // Trim to the non-overlapping side, if it still spans two vertices.
    if (lo < from) {
      if (from - lo >= 2) {
        kept.push({
          ...segment,
          toVertexId: vertices[from - 1].id,
        });
      }
    } else if (hi > to) {
      if (hi - to >= 2) {
        kept.push({
          ...segment,
          fromVertexId: vertices[to + 1].id,
        });
      }
    }
  }
  return kept;
}

/**
 * Drop segments the chain can no longer support: a missing endpoint or
 * a flipped order (mirrors the selection pruning on undo/delete). A
 * segment whose endpoints merely moved apart or together SURVIVES — the
 * span is the pair of points, wherever they now sit.
 */
export function prunePaceSegments(
  vertices: readonly DrawVertex[],
  segments: readonly PaceSegment[],
): readonly PaceSegment[] {
  if (segments.length === 0) return segments;
  const index = new Map<VertexId, number>();
  for (let i = 0; i < vertices.length; i += 1) index.set(vertices[i].id, i);
  const kept = segments.filter((segment) => {
    const a = index.get(segment.fromVertexId);
    const b = index.get(segment.toVertexId);
    return a !== undefined && b !== undefined && a < b;
  });
  return kept.length === segments.length ? segments : kept;
}

// ---------------------------------------------------------------------------
// The paced timeline
// ---------------------------------------------------------------------------

/** One display sample of the pace curve (the chart's series). */
export interface PaceSample {
  /** Cumulative distance along the final path (meters). */
  cumM: number;
  /** The realized pace at this spot, ms per meter. */
  paceMsPerMeter: number;
  /** The terrain at this spot (meters), when an estimate exists. */
  eleM?: number;
}

/** One split's pace (the bar graph's series). */
export interface PaceSplit {
  /** Split number, 1-based. */
  index: number;
  fromM: number;
  toM: number;
  /** Average pace over the split, ms per meter. */
  paceMsPerMeter: number;
  /** Average elevation over the split (meters), when known. */
  eleM?: number;
}

/** The paced timeline — one basis for the preview, the card, and the file. */
export interface PacedTimeline {
  /**
   * Timestamps index-aligned with `track.path` (every point stamped;
   * first = start, last = start + durationMs exactly). Method is
   * `pace-estimated` — the honest label for a pace-derived stamp.
   */
  times: { value: number; method: "pace-estimated" }[];
  /** The display series (decimated + lightly smoothed), ascending cumM. */
  samples: readonly PaceSample[];
  /** The total time (=== the recorded duration, always). */
  totalMs: number;
  /** Distance running under a stated pace (meters). */
  plannedM: number;
  /** The realized average pace of the unplanned remainder (ms/m). */
  remainderPaceMsPerMeter: number | null;
  /** True when terrain modulated the curve (an elevation estimate rode along). */
  elevationModulated: boolean;
  /** True when planned paces were scaled to keep the duration honest. */
  clamped: boolean;
  /** The number of segments that actually landed on the final path. */
  segmentCount: number;
}

/** Elevation lookup over cumulative distance (undefined = no estimate). */
export type ElevationAtFn = (cumM: number) => number | undefined;

/** Build the elevation lookup from an attachment's samples (null-safe). */
export function elevationAtFromSamples(
  samples: readonly ElevationSample[] | null,
): ElevationAtFn {
  if (!samples || samples.length === 0) return () => undefined;
  // Binary search over the ascending samples + linear interpolation
  // between knots — the same arithmetic interpolateSample performs,
  // inlined so the lookup allocates nothing.
  return (cumM: number): number | undefined => {
    if (samples.length === 0) return undefined;
    if (cumM <= samples[0].cumDistanceM) return samples[0].ele;
    const last = samples[samples.length - 1];
    if (cumM >= last.cumDistanceM) return last.ele;
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].cumDistanceM <= cumM) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const span = b.cumDistanceM - a.cumDistanceM;
    if (!(span > 0)) return a.ele;
    const fraction = (cumM - a.cumDistanceM) / span;
    return a.ele + (b.ele - a.ele) * fraction;
  };
}

/** Clamp a grade factor into the robustness window. */
function clampedFactor(grade: number | null): number {
  if (grade === null) return 1;
  const factor = minettiGapFactor(grade);
  if (!Number.isFinite(factor) || factor <= 0) return 1;
  return Math.min(GRADE_FACTOR_MAX, Math.max(GRADE_FACTOR_MIN, factor));
}

/** A resolved distance window of one segment on the final path. */
interface SegmentWindow {
  fromM: number;
  toM: number;
  paceMsPerMeter: number;
}

/**
 * Resolve the segments' distance windows on the FINAL path (vertices
 * keep their ids through resample and scale; a world-scale drawing's
 * decimation may drop one — such a segment is skipped honestly, never
 * approximated).
 */
function segmentWindows(
  track: CreateTrack,
  segments: readonly PaceSegment[],
): SegmentWindow[] {
  if (segments.length === 0) return [];
  const path = track.path;
  const cumOf = new Map<VertexId, number>();
  for (const point of path) {
    if (point.vertexId !== undefined && !cumOf.has(point.vertexId)) {
      cumOf.set(point.vertexId, point.cumDistanceM);
    }
  }
  const windows: SegmentWindow[] = [];
  for (const segment of segments) {
    const fromM = cumOf.get(segment.fromVertexId);
    const toM = cumOf.get(segment.toVertexId);
    if (fromM === undefined || toM === undefined || !(toM > fromM)) continue;
    windows.push({ fromM, toM, paceMsPerMeter: segment.paceMsPerMeter });
  }
  windows.sort((a, b) => a.fromM - b.fromM);
  return windows;
}

/** True when the windows tile the whole distance with no gaps. */
function windowsCoverAll(windows: readonly SegmentWindow[], totalM: number) {
  if (windows.length === 0) return false;
  let covered = 0;
  for (const window of windows) {
    if (window.fromM > covered) return false;
    covered = Math.max(covered, window.toM);
  }
  return covered >= totalM - 0.5;
}

/** The display series' sample ceiling (decimated for the chart). */
const MAX_DISPLAY_SAMPLES = 220;
/** The display smoothing window (samples either side, disclosed in copy). */
const SMOOTHING_WINDOW = 5;

/**
 * Build the paced timeline. Returns `null` when nothing shapes the
 * curve (no segments AND no elevation) — the caller keeps the track's
 * distance-proportional base times, byte-identical to today's file.
 *
 * `durationMs` and `startMs` come from the confirmed statistics (the
 * watch's truth); the timeline always ends at `startMs + durationMs`.
 */
export function buildPacedTimeline(
  track: CreateTrack,
  durationMs: number,
  startMs: number,
  segments: readonly PaceSegment[],
  elevationAt: ElevationAtFn,
): PacedTimeline | null {
  const path = track.path;
  if (path.length < 2 || !(track.finalDistanceM > 0) || !(durationMs > 0)) {
    return null;
  }
  const windows = segmentWindows(track, segments);
  const hasElevation = (() => {
    // A single probe decides nothing (the first leg may be flat data) —
    // sample a few cums; any defined elevation means the estimate rode.
    const probes = [0, track.finalDistanceM / 2, track.finalDistanceM];
    return probes.some((cum) => elevationAt(cum) !== undefined);
  })();
  if (windows.length === 0 && !hasElevation) return null;

  const totalM = track.finalDistanceM;
  const avgPaceMsPerMeter = durationMs / totalM;

  // Pass 1 — every leg's length and grade factor (the ownership walk
  // lives in pass 2, where the integrals exist).
  const legCount = path.length - 1;
  const legM = new Float64Array(legCount);
  const legFactor = new Float64Array(legCount);
  for (let i = 0; i < legCount; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const meters = b.cumDistanceM - a.cumDistanceM;
    legM[i] = meters > 0 ? meters : 0;
    const grade = legGrade(
      elevationAt(a.cumDistanceM),
      elevationAt(b.cumDistanceM),
      legM[i],
    );
    legFactor[i] = clampedFactor(grade);
  }

  // Pass 2 — the segments' average-exact integrals: a stated pace is the
  // stretch's REALIZED average (the user's words: "an avg pace between
  // those 2 points"), so each segment rebalances its raw factor-weighted
  // time to hit exactly `distance × stated pace` — the terrain still
  // breathes WITHIN the stretch (uphill legs slower than downhill legs),
  // around the stated average. The remainder then absorbs the difference
  // between the recorded duration and the planned total.
  interface SegIntegral {
    targetMs: number;
    rawMs: number;
    fromM: number;
    toM: number;
    paceMsPerMeter: number;
  }
  const integrals: SegIntegral[] = windows.map((window) => ({
    targetMs: 0,
    rawMs: 0,
    fromM: window.fromM,
    toM: window.toM,
    paceMsPerMeter: window.paceMsPerMeter,
  }));
  let remainderRawMs = 0;
  let customDistanceM = 0;
  for (let i = 0; i < legCount; i += 1) {
    if (legM[i] <= 0) continue;
    const midM = (path[i].cumDistanceM + path[i + 1].cumDistanceM) / 2;
    let owner: SegIntegral | null = null;
    for (const integral of integrals) {
      if (midM >= integral.fromM && midM <= integral.toM) {
        owner = integral;
        break;
      }
    }
    if (owner !== null) {
      owner.rawMs += legM[i] * owner.paceMsPerMeter * legFactor[i];
      customDistanceM += legM[i];
    } else {
      remainderRawMs += legM[i] * legFactor[i];
    }
  }
  let customTargetMs = 0;
  for (const integral of integrals) {
    integral.targetMs = (integral.toM - integral.fromM) * integral.paceMsPerMeter;
    customTargetMs += integral.targetMs;
  }

  const remainderDistanceM = totalM - customDistanceM;
  let clamped = false;
  let customScale = 1;
  let remainderScale = 1;
  let remainderPaceMsPerMeter: number | null = null;

  if (remainderDistanceM > 0.5) {
    let remainderTimeMs = durationMs - customTargetMs;
    const minPace = avgPaceMsPerMeter * REMAINDER_PACE_MIN_FACTOR;
    const maxPace = avgPaceMsPerMeter * REMAINDER_PACE_MAX_FACTOR;
    const floorMs = remainderDistanceM * minPace;
    const ceilingMs = remainderDistanceM * maxPace;
    if (remainderTimeMs < floorMs) {
      remainderTimeMs = floorMs;
      if (customTargetMs > 0) customScale = (durationMs - remainderTimeMs) / customTargetMs;
      clamped = true;
    } else if (remainderTimeMs > ceilingMs) {
      remainderTimeMs = ceilingMs;
      if (customTargetMs > 0) customScale = (durationMs - remainderTimeMs) / customTargetMs;
      clamped = true;
    }
    remainderPaceMsPerMeter = remainderTimeMs / remainderDistanceM;
    remainderScale = remainderRawMs > 0 ? remainderTimeMs / remainderRawMs : 1;
  } else if (customTargetMs > 0) {
    // The plan covers the whole route — scale it to the recorded total.
    customScale = durationMs / customTargetMs;
    clamped = Math.abs(customScale - 1) > 1e-9;
  }

  // Pass 3 — the leg times and the cumulative timestamps.
  const times: { value: number; method: "pace-estimated" }[] = [];
  const legTime = new Float64Array(legCount);
  const cumTime = new Float64Array(path.length);
  for (let i = 0; i < legCount; i += 1) {
    if (legM[i] <= 0) continue;
    const midM = (path[i].cumDistanceM + path[i + 1].cumDistanceM) / 2;
    let owner: SegIntegral | null = null;
    for (const integral of integrals) {
      if (midM >= integral.fromM && midM <= integral.toM) {
        owner = integral;
        break;
      }
    }
    const time =
      owner !== null
        ? owner.rawMs > 0
          ? (legM[i] * owner.paceMsPerMeter * legFactor[i] *
              (owner.targetMs / owner.rawMs)) * customScale
          : legM[i] * owner.paceMsPerMeter * customScale
        : legM[i] * legFactor[i] * remainderScale;
    legTime[i] = time > 0 ? time : 0;
    cumTime[i + 1] = cumTime[i] + legTime[i];
  }
  // Guarded normalization: fp drift and zero-length legs can leave the
  // last cum a hair off the duration — pin it, proportionally.
  const rawTotal = cumTime[path.length - 1];
  const scale =
    rawTotal > 0 && Number.isFinite(rawTotal) ? durationMs / rawTotal : 1;
  for (let i = 0; i < path.length; i += 1) {
    times.push({ value: startMs + cumTime[i] * scale, method: "pace-estimated" });
  }

  // The display series — realized pace per point, decimated + smoothed.
  const realized = new Float64Array(path.length);
  realized[0] = legCount > 0 && legM[0] > 0 ? legTime[0] / legM[0] : avgPaceMsPerMeter;
  for (let i = 1; i < path.length; i += 1) {
    const leg = i - 1;
    realized[i] = legM[leg] > 0 ? legTime[leg] / legM[leg] : realized[i - 1];
  }
  const samples = buildDisplaySamples(path, realized, elevationAt);

  return {
    times,
    samples,
    totalMs: durationMs,
    plannedM: customDistanceM,
    remainderPaceMsPerMeter,
    elevationModulated: hasElevation,
    clamped,
    segmentCount: windows.length,
  };
}

/** Decimate the per-point pace to the chart's series + smooth + attach ele. */
function buildDisplaySamples(
  path: readonly { cumDistanceM: number }[],
  realizedPace: Float64Array,
  elevationAt: ElevationAtFn,
): PaceSample[] {
  const count = path.length;
  const stride = Math.max(1, Math.ceil(count / MAX_DISPLAY_SAMPLES));
  const raw: PaceSample[] = [];
  for (let i = 0; i < count; i += stride) {
    // Average the realized pace over the stride's points (a window, not
    // a sample — decimation must not drop a planned surge between taps).
    let sum = 0;
    let n = 0;
    for (let j = i; j < Math.min(i + stride, count); j += 1) {
      const pace = realizedPace[j];
      if (Number.isFinite(pace) && pace > 0) {
        sum += pace;
        n += 1;
      }
    }
    const cumM = path[i].cumDistanceM;
    const ele = elevationAt(cumM);
    raw.push({
      cumM,
      paceMsPerMeter: n > 0 ? sum / n : realizedPace[i],
      ...(ele !== undefined ? { eleM: ele } : {}),
    });
  }
  const last = path[count - 1];
  if (raw.length === 0 || raw[raw.length - 1].cumM < last.cumDistanceM - 0.5) {
    const ele = elevationAt(last.cumDistanceM);
    raw.push({
      cumM: last.cumDistanceM,
      paceMsPerMeter: realizedPace[count - 1],
      ...(ele !== undefined ? { eleM: ele } : {}),
    });
  }
  // Centered moving average — the curve reads at a glance; the copy
  // discloses the window alongside (the metrics chart's rule).
  const smoothed: PaceSample[] = raw.map((sample, i) => {
    let sum = 0;
    let n = 0;
    for (
      let j = Math.max(0, i - SMOOTHING_WINDOW);
      j <= Math.min(raw.length - 1, i + SMOOTHING_WINDOW);
      j += 1
    ) {
      const pace = raw[j].paceMsPerMeter;
      if (Number.isFinite(pace) && pace > 0) {
        sum += pace;
        n += 1;
      }
    }
    return { ...sample, paceMsPerMeter: n > 0 ? sum / n : sample.paceMsPerMeter };
  });
  return smoothed;
}

/**
 * The splits' pace over the timeline (per km or per mile — the caller
 * passes the unit's meters). Split pace integrates the timeline's
 * cumulative times exactly (time is piecewise-linear in distance within
 * a leg), so the bars and the file can never disagree.
 */
export function paceSplits(
  timeline: PacedTimeline,
  track: CreateTrack,
  unitMeters: number,
): PaceSplit[] {
  const totalM = track.finalDistanceM;
  if (!(unitMeters > 0) || !(totalM > 0)) return [];
  const path = track.path;
  const times = timeline.times;
  // timeAt(cumM): linear interpolation between the surrounding points.
  const timeAt = (cumM: number): number => {
    if (cumM <= 0) return times[0]?.value ?? 0;
    if (cumM >= totalM) return times[times.length - 1]?.value ?? 0;
    let lo = 0;
    let hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].cumDistanceM <= cumM) lo = mid;
      else hi = mid;
    }
    const aM = path[lo].cumDistanceM;
    const bM = path[hi].cumDistanceM;
    const tA = times[lo]?.value ?? 0;
    const tB = times[hi]?.value ?? 0;
    const span = bM - aM;
    if (!(span > 0)) return tA;
    return tA + ((cumM - aM) / span) * (tB - tA);
  };
  const splits: PaceSplit[] = [];
  const splitCount = Math.ceil(totalM / unitMeters);
  for (let k = 0; k < splitCount; k += 1) {
    const fromM = k * unitMeters;
    const toM = Math.min((k + 1) * unitMeters, totalM);
    const spanM = toM - fromM;
    if (!(spanM > 0)) continue;
    const splitTimeMs = timeAt(toM) - timeAt(fromM);
    // Average elevation over the split, from the display samples.
    let eleSum = 0;
    let eleCount = 0;
    for (const sample of timeline.samples) {
      if (sample.cumM >= fromM && sample.cumM < toM && sample.eleM !== undefined) {
        eleSum += sample.eleM;
        eleCount += 1;
      }
    }
    splits.push({
      index: k + 1,
      fromM,
      toM,
      paceMsPerMeter: splitTimeMs / spanM,
      ...(eleCount > 0 ? { eleM: eleSum / eleCount } : {}),
    });
  }
  return splits;
}

/** The methods a generated timestamp can carry (the domain vocabulary). */
type TimeMethod = Estimated<number>["method"];

/**
 * The timeline's times for the file — the export's click-time join.
 * Returns the base (distance-proportional) times when nothing shapes
 * the curve, so a no-plan export stays byte-identical to today's.
 */
export function pacedTimesForFile(
  track: CreateTrack,
  durationMs: number,
  startMs: number,
  segments: readonly PaceSegment[],
  elevationSamples: readonly ElevationSample[] | null,
): { value: number; method: TimeMethod }[] {
  const timeline = buildPacedTimeline(
    track,
    durationMs,
    startMs,
    segments,
    elevationAtFromSamples(elevationSamples),
  );
  if (timeline) return timeline.times;
  return track.times.map((time) => ({
    value: time?.value ?? startMs,
    method: (time?.method ?? "distance-proportional") as TimeMethod,
  }));
}

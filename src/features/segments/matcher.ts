/**
 * The personal-segment matcher — Phase 25.2/25.3 (docs/plans/v3/
 * phase-25-heatmap-personal-segments.md): find a segment's efforts
 * across the saved library, on-device, with Strava's documented
 * matching semantics as the reference (§RR, strava-interop-research):
 *
 *   - CROSSINGS, not geometry: an effort is timed from the NEAREST
 *     RECORDED POINTS crossing the segment's start and end anchors —
 *     more GPS points mean finer timing, exactly as their docs say.
 *     A crossing is any pass within SEGMENT_DRIFT_TOLERANCE_M of an
 *     anchor (their matcher is documented as drift-tolerant, "sometimes
 *     falsely"); the tolerance is ours, named and disclosed.
 *   - ELAPSED TIME — the clock does not stop (Phase 24's rule,
 *     restated where it bites hardest). The window's time is the
 *     difference of the crossing timestamps.
 *   - THE HONESTY RULE (25.3): an effort touching a drawn-in point —
 *     at either crossing or anywhere between — is FLAGGED and never a
 *     PR. A record set on a repaired gap is not a record.
 *   - THE REPAIR DIVIDEND (25.4): a data gap does NOT break matching
 *     (Strava's documented "Gap Threshold" does, there); the walk
 *     continues past gaps, so repaired stretches still yield efforts —
 *     flagged ones, never PRs.
 *   - ONE TRACK: crossings never span a track boundary (separate
 *     <trk> elements are separate activities).
 *   - DIRECTIONAL: the segment runs start → end in document order.
 *   - Monotone time: an untimed or time-reversed crossing pair is
 *     never guessed into an effort.
 *
 * Overlap dedup: on a loop course the anchors are crossed once per
 * lap, and GPS jitter near an anchor can smear one crossing into
 * several candidate pairs. Candidates are considered fastest-first;
 * an accepted effort owns its [start, end] index span and any
 * overlapping candidate is dropped — every kept effort is a distinct
 * passage, and among overlapping readings the fastest survives.
 *
 * Phase 25 — Heatmap & personal segments. Pure TypeScript.
 */

import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  OriginalTrackPoint,
  ReconstructedPoint,
} from "@/types/domain";

/**
 * How far a point may sit from an anchor and still count as crossing
 * it. 40 m: generous enough for consumer GPS drift between repeated
 * rides of the same road, tight enough that a parallel street never
 * matches. Named here because the segment view discloses it verbatim.
 */
export const SEGMENT_DRIFT_TOLERANCE_M = 40;

/**
 * The along-track sanity window: a valid effort's covered distance
 * (measured along the track between the crossings) is at least half
 * the segment's own length (a "crossing" that only clipped the start
 * anchor's neighborhood is not an effort) and at most ~2.5× plus a
 * flat margin (a wildly longer stretch means the pairings strung
 * together unrelated crossings).
 */
const MIN_ALONG_FACTOR = 0.5;
const MAX_ALONG_FACTOR = 2.5;
const MAX_ALONG_FLAT_M = 250;

/** A segment's identity in matcher terms (start/end anchors + length). */
export interface SegmentAnchors {
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  /** Along-track length at creation time (the reference window). */
  lengthM: number;
}

/** One matched effort, before session metadata joins it. */
export interface SegmentEffortRow {
  sessionId: string;
  sessionName: string;
  /** The session's activity date (first timed recorded point). */
  activityStartMs: number | null;
  /** Elapsed time between the crossings, ms (the clock does not stop). */
  elapsedMs: number;
  /** True when any point in [start, end] is drawn-in — never a PR. */
  reconstructed: boolean;
}

// ---------------------------------------------------------------------------
// The walk (one per session, feeding every segment)
// ---------------------------------------------------------------------------

/** One usable point of one track, flattened for the matcher. */
interface WalkPoint {
  lat: number;
  lon: number;
  /** Epoch ms; null when the point carries no usable timestamp. */
  time: number | null;
  /** Cumulative distance within the track from its first usable point. */
  cum: number;
  recon: boolean;
}

/**
 * Flatten a merge into per-track walk points (usable points only, the
 * index walk's own predicate) — one pass, shared by every segment.
 */
export function segmentWalkTracks(
  merge: MergeResult,
): WalkPoint[][] {
  const tracks: WalkPoint[][] = [];
  for (const track of merge.tracks) {
    const points: WalkPoint[] = [];
    let cum = 0;
    for (const view of track.points) {
      const point = view.point;
      const recon = point.source === "reconstructed";
      const usable =
        recon || isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;
      const time = recon
        ? (point as ReconstructedPoint).time?.value
        : (point as OriginalTrackPoint).time;
      if (points.length > 0) {
        const legM = geodesicDistanceMeters(
          points[points.length - 1]!,
          point,
        );
        if (Number.isFinite(legM) && legM > 0) cum += legM;
      }
      points.push({
        lat: point.lat,
        lon: point.lon,
        time: time !== undefined && Number.isFinite(time) ? time : null,
        cum,
        recon,
      });
    }
    if (points.length > 0) tracks.push(points);
  }
  return tracks;
}

// ---------------------------------------------------------------------------
// Crossing detection + pairing
// ---------------------------------------------------------------------------

/** A maximal contiguous run of points within tolerance of one anchor. */
interface CrossingRun {
  /** Index of the run's representative (the closest point). */
  repIndex: number;
  firstIndex: number;
  lastIndex: number;
}

function crossingRuns(
  track: readonly WalkPoint[],
  anchor: { lat: number; lon: number },
): CrossingRun[] {
  const runs: CrossingRun[] = [];
  let current: CrossingRun | null = null;
  let currentDist = Infinity;
  for (let i = 0; i < track.length; i += 1) {
    const point = track[i]!;
    const d = geodesicDistanceMeters(point, anchor);
    if (Number.isFinite(d) && d <= SEGMENT_DRIFT_TOLERANCE_M) {
      if (current === null) {
        current = { repIndex: i, firstIndex: i, lastIndex: i };
        currentDist = d;
      } else {
        current.lastIndex = i;
        if (d < currentDist) {
          currentDist = d;
          current.repIndex = i;
        }
      }
    } else if (current !== null) {
      runs.push(current);
      current = null;
      currentDist = Infinity;
    }
  }
  if (current !== null) runs.push(current);
  return runs;
}

/** One candidate effort on one track (pre-dedup). */
interface Candidate {
  startIndex: number;
  endIndex: number;
  elapsedMs: number;
  reconstructed: boolean;
}

function candidatesOnTrack(
  track: readonly WalkPoint[],
  anchors: SegmentAnchors,
): Candidate[] {
  const startRuns = crossingRuns(track, anchors.start);
  if (startRuns.length === 0) return [];
  const endRuns = crossingRuns(track, anchors.end);
  if (endRuns.length === 0) return [];

  const minAlongM = Math.max(
    SEGMENT_DRIFT_TOLERANCE_M,
    MIN_ALONG_FACTOR * anchors.lengthM,
  );
  const maxAlongM = MAX_ALONG_FACTOR * anchors.lengthM + MAX_ALONG_FLAT_M;

  // A point is reconstructed ⇒ every span containing it is flagged.
  // Prefix sums make the [s, e] check O(1).
  const reconPrefix: number[] = [0];
  for (const point of track) {
    reconPrefix.push(
      reconPrefix[reconPrefix.length - 1]! + (point.recon ? 1 : 0),
    );
  }

  const candidates: Candidate[] = [];
  for (const startRun of startRuns) {
    const startPoint = track[startRun.repIndex]!;
    if (startPoint.time === null) continue;
    for (const endRun of endRuns) {
      if (endRun.repIndex <= startRun.repIndex) continue;
      const endPoint = track[endRun.repIndex]!;
      if (endPoint.time === null) continue;
      const elapsedMs = endPoint.time - startPoint.time;
      if (!(elapsedMs > 0)) continue; // reversed or zero — never guessed
      const alongM = endPoint.cum - startPoint.cum;
      if (alongM < minAlongM || alongM > maxAlongM) continue;
      const reconCount =
        reconPrefix[endRun.repIndex + 1]! - reconPrefix[startRun.repIndex]!;
      candidates.push({
        startIndex: startRun.repIndex,
        endIndex: endRun.repIndex,
        elapsedMs,
        reconstructed: reconCount > 0,
      });
    }
  }
  return candidates;
}

/**
 * Keep the fastest non-overlapping candidates: every kept effort is a
 * distinct passage (index spans never intersect).
 */
function dedupeOverlaps(candidates: readonly Candidate[]): Candidate[] {
  const ordered = [...candidates].sort((a, b) => a.elapsedMs - b.elapsedMs);
  const kept: Candidate[] = [];
  for (const candidate of ordered) {
    const overlaps = kept.some(
      (existing) =>
        candidate.startIndex <= existing.endIndex &&
        existing.startIndex <= candidate.endIndex,
    );
    if (!overlaps) kept.push(candidate);
  }
  // Present in passage order (the PR ranking happens at the row level).
  kept.sort((a, b) => a.startIndex - b.startIndex);
  return kept;
}

/**
 * Match one segment against one session's walk tracks. Returns the
 * raw candidates' deduped survivors; session metadata joins later.
 */
export function matchSegmentOnSession(
  tracks: readonly (readonly WalkPoint[])[],
  anchors: SegmentAnchors,
): Candidate[] {
  const out: Candidate[] = [];
  for (const track of tracks) {
    out.push(...dedupeOverlaps(candidatesOnTrack(track, anchors)));
  }
  return out;
}

/**
 * Match + join session metadata into renderable effort rows.
 * `sessionStartMs` is the session's activity date (the index walk's
 * own first-timed-recorded-point; null when the file has no timing).
 */
export function segmentEffortRows(
  sessionId: string,
  sessionName: string,
  tracks: readonly (readonly WalkPoint[])[],
  anchors: SegmentAnchors,
  sessionStartMs: number | null,
): SegmentEffortRow[] {
  return matchSegmentOnSession(tracks, anchors).map((candidate) => ({
    sessionId,
    sessionName,
    activityStartMs: sessionStartMs,
    elapsedMs: candidate.elapsedMs,
    reconstructed: candidate.reconstructed,
  }));
}

/**
 * The display order: clean efforts by elapsed (the PR first), then
 * flagged efforts by elapsed — flagged rows are visible, never ranked.
 */
export function sortEffortRows(
  rows: readonly SegmentEffortRow[],
): SegmentEffortRow[] {
  return [...rows].sort((a, b) => {
    if (a.reconstructed !== b.reconstructed) {
      return a.reconstructed ? 1 : -1;
    }
    return a.elapsedMs - b.elapsedMs;
  });
}

/** The best clean effort — the PR (null when only flagged/no efforts). */
export function personalRecord(
  rows: readonly SegmentEffortRow[],
): SegmentEffortRow | null {
  const clean = rows.filter((row) => !row.reconstructed);
  if (clean.length === 0) return null;
  return clean.reduce((best, row) =>
    row.elapsedMs < best.elapsedMs ? row : best,
  );
}

// ---------------------------------------------------------------------------
// The shelf fingerprint (staleness gate for persisted efforts)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit — small, stable, dependency-free. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A cheap fingerprint of the matcher's INPUT SET: the file-backed
 * shelf's (id, last-updated) pairs plus the matcher semantics version.
 * Persisted efforts carry the fingerprint they were computed under; a
 * change means "recompute", never "guess why it changed". Renames bump
 * `updatedAt` and force a recompute — rare, and always honest.
 */
export function shelfFingerprint(
  rows: readonly { id: string; updatedAt: number }[],
): string {
  const parts = rows
    .map((row) => `${row.id}@${row.updatedAt}`)
    .sort()
    .join("|");
  return `v1-${fnv1a(parts)}-${rows.length}`;
}

/**
 * Gap detection — find candidate repair sites between adjacent recorded
 * points (docs/MASTER_PLAN.md §H-4).
 *
 * Three candidate kinds, all configurable:
 *
 *   - `time-gap`        — consecutive points whose timestamps differ by
 *                         more than `timeGapMs` (default 120 s). The
 *                         classic paused-watch/GPS-outage signature.
 *   - `speed-anomaly`   — implied geodesic leg speed above
 *                         `speedAnomalyKmh` (default 25 km/h), guarded by
 *                         `speedDtGuardMs` (default 10 s) so that tiny
 *                         clock jitter cannot masquerade as impossible
 *                         speed.
 *   - `segment-break`   — the boundary between two adjacent non-empty
 *                         `<trkseg>` elements of the same track. Always
 *                         considered (§H-4), regardless of thresholds.
 *
 * Candidates are **deduplicated per boundary**: a time-gap that coincides
 * with a segment break becomes one gap whose kind follows the priority
 * `time-gap > speed-anomaly > segment-break` and whose severity is the
 * maximum of the merged evidence. Gaps are returned **severity-ranked**
 * (severe → suspect → info, document order within the same rank).
 *
 * Diagnostics (`impliedDistanceM`, `impliedSpeed`) are straight-line
 * geodesic values via the shared geodesy module — honest diagnostics, not
 * measured track distance.
 *
 * Flags matter: points flagged `invalid-coord`/`out-of-range-coord` are
 * excluded from distance/speed evidence; pairs with missing or
 * non-positive elapsed time cannot produce time/speed candidates (those
 * are validation findings, not gaps). Works on the raw parse output; flags
 * from `validateGpx` simply sharpen the evidence.
 *
 * Re-imported repairs (§H-7, Phase 7): a leg with at least one marked
 * endpoint touches previously reconstructed data — a repair seam or a
 * reconstruction interior — not a recording gap. Such legs never produce
 * candidates (any discrepancy there was already surfaced when the repair
 * was made); the user can still open a manual span on one, because
 * repairing is never gated on detection.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript: no DOM, no framework, no I/O.
 */

import type {
  DetectedGap,
  GapKind,
  GapSeverity,
  OriginalTrackData,
  OriginalTrackPoint,
  SegmentId,
} from "@/types/domain";
import { gapId } from "@/types/ids";
import { geodesicDistanceMeters, hasFiniteCoords } from "@/lib/geo/geodesy";

/** Configurable detection thresholds (§H-4). */
export interface GapThresholds {
  /** Time gaps strictly greater than this are candidates. Default 120 000. */
  timeGapMs: number;
  /** Implied speeds strictly greater than this (km/h) are candidates. Default 25. */
  speedAnomalyKmh: number;
  /** Legs with Δt at or below this are immune to speed checks. Default 10 000. */
  speedDtGuardMs: number;
}

/** Running-world defaults (§H-4). */
export const DEFAULT_GAP_THRESHOLDS: GapThresholds = {
  timeGapMs: 120_000,
  speedAnomalyKmh: 25,
  speedDtGuardMs: 10_000,
};

const KMH_TO_MS = 1 / 3.6;

/** Evidence priority when merging candidates at the same boundary. */
const KIND_PRIORITY: readonly GapKind[] = [
  "time-gap",
  "speed-anomaly",
  "segment-break",
];

const SEVERITY_RANK: Record<GapSeverity, number> = {
  severe: 0,
  suspect: 1,
  info: 2,
};

/** A point usable as distance/speed evidence. */
function usableCoords(p: OriginalTrackPoint): boolean {
  return (
    hasFiniteCoords(p) &&
    !p.flags.includes("invalid-coord") &&
    !p.flags.includes("out-of-range-coord")
  );
}

interface Candidate {
  before: OriginalTrackPoint;
  after: OriginalTrackPoint;
  beforeSegId: SegmentId;
  afterSegId: SegmentId;
  /** Global document ordinal of the after point (for stable ordering). */
  docIndex: number;
  kinds: Set<GapKind>;
  elapsedMs?: number;
  impliedDistanceM?: number;
  impliedSpeed?: number;
}

function severityOf(
  candidate: { kinds: Set<GapKind>; elapsedMs?: number; impliedSpeed?: number },
  thresholds: GapThresholds,
): GapSeverity {
  let severe = false;
  let suspect = false;
  if (candidate.kinds.has("time-gap")) {
    // An order of magnitude over the threshold is "severe" (default 20 min).
    if (candidate.elapsedMs !== undefined && candidate.elapsedMs >= 10 * thresholds.timeGapMs) {
      severe = true;
    } else {
      suspect = true;
    }
  }
  if (candidate.kinds.has("speed-anomaly")) {
    // Double the speed threshold is "severe" (default 50 km/h).
    if (
      candidate.impliedSpeed !== undefined &&
      candidate.impliedSpeed >= 2 * thresholds.speedAnomalyKmh * KMH_TO_MS
    ) {
      severe = true;
    } else {
      suspect = true;
    }
  }
  if (severe) return "severe";
  if (suspect) return "suspect";
  return "info"; // pure segment-break evidence
}

/**
 * Detect candidate repair sites. Pure and deterministic: same input +
 * thresholds → same output. Returned gaps are severity-ranked and start in
 * status `'new'` (§H-4: the user confirms what to repair).
 */
export function detectGaps(
  data: OriginalTrackData,
  thresholds: Partial<GapThresholds> = {},
): DetectedGap[] {
  const effective: GapThresholds = {
    ...DEFAULT_GAP_THRESHOLDS,
    ...thresholds,
  };

  const candidates: Candidate[] = [];

  // Re-imported provenance markers: legs with exactly one marked endpoint
  // are repair seams (see module doc) — suppressed from detection.
  const markedPoints = new Set(
    (data.repairMarkers ?? []).map((marker) => marker.pointId),
  );

  let currentTrack: number | null = null;
  let previous: { point: OriginalTrackPoint; segId: SegmentId } | undefined;
  let ordinal = 0;

  for (const segment of data.segments) {
    if (segment.trackIndex !== currentTrack) {
      // Boundaries never span tracks — different <trk> elements are treated
      // as separate activities (§H-4: segment breaks only, within a track).
      currentTrack = segment.trackIndex;
      previous = undefined;
    }
    for (const point of segment.points) {
      if (previous !== undefined) {
        // Repair data (§H-7): a leg with at least one marked endpoint is
        // a seam or an interior of a previously reconstructed stretch —
        // not a recording gap.
        const touchesRepair =
          markedPoints.has(previous.point.id) || markedPoints.has(point.id);

        const kinds = new Set<GapKind>();

        const bothTimed =
          previous.point.time !== undefined && point.time !== undefined;
        const elapsedMs = bothTimed
          ? (point.time as number) - (previous.point.time as number)
          : undefined;

        if (elapsedMs !== undefined && elapsedMs > effective.timeGapMs) {
          kinds.add("time-gap");
        }
        if (previous.segId !== segment.id) {
          kinds.add("segment-break");
        }

        let impliedDistanceM: number | undefined;
        let impliedSpeed: number | undefined;
        const coordsUsable = usableCoords(previous.point) && usableCoords(point);
        if (coordsUsable) {
          impliedDistanceM = geodesicDistanceMeters(previous.point, point);
        }
        if (
          elapsedMs !== undefined &&
          elapsedMs > effective.speedDtGuardMs &&
          coordsUsable
        ) {
          impliedSpeed = impliedDistanceM! / (elapsedMs / 1000);
          if (impliedSpeed > effective.speedAnomalyKmh * KMH_TO_MS) {
            kinds.add("speed-anomaly");
          }
        }

        if (!touchesRepair && kinds.size > 0) {
          // Dedupe is intrinsic: all evidence for this boundary lands in one
          // candidate's kind set (a time-gap that coincides with a segment
          // break is one gap with merged evidence, §H-4).
          candidates.push({
            before: previous.point,
            after: point,
            beforeSegId: previous.segId,
            afterSegId: segment.id,
            docIndex: ordinal,
            kinds,
            ...(elapsedMs !== undefined ? { elapsedMs } : {}),
            ...(impliedDistanceM !== undefined ? { impliedDistanceM } : {}),
            ...(impliedSpeed !== undefined ? { impliedSpeed } : {}),
          });
        }
      }
      previous = { point, segId: segment.id };
      ordinal += 1;
    }
  }

  // Severity-ranked (severe → suspect → info), document order within rank.
  candidates.sort((a, b) => {
    const rank = SEVERITY_RANK[severityOf(a, effective)] - SEVERITY_RANK[severityOf(b, effective)];
    return rank !== 0 ? rank : a.docIndex - b.docIndex;
  });

  const gaps: DetectedGap[] = candidates.map((candidate) => ({
    id: gapId(candidate.before.id, candidate.after.id),
    kind: KIND_PRIORITY.find((k) => candidate.kinds.has(k))!,
    before: { segmentId: candidate.beforeSegId, pointId: candidate.before.id },
    after: { segmentId: candidate.afterSegId, pointId: candidate.after.id },
    ...(candidate.elapsedMs !== undefined ? { elapsedMs: candidate.elapsedMs } : {}),
    ...(candidate.impliedDistanceM !== undefined
      ? { impliedDistanceM: candidate.impliedDistanceM }
      : {}),
    ...(candidate.impliedSpeed !== undefined
      ? { impliedSpeed: candidate.impliedSpeed }
      : {}),
    severity: severityOf(candidate, effective),
    status: "new",
  }));

  return gaps;
}

/**
 * Surgery planning (docs/MASTER_PLAN.md §EE 16.1) — manual geometry
 * control on the working-copy layer, planned exactly like a fix.
 *
 * Every operation is PLANNED before it exists: the planners below are
 * pure functions over the WORKING view returning a `FixPlan` — the
 * entries the op would write and the what-would-change lines the
 * preview dialog renders. Nothing is applied until the user confirms
 * (the Phase 13 ritual); applying writes ONE `WorkingEdit`, so undo
 * removes exactly what was approved.
 *
 * The four operations:
 *   - **split** — cut a segment after a picked point; the tail moves
 *     to a derived segment in the same track (points keep their ids).
 *   - **delete range** — remove the A–B stretch of a segment. Planned
 *     as N plain point-deletion entries: the whole existing
 *     vocabulary (apply, persistence, export, undo) serves it without
 *     a new kind, and the log's reason ("range") keeps the honesty
 *     trail.
 *   - **duplicate** — insert a copy of a segment directly after it;
 *     the copy's point ids are rewritten so later fixes can address
 *     them without aliasing the source.
 *   - **reorder** — permute segments within their tracks (one entry,
 *     one undo step).
 *
 * Phase 16 — Track surgery & input freedom. Pure TypeScript.
 */

import type {
  FixPlan,
  PointRef,
  SegmentId,
  SurgeryKind,
  WorkingEditEntry,
  WorkingTrackData,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Kind vocabulary
// ---------------------------------------------------------------------------

/** The surgery kind discriminants (narrowing helper for consumers). */
export function isSurgeryKind(
  kind: FixPlan["kind"],
): kind is SurgeryKind {
  return (
    kind === "split-segment" ||
    kind === "delete-range" ||
    kind === "duplicate-segment" ||
    kind === "reorder-segments"
  );
}

/** The fix reason each surgery kind writes into the log. */
export function reasonOfSurgeryKind(kind: SurgeryKind) {
  switch (kind) {
    case "split-segment":
      return "split" as const;
    case "delete-range":
      return "range" as const;
    case "duplicate-segment":
      return "copy" as const;
    case "reorder-segments":
      return "reorder" as const;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A working segment, narrowed to what the planners read. */
type SurgerySegment = WorkingTrackData["segments"][number];

function findSegment(
  working: WorkingTrackData,
  segmentId: SegmentId,
): SurgerySegment | undefined {
  return working.segments.find((segment) => segment.id === segmentId);
}

/**
 * Locate a point id in the working view — the pick flow's resolver
 * (a map click yields a point id; the forms want its segment and
 * 1-based position). Null when the id lives in no current segment.
 */
export function locateWorkingPoint(
  working: WorkingTrackData,
  pointId: string,
): { segmentId: SegmentId; index: number; count: number } | null {
  for (const segment of working.segments) {
    const index = segment.points.findIndex((point) => point.id === pointId);
    if (index !== -1) {
      return {
        segmentId: segment.id,
        index,
        count: segment.points.length,
      };
    }
  }
  return null;
}

/** `point #12 of 45` — the forms' live resolution line. */
export function describeWorkingPoint(location: {
  segmentId: SegmentId;
  index: number;
  count: number;
}): string {
  return `point #${location.index + 1} of ${location.count} in ${location.segmentId}`;
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

/**
 * Plan cutting a segment after one of its points. Null when the
 * segment does not exist, the point is not in it, or the point is the
 * segment's last (the cut would produce an empty tail — nothing to
 * split).
 */
export function planSplitSegment(
  working: WorkingTrackData,
  segmentId: SegmentId,
  atPointId: string,
): FixPlan | null {
  const segment = findSegment(working, segmentId);
  if (!segment) return null;
  const at = segment.points.findIndex((point) => point.id === atPointId);
  if (at === -1 || at === segment.points.length - 1) return null;
  const tailCount = segment.points.length - at - 1;
  const refs: PointRef[] = [
    { segmentId, pointId: atPointId as PointRef["pointId"] },
  ];
  return {
    kind: "split-segment",
    label: { key: "surgery.split.label", params: { segment: segmentId, at: at + 1 } },
    entries: [
      {
        kind: "segment-split",
        segmentId,
        atPointId: atPointId as PointRef["pointId"],
      },
    ],
    points: refs,
    summary: [
      {
        key: "surgery.split.s1",
        params: { segment: segmentId, at: at + 1, count: tailCount },
      },
      { key: "surgery.split.s2" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Delete range
// ---------------------------------------------------------------------------

/**
 * Plan deleting the A–B stretch of a segment (inclusive, either pick
 * order). Null when either endpoint is not in the segment. Deleting
 * the whole segment is legal — it stays in the file as an empty
 * segment, exactly like a fully deduped one.
 */
export function planDeleteRange(
  working: WorkingTrackData,
  segmentId: SegmentId,
  fromPointId: string,
  toPointId: string,
): FixPlan | null {
  const segment = findSegment(working, segmentId);
  if (!segment) return null;
  const i = segment.points.findIndex((point) => point.id === fromPointId);
  const j = segment.points.findIndex((point) => point.id === toPointId);
  if (i === -1 || j === -1) return null;
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  const count = hi - lo + 1;
  const whole = count === segment.points.length;
  const entries: WorkingEditEntry[] = segment.points
    .slice(lo, hi + 1)
    .map((point) => ({
      kind: "point-deletion" as const,
      pointId: point.id as PointRef["pointId"],
    }));
  const refs: PointRef[] = segment.points
    .slice(lo, hi + 1)
    .map((point) => ({ segmentId, pointId: point.id as PointRef["pointId"] }));
  return {
    kind: "delete-range",
    label: { key: count === 1 ? "surgery.deleteRange.label.one" : "surgery.deleteRange.label.many", params: { count, segment: segmentId } },
    entries,
    points: refs,
    summary: [
      {
        key: count === 1
          ? "surgery.deleteRange.s1.one"
          : "surgery.deleteRange.s1.many",
        params: { count, lo: lo + 1, hi: hi + 1, segment: segmentId },
      },
      { key: whole ? "surgery.deleteRange.s2.whole" : "surgery.deleteRange.s2.partial" },
      { key: "surgery.deleteRange.s3" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

/**
 * Plan inserting a copy of a segment directly after it (same track).
 * Null when the segment does not exist or holds no points (an empty
 * copy says nothing and helps no one).
 */
export function planDuplicateSegment(
  working: WorkingTrackData,
  segmentId: SegmentId,
): FixPlan | null {
  const segment = findSegment(working, segmentId);
  if (!segment || segment.points.length === 0) return null;
  const refs: PointRef[] = segment.points.map((point) => ({
    segmentId,
    pointId: point.id as PointRef["pointId"],
  }));
  return {
    kind: "duplicate-segment",
    label: { key: "surgery.duplicate.label", params: { segment: segmentId, count: segment.points.length } },
    entries: [{ kind: "segment-duplicate", segmentId }],
    points: refs,
    summary: [
      {
        key:
          segment.points.length === 1
            ? "surgery.duplicate.s1.one"
            : "surgery.duplicate.s1.many",
        params: { segment: segmentId, count: segment.points.length },
      },
      { key: "surgery.duplicate.s2" },
      { key: "surgery.duplicate.s3" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

/**
 * Plan a new segment order (within-track moves only — the caller's
 * draft constrains it; the apply layer never crosses tracks). Null
 * unless `order` is a true permutation of the current segment ids.
 */
export function planSegmentOrder(
  working: WorkingTrackData,
  order: readonly SegmentId[],
): FixPlan | null {
  const current = working.segments.map((segment) => segment.id);
  if (order.length !== current.length) return null;
  const currentSet = new Set(current);
  const seen = new Set<string>();
  for (const id of order) {
    if (!currentSet.has(id) || seen.has(id)) return null;
    seen.add(id);
  }

  // Per-track moved count — the honest headline ("3 of 9 segments move").
  const trackOf = new Map(
    working.segments.map((segment) => [segment.id, segment.trackIndex]),
  );
  let moved = 0;
  for (const trackIndex of new Set(trackOf.values())) {
    const before = working.segments
      .filter((segment) => segment.trackIndex === trackIndex)
      .map((segment) => segment.id);
    const after = order.filter((id) => trackOf.get(id) === trackIndex);
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] !== after[i]) moved += 1;
    }
  }
  if (moved === 0) return null; // nothing would change — refuse honestly

  const entries: WorkingEditEntry[] = [
    { kind: "segment-order", order: [...order] },
  ];
  return {
    kind: "reorder-segments",
    label: { key: moved === 1 ? "surgery.reorder.label.one" : "surgery.reorder.label.many", params: { count: moved } },
    entries,
    points: [],
    summary: [
      {
        key: moved === 1 ? "surgery.reorder.s1.one" : "surgery.reorder.s1.many",
        params: { count: moved },
      },
      { key: "surgery.reorder.s2" },
      { key: "surgery.reorder.s3" },
    ],
  };
}

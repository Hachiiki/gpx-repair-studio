/**
 * The working-copy layer (docs/MASTER_PLAN.md §EE 13.2) — the provenance
 * extension every later surgery phase builds on.
 *
 * The original model stays immutable (§G non-negotiable). Instead of
 * mutating it, every confirmed fix appends `WorkingEdit`s to a log, and
 * `applyWorkingEdits` derives the WORKING view from
 * `(original, log)` — a pure function whose output is shaped exactly
 * like `OriginalTrackData`, so the merge, the statistics, the route
 * view, and the exporter consume it without knowing it is derived.
 *
 * Semantics:
 *   - **point-deletion** — the point leaves the working view; its id is
 *     never reused (ids stay original-parse-stable, so gap anchors,
 *     repairs, and validation references never alias). Segment extras
 *     (rare vendor children anchored by point count) re-anchor to the
 *     surviving point that keeps their position; an extra whose anchor
 *     point is gone rides at the segment's end.
 *   - **segment-sort** — the segment's points are stably reordered by
 *     timestamp. Points without a usable time sink to the end, keeping
 *     their document order (documented in the preview). The reorder
 *     marks the file's order as ESTIMATED — the export note says so.
 *   - **elevation-override** — the point's `ele` becomes the
 *     interpolated replacement; `workingEle` keeps the provenance (the
 *     recorded value + the method) and the verbatim `raw` capture is
 *     untouched, so the exporter can label the change honestly.
 *
 * Identity rule: **no edits → the original object itself** — every
 * `useMemo`/`useEffect` keyed on the model stays quiet for pristine
 * files (the working copy is free until the first fix).
 *
 * Phase 13 — Deep validation & repair presets. Pure TypeScript.
 */

import { deepFreeze } from "@/features/gpx/deepFreeze";
import type {
  AnchoredExtra,
  OriginalSegment,
  OriginalTrackData,
  SegmentId,
  WorkingEdit,
  WorkingEditEntry,
  WorkingMeta,
  WorkingTrackData,
  WorkingTrackPoint,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/** A working segment mid-application: surviving points + sort state. */
interface WorkingSegmentDraft {
  points: WorkingTrackPoint[];
  sorted: boolean;
}

/** The empty meta — a pristine copy. */
export const PRISTINE_META: WorkingMeta = {
  deletedPointCount: 0,
  sortedSegmentIds: [],
  overriddenEleCount: 0,
  hasEdits: false,
};

/**
 * Derive the working view. Pure and deterministic; the input model is
 * only read. `edits` are applied in log order (deletions compose; a
 * later elevation-override of a deleted point is a no-op).
 *
 * Returns the ORIGINAL object itself when the log is empty (identity:
 * effect keys stay quiet for pristine files) — structurally assignable
 * because every `WorkingTrackPoint` field except the optional
 * `workingEle` is an `OriginalTrackPoint` field.
 */
export function applyWorkingEdits(
  data: OriginalTrackData,
  edits: readonly WorkingEdit[],
): WorkingTrackData {
  if (edits.length === 0) return data; // identity: the original itself

  // Flatten the log into per-point / per-segment intents.
  const deleted = new Set<string>();
  const segmentsToSort = new Set<SegmentId>();
  const eleOverrides = new Map<
    string,
    Extract<WorkingEditEntry, { kind: "elevation-override" }>
  >();
  for (const edit of edits) {
    for (const entry of edit.entries) {
      switch (entry.kind) {
        case "point-deletion":
          deleted.add(entry.pointId);
          break;
        case "segment-sort":
          segmentsToSort.add(entry.segmentId);
          break;
        case "elevation-override":
          // Last write wins (a re-smooth after an undo+redo cycle).
          eleOverrides.set(entry.pointId, entry);
          break;
      }
    }
  }

  const drafts = new Map<string, WorkingSegmentDraft>();
  for (const segment of data.segments) {
    drafts.set(segment.id, { points: [], sorted: false });
  }

  // Pass 1 — deletions + elevation overrides (document order walk).
  for (const segment of data.segments) {
    const draft = drafts.get(segment.id);
    if (!draft) continue;
    for (const point of segment.points) {
      if (deleted.has(point.id)) continue;
      const override = eleOverrides.get(point.id);
      draft.points.push(
        override !== undefined
          ? {
              ...point,
              ele: override.ele,
              workingEle: {
                ele: override.ele,
                method: override.method,
                ...(override.originalEle !== undefined
                  ? { originalEle: override.originalEle }
                  : {}),
              },
            }
          : point,
      );
    }
  }

  // Pass 2 — sorts (stable by time; untimed sink to the end, keeping
  // their document order — the preview dialog discloses the rule).
  for (const segmentId of segmentsToSort) {
    const draft = drafts.get(segmentId);
    if (!draft || draft.points.length === 0) continue;
    draft.points = [...draft.points].sort((a, b) => {
      const at = a.time ?? Number.POSITIVE_INFINITY;
      const bt = b.time ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return 0; // stability: equal/missing times keep document order
    });
    draft.sorted = true;
  }

  // Pass 3 — extras re-anchoring + segment assembly.
  const segments = data.segments.map((segment): OriginalSegment => {
    const draft = drafts.get(segment.id);
    if (!draft) return segment;
    return {
      ...segment,
      points: draft.points,
      extras:
        draft.sorted || deleted.size > 0
          ? reanchorExtras(segment, draft.points)
          : segment.extras,
    };
  });

  const meta: WorkingMeta = {
    deletedPointCount: deleted.size,
    sortedSegmentIds: [...segmentsToSort],
    overriddenEleCount: eleOverrides.size,
    hasEdits: true,
  };

  const working: WorkingTrackData = { ...data, segments, working: meta };

  if (process.env.NODE_ENV !== "production") {
    deepFreeze(working);
  }
  return working;
}

/**
 * Re-anchor a segment's extras onto the working order (O(n)). An extra
 * that followed original point k keeps following the SURVIVING point
 * that holds k's position: k itself when it survives, else the greatest
 * survivor before k; with none before it, the extra rides at the
 * segment's end — deterministic, visible, and rare (extras are rare
 * vendor children; the honest fallback beats silently dropping them).
 * An extra before any point (k = 0) stays at the head only while
 * original point 0 survives.
 */
function reanchorExtras(
  segment: OriginalSegment,
  points: readonly WorkingTrackPoint[],
): readonly AnchoredExtra[] {
  if (segment.extras.length === 0) return segment.extras;
  // Original index of every surviving point, by id (ids are unique and
  // original-parse-stable — the working order is irrelevant to this map).
  const originalIndexById = new Map<string, number>();
  segment.points.forEach((point, originalIndex) => {
    originalIndexById.set(point.id, originalIndex);
  });
  // Sorted surviving original indexes → their working position.
  const survivors: { originalIndex: number; workingIndex: number }[] = [];
  points.forEach((point, workingIndex) => {
    const originalIndex = originalIndexById.get(point.id);
    if (originalIndex !== undefined) {
      survivors.push({ originalIndex, workingIndex });
    }
  });
  survivors.sort((a, b) => a.originalIndex - b.originalIndex);
  const workingIndexOf = new Map<number, number>();
  for (const s of survivors) workingIndexOf.set(s.originalIndex, s.workingIndex);

  const anchorFor = (afterPointCount: number): number => {
    if (afterPointCount === 0) {
      // Before any point: stays at the head only if original point 0
      // survives (nothing was deleted in front of it).
      return workingIndexOf.has(0) ? 0 : points.length;
    }
    const k = afterPointCount - 1; // the original point it followed
    if (workingIndexOf.has(k)) return (workingIndexOf.get(k) as number) + 1;
    // The anchor point is gone: the greatest survivor before k holds
    // its position; with none, the extra falls to the segment end.
    let best: { originalIndex: number; workingIndex: number } | null = null;
    for (const s of survivors) {
      if (s.originalIndex > k) break;
      best = s;
    }
    return best !== null ? best.workingIndex + 1 : points.length;
  };

  return segment.extras.map((extra) => ({
    afterPointCount: anchorFor(extra.afterPointCount),
    xml: extra.xml,
  }));
}

// ---------------------------------------------------------------------------
// Meta derivation (for stats labels without re-applying)
// ---------------------------------------------------------------------------

/** Summarize a log the same way `applyWorkingEdits` would label it. */
export function workingMetaOf(
  edits: readonly WorkingEdit[],
): WorkingMeta {
  if (edits.length === 0) return PRISTINE_META;
  const deleted = new Set<string>();
  const sorted = new Set<SegmentId>();
  const overridden = new Set<string>();
  for (const edit of edits) {
    for (const entry of edit.entries) {
      if (entry.kind === "point-deletion") deleted.add(entry.pointId);
      else if (entry.kind === "segment-sort") sorted.add(entry.segmentId);
      else overridden.add(entry.pointId);
    }
  }
  return {
    deletedPointCount: deleted.size,
    sortedSegmentIds: [...sorted],
    overriddenEleCount: overridden.size,
    hasEdits: true,
  };
}

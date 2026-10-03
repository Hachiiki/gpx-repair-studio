/**
 * The working-copy layer (docs/MASTER_PLAN.md §EE 13.2, 16.1) — the
 * provenance extension every fix and every surgery op builds on.
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
 * Phase 16 — surgery (§EE 16.1), applied by the same log:
 *   - **segment-split** — the segment is cut AFTER the named point.
 *     The tail moves to a derived segment (`{id}~s{n}`) in the same
 *     track; the points keep their original ids, so later edits, gap
 *     anchors, and validation references keep resolving. Extras
 *     partition with the points and re-anchor piece-locally.
 *   - **segment-duplicate** — a copy is inserted right after the
 *     source segment (same track). The copy's point ids are rewritten
 *     to `{derivedId}:{i}` so a later fix can address a copied point
 *     without aliasing the source. Extras (vendor children) are NOT
 *     copied — the preview says so.
 *   - **segment-order** — the segment list is permuted (within-track
 *     moves only; the track structure is never crossed). One entry is
 *     one rearrangement, one undo step.
 *
 *   Derived ids are allocated by a per-run counter in LOG ORDER
 *   (`~s1`, `~d2`, `~s3`, …), so replaying the same log — apply,
 *   hydrate, undo — always derives the same ids. Original ids follow
 *   `t{n}s{n}` and never contain `~`, so no collision is possible.
 *
 * Identity rule: **no edits → the original object itself** — every
 * `useMemo`/`useEffect` keyed on the model stays quiet for pristine
 * files (the working copy is free until the first fix).
 *
 * Phase 13/16 — Deep validation, repair presets & track surgery.
 * Pure TypeScript.
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
// Working segments (the structural pass's mutable-by-copy draft)
// ---------------------------------------------------------------------------

/** A segment mid-application: survivors + extras + placement. */
interface WorkingSegmentDraft {
  id: SegmentId;
  trackIndex: number;
  points: WorkingTrackPoint[];
  extras: AnchoredExtra[];
}

/** The empty meta — a pristine copy. */
export const PRISTINE_META: WorkingMeta = {
  deletedPointCount: 0,
  sortedSegmentIds: [],
  overriddenEleCount: 0,
  splitCount: 0,
  duplicatedSegmentCount: 0,
  reorderedSegmentCount: 0,
  hasEdits: false,
};

/** One structural entry, kept in log order for replay. */
type StructuralEntry = Extract<
  WorkingEditEntry,
  { kind: "segment-split" | "segment-duplicate" | "segment-order" }
>;

/**
 * Derive the working view. Pure and deterministic; the input model is
 * only read. `edits` are applied in log order (deletions compose; a
 * later elevation-override of a deleted point is a no-op; structural
 * entries replay against the structure the earlier entries produced).
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

  // -- Pass 1 — flatten the log into intents -------------------------------
  const deleted = new Set<string>();
  const eleOverrides = new Map<
    string,
    Extract<WorkingEditEntry, { kind: "elevation-override" }>
  >();
  const sorts = new Set<SegmentId>();
  const structural: StructuralEntry[] = [];
  let splitEntries = 0;
  let duplicateEntries = 0;
  let orderEntries = 0;

  for (const edit of edits) {
    for (const entry of edit.entries) {
      switch (entry.kind) {
        case "point-deletion":
          deleted.add(entry.pointId);
          break;
        case "segment-sort":
          sorts.add(entry.segmentId);
          break;
        case "elevation-override":
          // Last write wins (a re-smooth after an undo+redo cycle).
          eleOverrides.set(entry.pointId, entry);
          break;
        case "segment-split":
          structural.push(entry);
          splitEntries += 1;
          break;
        case "segment-duplicate":
          structural.push(entry);
          duplicateEntries += 1;
          break;
        case "segment-order":
          structural.push(entry);
          orderEntries += 1;
          break;
      }
    }
  }

  // Which intents address ORIGINAL ids (Pass 2) vs. ids that only a
  // structural entry can create (the post-sweep — a fix planned on a
  // split piece or a duplicated segment writes derived ids).
  const originalPointIds = new Set<string>();
  for (const segment of data.segments) {
    for (const point of segment.points) originalPointIds.add(point.id);
  }
  const originalSegmentIds = new Set(data.segments.map((s) => s.id));
  const derivedDeletions = new Set<string>();
  for (const id of deleted) {
    if (!originalPointIds.has(id)) derivedDeletions.add(id);
  }
  const derivedOverrides = new Map<
    string,
    Extract<WorkingEditEntry, { kind: "elevation-override" }>
  >();
  for (const [id, entry] of eleOverrides) {
    if (!originalPointIds.has(id)) derivedOverrides.set(id, entry);
  }
  const derivedSorts = new Set<SegmentId>();
  for (const id of sorts) {
    if (!originalSegmentIds.has(id)) derivedSorts.add(id);
  }

  // -- Pass 2 — materialize the original segments ---------------------------
  // (deletions + elevation overrides + sorts, exactly the Phase 13
  // semantics; extras re-anchor when the segment lost a point or was
  // sorted — the condition the original implementation approximated
  // with a global "any deletion" check.)
  const drafts: WorkingSegmentDraft[] = [];
  for (const segment of data.segments) {
    const points: WorkingTrackPoint[] = [];
    let lost = false;
    for (const point of segment.points) {
      if (deleted.has(point.id)) {
        lost = true;
        continue;
      }
      const override = eleOverrides.get(point.id);
      points.push(
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
    let sorted = false;
    if (sorts.has(segment.id) && points.length > 0) {
      // Stable by time; untimed sink to the end, keeping their
      // document order (the preview dialog discloses the rule).
      points.sort((a, b) => {
        const at = a.time ?? Number.POSITIVE_INFINITY;
        const bt = b.time ?? Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        return 0; // stability: equal/missing times keep document order
      });
      sorted = true;
    }
    drafts.push({
      id: segment.id,
      trackIndex: segment.trackIndex,
      points,
      extras:
        sorted || lost
          ? [...reanchorExtras(segment, points)]
          : [...segment.extras],
    });
  }

  // -- Pass 3 — structural replay (log order) -------------------------------
  // ONE shared counter for every derived id (kind-lettered: `~s1`,
  // `~d2`, `~s3`, …) — the design's determinism rule: the same log
  // always derives the same ids, and no two structural entries can
  // ever mint the same one.
  const structuralCounter = { next: 0 };
  for (const entry of structural) {
    switch (entry.kind) {
      case "segment-split":
        applySplit(drafts, entry, structuralCounter);
        break;
      case "segment-duplicate":
        applyDuplicate(drafts, entry, structuralCounter);
        break;
      case "segment-order":
        applyOrder(drafts, entry);
        break;
    }
  }

  // -- Pass 4 — post-sweep: intents on derived ids ---------------------------
  // Deletions/overrides/sorts whose ids only exist after Pass 3 (a fix
  // planned against a split piece or a segment copy). Same order as
  // Pass 2: deletions + overrides in one walk, then sorts.
  if (derivedDeletions.size > 0 || derivedOverrides.size > 0) {
    for (const draft of drafts) {
      let changed = false;
      if (derivedDeletions.size > 0) {
        const kept = draft.points.filter((point) => {
          if (derivedDeletions.has(point.id)) {
            changed = true;
            return false;
          }
          return true;
        });
        if (changed) draft.points = kept;
      }
      if (derivedOverrides.size > 0) {
        draft.points = draft.points.map((point) => {
          const override = derivedOverrides.get(point.id);
          if (override === undefined) return point;
          changed = true;
          return {
            ...point,
            ele: override.ele,
            workingEle: {
              ele: override.ele,
              method: override.method,
              ...(override.originalEle !== undefined
                ? { originalEle: override.originalEle }
                : {}),
            },
          };
        });
      }
      if (changed) {
        // Extras re-anchor onto the surviving points (the same rule as
        // Pass 2; the draft IS the "original" from the extras' view).
        draft.extras = [...reanchorExtras(draft, draft.points)];
      }
    }
  }
  for (const segmentId of derivedSorts) {
    const draft = drafts.find((d) => d.id === segmentId);
    if (!draft || draft.points.length === 0) continue;
    draft.points = [...draft.points].sort((a, b) => {
      const at = a.time ?? Number.POSITIVE_INFINITY;
      const bt = b.time ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return 0;
    });
    draft.extras = [...reanchorExtras(draft, draft.points)];
  }

  // -- Assembly ---------------------------------------------------------------
  const segments = drafts.map((draft): OriginalSegment => ({
    id: draft.id,
    trackIndex: draft.trackIndex,
    points: draft.points,
    extras: draft.extras,
  }));

  const meta: WorkingMeta = {
    deletedPointCount: deleted.size,
    sortedSegmentIds: [...sorts],
    overriddenEleCount: eleOverrides.size,
    splitCount: splitEntries,
    duplicatedSegmentCount: duplicateEntries,
    reorderedSegmentCount: orderEntries,
    hasEdits: true,
  };

  const working: WorkingTrackData = { ...data, segments, working: meta };

  if (process.env.NODE_ENV !== "production") {
    deepFreeze(working);
  }
  return working;
}

// ---------------------------------------------------------------------------
// Structural operations (Pass 3)
// ---------------------------------------------------------------------------

/**
 * Cut a segment after a point: the tail becomes a derived segment in
 * the same track. The first piece keeps the segment's id (continuity
 * up to the cut); the points keep their ids everywhere (§EE 16.1 —
 * later edits and gap anchors keep resolving). Extras partition with
 * the points: an extra anchored after pre-split point `k` follows that
 * point into its piece at the piece-local count (the first piece's
 * prefix indices are unchanged, so its counts survive verbatim).
 */
function applySplit(
  drafts: WorkingSegmentDraft[],
  entry: Extract<StructuralEntry, { kind: "segment-split" }>,
  counter: { next: number },
): void {
  const index = drafts.findIndex((d) => d.id === entry.segmentId);
  if (index === -1) return;
  const segment = drafts[index];
  const at = segment.points.findIndex((p) => p.id === entry.atPointId);
  if (at === -1 || at === segment.points.length - 1) return; // nothing after

  const cut = at + 1;
  const tailPoints = segment.points.slice(cut);
  const tailExtras: AnchoredExtra[] = [];
  const headExtras: AnchoredExtra[] = [];
  for (const extra of segment.extras) {
    const k = extra.afterPointCount;
    if (k === 0 || k - 1 <= at) {
      // Head piece: prefix indices are unchanged — count survives.
      headExtras.push(extra);
    } else {
      // Tail piece: shift by the cut length.
      tailExtras.push({ afterPointCount: k - cut, xml: extra.xml });
    }
  }

  counter.next += 1;
  const derivedId = `${segment.id}~s${counter.next}` as SegmentId;
  segment.points = segment.points.slice(0, cut);
  segment.extras = headExtras;
  drafts.splice(index + 1, 0, {
    id: derivedId,
    trackIndex: segment.trackIndex,
    points: tailPoints,
    extras: tailExtras,
  });
}

/**
 * Insert a copy of the segment right after it (same track). The copy's
 * point ids are rewritten to `{derivedId}:{i}` — a later fix can
 * address a copied point without aliasing the source. Extras are NOT
 * copied (vendor children belong to the original recording; the
 * preview discloses this).
 */
function applyDuplicate(
  drafts: WorkingSegmentDraft[],
  entry: Extract<StructuralEntry, { kind: "segment-duplicate" }>,
  counter: { next: number },
): void {
  const index = drafts.findIndex((d) => d.id === entry.segmentId);
  if (index === -1) return;
  const segment = drafts[index];

  counter.next += 1;
  const derivedId = `${segment.id}~d${counter.next}` as SegmentId;
  const points = segment.points.map(
    (point, i): WorkingTrackPoint => ({ ...point, id: derivedIdAs(derivedId, i) }),
  );
  drafts.splice(index + 1, 0, {
    id: derivedId,
    trackIndex: segment.trackIndex,
    points,
    extras: [],
  });
}

/** `{derivedSegmentId}:{localIndex}` — the copied point's fresh id. */
function derivedIdAs(segmentId: SegmentId, index: number) {
  return `${segmentId}:${index}` as WorkingTrackPoint["id"];
}

/**
 * Permute the segment list to the entry's order. Ids it names that no
 * longer exist are skipped; segments it does not mention keep their
 * current relative order (appended after the named ones) — the honest
 * defensive read of a hand-edited or replayed log. Tracks are never
 * crossed: each segment keeps its own `trackIndex`, and the
 * merge/export walk filters per track, so only within-track moves
 * change the emitted order.
 */
function applyOrder(
  drafts: WorkingSegmentDraft[],
  entry: Extract<StructuralEntry, { kind: "segment-order" }>,
): void {
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  const ordered: WorkingSegmentDraft[] = [];
  const seen = new Set<string>();
  for (const id of entry.order) {
    const draft = byId.get(id);
    if (draft === undefined || seen.has(id)) continue;
    ordered.push(draft);
    seen.add(id);
  }
  for (const draft of drafts) {
    if (!seen.has(draft.id)) ordered.push(draft);
  }
  drafts.length = 0;
  drafts.push(...ordered);
}

// ---------------------------------------------------------------------------
// Extras re-anchoring (shared by Pass 2 and the post-sweep)
// ---------------------------------------------------------------------------

/**
 * Re-anchor a segment's extras onto the working order (O(n)). An extra
 * that followed original point k keeps following the SURVIVING point
 * that holds k's position: k itself when it survives, else the greatest
 * survivor before k; with none before it, the extra rides at the
 * segment's end — deterministic, visible, and rare (extras are rare
 * vendor children; the honest fallback beats silently dropping them).
 * An extra before any point (k = 0) stays at the head only while
 * original point 0 survives.
 *
 * Works for any segment shape — original (Pass 2: `segment` is the
 * pristine original, `points` the survivors) or derived (post-sweep:
 * the draft's own current points are the "original" its extras anchor
 * against).
 */
function reanchorExtras(
  segment: {
    points: readonly { id: string }[];
    extras: readonly AnchoredExtra[];
  },
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
  let splitCount = 0;
  let duplicatedSegmentCount = 0;
  let reorderedSegmentCount = 0;
  for (const edit of edits) {
    for (const entry of edit.entries) {
      switch (entry.kind) {
        case "point-deletion":
          deleted.add(entry.pointId);
          break;
        case "segment-sort":
          sorted.add(entry.segmentId);
          break;
        case "elevation-override":
          overridden.add(entry.pointId);
          break;
        case "segment-split":
          splitCount += 1;
          break;
        case "segment-duplicate":
          duplicatedSegmentCount += 1;
          break;
        case "segment-order":
          reorderedSegmentCount += 1;
          break;
      }
    }
  }
  return {
    deletedPointCount: deleted.size,
    sortedSegmentIds: [...sorted],
    overriddenEleCount: overridden.size,
    splitCount,
    duplicatedSegmentCount,
    reorderedSegmentCount,
    hasEdits: true,
  };
}

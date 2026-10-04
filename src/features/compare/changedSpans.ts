/**
 * Changed-span derivation (Phase 19 — §EE 19.1): which stretches of the
 * ORIGINAL recording the working copy's edit log touched.
 *
 * The overlay mode paints the original as a ghost under the working
 * copy; the spans this module derives render ON the ghost in the
 * signal color — "here is what was modified" — while the untouched
 * ghost stays quiet. Spans are resolved against the ORIGINAL model
 * (fixes never move points, so original coordinates are exact — the
 * Phase 13 rule), and expressed as inclusive original-index ranges so
 * both the map overlay and the static snapshot can slice coordinates
 * from either side without a second join.
 *
 * Semantics per entry kind:
 *   - point-deletion → the legs AROUND the deleted point (its
 *     neighbors carry the visual change — the line skips it);
 *   - elevation-override → the legs around the point (the geometry is
 *     unchanged; the highlight marks the data change);
 *   - segment-sort → the whole segment (its order was rewritten);
 *   - split / duplicate / order → the whole source segment (structure).
 *
 * Adjacent or overlapping spans in one segment merge (one continuous
 * highlight reads better than stripes). Ids that only exist after a
 * structural entry (derived `~s1` / `~d2` pieces) do not resolve
 * against the original — their source segment is already marked by the
 * structural entry, so they are skipped, never guessed.
 *
 * Phase 19 — Compare, summaries & guided flows. Pure TypeScript.
 */

import type {
  OriginalTrackData,
  SegmentId,
  WorkingEdit,
} from "@/types/domain";
import { parsePointIdRef } from "@/types/ids";

/** Why a span is highlighted — drives the aria/legend wording. */
export type ChangedSpanKind =
  | "deleted"
  | "elevation"
  | "sorted"
  | "structure";

export interface ChangedSpan {
  segmentId: SegmentId;
  /** Inclusive original-index range of the highlighted stretch. */
  fromIndex: number;
  toIndex: number;
  kind: ChangedSpanKind;
}

const KIND_RANK: Record<ChangedSpanKind, number> = {
  deleted: 0,
  elevation: 1,
  sorted: 2,
  structure: 3,
};

interface SpanDraft {
  from: number;
  to: number;
  kind: ChangedSpanKind;
}

/** Merge drafts that touch or overlap; keep the dominant kind. */
function mergeDrafts(drafts: SpanDraft[]): SpanDraft[] {
  const sorted = [...drafts].sort((a, b) => a.from - b.from);
  const merged: SpanDraft[] = [];
  for (const draft of sorted) {
    const last = merged[merged.length - 1];
    if (last && draft.from <= last.to + 1) {
      // Overlap or adjacency (a gap of exactly one index is still one
      // visual stretch — two neighboring highlights would read as one).
      last.to = Math.max(last.to, draft.to);
      if (KIND_RANK[draft.kind] > KIND_RANK[last.kind]) {
        last.kind = draft.kind;
      }
      continue;
    }
    merged.push({ ...draft });
  }
  return merged;
}

/**
 * Derive the changed spans of the original recording. Pure; the model
 * is only read. `edits` is the full confirmed-fix log (deletions,
 * overrides, sorts, and surgery entries all count).
 */
export function buildChangedSpans(
  data: OriginalTrackData,
  edits: readonly WorkingEdit[],
): readonly ChangedSpan[] {
  if (edits.length === 0) return [];

  const segmentLengths = new Map<SegmentId, number>();
  for (const segment of data.segments) {
    segmentLengths.set(segment.id, segment.points.length);
  }
  // The one-pass intent flatten (the working-copy module's Pass 1
  // shape): structural entries mark their source segment whole; point
  // intents resolve to neighborhoods.
  const draftsBySegment = new Map<SegmentId, SpanDraft[]>();

  const pushDraft = (
    segmentId: SegmentId,
    from: number,
    to: number,
    kind: ChangedSpanKind,
  ) => {
    const length = segmentLengths.get(segmentId);
    if (length === undefined || length === 0) return;
    const clampedFrom = Math.max(0, from);
    const clampedTo = Math.min(length - 1, to);
    if (clampedTo < clampedFrom) return;
    const drafts = draftsBySegment.get(segmentId) ?? [];
    drafts.push({ from: clampedFrom, to: clampedTo, kind });
    draftsBySegment.set(segmentId, drafts);
  };

  const wholeSegment = (
    segmentId: SegmentId,
    kind: ChangedSpanKind,
  ) => {
    pushDraft(segmentId, 0, Number.MAX_SAFE_INTEGER, kind);
  };

  for (const edit of edits) {
    for (const entry of edit.entries) {
      switch (entry.kind) {
        case "point-deletion": {
          const ref = parsePointIdRef(entry.pointId);
          if (ref === null) break; // derived id — its source is marked
          pushDraft(ref.segmentId, ref.index - 1, ref.index + 1, "deleted");
          break;
        }
        case "elevation-override": {
          const ref = parsePointIdRef(entry.pointId);
          if (ref === null) break;
          pushDraft(ref.segmentId, ref.index - 1, ref.index + 1, "elevation");
          break;
        }
        case "segment-sort":
          wholeSegment(entry.segmentId, "sorted");
          break;
        case "segment-split":
        case "segment-duplicate":
          wholeSegment(entry.segmentId, "structure");
          break;
        case "segment-order":
          // A permutation touches every segment it names.
          for (const segmentId of entry.order) {
            wholeSegment(segmentId, "structure");
          }
          break;
      }
    }
  }

  const spans: ChangedSpan[] = [];
  for (const segment of data.segments) {
    const drafts = draftsBySegment.get(segment.id);
    if (!drafts) continue;
    for (const draft of mergeDrafts(drafts)) {
      spans.push({
        segmentId: segment.id,
        fromIndex: draft.from,
        toIndex: draft.to,
        kind: draft.kind,
      });
    }
  }
  return spans;
}

/** Human wording for a span kind (legend + summaries share it). */
export const CHANGED_SPAN_LABELS: Record<ChangedSpanKind, string> = {
  deleted: "points removed",
  elevation: "elevations smoothed",
  sorted: "order sorted by time",
  structure: "segments split, copied or reordered",
};

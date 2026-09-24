/**
 * Branded entity identifiers for the GPX domain (docs/MASTER_PLAN.md §F, §G).
 *
 * IDs are plain strings at runtime but branded at the type level so that a
 * `PointId` can never be accidentally used where a `GapId` is expected.
 * They are *deterministic*: derived from document position (track/segment/
 * point ordinals), which makes them stable across a parse → export →
 * re-parse round-trip — a prerequisite for the identity-export tests and
 * for referencing points from validation issues and detected gaps.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript; no imports, no side effects.
 */

/** Identifier of a `<trkseg>` — one recorded segment inside a `<trk>`. */
export type SegmentId = string & { readonly __brand: "SegmentId" };

/** Identifier of a `<trkpt>` — stable as `${segmentId}:${pointIndex}`. */
export type PointId = string & { readonly __brand: "PointId" };

/** Identifier of a detected gap — stable per before/after boundary. */
export type GapId = string & { readonly __brand: "GapId" };

/**
 * Identifier of a user-drawn reconstruction vertex.
 * Type-only in Phase 1 — constructors arrive with the draw editor (Phase 4).
 */
export type VertexId = string & { readonly __brand: "VertexId" };

/** `t{trackIndex}s{segmentIndex}` — e.g. `t0s1` = 2nd segment of 1st track. */
export function segmentId(trackIndex: number, segmentIndex: number): SegmentId {
  return `t${trackIndex}s${segmentIndex}` as SegmentId;
}

/** `${segmentId}:${pointIndex}` — e.g. `t0s1:4` (docs/MASTER_PLAN.md §G). */
export function pointId(seg: SegmentId, index: number): PointId {
  return `${seg}:${index}` as PointId;
}

/** `gap/{beforePointId}/{afterPointId}` — one id per trackpoint boundary. */
export function gapId(beforePoint: PointId, afterPoint: PointId): GapId {
  return `gap/${beforePoint}/${afterPoint}` as GapId;
}

/**
 * `v{sequence}` — a reconstruction vertex id. Sequence numbers are allocated
 * monotonically by the editor store for the whole editing session (never
 * reused, even after undo/delete), so ids stay unique across every gap's
 * reconstruction and command history never aliases two different vertices.
 */
export function vertexId(sequence: number): VertexId {
  return `v${sequence}` as VertexId;
}

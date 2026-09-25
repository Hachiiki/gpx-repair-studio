/**
 * DrawModel — the pure reconstruction-editing domain
 * (docs/MASTER_PLAN.md Phase 4; §D-3 "derived data is never stored as truth").
 *
 * The reconstruction for one gap is a small ordered list of user-placed
 * vertices. Every user edit is expressed as an immutable **command** value:
 *
 *   - commands are *invertible* — each carries the data its inverse needs
 *     (a move stores both `from` and `to`, a delete stores the removed
 *     vertex and its index, …);
 *   - `applyDrawCommand` is a pure function
 *     `(Reconstruction, DrawCommand) → Reconstruction` — never mutates;
 *   - the **command stack** (`DrawHistory` + `commitCommand`/`undoCommand`/
 *     `redoCommand`) maintains the classic invariants:
 *       · committing pushes onto the undo stack and clears the redo stack;
 *       · undo pops the undo stack, applies the inverse, pushes the inverse
 *         onto the redo stack;
 *       · redo pops the redo stack, re-applies the command, pushes it back
 *         onto the undo stack;
 *       · undo/redo on empty stacks are no-ops;
 *   - the vertex **hard cap** (`MAX_VERTICES`) is enforced here, at the
 *     domain boundary: commits that would exceed it are rejected (the
 *     command constructor returns `null`), so no UI path can oversize a
 *     reconstruction.
 *
 * Settings (resample spacing, time strategy) are deliberately NOT commands
 * (§D-3.5): they never touch the undo stack.
 *
 * Anchors: a reconstruction always *connects* the gap's boundary points —
 * `reconstructionDistanceMeters` and the straight-line heuristic both
 * include the before/after anchors; rendering (Phase 3 map layer) prepends
 * and appends them the same way. The user never places the anchors, and no
 * vertex is ever required to reach them.
 *
 * Phase 4 — Reconstruction Editor: Drawing. Pure TypeScript: no React, no
 * DOM, no stores (the zustand editorStore is a thin wrapper over these
 * functions).
 */

import {
  crossTrackDistanceMeters,
  geodesicDistanceMeters,
  polylineLengthMeters,
} from "@/lib/geo/geodesy";
import type {
  DrawVertex,
  GapId,
  LatLon,
  PointId,
  Reconstruction,
  VertexId,
} from "@/types/domain";

/** Hard cap on vertices per reconstruction (acceptance: "vertex hard-cap enforced"). */
export const MAX_VERTICES = 128;

/**
 * A vertex is considered "on" the anchor straight line below this deviation
 * (meters). Pure heuristic for the honesty warning — not a validation.
 */
export const STRAIGHT_LINE_MAX_DEVIATION_M = 5;

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/** The mutable essence of a vertex: where it is and what it snapped to. */
export interface VertexPosition {
  lat: number;
  lon: number;
  /** Present when the vertex was snapped to a recorded track point. */
  snappedTo?: PointId;
}

/** Extract the position of a vertex (for distance/geometry computations). */
export function vertexPosition(vertex: DrawVertex): VertexPosition {
  return {
    lat: vertex.lat,
    lon: vertex.lon,
    ...(vertex.snappedTo !== undefined
      ? { snappedTo: vertex.snappedTo }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * One invertible user edit of a reconstruction's vertex list.
 * `index` values refer to positions in the *vertex* list (anchors excluded).
 *
 * There is deliberately no separate "append" command: appending IS
 * inserting at `vertices.length`, and the add/insert distinction would
 * break the strict inversion symmetry (add⁻¹ = delete, delete⁻¹ = insert).
 * `addVertexCommand` therefore produces an `insert-vertex` at the end.
 */
export type DrawCommand =
  | { kind: "insert-vertex"; index: number; vertex: DrawVertex }
  | { kind: "move-vertex"; vertexId: VertexId; from: VertexPosition; to: VertexPosition }
  | { kind: "delete-vertex"; index: number; vertex: DrawVertex }
  | { kind: "set-vertices"; previous: readonly DrawVertex[]; next: readonly DrawVertex[] };

/** The exact inverse of a command (undo applies this). */
export function invertDrawCommand(command: DrawCommand): DrawCommand {
  switch (command.kind) {
    case "insert-vertex":
      return { kind: "delete-vertex", index: command.index, vertex: command.vertex };
    case "delete-vertex":
      return { kind: "insert-vertex", index: command.index, vertex: command.vertex };
    case "move-vertex":
      return {
        kind: "move-vertex",
        vertexId: command.vertexId,
        from: command.to,
        to: command.from,
      };
    case "set-vertices":
      return {
        kind: "set-vertices",
        previous: command.next,
        next: command.previous,
      };
  }
}

// ---------------------------------------------------------------------------
// Command application (pure)
// ---------------------------------------------------------------------------

/** Copy `vertices` with `replacement` at `index` (bounds-checked upstream). */
function withVertex(
  vertices: readonly DrawVertex[],
  index: number,
  replacement: DrawVertex,
): DrawVertex[] {
  const next = [...vertices];
  next[index] = replacement;
  return next;
}

function insertAt(
  vertices: readonly DrawVertex[],
  index: number,
  vertex: DrawVertex,
): DrawVertex[] {
  const next = [...vertices];
  next.splice(index, 0, vertex);
  return next;
}

function removeAt(
  vertices: readonly DrawVertex[],
  index: number,
): DrawVertex[] {
  const next = [...vertices];
  next.splice(index, 1);
  return next;
}

/**
 * Apply a command to a reconstruction. Pure: returns a NEW reconstruction
 * (with `geometryRevision` bumped) or the SAME reference when nothing
 * changed (unknown vertex, out-of-bounds index, oversized result — the
 * defensive guards; the command constructors below make these unreachable
 * from the UI).
 */
export function applyDrawCommand(
  reconstruction: Reconstruction,
  command: DrawCommand,
): Reconstruction {
  const vertices = reconstruction.vertices;
  switch (command.kind) {
    case "insert-vertex": {
      // Hard cap (and defensive index guard).
      if (vertices.length >= MAX_VERTICES) return reconstruction;
      if (command.index < 0 || command.index > vertices.length) {
        return reconstruction;
      }
      return {
        ...reconstruction,
        vertices: insertAt(vertices, command.index, command.vertex),
        geometryRevision: reconstruction.geometryRevision + 1,
      };
    }
    case "move-vertex": {
      const index = vertices.findIndex((v) => v.id === command.vertexId);
      if (index === -1) return reconstruction;
      const current = vertices[index];
      const moved: DrawVertex = {
        id: current.id,
        lat: command.to.lat,
        lon: command.to.lon,
        ...(command.to.snappedTo !== undefined
          ? { snappedTo: command.to.snappedTo }
          : {}),
      };
      return {
        ...reconstruction,
        vertices: withVertex(vertices, index, moved),
        geometryRevision: reconstruction.geometryRevision + 1,
      };
    }
    case "delete-vertex": {
      if (command.index < 0 || command.index >= vertices.length) {
        return reconstruction;
      }
      return {
        ...reconstruction,
        vertices: removeAt(vertices, command.index),
        geometryRevision: reconstruction.geometryRevision + 1,
      };
    }
    case "set-vertices": {
      if (command.next.length > MAX_VERTICES) return reconstruction;
      if (
        command.next.length === vertices.length &&
        command.next.every((v, i) => v === vertices[i])
      ) {
        return reconstruction;
      }
      return {
        ...reconstruction,
        vertices: [...command.next],
        geometryRevision: reconstruction.geometryRevision + 1,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Command constructors (validate against the current state, or return null)
// ---------------------------------------------------------------------------

/**
 * Append a vertex at the end of the path (the "click on the map" edit) —
 * an `insert-vertex` at `vertices.length` (see the union's doc).
 * Returns `null` when the hard cap is reached — the UI surfaces the cap,
 * the domain refuses the data.
 */
export function addVertexCommand(
  reconstruction: Reconstruction,
  position: VertexPosition,
  id: VertexId,
): DrawCommand | null {
  return insertVertexCommand(
    reconstruction,
    reconstruction.vertices.length,
    position,
    id,
  );
}

/**
 * Insert a vertex at `index` (the "click a midpoint handle" edit).
 * `index` is the position in the vertex list the new vertex will occupy.
 */
export function insertVertexCommand(
  reconstruction: Reconstruction,
  index: number,
  position: VertexPosition,
  id: VertexId,
): DrawCommand | null {
  if (reconstruction.vertices.length >= MAX_VERTICES) return null;
  if (index < 0 || index > reconstruction.vertices.length) return null;
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lon)) {
    return null;
  }
  return {
    kind: "insert-vertex",
    index,
    vertex: {
      id,
      lat: position.lat,
      lon: position.lon,
      ...(position.snappedTo !== undefined
        ? { snappedTo: position.snappedTo }
        : {}),
    },
  };
}

/** Move a vertex (the "drag a handle" edit), capturing `from` for undo. */
export function moveVertexCommand(
  reconstruction: Reconstruction,
  vertexId: VertexId,
  to: VertexPosition,
): DrawCommand | null {
  const current = reconstruction.vertices.find((v) => v.id === vertexId);
  if (!current) return null;
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lon)) return null;
  const from = vertexPosition(current);
  if (from.lat === to.lat && from.lon === to.lon && from.snappedTo === to.snappedTo) {
    return null; // no-op move — not a command
  }
  return { kind: "move-vertex", vertexId, from, to };
}

/** Delete a vertex by id (map double-click or panel row). */
export function deleteVertexCommand(
  reconstruction: Reconstruction,
  vertexId: VertexId,
): DrawCommand | null {
  const index = reconstruction.vertices.findIndex((v) => v.id === vertexId);
  if (index === -1) return null;
  return { kind: "delete-vertex", index, vertex: reconstruction.vertices[index] };
}

/** Clear all vertices (undo restores the full previous list). */
export function clearVerticesCommand(
  reconstruction: Reconstruction,
): DrawCommand | null {
  if (reconstruction.vertices.length === 0) return null;
  return {
    kind: "set-vertices",
    previous: reconstruction.vertices,
    next: [],
  };
}

// ---------------------------------------------------------------------------
// Command stack (pure)
// ---------------------------------------------------------------------------

/** Undo/redo stacks for the editing session of ONE gap. */
export interface DrawHistory {
  undo: readonly DrawCommand[];
  redo: readonly DrawCommand[];
}

export const EMPTY_HISTORY: DrawHistory = { undo: [], redo: [] };

/** The state the stack operates on. */
export interface DrawState {
  reconstruction: Reconstruction;
  history: DrawHistory;
}

/** Commit a command: apply, push undo, clear redo. `null` → unchanged. */
export function commitCommand(
  state: DrawState,
  command: DrawCommand | null,
): DrawState {
  if (!command) return state;
  const reconstruction = applyDrawCommand(state.reconstruction, command);
  if (reconstruction === state.reconstruction) return state;
  return {
    reconstruction,
    history: {
      undo: [...state.history.undo, command],
      redo: [],
    },
  };
}

/** Undo the most recent command (no-op on an empty undo stack). */
export function undoCommand(state: DrawState): DrawState {
  const command = state.history.undo[state.history.undo.length - 1];
  if (!command) return state;
  const inverse = invertDrawCommand(command);
  const reconstruction = applyDrawCommand(state.reconstruction, inverse);
  if (reconstruction === state.reconstruction) return state;
  return {
    reconstruction,
    history: {
      undo: state.history.undo.slice(0, -1),
      redo: [...state.history.redo, inverse],
    },
  };
}

/** Redo the most recently undone command (no-op on an empty redo stack). */
export function redoCommand(state: DrawState): DrawState {
  const inverse = state.history.redo[state.history.redo.length - 1];
  if (!inverse) return state;
  const command = invertDrawCommand(inverse);
  const reconstruction = applyDrawCommand(state.reconstruction, command);
  if (reconstruction === state.reconstruction) return state;
  return {
    reconstruction,
    history: {
      undo: [...state.history.undo, command],
      redo: state.history.redo.slice(0, -1),
    },
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers (anchors included — the path always connects them)
// ---------------------------------------------------------------------------

/**
 * Geodesic length of the reconstruction path: before-anchor → vertices →
 * after-anchor (when present — open-ended extensions have no far anchor).
 * Uses the shared geodesy module (the single distance source).
 */
export function reconstructionDistanceMeters(
  vertices: readonly DrawVertex[],
  before: LatLon,
  after?: LatLon | null,
): number {
  return polylineLengthMeters([
    before,
    ...vertices,
    ...(after ? [after] : []),
  ]);
}

/**
 * Largest absolute cross-track deviation of any vertex from the straight
 * line between the anchors, in meters (0 when there are no vertices).
 */
export function maxDeviationFromStraightLine(
  vertices: readonly DrawVertex[],
  before: LatLon,
  after: LatLon,
): number {
  let max = 0;
  for (const vertex of vertices) {
    const deviation = Math.abs(
      crossTrackDistanceMeters(vertex, before, after),
    );
    if (Number.isFinite(deviation) && deviation > max) max = deviation;
  }
  return max;
}

/**
 * The straight-line honesty warning: true when every vertex sits (almost)
 * exactly on the anchor-to-anchor straight line — the drawn "route" is then
 * indistinguishable from the implied span, which is usually a sign the user
 * has not actually traced the missing route. A *warning*, never a block.
 * Open-ended extensions (no far anchor) have no straight line to hug:
 * always false.
 */
export function isStraightLine(
  vertices: readonly DrawVertex[],
  before: LatLon,
  after?: LatLon | null,
  maxDeviationM: number = STRAIGHT_LINE_MAX_DEVIATION_M,
): boolean {
  if (vertices.length === 0) return false;
  if (!after) return false;
  return maxDeviationFromStraightLine(vertices, before, after) <= maxDeviationM;
}

// ---------------------------------------------------------------------------
// Reconstruction factory
// ---------------------------------------------------------------------------

/** A fresh, empty reconstruction for one gap. */
export function emptyReconstruction(gapId: GapId): Reconstruction {
  return {
    gapId,
    vertices: [],
    resampleSpacingM: "off",
    geometryRevision: 0,
    timeStrategy: { kind: "distance-proportional" },
  };
}

/** Distance between two vertices/anchors (convenience for tests + UI). */
export function vertexDistanceMeters(a: LatLon, b: LatLon): number {
  return geodesicDistanceMeters(a, b);
}

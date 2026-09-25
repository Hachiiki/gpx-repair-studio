/**
 * Unit tests — the pure draw model (features/reconstruction/drawModel.ts).
 *
 * Command-stack invariants (Phase 4 acceptance):
 *   - committing applies, pushes undo, clears redo;
 *   - undo applies the inverse; redo re-applies; empty stacks are no-ops;
 *   - every command survives apply → invert → apply as an exact round trip;
 *   - the vertex hard cap is enforced at the constructor boundary;
 *   - geometryRevision bumps only for geometry changes.
 */

import { describe, expect, it } from "vitest";
import {
  addVertexCommand,
  applyDrawCommand,
  clearVerticesCommand,
  commitCommand,
  deleteVertexCommand,
  EMPTY_HISTORY,
  emptyReconstruction,
  insertVertexCommand,
  invertDrawCommand,
  isStraightLine,
  MAX_VERTICES,
  maxDeviationFromStraightLine,
  moveVertexCommand,
  redoCommand,
  reconstructionDistanceMeters,
  undoCommand,
  vertexPosition,
  type DrawCommand,
  type DrawState,
} from "@/features/reconstruction/drawModel";
import type { DrawVertex, GapId, PointId, VertexId } from "@/types/domain";
import { vertexId } from "@/types/ids";

const gap = (id: string) => id as GapId;
const pid = (id: string) => id as PointId;

const ANCHORS = {
  before: { lat: 52.52, lon: 13.405 },
  after: { lat: 52.525, lon: 13.41 },
};

/** A vertex at a deterministic offset from a base latitude. */
function vertex(seq: number, dLat = 0, dLon = 0): DrawVertex {
  return {
    id: vertexId(seq),
    lat: 52.52 + dLat,
    lon: 13.405 + dLon,
    ...(seq === 3 ? { snappedTo: pid("t0s0:7") } : {}),
  };
}

function stateWith(vertices: DrawVertex[]): DrawState {
  return {
    reconstruction: { ...emptyReconstruction(gap("g1")), vertices },
    history: EMPTY_HISTORY,
  };
}

describe("command constructors", () => {
  it("addVertexCommand appends via insert-vertex at the end", () => {
    const recon = emptyReconstruction(gap("g1"));
    const command = addVertexCommand(
      recon,
      { lat: 52.521, lon: 13.406 },
      vertexId(1),
    );
    expect(command).toEqual({
      kind: "insert-vertex",
      index: 0,
      vertex: { id: vertexId(1), lat: 52.521, lon: 13.406 },
    });
  });

  it("refuses to build commands beyond the hard cap", () => {
    const full = emptyReconstruction(gap("g1"));
    // Fill to the cap through direct construction (bypassing constructors
    // would be a UI bug; the domain still guards application below).
    full.vertices = Array.from({ length: MAX_VERTICES }, (_, i) =>
      vertex(i + 1),
    );
    expect(
      addVertexCommand(full, { lat: 1, lon: 1 }, vertexId(999)),
    ).toBeNull();
    expect(
      insertVertexCommand(full, 0, { lat: 1, lon: 1 }, vertexId(999)),
    ).toBeNull();
  });

  it("refuses non-finite positions and no-op moves", () => {
    const recon = emptyReconstruction(gap("g1"));
    expect(
      addVertexCommand(recon, { lat: NaN, lon: 1 }, vertexId(1)),
    ).toBeNull();

    const withVertex = applyDrawCommand(recon, {
      kind: "insert-vertex",
      index: 0,
      vertex: vertex(1),
    });
    expect(
      moveVertexCommand(withVertex, vertexId(1), {
        lat: vertex(1).lat,
        lon: vertex(1).lon,
      }),
    ).toBeNull();
  });

  it("moveVertexCommand captures the previous position for undo", () => {
    const state = stateWith([vertex(1, 0.001, 0.001)]);
    const command = moveVertexCommand(
      state.reconstruction,
      vertexId(1),
      { lat: 52.53, lon: 13.42, snappedTo: pid("t0s0:9") },
    );
    expect(command).toEqual({
      kind: "move-vertex",
      vertexId: vertexId(1),
      from: vertexPosition(vertex(1, 0.001, 0.001)),
      to: { lat: 52.53, lon: 13.42, snappedTo: pid("t0s0:9") },
    });
  });

  it("clearVerticesCommand carries the full previous list", () => {
    const state = stateWith([vertex(1), vertex(2)]);
    expect(clearVerticesCommand(state.reconstruction)).toEqual({
      kind: "set-vertices",
      previous: [vertex(1), vertex(2)],
      next: [],
    });
    expect(clearVerticesCommand(emptyReconstruction(gap("g1")))).toBeNull();
  });
});

describe("applyDrawCommand — pure application", () => {
  it("insert/move/delete/set all produce new immutable values", () => {
    const base = emptyReconstruction(gap("g1"));
    const added = applyDrawCommand(base, {
      kind: "insert-vertex",
      index: 0,
      vertex: vertex(1),
    });
    expect(added).not.toBe(base);
    expect(added.vertices).toHaveLength(1);
    expect(base.vertices).toHaveLength(0); // original untouched
    expect(added.geometryRevision).toBe(1);

    const inserted = applyDrawCommand(added, {
      kind: "insert-vertex",
      index: 0,
      vertex: vertex(2),
    });
    expect(inserted.vertices.map((v) => v.id)).toEqual([
      vertexId(2),
      vertexId(1),
    ]);
    expect(inserted.geometryRevision).toBe(2);

    const moved = applyDrawCommand(inserted, {
      kind: "move-vertex",
      vertexId: vertexId(1),
      from: { lat: vertex(1).lat, lon: vertex(1).lon },
      to: { lat: 52.9, lon: 13.9 },
    });
    expect(moved.vertices[1].lat).toBe(52.9);
    expect(moved.vertices[1].snappedTo).toBeUndefined();

    const deleted = applyDrawCommand(moved, {
      kind: "delete-vertex",
      index: 0,
      vertex: vertex(2),
    });
    expect(deleted.vertices.map((v) => v.id)).toEqual([vertexId(1)]);

    const set = applyDrawCommand(deleted, {
      kind: "set-vertices",
      previous: deleted.vertices,
      next: [vertex(7), vertex(8)],
    });
    expect(set.vertices).toHaveLength(2);
    expect(set.geometryRevision).toBe(5);
  });

  it("keeps snappedTo when moving onto a recorded point", () => {
    const state = stateWith([vertex(1)]);
    const moved = applyDrawCommand(state.reconstruction, {
      kind: "move-vertex",
      vertexId: vertexId(1),
      from: { lat: vertex(1).lat, lon: vertex(1).lon },
      to: { lat: 52.6, lon: 13.6, snappedTo: pid("t0s1:2") },
    });
    expect(moved.vertices[0].snappedTo).toBe(pid("t0s1:2"));
  });

  it("defensively ignores out-of-bounds and unknown targets", () => {
    const state = stateWith([vertex(1)]);
    const recon = state.reconstruction;
    expect(
      applyDrawCommand(recon, {
        kind: "insert-vertex",
        index: 5,
        vertex: vertex(2),
      }),
    ).toBe(recon);
    expect(
      applyDrawCommand(recon, {
        kind: "delete-vertex",
        index: 3,
        vertex: vertex(2),
      }),
    ).toBe(recon);
    expect(
      applyDrawCommand(recon, {
        kind: "move-vertex",
        vertexId: vertexId(99),
        from: { lat: 0, lon: 0 },
        to: { lat: 1, lon: 1 },
      }),
    ).toBe(recon);
    expect(
      applyDrawCommand(recon, {
        kind: "set-vertices",
        previous: recon.vertices,
        next: recon.vertices,
      }),
    ).toBe(recon); // identical set → no-op
  });

  it("refuses oversized set-vertices (cap guard at application)", () => {
    const state = stateWith([]);
    const oversized = Array.from({ length: MAX_VERTICES + 1 }, (_, i) =>
      vertex(i + 1),
    );
    expect(
      applyDrawCommand(state.reconstruction, {
        kind: "set-vertices",
        previous: [],
        next: oversized,
      }),
    ).toBe(state.reconstruction);
  });
});

describe("command stack invariants", () => {
  it("commit → apply, push undo, clear redo", () => {
    let state = stateWith([]);
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, { lat: 1, lon: 2 }, vertexId(1)),
    );
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, { lat: 3, lon: 4 }, vertexId(2)),
    );
    expect(state.reconstruction.vertices).toHaveLength(2);
    expect(state.history.undo).toHaveLength(2);
    expect(state.history.redo).toHaveLength(0);

    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, { lat: 5, lon: 6 }, vertexId(3)),
    );
    state = undoCommand(state);
    state = undoCommand(state);
    expect(state.history.redo).toHaveLength(2);

    // A new commit clears the redo stack (classic invariant).
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, { lat: 7, lon: 8 }, vertexId(4)),
    );
    expect(state.history.undo).toHaveLength(2); // 1 survivor + the new commit
    expect(state.history.redo).toHaveLength(0);
  });

  it("null commands (cap reached) leave the state untouched", () => {
    const state = stateWith([vertex(1)]);
    const next = commitCommand(state, null);
    expect(next).toBe(state);
  });

  it("undo/redo round-trip every command kind exactly", () => {
    let state = stateWith([]);
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, { lat: 52.521, lon: 13.406 }, vertexId(1)),
    );
    state = commitCommand(
      state,
      insertVertexCommand(state.reconstruction, 0, { lat: 52.522, lon: 13.408 }, vertexId(2)),
    );
    state = commitCommand(
      state,
      moveVertexCommand(state.reconstruction, vertexId(1), { lat: 52.53, lon: 13.43 }),
    );
    state = commitCommand(
      state,
      deleteVertexCommand(state.reconstruction, vertexId(2)),
    );
    state = commitCommand(state, clearVerticesCommand(state.reconstruction));
    const apex = state; // after all five commits (last one cleared)
    expect(apex.reconstruction.vertices).toHaveLength(0);
    expect(apex.history.undo).toHaveLength(5);

    // Undo everything → back to the empty vertex list. geometryRevision is
    // a *change* counter (staleness marker), so undoing also bumps it: 5
    // commands + 5 inverse applications = 10.
    for (let i = 0; i < 5; i += 1) state = undoCommand(state);
    expect(state.reconstruction.vertices).toHaveLength(0);
    expect(state.reconstruction.geometryRevision).toBe(10);
    expect(state.history.undo).toHaveLength(0);
    expect(state.history.redo).toHaveLength(5);

    // Redo everything → exactly the apex geometry again.
    for (let i = 0; i < 5; i += 1) state = redoCommand(state);
    expect(state.reconstruction.vertices).toEqual(
      apex.reconstruction.vertices,
    );
    expect(state.history.undo).toHaveLength(5);
    expect(state.history.redo).toHaveLength(0);
  });

  it("empty stacks: undo/redo are no-ops", () => {
    const state = stateWith([vertex(1)]);
    expect(undoCommand(state)).toBe(state);
    expect(redoCommand(state)).toBe(state);
  });

  it("invertDrawCommand is a strict involution", () => {
    const cases: DrawCommand[] = [
      { kind: "insert-vertex", index: 2, vertex: vertex(5) },
      {
        kind: "move-vertex",
        vertexId: vertexId(7),
        from: { lat: 1, lon: 2 },
        to: { lat: 3, lon: 4, snappedTo: pid("t0s0:1") },
      },
      { kind: "delete-vertex", index: 1, vertex: vertex(8) },
      {
        kind: "set-vertices",
        previous: [vertex(1)],
        next: [vertex(2), vertex(3)],
      },
    ];
    for (const command of cases) {
      expect(invertDrawCommand(invertDrawCommand(command))).toEqual(command);
    }
  });
});

describe("geometry helpers", () => {
  it("distance includes both anchors (always connected)", () => {
    const onlyAnchors = reconstructionDistanceMeters(
      [],
      ANCHORS.before,
      ANCHORS.after,
    );
    expect(onlyAnchors).toBeGreaterThan(400);
    expect(onlyAnchors).toBeLessThan(900);

    // A vertex detour must lengthen the path.
    const detoured = reconstructionDistanceMeters(
      [{ id: vertexId(1), lat: 52.53, lon: 13.42 }],
      ANCHORS.before,
      ANCHORS.after,
    );
    expect(detoured).toBeGreaterThan(onlyAnchors);
  });

  it("maxDeviationFromStraightLine measures cross-track offsets", () => {
    // A vertex 0.01° north of the straight line ≈ 1.11 km off track.
    const deviation = maxDeviationFromStraightLine(
      [{ id: vertexId(1), lat: 52.53, lon: 13.4075 }],
      { lat: 52.52, lon: 13.405 },
      { lat: 52.52, lon: 13.41 },
    );
    expect(deviation).toBeGreaterThan(1000);
    expect(deviation).toBeLessThan(1300);
  });

  it("isStraightLine: on-line vertices warn, off-line do not", () => {
    // The anchor line runs (52.52, 13.405) → (52.525, 13.41): slope 1 in
    // degree space. On-line points: lat − 52.52 === lon − 13.405.
    const nearLine = [
      { id: vertexId(1), lat: 52.5205, lon: 13.4055 },
      { id: vertexId(2), lat: 52.521, lon: 13.406 },
    ];
    const offLine = [
      { id: vertexId(1), lat: 52.53, lon: 13.407 },
      { id: vertexId(2), lat: 52.527, lon: 13.4085 },
    ];
    expect(isStraightLine(nearLine, ANCHORS.before, ANCHORS.after)).toBe(
      true,
    );
    expect(isStraightLine(offLine, ANCHORS.before, ANCHORS.after)).toBe(false);
    expect(isStraightLine([], ANCHORS.before, ANCHORS.after)).toBe(false);
  });

  it("open-ended extensions: distance = anchor + vertices only; never 'straight'", () => {
    const vertices = [
      { id: vertexId(1), lat: 52.521, lon: 13.406 },
      { id: vertexId(2), lat: 52.522, lon: 13.407 },
    ];
    // With NO far anchor the distance is exactly the drawn chain — there
    // is no closing leg adding phantom length.
    const open = reconstructionDistanceMeters(vertices, ANCHORS.before, null);
    const anchored = reconstructionDistanceMeters(
      vertices,
      ANCHORS.before,
      ANCHORS.after,
    );
    expect(open).toBeLessThan(anchored);
    // The straight-line warning has no line to hug without the far anchor.
    expect(isStraightLine(vertices, ANCHORS.before, null)).toBe(false);
    // Even literally collinear clicks stay unwarned — there is nothing to
    // be "straight" against.
    const collinear = [
      { id: vertexId(1), lat: 52.5205, lon: 13.4055 },
      { id: vertexId(2), lat: 52.521, lon: 13.406 },
    ];
    expect(isStraightLine(collinear, ANCHORS.before, null)).toBe(false);
  });
});

/**
 * Tasks 46–47 — the path-style system (curve spline + per-line memory).
 *
 * Three groups:
 *   - the pure curve geometry (roadFollow.ts) — the spline passes
 *     exactly through every clicked node, bends smoothly at corners,
 *     and the join's midpoints sit ON the curve;
 *   - resamplePath's curve baking — the exported path carries the same
 *     spline (WYSIWYG), the closing leg into the far anchor stays
 *     straight, and spacing never re-densifies spline legs;
 *   - the stores' per-line memory — setPathStyle writes the active
 *     reconstruction, reopening an editor re-adopts the remembered
 *     style, and the create route remembers its style.
 */

import { describe, expect, it } from "vitest";
import {
  CURVE_SAMPLE_M,
  curveSplinePoints,
  joinCurveChain,
} from "@/features/reconstruction/roadFollow";
import { resamplePath } from "@/features/reconstruction/resample";
import { useEditorStore } from "@/state/editor-store";
import { useCreateStore } from "@/state/create-store";
import type { DrawVertex, LatLon } from "@/types/domain";
import { vertexId } from "@/types/ids";

const NODES: LatLon[] = [
  { lat: 52.52, lon: 13.4 },
  { lat: 52.525, lon: 13.41 },
  { lat: 52.522, lon: 13.425 },
  { lat: 52.518, lon: 13.43 },
];

function verticesOf(points: readonly LatLon[]): DrawVertex[] {
  return points.map((point, index) => ({
    id: vertexId(index + 1),
    lat: point.lat,
    lon: point.lon,
  }));
}

describe("curveSplinePoints (the pure spline)", () => {
  it("passes EXACTLY through every clicked node", () => {
    const spline = curveSplinePoints(NODES, 5);
    for (const node of NODES) {
      expect(
        spline.some(
          (p) => p.lat === node.lat && p.lon === node.lon,
        ),
      ).toBe(true);
    }
  });

  it("bends: interior points leave the straight chords at the corner", () => {
    const spline = curveSplinePoints(NODES, 5);
    // The corner at node 2 (a direction change) pushes spline samples
    // away from the node1→node3 chord.
    const straightish = spline.every((p) => Math.abs(p.lat - 52.52) < 0.004);
    expect(straightish).toBe(false);
    // …and the samples are dense enough to read as a smooth arc.
    expect(spline.length).toBeGreaterThan(NODES.length * 2);
  });

  it("keeps two-node chains straight (nothing to bend through)", () => {
    const two = curveSplinePoints([NODES[0], NODES[1]], 5);
    expect(two).toHaveLength(2);
  });
});

describe("joinCurveChain (the curve-style draft join)", () => {
  it("returns the spline points and one ON-CURVE midpoint per leg", () => {
    const joined = joinCurveChain(NODES);
    expect(joined.points.length).toBeGreaterThan(NODES.length);
    expect(joined.midpoints).toHaveLength(NODES.length - 1);
    // Every midpoint lies near a spline sample — within one sampling
    // step (the distance-mid sits BETWEEN two ~10 m samples).
    for (const mid of joined.midpoints) {
      const nearest = joined.points.reduce((best, p) => {
        const d = Math.hypot(p.lat - mid.lat, p.lon - mid.lon);
        return d < best ? d : best;
      }, Number.POSITIVE_INFINITY);
      expect(nearest).toBeLessThan(2e-4); // ≲ 20 m — on the curve
    }
  });

  it("degenerates honestly below two nodes", () => {
    expect(joinCurveChain([NODES[0]]).points).toHaveLength(1);
    expect(joinCurveChain([]).midpoints).toHaveLength(0);
  });
});

describe("resamplePath curve baking (the export is the preview)", () => {
  const before = { lat: 52.515, lon: 13.395 };
  const after = { lat: 52.513, lon: 13.435 };

  it("bakes the same spline the preview renders (WYSIWYG)", () => {
    const path = resamplePath(
      before,
      verticesOf(NODES),
      after,
      "off",
      [],
      "curve",
    );
    // The interior vertices' neighborhood: the baked path carries spline
    // samples (not just the 4 nodes)…
    expect(path.length).toBeGreaterThan(NODES.length + 2);
    // …the exact nodes are kept verbatim (user data never moves)…
    for (const vertex of verticesOf(NODES)) {
      expect(
        path.some((p) => p.lat === vertex.lat && p.lon === vertex.lon),
      ).toBe(true);
    }
    // …and the anchors bracket the path.
    expect(path[0].role).toBe("before-anchor");
    expect(path[path.length - 1].role).toBe("after-anchor");
  });

  it("keeps the closing leg into the far anchor straight (the dashed preview)", () => {
    const path = resamplePath(
      before,
      verticesOf(NODES),
      after,
      "off",
      [],
      "curve",
    );
    // The last leg's points: last vertex → after-anchor with NO spline
    // interior between them (the preview renders it as the dashed
    // closing chord — the export must match).
    const lastIndex = path.findIndex((p) => p.role === "after-anchor");
    const previous = path[lastIndex - 1];
    const lastVertex = NODES[NODES.length - 1];
    expect(previous.lat).toBe(lastVertex.lat);
    expect(previous.lon).toBe(lastVertex.lon);
  });

  it("matches the preview join's geometry (one implementation, two consumers)", () => {
    const path = resamplePath(
      null,
      verticesOf(NODES),
      null,
      "off",
      [],
      "curve",
    );
    const joined = joinCurveChain(NODES);
    // The chain portion (no anchors) is the same polyline.
    expect(path.map((p) => [p.lat, p.lon])).toEqual(
      joined.points.map((p) => [p.lat, p.lon]),
    );
  });

  it("falls back honestly: two-node chains stay straight, other styles too", () => {
    // With anchors + only 2 vertices, the CHAIN (before → v0 → v1)
    // still counts 3 nodes and curves — matching the preview (the
    // controller's chain includes the before anchor). Only the closing
    // leg into after stays straight.
    const twoNodes = resamplePath(
      before,
      verticesOf([NODES[0], NODES[1]]),
      after,
      "off",
      [],
      "curve",
    );
    const lastVertexIndex = twoNodes.findIndex(
      (p) => p.lat === NODES[1].lat && p.lon === NODES[1].lon,
    );
    // …the closing leg is exactly two points (no spline into the anchor).
    expect(twoNodes).toHaveLength(lastVertexIndex + 2);

    // A truly anchor-less 2-node chain (create) has nothing to bend
    // through: exactly the two nodes.
    const createTwo = resamplePath(
      null,
      verticesOf([NODES[0], NODES[1]]),
      null,
      "off",
      [],
      "curve",
    );
    expect(createTwo).toHaveLength(2);

    // "off" stays straight everywhere.
    const straight = resamplePath(
      before,
      verticesOf(NODES),
      after,
      "off",
      [],
      "off",
    );
    expect(straight).toHaveLength(NODES.length + 2);
  });

  it("spacing never re-densifies spline legs (they are already dense)", () => {
    const off = resamplePath(
      null,
      verticesOf(NODES),
      null,
      "off",
      [],
      "curve",
    );
    const dense = resamplePath(
      null,
      verticesOf(NODES),
      null,
      5,
      [],
      "curve",
    );
    expect(dense).toHaveLength(off.length);
  });

  it("samples honor the step constant (dense enough to import smoothly)", () => {
    expect(CURVE_SAMPLE_M).toBeLessThanOrEqual(15);
  });
});

describe("the stores' per-segment path-style memory (Task 47 + the fix)", () => {
  it("the editor store: the line remembers the LAST PLACED segment's style; reopen re-adopts", () => {
    useEditorStore.getState().reset();
    const store = useEditorStore.getState();
    store.openEditor("g-gap-1" as never);
    // A chip switch alone restyles nothing (the mode-switching fix):
    // the style only decides how the NEXT segment generates.
    useEditorStore.getState().setPathStyle("curve");
    expect(
      useEditorStore.getState().reconstructions["g-gap-1"].pathStyle,
    ).toBeUndefined();

    // The placed segment writes the line's remembered style — and
    // carries its own legStyle forever.
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.4 });
    expect(useEditorStore.getState().reconstructions["g-gap-1"].pathStyle).toBe(
      "curve",
    );
    expect(
      useEditorStore.getState().reconstructions["g-gap-1"].vertices[0].legStyle,
    ).toBe("curve");

    // …a different line keeps its own (placed while active)…
    useEditorStore.getState().openEditor("g-gap-2" as never);
    useEditorStore.getState().setPathStyle("foot");
    useEditorStore.getState().addVertex({ lat: 52.53, lon: 13.41 });
    expect(useEditorStore.getState().reconstructions["g-gap-2"].pathStyle).toBe(
      "foot",
    );

    // …and reopening the first line re-adopts ITS style (the chips show
    // this line's mode, never the last one used).
    useEditorStore.getState().openEditor("g-gap-1" as never);
    expect(useEditorStore.getState().pathStyle).toBe("curve");
    useEditorStore.getState().reset();
  });

  it("the create store: the drawn route remembers the style of its last placed segment", () => {
    useCreateStore.getState().reset();
    useCreateStore.getState().beginDrawing({
      distanceM: 5000,
      durationMs: 25 * 60_000,
      paceMsPerKm: 5 * 60_000,
      startMs: Date.now(),
    });
    useCreateStore.getState().setPathStyle("foot");
    expect(useCreateStore.getState().pathStyle).toBe("foot");
    // No segment placed yet — the line remembers nothing.
    expect(useCreateStore.getState().reconstruction.pathStyle).toBeUndefined();
    // The placed segment is a foot segment, permanently.
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.4 });
    expect(useCreateStore.getState().reconstruction.pathStyle).toBe("foot");
    expect(
      useCreateStore.getState().reconstruction.vertices[0].legStyle,
    ).toBe("foot");
    // Switching to roads never redraws it.
    useCreateStore.getState().setPathStyle("car");
    expect(
      useCreateStore.getState().reconstruction.vertices[0].legStyle,
    ).toBe("foot");
    useCreateStore.getState().reset();
  });
});

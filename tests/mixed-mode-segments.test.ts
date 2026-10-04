/**
 * Mixed-mode segments — the Phase 20 mode-switching fix's contract.
 *
 * The drawing mode (Roads / Footpaths / Straight) is a property of each
 * SEGMENT, decided when it is drawn and never re-derived:
 *
 *   - switching the chips must NOT clear, recalculate, or replace any
 *     placed segment — the final route is ONE continuous line composed
 *     of every segment, in draw order, each under its own geometry;
 *   - road legs are resolved per segment under the segment's own
 *     profile (car legs for road segments, foot legs for footpath
 *     segments — even for the same node pair);
 *   - distance / elevation / export all consume the SAME styled join,
 *     so the combined route is what every number measures;
 *   - legacy lines (vertices without legStyle, legs without a mode)
 *     render exactly as they did before the fix.
 *
 * Four groups: the pure styled join, the command layer's stamping, the
 * mixed path baking, and the stores' mode-switch survival.
 */

import { describe, expect, it } from "vitest";
import {
  closingLegCoordinates,
  findLeg,
  joinStyledChain,
  routableOf,
} from "@/features/reconstruction/roadFollow";
import {
  addVertexCommand,
  commitCommand,
  insertVertexCommand,
  moveVertexCommand,
  undoCommand,
  type DrawState,
} from "@/features/reconstruction/drawModel";
import { resamplePath } from "@/features/reconstruction/resample";
import { planJoin } from "@/features/plan/estimate";
import { useEditorStore } from "@/state/editor-store";
import { usePlanStore } from "@/state/plan-store";
import type { DrawVertex, LatLon, RoadLeg } from "@/types/domain";
import { vertexId } from "@/types/ids";

const BERLIN = { lat: 52.52, lon: 13.4 };
const A: LatLon = { lat: 52.52, lon: 13.4 };
const B: LatLon = { lat: 52.525, lon: 13.41 };
const C: LatLon = { lat: 52.522, lon: 13.425 };
const D: LatLon = { lat: 52.518, lon: 13.43 };

/**
 * A deterministic road leg: a→(bulge north)→b under the given mode.
 * The bulge clears both endpoints' latitudes (the test spans are ≤
 * 0.005°, the default offset 0.01°), so "the interior is north of the
 * chord" is unambiguous.
 */
function bulgeLeg(
  a: LatLon,
  b: LatLon,
  mode: "car" | "foot" | undefined,
  offsetLat = 0.01,
): RoadLeg {
  const mid = { lat: (a.lat + b.lat) / 2 + offsetLat, lon: (a.lon + b.lon) / 2 };
  return {
    a,
    b,
    coordinates: [
      [a.lon, a.lat],
      [mid.lon, mid.lat],
      [b.lon, b.lat],
    ],
    routeDistanceM: 0,
    ...(mode !== undefined ? { mode } : {}),
  };
}

function styledVertices(
  points: readonly LatLon[],
  styles: readonly (DrawVertex["legStyle"])[],
): DrawVertex[] {
  return points.map((point, index) => ({
    id: vertexId(index + 1),
    lat: point.lat,
    lon: point.lon,
    ...(styles[index] !== undefined ? { legStyle: styles[index] } : {}),
  }));
}

describe("joinStyledChain — one line, many modes", () => {
  it("renders each segment under the mode it was drawn with", () => {
    // Road → Footpath → Straight, one chain.
    const nodes = styledVertices([A, B, C, D], ["car", "car", "foot", "off"]);
    const legs = [bulgeLeg(A, B, "car"), bulgeLeg(B, C, "foot")];
    const joined = joinStyledChain(nodes, legs);

    // Node count: 4 nodes + the car leg's interior + the foot leg's
    // interior (the straight segment contributes NOTHING but its node).
    expect(joined.points).toHaveLength(4 + 1 + 1);
    // The interiors are the legs' own midpoints, verbatim: the car
    // interior sits north of the A→B chord, the foot interior north of
    // B→C, and the C→D leg has no interior at all.
    expect(joined.points[1].lat).toBeCloseTo((A.lat + B.lat) / 2 + 0.01, 10);
    expect(joined.points[3].lat).toBeCloseTo((B.lat + C.lat) / 2 + 0.01, 10);
    // One midpoint per leg, on the rendered geometry.
    expect(joined.midpoints).toHaveLength(3);
  });

  it("a straight segment stays straight even when a leg exists for its pair", () => {
    // v0's legStyle is ignored (no incoming segment); the A→B segment
    // asks with v1's — "off".
    const nodes = styledVertices([A, B], ["car", "off"]);
    // A car leg resolved for the same pair (e.g. an older road segment
    // deleted and redrawn straight) must NOT re-route the line.
    const joined = joinStyledChain(nodes, [bulgeLeg(A, B, "car")]);
    expect(joined.points).toEqual([A, B]);
  });

  it("car and foot legs for the SAME pair coexist — each style finds its own", () => {
    const carLeg = bulgeLeg(A, B, "car", 0.02);
    const footLeg = bulgeLeg(A, B, "foot", 0.0005);
    const legs = [carLeg, footLeg];
    // findLeg filters by the asking profile…
    expect(findLeg(legs, A, B, "car")).toBe(carLeg);
    expect(findLeg(legs, A, B, "foot")).toBe(footLeg);
    // …and untagged (legacy) legs match any asking profile.
    const legacy = bulgeLeg(A, B, undefined);
    expect(findLeg([legacy], A, B, "car")).toBe(legacy);
    expect(findLeg([legacy], A, B, "foot")).toBe(legacy);
    // The styled join renders the right one per segment: the car-styled
    // segment bakes the car bulge, the foot-styled one the foot bulge.
    const carJoined = joinStyledChain(styledVertices([A, B, ], [undefined, "car"]), legs);
    expect(carJoined.points[1].lat).toBeCloseTo((A.lat + B.lat) / 2 + 0.02, 10);
    const footJoined = joinStyledChain(styledVertices([A, B], [undefined, "foot"]), legs);
    expect(footJoined.points[1].lat).toBeCloseTo(
      (A.lat + B.lat) / 2 + 0.0005,
      10,
    );
  });

  it("legacy nodes (no legStyle) keep the pre-fix whole-line behavior", () => {
    // A restored pre-fix line: unstyled vertices, untagged legs — the
    // road geometry applies exactly as it always did.
    const nodes = styledVertices([A, B], [undefined, undefined]);
    const joined = joinStyledChain(nodes, [bulgeLeg(A, B, undefined)]);
    expect(joined.points).toHaveLength(3);
    // The line-style fallback governs curve baking for legacy nodes.
    const curved = joinStyledChain(
      styledVertices([A, B, C], [undefined, undefined, undefined]),
      [],
      "curve",
    );
    expect(curved.points.length).toBeGreaterThan(3);
  });

  it("the closing join asks under the asking style's profile", () => {
    const leg = bulgeLeg(C, D, "car");
    const legs = [leg];
    // A car-styled closing finds its road geometry…
    expect(closingLegCoordinates(C, D, legs, "car")).toHaveLength(3);
    // …a straight closing stays the chord when nothing matches its pair.
    expect(closingLegCoordinates(A, B, legs, "off")).toHaveLength(2);
    // …and an untagged (legacy / preview) leg matches any asking style.
    const legacy = bulgeLeg(C, D, undefined);
    expect(closingLegCoordinates(C, D, [legacy], "foot")).toHaveLength(3);
  });

  it("routableOf separates routable profiles from local styles", () => {
    expect(routableOf("car")).toBe("car");
    expect(routableOf("foot")).toBe("foot");
    expect(routableOf("off")).toBeNull();
    expect(routableOf("curve")).toBeNull();
  });
});

describe("the command layer — styles are stamped at draw time", () => {
  function emptyChain() {
    return {
      gapId: "g-test" as never,
      vertices: [] as DrawVertex[],
      resampleSpacingM: "off" as const,
      geometryRevision: 0,
      timeStrategy: { kind: "distance-proportional" as const },
    };
  }

  it("addVertex stamps the chip state as the new segment's legStyle", () => {
    const command = addVertexCommand(emptyChain(), B, vertexId(1), "car");
    expect(command?.kind).toBe("insert-vertex");
    if (command?.kind !== "insert-vertex") return;
    expect(command.vertex.legStyle).toBe("car");
  });

  it("a mid-list insert INHERITS the split leg's style; an append takes the chip's", () => {
    let state: DrawState = {
      reconstruction: emptyChain(),
      history: { undo: [], redo: [] },
    };
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, A, vertexId(1), "car"),
    );
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, C, vertexId(2), "foot"),
    );
    // Insert between A and C while the chip says "off": the split halves
    // of the foot leg stay foot.
    state = commitCommand(
      state,
      insertVertexCommand(state.reconstruction, 1, B, vertexId(3), "off"),
    );
    expect(
      state.reconstruction.vertices.map((v) => v.legStyle),
    ).toEqual(["car", "foot", "foot"]);
    // An append while the chip says "off" creates an "off" segment.
    state = commitCommand(
      state,
      insertVertexCommand(state.reconstruction, 3, D, vertexId(4), "off"),
    );
    expect(state.reconstruction.vertices[3].legStyle).toBe("off");
  });

  it("a moved vertex KEEPS its segment's style (drags re-route under it)", () => {
    let state: DrawState = {
      reconstruction: emptyChain(),
      history: { undo: [], redo: [] },
    };
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, A, vertexId(1), "car"),
    );
    state = commitCommand(
      state,
      addVertexCommand(state.reconstruction, B, vertexId(2), "car"),
    );
    const moved = moveVertexCommand(
      state.reconstruction,
      vertexId(2),
      { lat: 52.53, lon: 13.42 },
    );
    state = commitCommand(state, moved);
    expect(state.reconstruction.vertices[1].legStyle).toBe("car");
    // …and the style survives the undo/redo round trip.
    state = undoCommand(state);
    expect(state.reconstruction.vertices[1].lat).toBe(B.lat);
    expect(state.reconstruction.vertices[1].legStyle).toBe("car");
  });
});

describe("resamplePath + planJoin — the combined route bakes per segment", () => {
  it("one path: road interior + spline interior + straight chord", () => {
    // A(road)→B(road)→C(foot)→D(straight), plus a curve leg elsewhere.
    const vertices = styledVertices([A, B, C, D], ["car", "car", "foot", "off"]);
    const legs = [bulgeLeg(A, B, "car", 0.012), bulgeLeg(B, C, "foot", 0.011)];
    const path = resamplePath(null, vertices, null, "off", legs, "off");

    // Roles: the car leg contributes a road point, the foot leg a road
    // point, the straight leg nothing.
    expect(path.filter((p) => p.role === "road")).toHaveLength(2);
    // Every exact vertex is kept verbatim.
    for (const vertex of vertices) {
      expect(path.some((p) => p.lat === vertex.lat && p.lon === vertex.lon)).toBe(
        true,
      );
    }
    // The road interiors are the legs' own midpoints (north of both
    // endpoints — the offsets clear the spans).
    const roadPoints = path.filter((p) => p.role === "road");
    expect(roadPoints[0].lat).toBeCloseTo((A.lat + B.lat) / 2 + 0.012, 10);
    expect(roadPoints[1].lat).toBeCloseTo((B.lat + C.lat) / 2 + 0.011, 10);
  });

  it("the closing leg follows the LAST vertex's style", () => {
    const before = { lat: 52.515, lon: 13.395 };
    const after = D;
    // The line ends in a foot segment — the closing join asks as foot.
    const vertices = styledVertices([A, B, C], ["car", "car", "foot"]);
    const legs = [
      bulgeLeg(A, B, "car"),
      bulgeLeg(B, C, "foot"),
      bulgeLeg(C, D, "foot", 0.013),
    ];
    const path = resamplePath(before, vertices, after, "off", legs, "car");
    const closing = path[path.length - 1];
    expect(closing.role).toBe("after-anchor");
    // The closing road interior (the foot leg's bulge) is baked.
    const prev = path[path.length - 2];
    expect(prev.role).toBe("road");
    expect(prev.lat).toBeCloseTo((C.lat + D.lat) / 2 + 0.013, 10);
  });

  it("planJoin measures the combined mixed-mode route", () => {
    const vertices = styledVertices([A, B, C], ["car", "car", "off"]);
    const carLeg = bulgeLeg(A, B, "car", 0.02);
    const join = planJoin(vertices, [carLeg], "off");
    // The rendered join carries the road interior (4 points)…
    expect(join.points).toHaveLength(4);
    // …and the distance includes the detour north (greater than the
    // straight A→B→C chain).
    const straightOnly = planJoin(vertices, [], "off");
    expect(join.distanceM).toBeGreaterThan(straightOnly.distanceM);
  });

  it("legacy lines bake exactly as before the fix", () => {
    const vertices = styledVertices([A, B], [undefined, undefined]);
    const leg = bulgeLeg(A, B, undefined);
    // Pre-fix call shape: legs + whole-line style, unstyled vertices.
    const path = resamplePath(null, vertices, null, "off", [leg], "off");
    expect(path.filter((p) => p.role === "road")).toHaveLength(1);
  });
});

describe("the stores — switching modes never touches placed segments", () => {
  it("the editor store: Road → Foot → Straight → Road, one continuous history", () => {
    useEditorStore.getState().reset();
    useEditorStore.getState().openEditor("g-mixed" as never);
    const store = useEditorStore.getState();

    // 1. Road mode: two clicks = one road segment (anchor→v0, v0→v1).
    useEditorStore.getState().setPathStyle("car");
    useEditorStore.getState().addVertex({ ...A });
    useEditorStore.getState().addVertex({ ...B });

    // 2. Foot mode: another segment.
    useEditorStore.getState().setPathStyle("foot");
    useEditorStore.getState().addVertex({ ...C });

    // 3. Straight mode: another.
    useEditorStore.getState().setPathStyle("off");
    useEditorStore.getState().addVertex({ ...D });

    // 4. Back to Road — and keep drawing.
    useEditorStore.getState().setPathStyle("car");
    useEditorStore.getState().addVertex({ lat: 52.514, lon: 13.435 });

    const state = useEditorStore.getState();
    const vertices = state.reconstructions["g-mixed"].vertices;
    // Every segment kept the style it was drawn with, in draw order.
    expect(vertices.map((v) => v.legStyle)).toEqual([
      "car",
      "car",
      "foot",
      "off",
      "car",
    ]);
    // Nothing was cleared, reset, or recalculated: the count is exactly
    // the clicks placed, and the undo stack spans them all.
    expect(vertices).toHaveLength(5);
    expect(state.history.undo).toHaveLength(5);
    // The line's remembered style = the LAST placed segment's.
    expect(state.reconstructions["g-mixed"].pathStyle).toBe("car");

    // The side table can hold legs for BOTH profiles at once — each
    // renders for its own segments (the styled join above).
    useEditorStore.getState().setRoadLegs("g-mixed" as never, [
      bulgeLeg(A, B, "car"),
      bulgeLeg(B, C, "foot"),
    ]);
    const path = resamplePath(
      null,
      useEditorStore.getState().reconstructions["g-mixed"].vertices,
      null,
      "off",
      useEditorStore.getState().roadLegs["g-mixed"],
      "car",
    );
    expect(path.filter((p) => p.role === "road")).toHaveLength(2);
    useEditorStore.getState().reset();
  });

  it("the plan store: a mixed route survives arbitrary chip switches", () => {
    usePlanStore.getState().reset();
    usePlanStore.getState().beginPlanning();

    const seq: DrawVertex["legStyle"][] = ["car", "foot", "off", "car", "off"];
    let i = 0;
    const click = () => {
      const style = seq[i];
      usePlanStore.getState().setPathStyle(style!);
      usePlanStore
        .getState()
        .addVertex({ lat: 52.52 + i * 0.001, lon: 13.4 + i * 0.001 });
      i += 1;
    };
    for (let k = 0; k < seq.length; k += 1) click();

    // Redundant switches after the fact — pure settings, no data impact.
    usePlanStore.getState().setPathStyle("foot");
    usePlanStore.getState().setPathStyle("off");
    usePlanStore.getState().setPathStyle("car");

    const state = usePlanStore.getState();
    expect(state.reconstruction.vertices.map((v) => v.legStyle)).toEqual(seq);
    expect(state.history.undo).toHaveLength(seq.length);
    expect(state.reconstruction.pathStyle).toBe("off"); // the last placed
    usePlanStore.getState().reset();
  });

  it("undo walks the mixed line back one segment at a time, styles intact", () => {
    usePlanStore.getState().reset();
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().setPathStyle("car");
    usePlanStore.getState().addVertex({ ...A });
    usePlanStore.getState().setPathStyle("off");
    usePlanStore.getState().addVertex({ ...B });
    usePlanStore.getState().undo();
    const state = usePlanStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(1);
    expect(state.reconstruction.vertices[0].legStyle).toBe("car");
    usePlanStore.getState().reset();
  });

  it(BERLIN ? "restored legacy sessions keep their whole-line rendering" : "", () => {
    // A pre-fix session: vertices carry no legStyle, the line remembers
    // "foot", the legs are untagged. The styled join + resample must
    // render it exactly as the pre-fix code did.
    const legacy = styledVertices([A, B, C], [undefined, undefined, undefined]);
    const legs = [bulgeLeg(A, B, undefined), bulgeLeg(B, C, undefined)];
    const join = joinStyledChain(legacy, legs, "foot");
    expect(join.points).toHaveLength(5); // both road interiors applied
    const path = resamplePath(null, legacy, null, "off", legs, "foot");
    expect(path.filter((p) => p.role === "road")).toHaveLength(2);
  });
});

/**
 * Unit tests — the plan store (state/plan-store.ts).
 *
 * The "plan a route" section's state contract:
 *   - the lifecycle is exactly idle ⇄ studio (beginPlanning enters in
 *     draw mode; reset clears everything and bumps the session token);
 *   - vertex edits run through the SAME drawModel commands as every
 *     other editor store (undo/redo/clear, one undo per stroke, the
 *     vertex cap, the off→curve flip);
 *   - the planned time is a transient setting (never undoable, never
 *     history-touching);
 *   - there is NO export/share state anywhere in the store — the
 *     section's defining contract.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { usePlanStore } from "@/state/plan-store";
import { PLAN_ROUTE_ID } from "@/features/plan/estimate";
import { vertexId } from "@/types/ids";

beforeEach(() => {
  usePlanStore.getState().reset();
});

describe("lifecycle", () => {
  it("starts idle with an empty route and no planned time", () => {
    const state = usePlanStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.reconstruction.vertices).toHaveLength(0);
    expect(state.plannedTimeMs).toBeNull();
  });

  it("beginPlanning enters the studio ready to click", () => {
    usePlanStore.getState().setPointerMode("pan");
    usePlanStore.getState().beginPlanning();
    const state = usePlanStore.getState();
    expect(state.phase).toBe("studio");
    expect(state.pointerMode).toBe("draw");
  });

  it("reset clears the route, the time, and bumps the session token", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    usePlanStore.getState().setPlannedTime(1_800_000);
    const before = usePlanStore.getState().sessionSeq;

    usePlanStore.getState().reset();
    const state = usePlanStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.reconstruction.vertices).toHaveLength(0);
    expect(state.reconstruction.gapId).toBe(PLAN_ROUTE_ID);
    expect(state.plannedTimeMs).toBeNull();
    expect(state.sessionSeq).toBeGreaterThan(before);
    // A different session's elevation record can never be inherited.
    expect(state.history.undo).toHaveLength(0);
  });

  it("has no view, share, or export state of any kind", () => {
    const state = usePlanStore.getState() as unknown as Record<string, unknown>;
    for (const key of Object.keys(state)) {
      expect(key).not.toMatch(/share|export|download|view/i);
    }
  });
});

describe("planned time — the pace calculator's input", () => {
  it("stores the entered time and never touches history", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    const revision = usePlanStore.getState().reconstruction.geometryRevision;

    usePlanStore.getState().setPlannedTime(2_400_000);
    const state = usePlanStore.getState();
    expect(state.plannedTimeMs).toBe(2_400_000);
    expect(state.reconstruction.geometryRevision).toBe(revision);
    expect(state.history.undo).toHaveLength(1); // only the vertex add

    usePlanStore.getState().setPlannedTime(null);
    expect(usePlanStore.getState().plannedTimeMs).toBeNull();
  });
});

describe("vertex edits — the shared drawModel commands", () => {
  it("adds, moves, deletes, and undoes each", () => {
    usePlanStore.getState().beginPlanning();
    const store = usePlanStore.getState();

    store.addVertex({ lat: 52.52, lon: 13.405 });
    store.addVertex({ lat: 52.53, lon: 13.405 });
    let state = usePlanStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(2);
    expect(state.reconstruction.vertices[0].id).toBe(vertexId(1));
    expect(state.reconstruction.vertices[1].id).toBe(vertexId(2));
    expect(state.history.undo).toHaveLength(2);

    const second = state.reconstruction.vertices[1].id;
    usePlanStore.getState().moveVertex(second, { lat: 52.54, lon: 13.41 });
    state = usePlanStore.getState();
    expect(state.reconstruction.vertices[1]).toMatchObject({
      lat: 52.54,
      lon: 13.41,
    });
    expect(state.history.undo).toHaveLength(3);

    usePlanStore.getState().undo();
    expect(usePlanStore.getState().reconstruction.vertices[1]).toMatchObject({
      lat: 52.53,
      lon: 13.405,
    });
    usePlanStore.getState().redo();
    expect(usePlanStore.getState().reconstruction.vertices[1]).toMatchObject({
      lat: 52.54,
      lon: 13.41,
    });

    usePlanStore.getState().deleteVertex(second);
    expect(usePlanStore.getState().reconstruction.vertices).toHaveLength(1);
  });

  it("clears everything in one command", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    usePlanStore.getState().addVertex({ lat: 52.53, lon: 13.405 });

    usePlanStore.getState().clearVertices();
    expect(usePlanStore.getState().reconstruction.vertices).toHaveLength(0);

    usePlanStore.getState().undo();
    expect(usePlanStore.getState().reconstruction.vertices).toHaveLength(2);
  });
});

describe("commitStroke — the Curve pen's command (user pass 48)", () => {
  const STROKE = [
    { lat: 52.52, lon: 13.405 },
    { lat: 52.5225, lon: 13.4075 },
    { lat: 52.525, lon: 13.41 },
    { lat: 52.5275, lon: 13.4125 },
    { lat: 52.53, lon: 13.415 },
  ];

  it("commits the stroke as ONE undo step", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().addVertex({ lat: 52.51, lon: 13.4 });

    usePlanStore.getState().commitStroke(STROKE);
    const state = usePlanStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(6);
    expect(state.history.undo).toHaveLength(2); // the click + the stroke

    usePlanStore.getState().undo();
    expect(usePlanStore.getState().reconstruction.vertices).toHaveLength(1);
  });

  it("flips a local straight route to the curve style, keeps routed ones", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().setPathStyle("off");
    usePlanStore.getState().commitStroke(STROKE);
    expect(usePlanStore.getState().pathStyle).toBe("curve");
    expect(usePlanStore.getState().reconstruction.pathStyle).toBe("curve");

    usePlanStore.getState().reset();
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().setPathStyle("car");
    usePlanStore.getState().commitStroke(STROKE);
    expect(usePlanStore.getState().pathStyle).toBe("car");
  });

  it("refuses to commit outside the studio or when the cap leaves no budget", () => {
    usePlanStore.getState().commitStroke(STROKE);
    expect(usePlanStore.getState().reconstruction.vertices).toHaveLength(0);

    // At the vertex cap the budget is gone — the stroke is refused.
    usePlanStore.getState().beginPlanning();
    for (let i = 0; i < 128; i += 1) {
      usePlanStore.getState().addVertex({ lat: 52.5 + i / 10_000, lon: 13.4 });
    }
    const atCap = usePlanStore.getState().reconstruction.vertices.length;
    usePlanStore.getState().commitStroke(STROKE);
    expect(usePlanStore.getState().reconstruction.vertices).toHaveLength(atCap);
    expect(usePlanStore.getState().history.undo).toHaveLength(atCap);
  });
});

describe("settings — never undoable (§D-3.5)", () => {
  it("path style, pen, and pointer mode leave history alone", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    const undoDepth = () => usePlanStore.getState().history.undo.length;

    const before = undoDepth();
    usePlanStore.getState().setPathStyle("foot");
    usePlanStore.getState().setPenMode("curve");
    usePlanStore.getState().setPointerMode("move");
    expect(undoDepth()).toBe(before);
    expect(usePlanStore.getState().pathStyle).toBe("foot");
    expect(usePlanStore.getState().pen).toBe("curve");
    expect(usePlanStore.getState().pointerMode).toBe("move");
  });

  it("the route remembers its own path style", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().setPathStyle("foot");
    expect(usePlanStore.getState().reconstruction.pathStyle).toBe("foot");

    // A no-op restyle changes nothing.
    usePlanStore.getState().setPathStyle("foot");
    expect(usePlanStore.getState().reconstruction.pathStyle).toBe("foot");
  });

  it("replaces road legs without churn when unchanged", () => {
    usePlanStore.getState().beginPlanning();
    usePlanStore.getState().setRoadLegs([]);
    const legs = [
      {
        a: { lat: 52.52, lon: 13.405 },
        b: { lat: 52.53, lon: 13.405 },
        coordinates: [
          [13.405, 52.52],
          [13.405, 52.53],
        ] as [number, number][],
        routeDistanceM: 1112,
      },
    ];
    usePlanStore.getState().setRoadLegs(legs);
    const first = usePlanStore.getState().roadLegs;
    usePlanStore.getState().setRoadLegs([...legs]);
    expect(usePlanStore.getState().roadLegs).toBe(first);
  });
});

/**
 * Unit tests — the create store (state/create-store.ts).
 *
 * The "create from activity stats" workflow's state contract:
 *   - phases advance form → draw → review and retreat review → draw /
 *     draw → form, with the statistics and route surviving retreats;
 *   - finishRoute refuses below the two-vertex minimum;
 *   - vertex edits run through the SAME drawModel commands as the repair
 *     and recovery stores (undo/redo/clear included);
 *   - reset returns to a pristine form;
 *   - settings (spacing, road-follow, match toggle) never touch history.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CREATE_SPACING_M,
  useCreateStore,
} from "@/state/create-store";
import { CREATE_ROUTE_ID } from "@/features/create/track";
import { vertexId } from "@/types/ids";

const STATS = {
  distanceM: 5230,
  durationMs: 1_955_000,
  paceMsPerKm: 374_000,
  startMs: Date.UTC(2026, 8, 20, 5, 30),
};

beforeEach(() => {
  useCreateStore.getState().reset();
});

describe("phase lifecycle", () => {
  it("starts on the form with no statistics", () => {
    const state = useCreateStore.getState();
    expect(state.phase).toBe("form");
    expect(state.stats).toBeNull();
    expect(state.reconstruction.vertices).toHaveLength(0);
  });

  it("beginDrawing confirms the statistics and enters the drawing phase in draw mode", () => {
    useCreateStore.getState().beginDrawing(STATS);
    const state = useCreateStore.getState();
    expect(state.phase).toBe("draw");
    expect(state.stats).toEqual(STATS);
    expect(state.drawMode).toBe(true);
  });

  it("finishRoute refuses below two vertices and advances past them", () => {
    useCreateStore.getState().beginDrawing(STATS);

    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    expect(useCreateStore.getState().phase).toBe("draw");

    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    expect(useCreateStore.getState().phase).toBe("review");
    expect(useCreateStore.getState().drawMode).toBe(false);
  });

  it("editRoute returns to the drawing phase and backToForm keeps everything", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    expect(useCreateStore.getState().phase).toBe("review");

    useCreateStore.getState().editRoute();
    expect(useCreateStore.getState().phase).toBe("draw");
    expect(useCreateStore.getState().drawMode).toBe(true);

    useCreateStore.getState().backToForm();
    const state = useCreateStore.getState();
    expect(state.phase).toBe("form");
    // The statistics and the drawn route survive a retreat to the form.
    expect(state.stats).toEqual(STATS);
    expect(state.reconstruction.vertices).toHaveLength(2);
  });

  it("reset returns to a pristine form", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().setRoadFollow("foot");
    useCreateStore.getState().reset();

    const state = useCreateStore.getState();
    expect(state.phase).toBe("form");
    expect(state.stats).toBeNull();
    expect(state.reconstruction.vertices).toHaveLength(0);
    expect(state.roadFollow).toBe("car");
    expect(state.spacingM).toBe(DEFAULT_CREATE_SPACING_M);
    expect(state.history.undo).toHaveLength(0);
  });
});

describe("vertex commands (the shared drawModel machinery)", () => {
  it("adds, moves, deletes vertices with undo and redo", () => {
    useCreateStore.getState().beginDrawing(STATS);
    const store = useCreateStore.getState();

    store.addVertex({ lat: 52.52, lon: 13.405 });
    store.addVertex({ lat: 52.53, lon: 13.405 });
    store.addVertex({ lat: 52.54, lon: 13.405 });
    expect(useCreateStore.getState().reconstruction.vertices).toHaveLength(3);

    const second = useCreateStore.getState().reconstruction.vertices[1];
    useCreateStore.getState().moveVertex(second.id, { lat: 52.535, lon: 13.406 });
    expect(
      useCreateStore.getState().reconstruction.vertices[1].lat,
    ).toBeCloseTo(52.535, 9);

    useCreateStore.getState().undo();
    expect(
      useCreateStore.getState().reconstruction.vertices[1].lat,
    ).toBeCloseTo(52.53, 9);
    useCreateStore.getState().redo();
    expect(
      useCreateStore.getState().reconstruction.vertices[1].lat,
    ).toBeCloseTo(52.535, 9);

    useCreateStore.getState().deleteVertex(second.id);
    expect(useCreateStore.getState().reconstruction.vertices).toHaveLength(2);
    useCreateStore.getState().undo();
    expect(useCreateStore.getState().reconstruction.vertices).toHaveLength(3);

    useCreateStore.getState().clearVertices();
    expect(useCreateStore.getState().reconstruction.vertices).toHaveLength(0);
    useCreateStore.getState().undo();
    expect(useCreateStore.getState().reconstruction.vertices).toHaveLength(3);
  });

  it("allocates vertex ids monotonically (never reused within a session)", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().undo();
    useCreateStore.getState().addVertex({ lat: 52.54, lon: 13.405 });
    const ids = useCreateStore
      .getState()
      .reconstruction.vertices.map((v) => v.id);
    expect(ids).toEqual([vertexId(1), vertexId(3)]);
  });

  it("carries the create pseudo-gap id", () => {
    expect(useCreateStore.getState().reconstruction.gapId).toBe(
      CREATE_ROUTE_ID,
    );
  });
});

describe("settings (never undoable)", () => {
  it("changes spacing, road-follow, and the match toggle without history", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });

    useCreateStore.getState().setSpacing(50);
    useCreateStore.getState().setRoadFollow("foot");
    useCreateStore.getState().setMatchDistance(false);

    const state = useCreateStore.getState();
    expect(state.spacingM).toBe(50);
    expect(state.reconstruction.resampleSpacingM).toBe(50);
    expect(state.roadFollow).toBe("foot");
    expect(state.matchDistance).toBe(false);
    expect(state.history.undo).toHaveLength(1); // only the addVertex
  });
});

describe("road-follow side table", () => {
  it("replaces resolved legs and ignores unchanged writes", () => {
    const leg = {
      a: { lat: 52.52, lon: 13.405 },
      b: { lat: 52.53, lon: 13.405 },
      coordinates: [
        [13.405, 52.52],
        [13.405, 52.53],
      ] as [number, number][],
      routeDistanceM: 1112,
    };
    useCreateStore.getState().setRoadLegs([leg]);
    expect(useCreateStore.getState().roadLegs).toEqual([leg]);
    // An identical write is a no-op (referential stability for the
    // memoized joins downstream).
    const before = useCreateStore.getState().roadLegs;
    useCreateStore.getState().setRoadLegs([leg]);
    expect(useCreateStore.getState().roadLegs).toBe(before);
  });
});

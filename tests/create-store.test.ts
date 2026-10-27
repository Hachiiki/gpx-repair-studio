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
import { DEFAULT_CREATE_SPACING_M, useCreateStore } from "@/state/create-store";
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
  it("starts on the form with no statistics and the drawn-distance basis", () => {
    const state = useCreateStore.getState();
    expect(state.phase).toBe("form");
    expect(state.stats).toBeNull();
    expect(state.reconstruction.vertices).toHaveLength(0);
    // The drawn geometry is the file's distance by default — the watch's
    // number is the explicit escape hatch, not the starting point.
    expect(state.matchDistance).toBe(false);
  });

  it("beginDrawing confirms the statistics and enters the drawing phase in draw mode", () => {
    useCreateStore.getState().beginDrawing(STATS);
    const state = useCreateStore.getState();
    expect(state.phase).toBe("draw");
    expect(state.stats).toEqual(STATS);
    expect(state.pointerMode).toBe("draw");
  });

  it("finishRoute refuses below two vertices and advances past them", () => {
    useCreateStore.getState().beginDrawing(STATS);

    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    expect(useCreateStore.getState().phase).toBe("draw");

    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    expect(useCreateStore.getState().phase).toBe("review");
    expect(useCreateStore.getState().pointerMode).toBe("pan");
  });

  it("editRoute returns to the drawing phase and backToForm keeps everything", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    expect(useCreateStore.getState().phase).toBe("review");

    useCreateStore.getState().editRoute();
    expect(useCreateStore.getState().phase).toBe("draw");
    expect(useCreateStore.getState().pointerMode).toBe("draw");

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
    useCreateStore.getState().setPathStyle("foot");
    useCreateStore.getState().reset();

    const state = useCreateStore.getState();
    expect(state.phase).toBe("form");
    expect(state.stats).toBeNull();
    expect(state.reconstruction.vertices).toHaveLength(0);
    expect(state.pathStyle).toBe("car");
    expect(state.spacingM).toBe(DEFAULT_CREATE_SPACING_M);
    expect(state.history.undo).toHaveLength(0);
  });

  it("reset advances the session token (elevation never inherits across activities)", () => {
    const before = useCreateStore.getState().sessionSeq;
    useCreateStore.getState().reset();
    expect(useCreateStore.getState().sessionSeq).toBe(before + 1);
    // Back-to-statistics retreats keep the token — same route, same session.
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().backToForm();
    useCreateStore.getState().beginDrawing(STATS);
    expect(useCreateStore.getState().sessionSeq).toBe(before + 1);
  });
});

describe("view + share dialog (the in-section share flow)", () => {
  function reachReview() {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    expect(useCreateStore.getState().phase).toBe("review");
  }

  it("starts in the studio view and switches to share and back", () => {
    expect(useCreateStore.getState().view).toBe("studio");
    reachReview();

    useCreateStore.getState().setView("share");
    expect(useCreateStore.getState().view).toBe("share");
    // The share dialog can't open from inside the share view.
    useCreateStore.getState().openShareDialog();
    expect(useCreateStore.getState().shareDialogOpen).toBe(false);

    useCreateStore.getState().setView("studio");
    expect(useCreateStore.getState().view).toBe("studio");
  });

  it("opens the share dialog only from the review phase, closes freely", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().openShareDialog();
    expect(useCreateStore.getState().shareDialogOpen).toBe(false); // draw phase

    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().finishRoute();

    useCreateStore.getState().openShareDialog();
    expect(useCreateStore.getState().shareDialogOpen).toBe(true);
    useCreateStore.getState().closeShareDialog();
    expect(useCreateStore.getState().shareDialogOpen).toBe(false);
  });

  it("leaving the review (edit/form/reset) always returns to the studio view", () => {
    reachReview();
    useCreateStore.getState().setView("share");

    useCreateStore.getState().editRoute();
    expect(useCreateStore.getState().view).toBe("studio");

    useCreateStore.getState().finishRoute();
    useCreateStore.getState().setView("share");
    useCreateStore.getState().backToForm();
    expect(useCreateStore.getState().view).toBe("studio");

    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
    useCreateStore.getState().finishRoute();
    useCreateStore.getState().openShareDialog();
    useCreateStore.getState().reset();
    const state = useCreateStore.getState();
    expect(state.view).toBe("studio");
    expect(state.shareDialogOpen).toBe(false);
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
    useCreateStore
      .getState()
      .moveVertex(second.id, { lat: 52.535, lon: 13.406 });
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

describe("commitStroke — the Curve pen's command (user pass 48)", () => {
  const STROKE = [
    { lat: 52.52, lon: 13.405 },
    { lat: 52.5205, lon: 13.4058 },
    { lat: 52.5212, lon: 13.4064 },
  ];

  it("appends one stroke as ONE undo step and smooths a local route", () => {
    useCreateStore.getState().beginDrawing(STATS);
    const store = useCreateStore.getState();
    store.setPathStyle("off");
    store.addVertex({ lat: 52.51, lon: 13.4 });

    store.commitStroke(STROKE);
    let state = useCreateStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(1 + STROKE.length);
    expect(state.history.undo).toHaveLength(2); // the click + the stroke
    expect(state.reconstruction.pathStyle).toBe("curve"); // smoothed locally

    useCreateStore.getState().undo();
    state = useCreateStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(1);
    useCreateStore.getState().redo();
    expect(
      useCreateStore.getState().reconstruction.vertices,
    ).toHaveLength(1 + STROKE.length);
  });

  it("keeps a routed route routed (the stroke is waypoints)", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().setPathStyle("car");
    useCreateStore.getState().commitStroke(STROKE);

    const state = useCreateStore.getState();
    expect(state.reconstruction.pathStyle).toBe("car");
    expect(state.reconstruction.vertices).toHaveLength(STROKE.length);
  });

  it("does nothing outside the drawing phase", () => {
    useCreateStore.getState().reset();
    useCreateStore.getState().commitStroke(STROKE);
    const state = useCreateStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(0);
    expect(state.history.undo).toHaveLength(0);
  });
});

describe("settings (never undoable)", () => {
  it("changes spacing, road-follow, and the match toggle without history", () => {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });

    useCreateStore.getState().setSpacing(50);
    useCreateStore.getState().setPathStyle("foot");
    useCreateStore.getState().setMatchDistance(true);

    const state = useCreateStore.getState();
    expect(state.spacingM).toBe(50);
    expect(state.reconstruction.resampleSpacingM).toBe(50);
    expect(state.pathStyle).toBe("foot");
    expect(state.matchDistance).toBe(true);
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

// ---------------------------------------------------------------------------
// Selection + clipboard (Task 72: repeat a loop)
// ---------------------------------------------------------------------------

describe("selection + clipboard (Task 72)", () => {
  /** Begin drawing and place a small closed loop (4 points). */
  function drawLoop() {
    useCreateStore.getState().beginDrawing(STATS);
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useCreateStore.getState().addVertex({ lat: 52.521, lon: 13.406 });
    useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.407 });
    useCreateStore.getState().addVertex({ lat: 52.519, lon: 13.406 });
  }

  it("toggles, ranges, selects all, and clears; unknown ids are refused", () => {
    drawLoop();
    const store = useCreateStore.getState();
    store.toggleVertexSelection(vertexId(1));
    expect(useCreateStore.getState().selection.has(vertexId(1))).toBe(true);
    store.toggleVertexSelection(vertexId(1));
    expect(useCreateStore.getState().selection.size).toBe(0);

    // Range either way round selects the inclusive span.
    useCreateStore.getState().selectVertexRange(vertexId(3), vertexId(1));
    let selection = useCreateStore.getState().selection;
    expect([...selection].sort()).toEqual(["v1", "v2", "v3"]);
    useCreateStore.getState().clearSelection();
    useCreateStore.getState().selectVertexRange(vertexId(2), vertexId(4));
    selection = useCreateStore.getState().selection;
    expect([...selection].sort()).toEqual(["v2", "v3", "v4"]);

    useCreateStore.getState().selectAllVertices();
    expect(useCreateStore.getState().selection.size).toBe(4);
    useCreateStore.getState().clearSelection();
    expect(useCreateStore.getState().selection.size).toBe(0);

    // A stale id (an undone vertex, a foreign map feature) never enters.
    useCreateStore.getState().toggleVertexSelection(vertexId(999));
    expect(useCreateStore.getState().selection.size).toBe(0);
  });

  it("copy keeps the selection and stores the fragment in route order", () => {
    drawLoop();
    // Select "backwards" — the copy still follows the chain.
    useCreateStore.getState().toggleVertexSelection(vertexId(3));
    useCreateStore.getState().toggleVertexSelection(vertexId(1));
    useCreateStore.getState().copySelection();
    const clipboard = useCreateStore.getState().clipboard;
    expect(clipboard.map((p) => p.lat)).toEqual([52.52, 52.52]);
    // The selection survives the copy (repeat pastes stay one keystroke).
    expect(useCreateStore.getState().selection.size).toBe(2);
  });

  it("paste appends the loop at the end; ONE undo removes the whole paste", () => {
    drawLoop();
    useCreateStore.getState().selectAllVertices();
    useCreateStore.getState().copySelection();
    const undoDepthBefore = useCreateStore.getState().history.undo.length;

    useCreateStore.getState().pasteClipboard();
    let state = useCreateStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(8);
    // The pasted loop repeats the copied geometry, order intact.
    expect(state.reconstruction.vertices[4].lat).toBe(52.52);
    expect(state.reconstruction.vertices[7].lat).toBe(52.519);
    // Exactly ONE undo step for the paste.
    expect(state.history.undo.length).toBe(undoDepthBefore + 1);
    // The pasted vertices are NOT selected; the original selection holds.
    expect(state.selection.size).toBe(4);
    expect(state.selection.has(vertexId(5))).toBe(false);

    // Paste again — the loop stacks (the feature's whole point).
    useCreateStore.getState().pasteClipboard();
    state = useCreateStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(12);
    expect(state.history.undo.length).toBe(undoDepthBefore + 2);

    // One undo removes exactly one paste.
    useCreateStore.getState().undo();
    expect(useCreateStore.getState().reconstruction.vertices).toHaveLength(8);
  });

  it("paste never reuses a vertex id (undo/redo stay unambiguous)", () => {
    drawLoop();
    useCreateStore.getState().selectAllVertices();
    useCreateStore.getState().copySelection();
    useCreateStore.getState().pasteClipboard();
    const ids = useCreateStore
      .getState()
      .reconstruction.vertices.map((v) => v.id);
    expect(new Set(ids).size).toBe(8);
    // The sequence advanced by the pasted count.
    expect(useCreateStore.getState().vertexSeq).toBe(8);
  });

  it("deleting a selected vertex prunes it from the selection", () => {
    drawLoop();
    useCreateStore.getState().selectAllVertices();
    useCreateStore.getState().deleteVertex(vertexId(2));
    const selection = useCreateStore.getState().selection;
    expect(selection.size).toBe(3);
    expect(selection.has(vertexId(2))).toBe(false);
  });

  it("undo past the selection prunes ids the chain no longer has", () => {
    drawLoop();
    const undoDepth = useCreateStore.getState().history.undo.length;
    useCreateStore.getState().selectAllVertices();
    // Undo the last placed vertex — its id must leave the selection.
    for (let i = 0; i < undoDepth; i += 1) {
      useCreateStore.getState().undo();
    }
    const state = useCreateStore.getState();
    expect(state.reconstruction.vertices).toHaveLength(0);
    expect(state.selection.size).toBe(0);
  });

  it("clear empties the selection with the chain; reset clears clipboard too", () => {
    drawLoop();
    useCreateStore.getState().selectAllVertices();
    useCreateStore.getState().copySelection();
    expect(useCreateStore.getState().clipboard).toHaveLength(4);

    useCreateStore.getState().clearVertices();
    expect(useCreateStore.getState().selection.size).toBe(0);
    // The clipboard deliberately SURVIVES a clear (draw the loop again,
    // paste it back).
    expect(useCreateStore.getState().clipboard).toHaveLength(4);

    useCreateStore.getState().reset();
    const state = useCreateStore.getState();
    expect(state.selection.size).toBe(0);
    expect(state.clipboard).toHaveLength(0);
  });

  it("a partial paste lands only what fits and reserves only its ids", () => {
    useCreateStore.getState().beginDrawing(STATS);
    // Fill the chain to MAX - 1 with distinct points.
    for (let i = 0; i < 127; i += 1) {
      useCreateStore
        .getState()
        .addVertex({ lat: 52.5 + i * 1e-5, lon: 13.405 });
    }
    useCreateStore.getState().selectAllVertices();
    useCreateStore.getState().copySelection();
    // Copy a 3-point sub-fragment (the last three).
    useCreateStore.getState().clearSelection();
    useCreateStore.getState().selectVertexRange(vertexId(125), vertexId(127));
    useCreateStore.getState().copySelection();
    expect(useCreateStore.getState().clipboard).toHaveLength(3);

    useCreateStore.getState().pasteClipboard();
    const state = useCreateStore.getState();
    // Only ONE of the three fit; it is the FIRST (order preserved).
    expect(state.reconstruction.vertices).toHaveLength(128);
    expect(state.reconstruction.vertices[127].lat).toBeCloseTo(
      52.5 + 124 * 1e-5,
      10,
    );
    expect(state.vertexSeq).toBe(128);
  });
});

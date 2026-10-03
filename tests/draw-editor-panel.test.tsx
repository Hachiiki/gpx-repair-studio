// @vitest-environment jsdom
/**
 * React Testing Library — the draw editor panel (Phase 4 presentation).
 *
 * The panel is props-driven (`DrawEditorBinding`); the editor state machine
 * itself is covered by tests/editor-store.test.ts. These tests exercise:
 *   - context (gap kind/severity/boundaries) and the in-progress badge;
 *   - live distance + vertex count + cap surfacing;
 *   - the straight-line honesty warning;
 *   - UndoRedoBar disabled states and intents;
 *   - spacing select + snap toggle intents;
 *   - per-vertex delete rows (snapped indicator);
 *   - skip / done / close intents.
 *
 * Additionally, one integration-style block drives the REAL editor store
 * through the panel wiring (open → add → undo → redo → clear) to prove the
 * binding contract the hook produces stays renderable end-to-end.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawEditorPanel } from "@/components/reconstruction/draw-editor-panel";
import type { DrawEditorBinding, RepairRow } from "@/hooks/use-draw-editor";
import type { NudgeStepM } from "@/features/reconstruction/coordEntry";
import { resolveGapTimePlan } from "@/features/reconstruction/timestamps";
import { useEditorStore } from "@/state/editor-store";
import { useUiStore } from "@/state/ui-store";
import type { GapRow } from "@/hooks/use-gpx-session";
import type { GapId, VertexId } from "@/types/domain";
import { vertexId } from "@/types/ids";

afterEach(() => cleanup());

const GAP_ROW: GapRow = {
  id: "gap/t0s0:1/t0s0:2" as GapId,
  kind: "time-gap",
  severity: "severe",
  status: "new",
  elapsedMs: 300_000,
  impliedDistanceM: 142.5,
  impliedSpeed: 0.000475,
  before: {
    pointId: "t0s0:1" as never,
    segmentId: "t0s0" as never,
    lat: 52.5201,
    lon: 13.405,
  },
  after: {
    pointId: "t0s0:2" as never,
    segmentId: "t0s0" as never,
    lat: 52.5212,
    lon: 13.4061,
  },
};

function makeBinding(
  overrides: Partial<DrawEditorBinding> = {},
): DrawEditorBinding {
  return {
    active: true,
    activeGap: GAP_ROW,
    pointerMode: "draw",
    pen: "default",
    snapEnabled: true,
    pathStyle: "car",
    routingPending: false,
    routingFailed: false,
    routingNeedsConsent: false,
    routerConsent: "granted",
    requestRoadConsent: () => undefined,
    online: true,
    snapState: "idle",
    snapPreviewNumbers: null,
    snapCanRun: false,
    startRoadSnap: () => undefined,
    cancelRoadSnap: () => undefined,
    applyRoadSnap: () => undefined,
    vertices: [],
    vertexCount: 0,
    maxVertices: 128,
    atVertexCap: false,
    distanceM: 0,
    straightLine: false,
    resampleSpacing: "off",
    timePlan: null,
    fileTiming: { startMs: null, totalDurationMs: null },
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
    statusById: { [GAP_ROW.id]: "in-progress" },
    reconstructedCount: 0,
    skippedCount: 0,
    repairTimeStats: {
      gapCount: 0,
      reconstructedDistanceM: 0,
      reconstructedTimeMs: null,
      gapsWithoutDuration: 0,
      discrepancies: [],
      beyondWallMs: 0,
    },
    paceRows: [],
    manualRows: [],
    pickMode: null,
    openEditor: () => {},
    closeEditor: () => {},
    beginPickAnchor: () => {},
    beginPickPair: () => {},
    cancelPickSpan: () => {},
    removeManualSpan: () => {},
    setPointerMode: () => {},
    setPenMode: () => {},
    setSnapEnabled: () => {},
    setPathStyle: () => {},
    undo: () => {},
    redo: () => {},
    clearVertices: () => {},
    setResampleSpacing: () => {},
    setTimeStrategy: () => {},
    setFileTiming: () => {},
    toggleSkip: () => {},
    deleteVertex: (_vertexId: VertexId) => {},
    addVertexAt: (_lat: number, _lon: number) => {},
    insertVertexAt: (_index: number, _lat: number, _lon: number) => {},
    moveVertexTo: (_vertexId: VertexId, _lat: number, _lon: number) => {},
    nudgeVertex: (_vertexId: VertexId, _dLat: number, _dLon: number) => {},
    nudgeStepM: 10,
    setNudgeStepM: (_step: NudgeStepM) => {},
    ...overrides,
  };
}

describe("DrawEditorPanel — context and live stats", () => {
  it("renders nothing when no editor session is active", () => {
    const { container } = render(
      <DrawEditorPanel draw={makeBinding({ active: false, activeGap: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows gap context, the editing badge, distance, and vertex count", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({ distanceM: 812.4, vertexCount: 3 })}
      />,
    );
    const panel = screen.getByTestId("draw-editor-panel");
    expect(panel).toHaveTextContent("Reconstruct route");
    expect(panel).toHaveTextContent("Time gap");
    expect(panel).toHaveTextContent("Editing");
    expect(screen.getByTestId("draw-distance")).toHaveTextContent("812 m");
    expect(screen.getByTestId("draw-distance")).toHaveTextContent("Estimated");
    expect(screen.getByTestId("vertex-count")).toHaveTextContent("3 / 128 points");
    expect(panel).toHaveTextContent("52.52010, 13.40500");
    expect(panel).toHaveTextContent("52.52120, 13.40610");
  });

  it("surfaces the hard cap", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({
          vertexCount: 128,
          atVertexCap: true,
          vertices: [{ id: vertexId(1), lat: 1, lon: 2 }],
        })}
      />,
    );
    expect(screen.getByTestId("vertex-count")).toHaveTextContent(
      "128 / 128 points — limit reached",
    );
  });

  it("shows the straight-line warning only when geometry is straight", () => {
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding({ straightLine: false })} />,
    );
    expect(screen.queryByTestId("straight-line-warning")).toBeNull();

    rerender(
      <DrawEditorPanel
        draw={makeBinding({ straightLine: true, vertexCount: 2 })}
      />,
    );
    const warning = screen.getByTestId("straight-line-warning");
    expect(warning).toHaveTextContent("Nearly a straight line");
  });
});

describe("DrawEditorPanel — history and settings intents", () => {
  it("disables undo/redo/clear when there is nothing to do", () => {
    render(<DrawEditorPanel draw={makeBinding()} />);
    expect(screen.getByTestId("undo-button")).toBeDisabled();
    expect(screen.getByTestId("redo-button")).toBeDisabled();
    expect(screen.getByTestId("clear-button")).toBeDisabled();
  });

  it("fires undo/redo/clear intents from the bar", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const clear = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({
          canUndo: true,
          canRedo: true,
          undoCount: 2,
          redoCount: 1,
          vertexCount: 2,
          undo,
          redo,
          clearVertices: clear,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("undo-button"));
    expect(undo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("redo-button"));
    expect(redo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("clear-button"));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("fires spacing and snap intents", () => {
    const setResampleSpacing = vi.fn();
    const setSnapEnabled = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({ setResampleSpacing, setSnapEnabled })}
      />,
    );
    fireEvent.change(screen.getByTestId("spacing-select"), {
      target: { value: "25" },
    });
    expect(setResampleSpacing).toHaveBeenCalledWith(25);

    fireEvent.click(screen.getByTestId("snap-toggle"));
    expect(setSnapEnabled).toHaveBeenCalledWith(false);
  });

  it("fires skip and done/close intents", () => {
    const toggleSkip = vi.fn();
    const closeEditor = vi.fn();
    render(
      <DrawEditorPanel draw={makeBinding({ toggleSkip, closeEditor })} />,
    );
    fireEvent.click(screen.getByTestId("skip-gap-button"));
    expect(toggleSkip).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("done-editing-button"));
    expect(closeEditor).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("close-editor-button"));
    expect(closeEditor).toHaveBeenCalledTimes(2);
  });
});

describe("DrawEditorPanel — vertex rows", () => {
  it("lists vertices with coordinates, snapped markers, and delete intents", () => {
    const deleteVertex = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({
          vertices: [
            { id: vertexId(1), lat: 52.5205, lon: 13.4055 },
            {
              id: vertexId(2),
              lat: 52.5208,
              lon: 13.4058,
              snappedTo: "t0s0:1" as never,
            },
          ],
          vertexCount: 2,
          deleteVertex,
        })}
      />,
    );
    const rows = screen.getAllByTestId("vertex-row");
    expect(rows).toHaveLength(2);
    // Phase 16 — the coordinates live in editable inputs now (the
    // numeric-entry surface), values instead of static text.
    const latInputs = screen.getAllByTestId("vertex-lat-input");
    const lonInputs = screen.getAllByTestId("vertex-lon-input");
    expect(latInputs[0]).toHaveValue("52.5205");
    expect(lonInputs[0]).toHaveValue("13.4055");
    expect(rows[1]).toHaveTextContent("snapped");

    const buttons = screen.getAllByTestId("delete-vertex-button");
    fireEvent.click(buttons[1]);
    expect(deleteVertex).toHaveBeenCalledWith(vertexId(2));
  });
});

describe("DrawEditorPanel — store integration wiring", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it("renders live store state through a hook-shaped binding", () => {
    // Drive the real store exactly as useDrawEditor's callbacks do.
    useEditorStore.getState().openEditor(GAP_ROW.id);
    useEditorStore.getState().addVertex({ lat: 52.5205, lon: 13.4055 });
    useEditorStore.getState().addVertex({ lat: 52.5208, lon: 13.4058 });

    const binding = () => {
      const state = useEditorStore.getState();
      const recon = state.reconstructions[GAP_ROW.id];
      return makeBinding({
        vertices: recon.vertices,
        vertexCount: recon.vertices.length,
        canUndo: state.history.undo.length > 0,
        canRedo: state.history.redo.length > 0,
        undoCount: state.history.undo.length,
        redoCount: state.history.redo.length,
        undo: () => useEditorStore.getState().undo(),
        redo: () => useEditorStore.getState().redo(),
        clearVertices: () => useEditorStore.getState().clearVertices(),
      });
    };

    const { rerender } = render(<DrawEditorPanel draw={binding()} />);
    expect(screen.getByTestId("vertex-count")).toHaveTextContent("2 / 128");
    expect(screen.getAllByTestId("vertex-row")).toHaveLength(2);

    // Undo through the panel → one row left.
    fireEvent.click(screen.getByTestId("undo-button"));
    rerender(<DrawEditorPanel draw={binding()} />);
    expect(screen.getAllByTestId("vertex-row")).toHaveLength(1);

    // Redo → back to two.
    fireEvent.click(screen.getByTestId("redo-button"));
    rerender(<DrawEditorPanel draw={binding()} />);
    expect(screen.getAllByTestId("vertex-row")).toHaveLength(2);

    // Clear → none.
    fireEvent.click(screen.getByTestId("clear-button"));
    rerender(<DrawEditorPanel draw={binding()} />);
    expect(screen.queryByTestId("vertex-row")).toBeNull();
    expect(screen.getByTestId("vertex-count")).toHaveTextContent("0 / 128");
  });
});

describe("DrawEditorPanel — open-ended extensions (one-anchor add)", () => {
  /** An extend row: anchor as `before`, no `after` boundary. */
  const EXTEND_ROW: RepairRow = {
    id: "gap/t0s0:8/end" as GapId,
    kind: "manual-insert",
    severity: "info",
    status: "new",
    before: {
      pointId: "t0s0:8" as never,
      segmentId: "t0s0" as never,
      lat: 52.5201,
      lon: 13.405,
    },
  };

  it("shows the anchor, the open-end instruction, and no straight-line warning", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({
          activeGap: EXTEND_ROW,
          straightLine: false,
          vertices: [
            { id: vertexId(1), lat: 52.5205, lon: 13.4055 },
          ],
          vertexCount: 1,
          statusById: { [EXTEND_ROW.id]: "in-progress" },
        })}
      />,
    );
    const panel = screen.getByTestId("draw-editor-panel");
    expect(panel).toHaveTextContent("Added route");
    expect(panel).toHaveTextContent("52.52010, 13.40500"); // the anchor
    expect(panel).toHaveTextContent("open — your clicks extend the route");
    expect(screen.getByTestId("open-end-instructions")).toHaveTextContent(
      "What you see is exactly what the repair will be",
    );
    // No far anchor → no straight-line warning, even for near-collinear
    // clicks (the binding computes straightLine=false for open rows).
    expect(screen.queryByTestId("straight-line-warning")).toBeNull();
    // Manual-kind rows offer "Remove repair span", not "Mark as skipped".
    expect(screen.getByTestId("remove-span-button")).toBeVisible();
    expect(screen.queryByTestId("skip-gap-button")).toBeNull();
  });
});

describe("DrawEditorPanel — Phase 5 time strategy embedding", () => {
  it("renders the time controls inside the panel when a plan exists", () => {
    const plan = resolveGapTimePlan(
      { routeBeforeMs: Date.UTC(2024, 4, 1, 7, 0, 9), routeAfterMs: Date.UTC(2024, 4, 1, 7, 5, 9) },
      { kind: "distance-proportional" },
      { startMs: null, totalDurationMs: null },
    );
    render(
      <DrawEditorPanel
        draw={makeBinding({
          timePlan: plan,
          distanceM: 1000,
          vertexCount: 2,
        })}
      />,
    );
    expect(screen.getByTestId("time-strategy-controls")).toBeVisible();
    expect(screen.getByTestId("gap-duration")).toHaveTextContent("5:00");
    expect(screen.getByTestId("gap-pace")).toHaveTextContent("5:00 /km");
  });

  it("omits the time controls when no plan is resolved", () => {
    render(<DrawEditorPanel draw={makeBinding({ timePlan: null })} />);
    expect(screen.queryByTestId("time-strategy-controls")).toBeNull();
  });
});

describe("DrawEditorPanel — road follow (snap to road)", () => {
  it("renders the mode group with the active choice pressed (user pass 48: no Curves chip)", () => {
    render(<DrawEditorPanel draw={makeBinding({ pathStyle: "car" })} />);
    const group = screen.getByTestId("road-follow-group");
    expect(group).toHaveTextContent("Between points, follow");
    expect(screen.getByTestId("road-follow-car")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("road-follow-foot")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("road-follow-off")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Curve is a PEN now (user pass 48) — it is not a path choice.
    expect(screen.queryByTestId("road-follow-curve")).toBeNull();
    // The privacy disclosure is part of the affordance itself.
    expect(group).toHaveTextContent("never leaves this browser");
  });

  it("a curve-pen line reads as Straight (its local home); tapping flattens it", () => {
    const setPathStyle = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({ pathStyle: "curve", setPathStyle })}
      />,
    );
    // "curve" never presses the Roads/Footpaths chips — Straight is its home.
    expect(screen.getByTestId("road-follow-car")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("road-follow-off")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // No routing status for a local line.
    expect(screen.queryByTestId("road-follow-status")).toBeNull();
    // Tapping Straight explicitly flattens the smooth line.
    fireEvent.click(screen.getByTestId("road-follow-off"));
    expect(setPathStyle).toHaveBeenCalledWith("off");
  });

  it("switching modes dispatches setPathStyle", () => {
    const setPathStyle = vi.fn();
    render(
      <DrawEditorPanel draw={makeBinding({ pathStyle: "car", setPathStyle })} />,
    );
    fireEvent.click(screen.getByTestId("road-follow-foot"));
    expect(setPathStyle).toHaveBeenCalledWith("foot");
    fireEvent.click(screen.getByTestId("road-follow-off"));
    expect(setPathStyle).toHaveBeenCalledWith("off");
  });

  it("surfaces routing status: finding, failure, and the drag hint", () => {
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding({ pathStyle: "car", routingPending: true })} />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "Finding the road",
    );

    rerender(
      <DrawEditorPanel
        draw={makeBinding({ pathStyle: "car", routingPending: false, routingFailed: true })}
      />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "unavailable right now",
    );

    rerender(
      <DrawEditorPanel
        draw={makeBinding({ pathStyle: "car", routingPending: false, routingFailed: false })}
      />,
    );
    // User pass 52: the idle status must not invite dragging while the
    // pointer is in Draw — it points at Move instead.
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "Switch to Move (M) to drag a point",
    );

    rerender(
      <DrawEditorPanel
        draw={makeBinding({
          pathStyle: "car",
          routingPending: false,
          routingFailed: false,
          pointerMode: "move",
        })}
      />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "Drag any point to adjust",
    );
  });

  it("hides the status line when road follow is off", () => {
    render(<DrawEditorPanel draw={makeBinding({ pathStyle: "off" })} />);
    expect(screen.queryByTestId("road-follow-status")).toBeNull();
  });

  it("the drawn-points header teaches both input worlds (map + keyboard)", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({
          vertices: [{ id: vertexId(1), lat: 52.5205, lon: 13.4055 }],
          vertexCount: 1,
        })}
      />,
    );
    expect(screen.getByText(/drag them on the map, or type/i)).toBeVisible();
  });
});

describe("DrawEditorPanel — the pen group (user pass 48: curve is a pen)", () => {
  it("renders Default and Curve pens, pressing the active one", () => {
    render(<DrawEditorPanel draw={makeBinding({ pen: "default" })} />);
    const group = screen.getByTestId("pen-mode-group");
    expect(group).toHaveTextContent("Pen");
    expect(screen.getByTestId("pen-mode-default")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("pen-mode-curve")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // No freehand hint while the classic pencil holds the draw mode.
    expect(screen.queryByTestId("pen-curve-hint")).toBeNull();
  });

  it("switching pens dispatches setPenMode", () => {
    const setPenMode = vi.fn();
    render(
      <DrawEditorPanel draw={makeBinding({ pen: "default", setPenMode })} />,
    );
    fireEvent.click(screen.getByTestId("pen-mode-curve"));
    expect(setPenMode).toHaveBeenCalledWith("curve");
    fireEvent.click(screen.getByTestId("pen-mode-default"));
    expect(setPenMode).toHaveBeenCalledWith("default");
  });

  it("teaches the freehand gesture while the Curve pen draws", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({ pointerMode: "draw", pen: "curve" })}
      />,
    );
    expect(screen.getByTestId("pen-curve-hint")).toHaveTextContent(
      /Drag on the map to draw your curve/,
    );
    // The pen is a Draw-mode concern — the hint is gone in Move mode.
    cleanup();
    render(
      <DrawEditorPanel
        draw={makeBinding({ pointerMode: "move", pen: "curve" })}
      />,
    );
    expect(screen.queryByTestId("pen-curve-hint")).toBeNull();
  });
});

describe("DrawEditorPanel — the pen group is inert outside Draw (user pass 52)", () => {
  it("Move mode: the pen chips disable and the note says why", () => {
    render(<DrawEditorPanel draw={makeBinding({ pointerMode: "move" })} />);
    // Chips keep their pressed state (the pen is remembered) but are
    // honestly inert — disabled, no hover affordance.
    expect(screen.getByTestId("pen-mode-default")).toBeDisabled();
    expect(screen.getByTestId("pen-mode-curve")).toBeDisabled();
    expect(screen.getByTestId("pen-mode-default")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // No freehand hint while the pen is inert.
    expect(screen.queryByTestId("pen-curve-hint")).toBeNull();
    const note = screen.getByTestId("pen-inactive-note");
    expect(note).toHaveTextContent(/pen works in Draw mode only/i);
    expect(note).toHaveTextContent(/drags your points/i);
  });

  it("Pan mode: the note says the pointer navigates", () => {
    render(<DrawEditorPanel draw={makeBinding({ pointerMode: "pan" })} />);
    expect(screen.getByTestId("pen-mode-default")).toBeDisabled();
    expect(screen.getByTestId("pen-inactive-note")).toHaveTextContent(
      /navigates the map/i,
    );
  });

  it("Draw mode: the chips are live and the note is gone", () => {
    render(<DrawEditorPanel draw={makeBinding({ pointerMode: "draw" })} />);
    expect(screen.getByTestId("pen-mode-default")).toBeEnabled();
    expect(screen.getByTestId("pen-mode-curve")).toBeEnabled();
    expect(screen.queryByTestId("pen-inactive-note")).toBeNull();
  });

  it("an inert chip click dispatches nothing (the button is disabled)", () => {
    const setPenMode = vi.fn();
    render(
      <DrawEditorPanel draw={makeBinding({ pointerMode: "move", setPenMode })} />,
    );
    fireEvent.click(screen.getByTestId("pen-mode-curve"));
    expect(setPenMode).not.toHaveBeenCalled();
  });
});

describe("DrawEditorPanel — the editor reveal scroll (user pass 49)", () => {
  // The reveal scroll runs inside a rAF (it must land after the gap-row
  // selection scroll of the same effect flush); run frames synchronously
  // so the assertions see the final state without real timers.
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(performance.now());
        return 0;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  /** A second detected gap — switching editors re-reveals the panel. */
  const OTHER_GAP: GapRow = {
    ...GAP_ROW,
    id: "gap/t0s0:5/t0s0:6" as GapId,
  };

  function makeColumn(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      scrollHeight: 2000,
      clientHeight: 800,
      scrollTop: 1200,
      getBoundingClientRect: () => ({ top: 100 }),
      scrollTo: vi.fn(),
      ...overrides,
    } as unknown as HTMLElement;
  }

  it("scrolls the tools column to the panel when the editor opens on another gap", () => {
    const column = makeColumn();
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding()} />,
    );
    const card = screen.getByTestId("draw-editor-panel");
    // The panel sits 600 px above the column's visible top (the repair
    // studio's case: it inserts above the user's scroll position).
    vi.spyOn(card, "closest").mockReturnValue(column);
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      top: -500,
    } as DOMRect);

    rerender(
      <DrawEditorPanel draw={makeBinding({ activeGap: OTHER_GAP })} />,
    );
    // delta = -500 - 100 → top = 1200 - 600 = 600.
    expect(column.scrollTo).toHaveBeenCalledWith({
      top: 600,
      behavior: "smooth",
    });
  });

  it("brings a below-the-fold panel up the same way (the recovery case)", () => {
    const column = makeColumn();
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding()} />,
    );
    const card = screen.getByTestId("draw-editor-panel");
    vi.spyOn(card, "closest").mockReturnValue(column);
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      top: 1500,
    } as DOMRect);

    rerender(
      <DrawEditorPanel draw={makeBinding({ activeGap: OTHER_GAP })} />,
    );
    // delta = 1500 - 100 → top = 1200 + 1400 = 2600.
    expect(column.scrollTo).toHaveBeenCalledWith({
      top: 2600,
      behavior: "smooth",
    });
  });

  it("never scrolls when the column fits its content (mobile / short columns)", () => {
    const column = makeColumn({ scrollHeight: 800, clientHeight: 800 });
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding()} />,
    );
    const card = screen.getByTestId("draw-editor-panel");
    vi.spyOn(card, "closest").mockReturnValue(column);
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      top: 100,
    } as DOMRect);

    rerender(
      <DrawEditorPanel draw={makeBinding({ activeGap: OTHER_GAP })} />,
    );
    expect(column.scrollTo).not.toHaveBeenCalled();
  });

  it("does not re-scroll while drawing on the same gap (vertex churn)", () => {
    const column = makeColumn();
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding()} />,
    );
    const card = screen.getByTestId("draw-editor-panel");
    vi.spyOn(card, "closest").mockReturnValue(column);
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      top: -500,
    } as DOMRect);
    rerender(
      <DrawEditorPanel draw={makeBinding({ activeGap: OTHER_GAP })} />,
    );
    expect(column.scrollTo).toHaveBeenCalledTimes(1);

    // Same gap, more vertices — the reveal scroll must stay silent.
    rerender(
      <DrawEditorPanel
        draw={makeBinding({
          activeGap: OTHER_GAP,
          vertexCount: 4,
          vertices: [
            { id: vertexId(1), lat: 52.5205, lon: 13.4055 },
            { id: vertexId(2), lat: 52.521, lon: 13.406 },
            { id: vertexId(3), lat: 52.5215, lon: 13.4065 },
            { id: vertexId(4), lat: 52.522, lon: 13.407 },
          ],
        })}
      />,
    );
    expect(column.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("is a no-op outside a tools column (bare mounts never page-scroll)", () => {
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding()} />,
    );
    // No closest() mock: the bare RTL tree has no tools-panel ancestor.
    rerender(
      <DrawEditorPanel draw={makeBinding({ activeGap: OTHER_GAP })} />,
    );
    expect(screen.getByTestId("draw-editor-panel")).toBeInTheDocument();
  });
});

describe("Phase 17 — the consent gate's face in the draw tools", () => {
  it("shows the enable notice while a routable style is on without consent", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({
          pathStyle: "car",
          routerConsent: "unknown",
          routingNeedsConsent: true,
        })}
      />,
    );
    const notice = screen.getByTestId("road-consent-notice");
    expect(notice).toHaveTextContent(/sends the points you draw/i);
    expect(notice).toHaveTextContent(/never your file/i);
    expect(screen.queryByTestId("road-consent-on-note")).toBeNull();
  });

  it("the enable button dispatches the consent request intent", () => {
    const requestRoadConsent = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({
          pathStyle: "car",
          routerConsent: "unknown",
          routingNeedsConsent: true,
          requestRoadConsent,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("road-consent-enable"));
    expect(requestRoadConsent).toHaveBeenCalledTimes(1);
  });

  it("while granted, the session note carries the turn-off door", () => {
    const requestRoadConsent = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({
          pathStyle: "car",
          routerConsent: "granted",
          routingNeedsConsent: false,
          requestRoadConsent,
        })}
      />,
    );
    expect(screen.queryByTestId("road-consent-notice")).toBeNull();
    const note = screen.getByTestId("road-consent-on-note");
    expect(note).toHaveTextContent(/on for this session/i);
    fireEvent.click(screen.getByRole("button", { name: /turn it off/i }));
    expect(requestRoadConsent).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 17 — the Snap-to-road control (§EE 17.3/17.4)", () => {
  it("idle: enabled with the honest invitation", () => {
    render(
      <DrawEditorPanel draw={makeBinding({ snapCanRun: true, online: true })} />,
    );
    expect(screen.getByTestId("snap-to-road-button")).toBeEnabled();
    expect(screen.getByTestId("snap-status")).toHaveTextContent(
      /preview first, undo after/i,
    );
    expect(screen.queryByTestId("snap-preview-box")).toBeNull();
  });

  it("offline: disabled WITH the explanation (freehand keeps working)", () => {
    render(
      <DrawEditorPanel draw={makeBinding({ snapCanRun: true, online: false })} />,
    );
    expect(screen.getByTestId("snap-to-road-button")).toBeDisabled();
    expect(screen.getByTestId("snap-status")).toHaveTextContent(/Offline/i);
    expect(screen.getByTestId("snap-status")).toHaveTextContent(
      /straight and curve lines keep working/i,
    );
  });

  it("no points yet: disabled with the draw-first explanation", () => {
    render(
      <DrawEditorPanel draw={makeBinding({ snapCanRun: false, online: true })} />,
    );
    expect(screen.getByTestId("snap-to-road-button")).toBeDisabled();
    expect(screen.getByTestId("snap-status")).toHaveTextContent(
      /at least one point/i,
    );
  });

  it("pending: the button defers and the status says so", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({ snapCanRun: true, snapState: "pending" })}
      />,
    );
    expect(screen.getByTestId("snap-to-road-button")).toBeDisabled();
    expect(screen.getByTestId("snap-status")).toHaveTextContent(
      /Finding the road/i,
    );
  });

  it("failed: the honest message, the line stays as drawn", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({ snapCanRun: true, snapState: "failed" })}
      />,
    );
    expect(screen.getByTestId("snap-status")).toHaveTextContent(
      /stays as drawn/i,
    );
    expect(screen.getByTestId("snap-to-road-button")).toBeEnabled();
  });

  it("preview: the numbers box with the delta, and both intents", () => {
    const applyRoadSnap = vi.fn();
    const cancelRoadSnap = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({
          snapCanRun: true,
          snapState: "preview",
          snapPreviewNumbers: {
            drawnDistanceM: 1000,
            routedDistanceM: 1630,
            deltaM: 630,
          },
          applyRoadSnap,
          cancelRoadSnap,
        })}
      />,
    );
    const box = screen.getByTestId("snap-preview-box");
    expect(box).toHaveTextContent(/Road preview/i);
    expect(box).toHaveTextContent("1.00 km"); // your line
    expect(box).toHaveTextContent("1.63 km"); // on the road
    expect(box).toHaveTextContent("+630"); // the signed delta
    expect(box).toHaveTextContent(/one undo step/i);
    fireEvent.click(screen.getByTestId("snap-apply-button"));
    expect(applyRoadSnap).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("snap-cancel-button"));
    expect(cancelRoadSnap).toHaveBeenCalledTimes(1);
  });

  it("the snap button starts a snap (profile defaults to car)", () => {
    const startRoadSnap = vi.fn();
    render(
      <DrawEditorPanel
        draw={makeBinding({ snapCanRun: true, startRoadSnap })}
      />,
    );
    fireEvent.click(screen.getByTestId("snap-to-road-button"));
    expect(startRoadSnap).toHaveBeenCalledTimes(1);
  });
});

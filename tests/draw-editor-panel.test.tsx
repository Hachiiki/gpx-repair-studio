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
    drawMode: true,
    snapEnabled: true,
    roadFollow: "car",
    routingPending: false,
    routingFailed: false,
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
    setDrawMode: () => {},
    setSnapEnabled: () => {},
    setRoadFollow: () => {},
    undo: () => {},
    redo: () => {},
    clearVertices: () => {},
    setResampleSpacing: () => {},
    setTimeStrategy: () => {},
    setFileTiming: () => {},
    toggleSkip: () => {},
    deleteVertex: (_vertexId: VertexId) => {},
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
    expect(rows[0]).toHaveTextContent("52.52050, 13.40550");
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
  it("renders the mode group with the active choice pressed", () => {
    render(<DrawEditorPanel draw={makeBinding({ roadFollow: "car" })} />);
    const group = screen.getByTestId("road-follow-group");
    expect(group).toHaveTextContent("Between clicks, follow");
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
    // The privacy disclosure is part of the affordance itself.
    expect(group).toHaveTextContent("never leaves this browser");
  });

  it("switching modes dispatches setRoadFollow", () => {
    const setRoadFollow = vi.fn();
    render(
      <DrawEditorPanel draw={makeBinding({ roadFollow: "car", setRoadFollow })} />,
    );
    fireEvent.click(screen.getByTestId("road-follow-foot"));
    expect(setRoadFollow).toHaveBeenCalledWith("foot");
    fireEvent.click(screen.getByTestId("road-follow-off"));
    expect(setRoadFollow).toHaveBeenCalledWith("off");
  });

  it("surfaces routing status: finding, failure, and the drag hint", () => {
    const { rerender } = render(
      <DrawEditorPanel draw={makeBinding({ roadFollow: "car", routingPending: true })} />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "Finding the road",
    );

    rerender(
      <DrawEditorPanel
        draw={makeBinding({ roadFollow: "car", routingPending: false, routingFailed: true })}
      />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "unavailable right now",
    );

    rerender(
      <DrawEditorPanel
        draw={makeBinding({ roadFollow: "car", routingPending: false, routingFailed: false })}
      />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "Drag any point to adjust",
    );
  });

  it("hides the status line when road follow is off", () => {
    render(<DrawEditorPanel draw={makeBinding({ roadFollow: "off" })} />);
    expect(screen.queryByTestId("road-follow-status")).toBeNull();
  });

  it("the drawn-points header teaches drag and double-click editing", () => {
    render(
      <DrawEditorPanel
        draw={makeBinding({
          vertices: [{ id: vertexId(1), lat: 52.5205, lon: 13.4055 }],
          vertexCount: 1,
        })}
      />,
    );
    expect(screen.getByText(/drag on the map to adjust/i)).toBeVisible();
  });
});

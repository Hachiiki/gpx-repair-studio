// @vitest-environment jsdom
/**
 * React Testing Library — the "plan a route" section's surfaces.
 *
 *   - PlanStartCard: the landing tool page's intake states the no-export
 *     / no-share contract and dispatches the begin intent.
 *   - PlanGuideCard: the scratchpad contract, the locate aid's degraded
 *     states, and the clear affordance's gating.
 *   - PlanDrawPanel: the pen + path-style chips' shared language, the
 *     live distance, the vertex count — and NO finish/export control.
 *   - PlanEstimatesCard: the crow-flies line, the elevation section,
 *     and the pace calculator — enter a time, read the pace, speed,
 *     and splits; the hints when route or time is missing; clear.
 *
 * The section's defining contract is asserted everywhere it could
 * regress: no export control, no share control, no download of any
 * kind appears in any of these surfaces.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanStartCard } from "@/components/plan/plan-start-card";
import { PlanGuideCard } from "@/components/plan/plan-guide-card";
import { PlanDrawPanel } from "@/components/plan/plan-draw-panel";
import { PlanEstimatesCard } from "@/components/plan/plan-estimates-card";
import type { PlanDrawBinding } from "@/hooks/use-plan-draw";
import type { ElevationControlsBinding } from "@/hooks/use-elevation";
import { vertexId } from "@/types/ids";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function drawBinding(
  overrides: Partial<PlanDrawBinding> = {},
): PlanDrawBinding {
  return {
    active: true,
    pointerMode: "draw",
    pen: "default",
    distanceM: 5230,
    vertexCount: 3,
    maxVertices: 128,
    pickMode: null,
    setPointerMode: () => {},
    setPenMode: () => {},
    vertices: [
      { id: vertexId(1), lat: 52.52, lon: 13.405 },
      { id: vertexId(2), lat: 52.53, lon: 13.405 },
      { id: vertexId(3), lat: 52.53, lon: 13.455 },
    ],
    atVertexCap: false,
    canUndo: true,
    canRedo: false,
    undoCount: 1,
    redoCount: 0,
    pathStyle: "car",
    routingPending: false,
    routingFailed: false,
    routingNeedsConsent: false,
    routerConsent: "granted",
    requestRoadConsent: () => undefined,
    setPathStyle: () => {},
    undo: () => {},
    redo: () => {},
    clearVertices: () => {},
    deleteVertex: () => {},
    ...overrides,
  };
}

/** A not-fetched elevation binding — the estimates card's default state. */
function elevationBinding(
  overrides: Partial<ElevationControlsBinding> = {},
): ElevationControlsBinding {
  return {
    canFetch: true,
    blockedReason: null,
    status: "not-fetched",
    stale: false,
    fetching: false,
    answered: 0,
    sent: 0,
    total: 0,
    resolved: 0,
    disclosure: { sentPoints: 181, totalPoints: 181, requestCount: 2 },
    providerName: "Open-Meteo",
    attribution: "Open-Meteo",
    privacyNoteKey: "elevation.privacyNote.openMeteo",
    summary: null,
    error: null,
    confirmFetch: vi.fn(),
    ...overrides,
  };
}

/** Render the estimates card with sensible defaults. */
function setupEstimates(
  overrides: Partial<Parameters<typeof PlanEstimatesCard>[0]> = {},
) {
  const setPlannedTimeMs = vi.fn();
  const view = render(
    <PlanEstimatesCard
      distanceM={5230}
      crowFliesM={2100}
      detour={2.49}
      elevation={elevationBinding()}
      plannedTimeMs={null}
      setPlannedTimeMs={setPlannedTimeMs}
      paceUnit="km"
      onPaceUnitChange={() => {}}
      {...overrides}
    />,
  );
  return { setPlannedTimeMs, view };
}

// ---------------------------------------------------------------------------
// PlanStartCard
// ---------------------------------------------------------------------------

describe("PlanStartCard", () => {
  it("states the scratchpad contract and dispatches the begin intent", () => {
    const onBegin = vi.fn();
    render(<PlanStartCard onBegin={onBegin} />);

    expect(screen.getByTestId("plan-start-card")).toHaveTextContent(
      /no export and no share/i,
    );
    const button = screen.getByTestId("plan-start-button");
    expect(button).toHaveTextContent("Start planning");
    fireEvent.click(button);
    expect(onBegin).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// PlanGuideCard
// ---------------------------------------------------------------------------

describe("PlanGuideCard", () => {
  it("teaches the scratchpad contract with no export or share wording", () => {
    render(
      <PlanGuideCard
        onLocate={() => {}}
        locateStatus="idle"
        vertexCount={0}
        onClear={() => {}}
      />,
    );
    const card = screen.getByTestId("plan-guide-card");
    expect(card).toHaveTextContent(/no export, no share/i);
    expect(card).not.toHaveTextContent(/download/i);
    expect(screen.queryByTestId("export-button")).toBeNull();
  });

  it("gates Clear on having something to clear", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <PlanGuideCard
        onLocate={() => {}}
        locateStatus="idle"
        vertexCount={0}
        onClear={onClear}
      />,
    );
    const button = screen.getByTestId("plan-clear-button");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClear).not.toHaveBeenCalled();

    rerender(
      <PlanGuideCard
        onLocate={() => {}}
        locateStatus="idle"
        vertexCount={3}
        onClear={onClear}
      />,
    );
    expect(screen.getByTestId("plan-clear-button")).toBeEnabled();
    fireEvent.click(screen.getByTestId("plan-clear-button"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("surfaces the locate aid's degraded states quietly", () => {
    render(
      <PlanGuideCard
        onLocate={() => {}}
        locateStatus="denied"
        vertexCount={0}
        onClear={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-locate-notice")).toHaveTextContent(
      /permission was declined/i,
    );
  });
});

// ---------------------------------------------------------------------------
// PlanDrawPanel
// ---------------------------------------------------------------------------

describe("PlanDrawPanel", () => {
  it("renders null while inactive", () => {
    const { container } = render(
      <PlanDrawPanel draw={drawBinding({ active: false })} paceUnit="km" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the live distance, the vertex count, and NO finish control", () => {
    render(<PlanDrawPanel draw={drawBinding()} paceUnit="km" />);
    expect(screen.getByTestId("draw-distance")).toHaveTextContent("5.23 km");
    expect(screen.getByTestId("vertex-count")).toHaveTextContent(
      "3 / 128 points",
    );
    // The planner has no finish — the route is never "done", and there
    // is no export to unlock.
    expect(screen.queryByTestId("finish-route-button")).toBeNull();
    expect(screen.queryByText(/export/i)).toBeNull();
  });

  it("switches pen and path style through the shared chip language", () => {
    const setPenMode = vi.fn();
    const setPathStyle = vi.fn();
    render(
      <PlanDrawPanel
        draw={drawBinding({ setPenMode, setPathStyle })}
        paceUnit="km"
      />,
    );
    fireEvent.click(screen.getByTestId("pen-mode-curve"));
    expect(setPenMode).toHaveBeenCalledWith("curve");
    fireEvent.click(screen.getByTestId("road-follow-foot"));
    expect(setPathStyle).toHaveBeenCalledWith("foot");
    // Exactly three path styles — the pen owns curves now (user pass 48).
    expect(screen.queryByTestId("road-follow-curve")).toBeNull();
  });

  it("user pass 52: the pen group is inert outside Draw, honest about Move", () => {
    const setPenMode = vi.fn();
    const { rerender } = render(
      <PlanDrawPanel
        draw={drawBinding({ pointerMode: "move", setPenMode })}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("pen-mode-default")).toBeDisabled();
    expect(screen.getByTestId("pen-mode-curve")).toBeDisabled();
    expect(screen.getByTestId("pen-inactive-note")).toHaveTextContent(
      /drags your points/i,
    );
    fireEvent.click(screen.getByTestId("pen-mode-curve"));
    expect(setPenMode).not.toHaveBeenCalled();

    rerender(
      <PlanDrawPanel
        draw={drawBinding({ pointerMode: "pan", setPenMode })}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("pen-inactive-note")).toHaveTextContent(
      /navigates the map/i,
    );

    rerender(
      <PlanDrawPanel
        draw={drawBinding({ pointerMode: "draw", setPenMode })}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("pen-mode-default")).toBeEnabled();
    expect(screen.queryByTestId("pen-inactive-note")).toBeNull();
  });

  it("user pass 52: the road-follow status points at Move while the pencil draws", () => {
    const { rerender } = render(
      <PlanDrawPanel draw={drawBinding()} paceUnit="km" />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "Switch to Move (M) to drag a point",
    );
    rerender(
      <PlanDrawPanel
        draw={drawBinding({ pointerMode: "move" })}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("road-follow-status")).toHaveTextContent(
      "Drag any point to adjust",
    );
  });

  it("renders the accessible vertex list with per-point delete", () => {
    const deleteVertex = vi.fn();
    render(
      <PlanDrawPanel draw={drawBinding({ deleteVertex })} paceUnit="km" />,
    );
    const rows = screen.getAllByTestId("plan-vertex-row");
    expect(rows).toHaveLength(3);
    fireEvent.click(screen.getAllByTestId("plan-delete-vertex-button")[1]);
    expect(deleteVertex).toHaveBeenCalledWith(vertexId(2));
  });
});

// ---------------------------------------------------------------------------
// PlanEstimatesCard
// ---------------------------------------------------------------------------

describe("PlanEstimatesCard", () => {
  it("states the crow-flies comparison with the detour factor", () => {
    setupEstimates();
    const line = screen.getByTestId("plan-crowflies");
    expect(line).toHaveTextContent("2.10 km");
    expect(line).toHaveTextContent("2.5×");
    expect(line).toHaveTextContent("5.23 km");
  });

  it("carries the elevation section's opt-in state", () => {
    setupEstimates();
    expect(screen.getByTestId("elevation-controls")).toBeVisible();
    expect(screen.getByTestId("elevation-status-badge")).toHaveTextContent(
      "Not estimated",
    );
  });

  it("hints at what the pace needs before it can compute", () => {
    const { rerender } = render(
      <PlanEstimatesCard
        distanceM={null}
        crowFliesM={null}
        detour={null}
        elevation={elevationBinding()}
        plannedTimeMs={null}
        setPlannedTimeMs={() => {}}
        paceUnit="km"
        onPaceUnitChange={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-pace-hint")).toHaveTextContent(
      /draw a route on the map first/i,
    );

    rerender(
      <PlanEstimatesCard
        distanceM={5230}
        crowFliesM={2100}
        detour={2.49}
        elevation={elevationBinding()}
        plannedTimeMs={null}
        setPlannedTimeMs={() => {}}
        paceUnit="km"
        onPaceUnitChange={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-pace-hint")).toHaveTextContent(
      /enter a time above/i,
    );
    expect(screen.getByTestId("plan-pace-result")).toHaveTextContent("—");
  });

  it("computes pace, speed, and splits from an entered time", () => {
    // 32:35 over 5.23 km → 6:13 /km, 9.6 km/h, five whole-km splits.
    const { setPlannedTimeMs } = setupEstimates({
      plannedTimeMs: 1_955_000,
    });
    // The fields prefill from the time.
    expect(screen.getByTestId("plan-time-hours")).toHaveValue(0);
    expect(screen.getByTestId("plan-time-minutes")).toHaveValue(32);
    expect(screen.getByTestId("plan-time-seconds")).toHaveValue(35);

    const result = screen.getByTestId("plan-pace-result");
    expect(result).toHaveTextContent("6:13 /km");
    expect(result).toHaveTextContent("9.6 km/h");
    expect(screen.getByTestId("plan-pace-planned-badge")).toHaveTextContent(
      "Planned",
    );

    // Five splits + the 230 m tail row.
    const rows = screen.getAllByTestId("plan-split-row");
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent("1 km");
    expect(rows[5]).toHaveTextContent("230 m");

    // Editing a field pushes the parsed time to the store (30m35s).
    fireEvent.change(screen.getByTestId("plan-time-minutes"), {
      target: { value: "30" },
    });
    expect(setPlannedTimeMs).toHaveBeenCalledWith(1_835_000);
  });

  it("clears the entered time and disables Clear with none", () => {
    const { setPlannedTimeMs, view } = setupEstimates({
      plannedTimeMs: 1_800_000,
    });
    const clear = screen.getByTestId("plan-time-clear");
    expect(clear).toBeEnabled();
    fireEvent.click(clear);
    expect(setPlannedTimeMs).toHaveBeenCalledWith(null);
    expect(screen.getByTestId("plan-time-minutes")).toHaveValue(0);
    view.unmount();

    const { setPlannedTimeMs: setNone } = setupEstimates({
      plannedTimeMs: null,
    });
    expect(screen.getByTestId("plan-time-clear")).toBeDisabled();
    expect(setNone).not.toHaveBeenCalled();
  });

  it("renders no export, share, or download control of any kind", () => {
    setupEstimates({ plannedTimeMs: 1_800_000 });
    const card = screen.getByTestId("plan-estimates-card");
    expect(card).not.toHaveTextContent(/download/i);
    expect(card).not.toHaveTextContent(/share/i);
    expect(screen.queryByTestId("export-button")).toBeNull();
    expect(screen.queryByTestId("share-button")).toBeNull();
  });
});

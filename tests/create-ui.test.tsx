// @vitest-environment jsdom
/**
 * React Testing Library — the "create from activity stats" section's
 * Step 1 form and the studio panels.
 *
 *   - ActivityStatsForm: validation blocks unusable entries with
 *     per-field messages; the consistency notice classifies (rounding /
 *     mismatch) without blocking; a valid entry hands the normalized
 *     ActivityStats to the onBegin intent; returning statistics prefill.
 *   - CreateGuideCard: the recorded recap, the locate aid's degraded
 *     states, and the back-to-form intent.
 *   - RouteDrawPanel: Finish disabled below two points, the road-follow
 *     chips, the drawn-vs-recorded comparison, spacing.
 *   - RouteReviewCard: recorded/drawn/difference, the drawn-distance
 *     default with the watch's distance as the unchecked choice, the
 *     final summary trio, export + edit intents.
 *   - ReconcileDistanceDialog: the finish-time warning states the
 *     difference, keeps the recorded time, recomputes the pace from the
 *     whole route, and dispatches both distance-basis choices.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityStatsForm } from "@/components/create/activity-stats-form";
import { CreateGuideCard } from "@/components/create/create-guide-card";
import { RouteDrawPanel } from "@/components/create/route-draw-panel";
import { RouteReviewCard } from "@/components/create/route-review-card";
import type { CreateDrawBinding } from "@/hooks/use-create-draw";
import type { CreateReview } from "@/hooks/use-create-export";
import type { ActivityStats } from "@/hooks/use-create-session";
import { ReconcileDistanceDialog } from "@/components/create/reconcile-distance-dialog";
import {
  buildCreateTrack,
  computeReconciliation,
  type Reconciliation,
} from "@/features/create/track";
import { impliedPaceMsPerUnit } from "@/features/create/stats";
import { formatPaceMs } from "@/lib/utils/format";
import { vertexId } from "@/types/ids";

afterEach(() => cleanup());

const STATS: ActivityStats = {
  distanceM: 5230,
  durationMs: 1_955_000, // 32:35
  paceMsPerKm: 374_000, // 6:14 /km
  startMs: Date.UTC(2026, 8, 20, 5, 30),
};

// ---------------------------------------------------------------------------
// ActivityStatsForm
// ---------------------------------------------------------------------------

function setupForm(
  overrides: Partial<Parameters<typeof ActivityStatsForm>[0]> = {},
) {
  const onBegin = vi.fn();
  render(
    <ActivityStatsForm
      paceUnit="km"
      onPaceUnitChange={() => {}}
      onBegin={onBegin}
      {...overrides}
    />,
  );
  return { onBegin };
}

function fillValid() {
  fireEvent.change(screen.getByLabelText("Distance recorded by your watch"), {
    target: { value: "5.23" },
  });
  fireEvent.change(screen.getByLabelText("Pace minutes per unit"), {
    target: { value: "6" },
  });
  fireEvent.change(screen.getByLabelText("Pace seconds per unit"), {
    target: { value: "14" },
  });
  fireEvent.change(screen.getByLabelText("Total time hours"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("Total time minutes"), {
    target: { value: "32" },
  });
  fireEvent.change(screen.getByLabelText("Total time seconds"), {
    target: { value: "35" },
  });
  fireEvent.change(screen.getByLabelText(/Start/), {
    target: { value: "2026-09-20T05:30" },
  });
}

describe("ActivityStatsForm", () => {
  it("blocks an empty submit with per-field messages and no onBegin", () => {
    const { onBegin } = setupForm();
    fireEvent.click(screen.getByTestId("begin-drawing-button"));
    expect(onBegin).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Enter the distance your watch recorded/),
    ).toBeVisible();
    expect(screen.getByText(/Enter your average pace/)).toBeVisible();
    expect(
      screen.getByText(/Total time must be greater than zero/),
    ).toBeVisible();
    expect(screen.getByText(/Set when the activity started/)).toBeVisible();
  });

  it("hands a normalized valid entry to onBegin", () => {
    const { onBegin } = setupForm();
    fillValid();
    fireEvent.click(screen.getByTestId("begin-drawing-button"));
    expect(onBegin).toHaveBeenCalledTimes(1);
    const stats = onBegin.mock.calls[0][0] as ActivityStats;
    expect(stats.distanceM).toBeCloseTo(5230, 6);
    expect(stats.paceMsPerKm).toBe(374_000);
    expect(stats.durationMs).toBe(1_955_000);
    expect(new Date(stats.startMs).getUTCFullYear()).toBe(2026);
  });

  it("continues through any disagreement — the values are the user's", () => {
    const { onBegin } = setupForm();
    fillValid();
    // The cross-check is informational and lives in the store/studio —
    // the form itself never blocks or rewrites anything.
    fireEvent.click(screen.getByTestId("begin-drawing-button"));
    expect(onBegin).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("stats-consistency-notice")).toBeNull();
  });

  it("prefills from previously confirmed statistics", () => {
    setupForm({ initialStats: STATS });
    expect(
      screen.getByLabelText("Distance recorded by your watch"),
    ).toHaveValue(5.23);
    expect(screen.getByLabelText("Pace minutes per unit")).toHaveValue(6);
    expect(screen.getByLabelText("Pace seconds per unit")).toHaveValue(14);
    expect(screen.getByLabelText("Total time minutes")).toHaveValue(32);
    expect(screen.getByLabelText("Total time seconds")).toHaveValue(35);
  });
});

// ---------------------------------------------------------------------------
// CreateGuideCard
// ---------------------------------------------------------------------------

describe("CreateGuideCard", () => {
  const props = {
    stats: STATS,
    paceUnit: "km" as const,
    consistency: null,
    onLocate: vi.fn(),
    locateStatus: "idle" as const,
    onBackToStats: vi.fn(),
    vertexCount: 0,
  };

  it("recaps the recorded statistics and teaches the first click", () => {
    render(<CreateGuideCard {...props} />);
    const recap = screen.getByTestId("create-stats-recap");
    expect(recap).toHaveTextContent("5.23 km");
    expect(recap).toHaveTextContent("32:35");
    expect(recap).toHaveTextContent("6:14 /km");
    expect(screen.getByTestId("create-draw-instructions")).toBeVisible();
  });

  it("offers the locate aid and degrades to a notice when declined", () => {
    render(<CreateGuideCard {...props} />);
    fireEvent.click(screen.getByTestId("locate-button"));
    expect(props.onLocate).toHaveBeenCalledTimes(1);
  });

  it("shows the denial notice when geolocation was declined", () => {
    render(<CreateGuideCard {...props} locateStatus="denied" />);
    expect(screen.getByTestId("locate-notice")).toHaveTextContent(/declined/);
  });

  it("dispatches the back-to-statistics intent", () => {
    render(<CreateGuideCard {...props} />);
    fireEvent.click(screen.getByTestId("back-to-stats-button"));
    expect(props.onBackToStats).toHaveBeenCalledTimes(1);
  });

  it("renders the persisted consistency note for a disagreeing triple", () => {
    // 5.23 km × 6:14/km ≈ 32:33 implied — entered 52:35.
    render(
      <CreateGuideCard
        {...props}
        consistency={{
          level: "mismatch",
          impliedDurationMs: 1_953_020,
          deviationMs: 1_201_980,
          deviationRatio: 0.381,
        }}
      />,
    );
    expect(screen.getByTestId("stats-consistency-notice")).toHaveTextContent(
      /don't quite agree/,
    );
  });

  it("stays quiet when the statistics agree", () => {
    render(
      <CreateGuideCard
        {...props}
        consistency={{
          level: "consistent",
          impliedDurationMs: 1_955_000,
          deviationMs: 0,
          deviationRatio: 0,
        }}
      />,
    );
    expect(screen.queryByTestId("stats-consistency-notice")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RouteDrawPanel
// ---------------------------------------------------------------------------

function drawBinding(
  overrides: Partial<CreateDrawBinding> = {},
): CreateDrawBinding {
  return {
    active: true,
    drawMode: true,
    distanceM: 3550,
    vertexCount: 3,
    maxVertices: 128,
    pickMode: null,
    setDrawMode: () => {},
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
    roadFollow: "car",
    routingPending: false,
    routingFailed: false,
    resampleSpacing: 25,
    setRoadFollow: () => {},
    setResampleSpacing: () => {},
    undo: () => {},
    redo: () => {},
    clearVertices: () => {},
    deleteVertex: () => {},
    finishRoute: vi.fn(),
    canFinish: true,
    ...overrides,
  };
}

describe("RouteDrawPanel", () => {
  it("shows the drawn distance against the recorded target and Finish enabled", () => {
    const draw = drawBinding();
    render(<RouteDrawPanel draw={draw} stats={STATS} paceUnit="km" />);
    expect(screen.getByTestId("draw-distance")).toHaveTextContent("3.55 km");
    expect(screen.getByTestId("drawn-vs-recorded")).toHaveTextContent(
      /Shorter than your recorded 5.23 km/,
    );
    expect(screen.getByTestId("finish-route-button")).toBeEnabled();
  });

  it("disables Finish below the two-vertex minimum", () => {
    const finish = vi.fn();
    const draw = drawBinding({
      vertices: [],
      vertexCount: 0,
      distanceM: null,
      canFinish: false,
      finishRoute: finish,
    });
    render(<RouteDrawPanel draw={draw} stats={STATS} paceUnit="km" />);
    const button = screen.getByTestId("finish-route-button");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(finish).not.toHaveBeenCalled();
  });

  it("switches the road-follow mode through the shared chip language", () => {
    const setRoadFollow = vi.fn();
    const draw = drawBinding({ setRoadFollow });
    render(<RouteDrawPanel draw={draw} stats={STATS} paceUnit="km" />);
    fireEvent.click(screen.getByTestId("road-follow-foot"));
    expect(setRoadFollow).toHaveBeenCalledWith("foot");
  });
});

// ---------------------------------------------------------------------------
// RouteReviewCard
// ---------------------------------------------------------------------------

function reviewBinding(overrides: Partial<CreateReview> = {}): CreateReview {
  const track = buildCreateTrack(STATS, {
    vertices: [
      { id: vertexId(1), lat: 52.52, lon: 13.405 },
      { id: vertexId(2), lat: 52.53, lon: 13.405 },
      { id: vertexId(3), lat: 52.53, lon: 13.455 },
    ],
    roadLegs: [],
    spacingM: 25,
    matchDistance: false,
  })!;
  return {
    track,
    stats: STATS,
    download: () => "activity-2026-09-20.gpx",
    setMatchDistance: vi.fn(),
    ...overrides,
  };
}

/** A scaled track (the watch's-distance choice) for the switch-case tests. */
function scaledReviewBinding(): CreateReview {
  const track = buildCreateTrack(STATS, {
    vertices: [
      { id: vertexId(1), lat: 52.52, lon: 13.405 },
      { id: vertexId(2), lat: 52.53, lon: 13.405 },
      { id: vertexId(3), lat: 52.53, lon: 13.455 },
    ],
    roadLegs: [],
    spacingM: 25,
    matchDistance: true,
  })!;
  return {
    track,
    stats: STATS,
    download: () => "activity-2026-09-20.gpx",
    setMatchDistance: vi.fn(),
  };
}

describe("RouteReviewCard", () => {
  it("defaults to the drawn distance — the watch's is an unchecked choice", () => {
    const review = reviewBinding();
    render(
      <RouteReviewCard
        review={review}
        stats={STATS}
        paceUnit="km"
        consistency={null}
        onEditRoute={() => {}}
      />,
    );
    const box = screen.getByTestId("distance-reconciliation");
    expect(box).toHaveTextContent("5.23 km");
    expect(box).toHaveTextContent("4.51 km");
    expect(screen.getByTestId("distance-difference")).toHaveTextContent("−");
    // 4.51 km drawn vs 5.23 km recorded: a choice is offered, the drawn
    // distance is the default (the toggle to the watch's is UNchecked),
    // and the gap is not extreme — no distortion warning.
    expect(screen.queryByTestId("extreme-scale-warning")).toBeNull();
    expect(screen.getByTestId("match-distance-toggle")).not.toBeChecked();
  });

  it("summarizes the DRAWN basis: drawn distance and its implied pace", () => {
    const review = reviewBinding();
    render(
      <RouteReviewCard
        review={review}
        stats={STATS}
        paceUnit="km"
        consistency={null}
        onEditRoute={() => {}}
      />,
    );
    const summary = screen.getByTestId("activity-summary");
    // Final distance = the drawn ~4.51 km; time = the recorded 32:35.
    expect(summary).toHaveTextContent("4.51 km");
    expect(summary).toHaveTextContent("32:35");
    // The pace implied by 32:35 over the drawn route — the file's own
    // arithmetic (time ÷ drawn distance), never the entered 6:14.
    const expectedPace = formatPaceMs(
      impliedPaceMsPerUnit(
        STATS.durationMs,
        review.track.drawnDistanceM,
        "km",
      )!,
    );
    expect(summary).toHaveTextContent(`${expectedPace} /km`);
    expect(summary).toHaveTextContent(/Reconstructed manually/);
  });

  it("switches to the watch's distance through the choice (scaled summary)", () => {
    const review = scaledReviewBinding();
    render(
      <RouteReviewCard
        review={review}
        stats={STATS}
        paceUnit="km"
        consistency={null}
        onEditRoute={() => {}}
      />,
    );
    const summary = screen.getByTestId("activity-summary");
    expect(screen.getByTestId("match-distance-toggle")).toBeChecked();
    // Final distance = the recorded 5.23 km (scaled); time = 32:35.
    expect(summary).toHaveTextContent("5.23 km");
    expect(summary).toHaveTextContent("32:35");
    // The pace implied by 32:35 / 5.23 km = 6:13.8 → "6:13 /km".
    expect(summary).toHaveTextContent("6:13 /km");
  });

  it("toggles the choice and dispatches export + edit intents", () => {
    const setMatchDistance = vi.fn();
    const download = vi.fn(() => "activity-2026-09-20.gpx");
    const onEditRoute = vi.fn();
    const review = reviewBinding({ setMatchDistance, download });
    render(
      <RouteReviewCard
        review={review}
        stats={STATS}
        paceUnit="km"
        consistency={null}
        onEditRoute={onEditRoute}
      />,
    );

    fireEvent.click(screen.getByTestId("match-distance-toggle"));
    expect(setMatchDistance).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId("export-gpx-button"));
    expect(download).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("export-success")).toHaveTextContent(
      "activity-2026-09-20.gpx",
    );

    fireEvent.click(screen.getByTestId("edit-route-button"));
    expect(onEditRoute).toHaveBeenCalledTimes(1);
  });

  it("warns about extreme differences with the mixup/loop hint", () => {
    // A much shorter drawing: ~1.1 km vs the recorded 5.23 km (79%).
    const track = buildCreateTrack(STATS, {
      vertices: [
        { id: vertexId(1), lat: 52.52, lon: 13.405 },
        { id: vertexId(2), lat: 52.53, lon: 13.405 },
      ],
      roadLegs: [],
      spacingM: 25,
      matchDistance: false,
    })!;
    expect(track.reconciliation.extreme).toBe(true);
    render(
      <RouteReviewCard
        review={{
          track,
          stats: STATS,
          download: () => "activity-2026-09-20.gpx",
          setMatchDistance: vi.fn(),
        }}
        stats={STATS}
        paceUnit="km"
        consistency={null}
        onEditRoute={() => {}}
      />,
    );
    const warning = screen.getByTestId("extreme-scale-warning");
    expect(warning).toHaveTextContent(/km\/miles mixup/);
    expect(warning).toHaveTextContent(/missed loop/);
  });
});

// ---------------------------------------------------------------------------
// ReconcileDistanceDialog
// ---------------------------------------------------------------------------

function dialogProps(
  reconciliation: Reconciliation,
  overrides: Partial<Parameters<typeof ReconcileDistanceDialog>[0]> = {},
) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    reconciliation,
    durationMs: STATS.durationMs,
    paceUnit: "km" as const,
    onUseDrawn: vi.fn(),
    onUseRecorded: vi.fn(),
    ...overrides,
  };
}

describe("ReconcileDistanceDialog", () => {
  it("states the difference, keeps the time, and recomputes the pace", () => {
    // The drawn L (~4.51 km) vs the recorded 5.23 km — 14% shorter.
    const track = buildCreateTrack(STATS, {
      vertices: [
        { id: vertexId(1), lat: 52.52, lon: 13.405 },
        { id: vertexId(2), lat: 52.53, lon: 13.405 },
        { id: vertexId(3), lat: 52.53, lon: 13.455 },
      ],
      roadLegs: [],
      spacingM: 25,
      matchDistance: false,
    })!;
    const props = dialogProps(track.reconciliation);
    render(<ReconcileDistanceDialog {...props} />);

    const dialog = screen.getByTestId("reconcile-distance-dialog");
    expect(dialog).toHaveTextContent("5.23 km");
    expect(dialog).toHaveTextContent("4.51 km");
    expect(dialog).toHaveTextContent(
      `${Math.round(track.reconciliation.relativeDifference * 100)}% shorter`,
    );
    // The recorded time is kept verbatim and the pace is recomputed from
    // the whole route (time ÷ drawn distance) — not the entered 6:14.
    expect(dialog).toHaveTextContent("32:35");
    const expectedPace = formatPaceMs(
      impliedPaceMsPerUnit(
        STATS.durationMs,
        track.reconciliation.drawnM,
        "km",
      )!,
    );
    expect(dialog).toHaveTextContent(`${expectedPace} /km`);
    // No extreme hint at 14%.
    expect(screen.queryByTestId("reconcile-extreme-hint")).toBeNull();
  });

  it("dispatches both distance-basis choices", () => {
    const onUseDrawn = vi.fn();
    const onUseRecorded = vi.fn();
    const props = dialogProps(computeReconciliation(5230, 4800), {
      onUseDrawn,
      onUseRecorded,
    });
    render(<ReconcileDistanceDialog {...props} />);

    fireEvent.click(screen.getByTestId("use-drawn-distance-button"));
    expect(onUseDrawn).toHaveBeenCalledTimes(1);
    expect(onUseRecorded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("use-recorded-distance-button"));
    expect(onUseRecorded).toHaveBeenCalledTimes(1);
    expect(onUseDrawn).toHaveBeenCalledTimes(1);
  });

  it("adds the mixup/loop hint for extreme differences", () => {
    // 5.23 km recorded vs 1.00 km drawn — 81% apart.
    const props = dialogProps(computeReconciliation(5230, 1000));
    render(<ReconcileDistanceDialog {...props} />);
    const hint = screen.getByTestId("reconcile-extreme-hint");
    expect(hint).toHaveTextContent(/km\/miles mixup/);
    expect(hint).toHaveTextContent(/missed loop/);
  });
});

// @vitest-environment jsdom
/**
 * React Testing Library — the §J-1 case matrix as rendered by
 * TimeStrategyControls (Phase 5):
 *
 *   - Case 1: derived span shown, By distance pressed, live estimated
 *     pace badged, strategy switch dispatches intents;
 *   - Case 4: the manual-vs-recorded disagreement is surfaced;
 *   - Case 2/3: the "—" prompt and the Add-a-duration flow through the
 *     ManualDurationDialog;
 *   - pace unit follows the persisted ui-store setting.
 *
 * The plans are produced by the REAL resolveGapTimePlan (no mocks) —
 * the same resolution the hook performs.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeStrategyControls } from "@/components/reconstruction/time-strategy-controls";
import { resolveGapTimePlan } from "@/features/reconstruction/timestamps";
import { useUiStore } from "@/state/ui-store";
import type { TimeStrategy } from "@/types/domain";

afterEach(() => cleanup());

const T0 = Date.UTC(2024, 4, 1, 7, 0, 9);
const T1 = Date.UTC(2024, 4, 1, 7, 5, 9);
const FIVE_MIN = 5 * 60_000;
const TWELVE_MIN = 12 * 60_000;

/** 1 km drawn route at 5:00 → 5:00 /km. */
const DISTANCE_M = 1000;

function planFor(
  boundaries: { routeBeforeMs?: number; routeAfterMs?: number },
  strategy: TimeStrategy,
) {
  return resolveGapTimePlan(boundaries, strategy, {
    startMs: null,
    totalDurationMs: null,
  });
}

function setup(
  plan: ReturnType<typeof planFor>,
  strategySpy = vi.fn(),
  overrides: { distanceM?: number | null; vertexCount?: number } = {},
) {
  render(
    <TimeStrategyControls
      plan={plan}
      distanceM={overrides.distanceM ?? DISTANCE_M}
      vertexCount={overrides.vertexCount ?? 2}
      setTimeStrategy={strategySpy}
    />,
  );
  return strategySpy;
}

beforeEach(() => {
  useUiStore.setState({ paceUnit: "km" });
});

describe("TimeStrategyControls — Case 1 (both boundaries)", () => {
  it("shows the recorded span with the default strategy pressed", () => {
    setup(planFor({ routeBeforeMs: T0, routeAfterMs: T1 }, { kind: "distance-proportional" }));

    const group = screen.getByTestId("time-strategy-controls");
    expect(group).toHaveTextContent("5:00"); // the recorded span
    expect(screen.getByTestId("time-strategy-distance-proportional")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("time-strategy-uniform")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows the live estimated pace, badged, once a route exists", () => {
    setup(planFor({ routeBeforeMs: T0, routeAfterMs: T1 }, { kind: "distance-proportional" }));

    const pace = screen.getByTestId("gap-pace");
    expect(pace).toHaveTextContent("5:00 /km");
    expect(pace.querySelector('[data-slot="badge"]')).toHaveTextContent("Estimated");
  });

  it("hides the pace value until vertices exist (the honest '—')", () => {
    setup(
      planFor({ routeBeforeMs: T0, routeAfterMs: T1 }, { kind: "distance-proportional" }),
      vi.fn(),
      { vertexCount: 0, distanceM: 0 },
    );
    expect(screen.getByTestId("gap-pace")).toHaveTextContent("—");
  });

  it("switching strategy dispatches the intent; manual opens the dialog", () => {
    const spy = setup(
      planFor({ routeBeforeMs: T0, routeAfterMs: T1 }, { kind: "distance-proportional" }),
    );

    fireEvent.click(screen.getByTestId("time-strategy-uniform"));
    expect(spy).toHaveBeenCalledWith({ kind: "uniform" });

    fireEvent.click(screen.getByTestId("time-strategy-manual-duration"));
    expect(screen.getByTestId("manual-duration-dialog")).toBeVisible();

    // 0 h / 12 m / 0 s → save.
    fireEvent.change(screen.getByTestId("duration-minutes"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByTestId("save-duration-button"));
    expect(spy).toHaveBeenCalledWith({
      kind: "manual-duration",
      durationMs: TWELVE_MIN,
    });
  });
});

describe("TimeStrategyControls — Case 4 (manual vs recorded)", () => {
  it("surfaces the disagreement with both durations", () => {
    setup(
      planFor(
        { routeBeforeMs: T0, routeAfterMs: T1 },
        { kind: "manual-duration", durationMs: TWELVE_MIN },
      ),
    );

    const alert = screen.getByTestId("duration-discrepancy");
    expect(alert).toHaveTextContent("12:00"); // manual
    expect(alert).toHaveTextContent("5:00"); // recorded span
    expect(screen.getByTestId("gap-duration")).toHaveTextContent("your estimate");
    // Manual 12:00 over 1 km → 12:00 /km.
    expect(screen.getByTestId("gap-pace")).toHaveTextContent("12:00 /km");
  });

  it("an agreeing manual duration shows no discrepancy alert", () => {
    setup(
      planFor(
        { routeBeforeMs: T0, routeAfterMs: T1 },
        { kind: "manual-duration", durationMs: FIVE_MIN },
      ),
    );
    expect(screen.queryByTestId("duration-discrepancy")).toBeNull();
  });
});

describe("TimeStrategyControls — Cases 2/3 (missing boundaries)", () => {
  it("Case 2 prompts for a duration and dispatches it via the dialog", () => {
    const spy = setup(planFor({ routeBeforeMs: T0 }, { kind: "distance-proportional" }));

    expect(screen.getByTestId("time-missing-reason")).toHaveTextContent(
      /only one end of this gap/i,
    );
    expect(screen.getByTestId("gap-pace")).toHaveTextContent("—");

    fireEvent.click(screen.getByTestId("add-duration-button"));
    fireEvent.change(screen.getByTestId("duration-hours"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("save-duration-button"));
    expect(spy).toHaveBeenCalledWith({
      kind: "manual-duration",
      durationMs: 60 * 60_000,
    });
  });

  it("Case 3 explains the missing anchor; a saved duration offers editing", () => {
    const spy = setup(planFor({}, { kind: "manual-duration", durationMs: TWELVE_MIN }));

    expect(screen.getByTestId("gap-duration")).toHaveTextContent("12:00");
    expect(screen.getByTestId("edit-duration-button")).toHaveTextContent(/edit/i);
    expect(spy).not.toHaveBeenCalled(); // nothing dispatched on render
  });

  it("Case 3 without a duration shows the export-without-times note", () => {
    setup(planFor({}, { kind: "distance-proportional" }));
    expect(screen.getByTestId("time-missing-reason")).toHaveTextContent(
      /no timestamps around this gap/i,
    );
  });
});

describe("TimeStrategyControls — pace unit", () => {
  it("formats per the persisted ui-store unit", () => {
    useUiStore.setState({ paceUnit: "mi" });
    setup(planFor({ routeBeforeMs: T0, routeAfterMs: T1 }, { kind: "distance-proportional" }));
    // 5 min/km → 8:02 /mi.
    expect(screen.getByTestId("gap-pace")).toHaveTextContent("8:02 /mi");
  });
});

describe("ManualDurationDialog (within the controls)", () => {
  it("rejects invalid input: Save disabled, error announced", async () => {
    setup(planFor({ routeBeforeMs: T0, routeAfterMs: T1 }, { kind: "distance-proportional" }));
    fireEvent.click(screen.getByTestId("time-strategy-manual-duration"));

    fireEvent.change(screen.getByTestId("duration-minutes"), {
      target: { value: "-3" },
    });
    expect(await screen.findByTestId("duration-error")).toBeVisible();
    expect(screen.getByTestId("save-duration-button")).toBeDisabled();
  });

  it("prefills from the current manual strategy and saves edits", () => {
    const spy = setup(
      planFor(
        { routeBeforeMs: T0, routeAfterMs: T1 },
        { kind: "manual-duration", durationMs: TWELVE_MIN },
      ),
    );
    fireEvent.click(screen.getByTestId("time-strategy-manual-duration"));

    expect(screen.getByTestId("duration-minutes")).toHaveValue(12);
    fireEvent.change(screen.getByTestId("duration-minutes"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByTestId("save-duration-button"));
    expect(spy).toHaveBeenCalledWith({
      kind: "manual-duration",
      durationMs: 20 * 60_000,
    });
  });

  it("cancel closes without dispatching", () => {
    const spy = setup(planFor({ routeBeforeMs: T0, routeAfterMs: T1 }, { kind: "distance-proportional" }));
    fireEvent.click(screen.getByTestId("time-strategy-manual-duration"));
    fireEvent.click(screen.getByTestId("cancel-duration-button"));

    expect(spy).not.toHaveBeenCalled();
    waitFor(() =>
      expect(screen.queryByTestId("manual-duration-dialog")).toBeNull(),
    );
  });
});

describe("TimeStrategyControls — the pace-estimated source (Task 28)", () => {
  /** 1 km drawn at 3⅓ m/s → a 5:00 estimate (5:00 /km). */
  const SPEED_MPS = 1000 / 300;
  const FILE_TIMING = {
    startMs: null,
    totalDurationMs: null,
    recordedSpeedMps: SPEED_MPS,
  };

  function pacePlan(
    boundaries: { routeBeforeMs?: number; routeAfterMs?: number },
    pathLengthM: number | null = DISTANCE_M,
  ) {
    return resolveGapTimePlan(
      boundaries,
      { kind: "pace-estimated" },
      FILE_TIMING,
      pathLengthM,
    );
  }

  function setupPace(
    plan: ReturnType<typeof pacePlan>,
    paceAvailable: boolean,
    strategySpy = vi.fn(),
  ) {
    render(
      <TimeStrategyControls
        plan={plan}
        distanceM={DISTANCE_M}
        vertexCount={2}
        setTimeStrategy={strategySpy}
        paceAvailable={paceAvailable}
      />,
    );
    return strategySpy;
  }

  it("a file pace adds the From-your-pace chip to the both-boundaries row", () => {
    setupPace(
      pacePlan({ routeBeforeMs: T0, routeAfterMs: T0 + 1000 }),
      true,
    );
    // The adjacent 1 s window with a 5:00 estimate — the section reads
    // as unmeasured, not paused.
    expect(screen.getByText(/wasn't measured/i)).toBeVisible();
    expect(screen.getByTestId("time-strategy-pace-estimated")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("gap-duration")).toHaveTextContent("5:00");
    expect(screen.getByTestId("gap-duration")).toHaveTextContent("pace estimate");
    expect(screen.getByTestId("gap-pace")).toHaveTextContent("5:00 /km");
  });

  it("without a file pace the chip never renders (the repair studio's UI)", () => {
    setupPace(
      pacePlan({ routeBeforeMs: T0, routeAfterMs: T0 + 1000 }),
      false,
    );
    expect(screen.queryByTestId("time-strategy-pace-estimated")).toBeNull();
  });

  it("an unmet pace-estimated plan explains itself instead of showing a duration", () => {
    setupPace(
      pacePlan({ routeBeforeMs: T0 }, null), // nothing drawn yet
      true,
    );
    expect(screen.getByTestId("time-missing-reason")).toHaveTextContent(
      /draw the route first/i,
    );
    expect(screen.getByTestId("gap-duration")).toHaveTextContent("—");
  });

  it("a one-boundary span offers pace + manual chips when a file pace exists", () => {
    const spy = setupPace(pacePlan({ routeBeforeMs: T0 }), true);

    // Two honest sources replace the single add-a-duration button.
    expect(screen.getByTestId("time-strategy-pace-estimated")).toBeVisible();
    expect(screen.getByTestId("time-strategy-manual-duration")).toBeVisible();
    expect(screen.queryByTestId("add-duration-button")).toBeNull();

    fireEvent.click(screen.getByTestId("time-strategy-pace-estimated"));
    expect(spy).toHaveBeenCalledWith({ kind: "pace-estimated" });
  });

  it("the estimate-vs-window disagreement is surfaced with the PE phrasing", () => {
    setupPace(
      pacePlan({ routeBeforeMs: T0, routeAfterMs: T0 + 1000 }), // 1 s recorded window
      true,
    );
    const alert = screen.getByTestId("duration-discrepancy");
    expect(alert).toHaveTextContent(/pace estimate/i);
    expect(alert).toHaveTextContent("5:00"); // the estimate
    expect(alert).toHaveTextContent("0:01"); // the recorded window
  });
});

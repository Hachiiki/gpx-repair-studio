// @vitest-environment jsdom
/**
 * React Testing Library — the Phase 23 dashboard surfaces:
 *
 *   - ZonesCard: the four tabs, the distribution rows with their
 *     bars, the honesty reasons (metrics-free / race-unset / no
 *     timing), the GAP line, the opt-in calorie line, and the
 *     per-split breakdown;
 *   - MetricsChart: the tabs, the keyboard readout (Arrow/Home/End/
 *     Escape), the textual table twin, the elevation backdrop;
 *   - ZoneSettings: commit-on-blur edits, boundary guardrails, the
 *     race picker, the calorie opt-in.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZonesCard } from "@/components/statistics/zones-card";
import { MetricsChart } from "@/components/statistics/metrics-chart";
import { ZoneSettings } from "@/components/statistics/zone-settings";
import type { FitnessSettings, ZonesView } from "@/hooks/use-zones";
import { DEFAULT_FITNESS_SETTINGS } from "@/features/statistics/zones";
import type { MetricsProfile } from "@/features/statistics/metrics-series";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function zonesView(overrides: Partial<ZonesView> = {}): ZonesView {
  return {
    hr: {
      zones: {
        rows: [
          { zone: 1, fromValue: null, toValue: 114, timeMs: 60_000, share: 0.2 },
          { zone: 2, fromValue: 114, toValue: 133, timeMs: 90_000, share: 0.3 },
          { zone: 3, fromValue: 133, toValue: 152, timeMs: 75_000, share: 0.25 },
          { zone: 4, fromValue: 152, toValue: 171, timeMs: 45_000, share: 0.15 },
          { zone: 5, fromValue: 171, toValue: null, timeMs: 30_000, share: 0.1 },
        ],
        zoneCount: 5,
        accountedMs: 300_000,
        noDataMs: 60_000,
        movingMs: 360_000,
        hasMetricData: true,
        hasTimingData: true,
      },
      perSplit: [
        {
          splitIndex: 1,
          zoneTimesMs: [30_000, 40_000, 0, 0, 0],
          noDataMs: 10_000,
          dominantZone: 2,
        },
      ],
    },
    power: {
      zones: {
        rows: [],
        zoneCount: 7,
        accountedMs: 0,
        noDataMs: 0,
        movingMs: 0,
        hasMetricData: false,
        hasTimingData: true,
      },
      perSplit: null,
    },
    pace: {
      zones: {
        rows: [],
        zoneCount: 6,
        accountedMs: 0,
        noDataMs: 0,
        movingMs: 0,
        hasMetricData: false,
        hasTimingData: true,
      },
      perSplit: null,
      boundaries: null,
    },
    cadence: {
      rows: [
        { from: 80, to: 90, timeMs: 120_000, share: 0.6 },
        { from: 90, to: null, timeMs: 80_000, share: 0.4 },
      ],
      accountedMs: 200_000,
      noDataMs: 0,
      movingMs: 200_000,
      hasCadenceData: true,
      hasTimingData: true,
    },
    gap: {
      movingMs: 360_000,
      gapTimeMs: 330_000,
      distanceM: 6000,
      gapPaceMsPerMeter: 312.5,
      actualPaceMsPerMeter: 340.2,
      flatLegs: 2,
      gradedLegs: 38,
      hasTimingData: true,
      hasElevationData: true,
    },
    calories: null,
    metricsProfile: null,
    ...overrides,
  };
}

function metricsProfile(overrides: Partial<MetricsProfile> = {}): MetricsProfile {
  return {
    points: [
      { xM: 0, ele: 100, hr: 120, kind: "recorded" },
      { xM: 500, ele: 110, hr: 130, kind: "recorded" },
      { xM: 1000, ele: 120, kind: "recorded" }, // hr hole
      { xM: 1500, ele: 130, hr: 150, kind: "recorded" },
    ],
    totalDistanceM: 1500,
    minEleM: 100,
    maxEleM: 130,
    hasAnyEle: true,
    hasHr: true,
    hasCad: false,
    hasPower: false,
    minHr: 120,
    maxHr: 150,
    minCad: 0,
    maxCad: 0,
    minWatts: 0,
    maxWatts: 0,
    smoothingWindow: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ZonesCard
// ---------------------------------------------------------------------------

describe("ZonesCard", () => {
  it("renders the HR distribution with names, ranges, times, and shares", () => {
    render(
      <ZonesCard
        zones={zonesView()}
        paceUnit="km"
        fitness={DEFAULT_FITNESS_SETTINGS}
        onFitnessChange={() => {}}
        onResetFitness={() => {}}
      />,
    );
    const card = screen.getByTestId("zones-card");
    expect(card).toHaveTextContent("Endurance");
    expect(card).toHaveTextContent("under 114 bpm");
    expect(card).toHaveTextContent("171 bpm and above");
    expect(screen.getByTestId("zone-row-3")).toHaveTextContent("Tempo");
    expect(screen.getByTestId("zone-row-3")).toHaveTextContent("1:15");
    expect(screen.getByTestId("zone-row-3")).toHaveTextContent("25%");
    expect(screen.getByTestId("zones-bar-2")).toBeInTheDocument();
    // The reconciliation line names the moving time.
    expect(card).toHaveTextContent("6:00");
  });

  it("switches tabs and shows the power/pace honesty reasons", () => {
    render(
      <ZonesCard
        zones={zonesView()}
        paceUnit="km"
        fitness={DEFAULT_FITNESS_SETTINGS}
        onFitnessChange={() => {}}
        onResetFitness={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("zones-tab-power"));
    expect(screen.getByTestId("zones-reason")).toHaveTextContent(
      "No power in this file",
    );
    fireEvent.click(screen.getByTestId("zones-tab-pace"));
    // GAP still shows on the pace tab; the zones carry the race-unset reason.
    expect(screen.getByTestId("zones-gap")).toHaveTextContent("GAP");
    expect(screen.getByTestId("zones-reason")).toHaveTextContent(
      "Set a recent race result",
    );
  });

  it("cadence tab renders the unit-agnostic ranges", () => {
    render(
      <ZonesCard
        zones={zonesView()}
        paceUnit="km"
        fitness={DEFAULT_FITNESS_SETTINGS}
        onFitnessChange={() => {}}
        onResetFitness={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("zones-tab-cadence"));
    expect(screen.getByTestId("zones-cadence-table")).toHaveTextContent("80–90");
    expect(screen.getByTestId("zones-cadence-table")).toHaveTextContent(
      "90 and above",
    );
  });

  it("the per-split breakdown opens with the dominant zones bold", () => {
    render(
      <ZonesCard
        zones={zonesView()}
        paceUnit="km"
        fitness={DEFAULT_FITNESS_SETTINGS}
        onFitnessChange={() => {}}
        onResetFitness={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("zones-split-toggle"));
    const table = screen.getByTestId("zones-split-table");
    expect(table).toHaveTextContent("30");
    expect(table).toHaveTextContent("40");
  });

  it("renders the opt-in calorie line only when the estimate exists", () => {
    const view = zonesView({
      calories: {
        kind: "power",
        kcal: 717.2,
        averageWatts: 210,
        powerSeconds: 3600,
      },
    });
    render(
      <ZonesCard
        zones={view}
        paceUnit="km"
        fitness={DEFAULT_FITNESS_SETTINGS}
        onFitnessChange={() => {}}
        onResetFitness={() => {}}
      />,
    );
    const calories = screen.getByTestId("zones-calories");
    expect(calories).toHaveTextContent("717 kcal");
    expect(calories).toHaveTextContent("210 W");
    expect(calories).toHaveTextContent("estimate");
  });

  it("a metrics-free file shows the honesty reason, not empty rows", () => {
    const view = zonesView({
      hr: {
        zones: {
          rows: [],
          zoneCount: 5,
          accountedMs: 0,
          noDataMs: 360_000,
          movingMs: 360_000,
          hasMetricData: false,
          hasTimingData: true,
        },
        perSplit: null,
      },
    });
    render(
      <ZonesCard
        zones={view}
        paceUnit="km"
        fitness={DEFAULT_FITNESS_SETTINGS}
        onFitnessChange={() => {}}
        onResetFitness={() => {}}
      />,
    );
    // The card opens on the first tab WITH data (cadence here) — the
    // metrics-free tabs carry their reasons.
    fireEvent.click(screen.getByTestId("zones-tab-hr"));
    expect(screen.getByTestId("zones-reason")).toHaveTextContent(
      "No heart rate in this file",
    );
  });
});

// ---------------------------------------------------------------------------
// MetricsChart
// ---------------------------------------------------------------------------

describe("MetricsChart", () => {
  it("draws the series over the elevation backdrop and reads by keyboard", () => {
    render(<MetricsChart profile={metricsProfile()} />);
    const svg = screen.getByTestId("metrics-chart-svg");
    expect(svg).toBeInTheDocument();
    expect(screen.getAllByTestId("metrics-elevation-backdrop").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("metrics-series").length).toBeGreaterThan(0);

    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByTestId("metrics-readout")).toHaveTextContent(
      "120 bpm",
    );
    fireEvent.keyDown(svg, { key: "End" });
    expect(screen.getByTestId("metrics-readout")).toHaveTextContent("150 bpm");
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(screen.getByTestId("metrics-readout")).toHaveTextContent(
      "hover, or focus + arrow keys",
    );
  });

  it("the hole sample reads its no-value reason", () => {
    render(<MetricsChart profile={metricsProfile()} />);
    const svg = screen.getByTestId("metrics-chart-svg");
    fireEvent.focus(svg);
    // Home → index 0; two ArrowRights → index 2 (the hr hole).
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByTestId("metrics-readout")).toHaveTextContent(
      "no Heart rate recorded",
    );
  });

  it("the textual twin buckets the same display series", () => {
    render(<MetricsChart profile={metricsProfile()} />);
    fireEvent.click(screen.getByTestId("metrics-table-toggle"));
    const table = screen.getByTestId("metrics-table");
    expect(table).toHaveTextContent("Distance interval");
    expect(table).toHaveTextContent("Average");
    expect(table).toHaveTextContent("—"); // the hole interval
  });

  it("renders nothing for a metric it does not carry", () => {
    render(<MetricsChart profile={metricsProfile()} />);
    expect(screen.queryByTestId("metrics-tab-cad")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metrics-tab-power")).not.toBeInTheDocument();
    expect(screen.getByTestId("metrics-tab-hr")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ZoneSettings
// ---------------------------------------------------------------------------

describe("ZoneSettings", () => {
  function setup(fitness: FitnessSettings = { ...DEFAULT_FITNESS_SETTINGS }) {
    const onFitnessChange = vi.fn();
    const onReset = vi.fn();
    render(
      <ZoneSettings
        fitness={fitness}
        onFitnessChange={onFitnessChange}
        onReset={onReset}
      />,
    );
    return { onFitnessChange, onReset };
  }

  it("commits a max-HR edit on blur and re-derives the boundaries", () => {
    const { onFitnessChange } = setup();
    fireEvent.click(screen.getByTestId("zone-settings-trigger"));
    const input = screen.getByLabelText("Max heart rate", {
      exact: false,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "180" } });
    fireEvent.blur(input);
    expect(onFitnessChange).toHaveBeenCalledWith({
      hr: { maxHr: 180, boundaries: [108, 126, 144, 162] },
    });
  });

  it("discards an invalid draft (out of range) instead of committing", () => {
    const { onFitnessChange } = setup();
    fireEvent.click(screen.getByTestId("zone-settings-trigger"));
    const input = screen.getByLabelText("FTP") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    expect(onFitnessChange).not.toHaveBeenCalled();
    expect(input.value).toBe("200");
  });

  it("a boundary edit that violates the guardrails is rejected with its reason", () => {
    const { onFitnessChange } = setup();
    fireEvent.click(screen.getByTestId("zone-settings-trigger"));
    // The Z2 boundary field (the first of the four): 140 sits above
    // Z3's floor (133) but inside the max-HR cap — the overlap rule.
    const input = screen.getByLabelText("Z2") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "140" } });
    fireEvent.blur(input);
    expect(onFitnessChange).not.toHaveBeenCalled();
    // The guardrail verdict shows under the boundary fields.
    const issues = screen.getAllByTestId("zone-settings-issue");
    expect(issues[0]).toHaveTextContent("Boundaries must increase");
  });

  it("the race picker parks the distance and the time commits on blur", () => {
    const { onFitnessChange } = setup();
    fireEvent.click(screen.getByTestId("zone-settings-trigger"));
    fireEvent.click(screen.getByTestId("zone-race-distance"));
    fireEvent.click(screen.getByTestId("zone-race-5k"));
    // Selecting the preset with no time yet parks distance only.
    expect(onFitnessChange).toHaveBeenCalledWith({
      pace: { race: { distanceM: 5000, timeMs: 0 } },
    });
    // Enter 25:00 and blur an h/m/s field.
    const fields = within(
      screen.getByTestId("zone-race-time"),
    ).getAllByRole("spinbutton");
    fireEvent.change(fields[1], { target: { value: "25" } });
    fireEvent.blur(fields[1]);
    expect(onFitnessChange).toHaveBeenCalledWith({
      pace: { race: { distanceM: 5000, timeMs: 1_500_000 } },
    });
  });

  it("the calorie opt-in toggles and the weight commits", () => {
    const fitness: FitnessSettings = {
      ...DEFAULT_FITNESS_SETTINGS,
      calories: { enabled: true, weightKg: null },
    };
    const { onFitnessChange } = setup(fitness);
    fireEvent.click(screen.getByTestId("zone-settings-trigger"));
    const input = screen.getByLabelText("Weight") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.blur(input);
    expect(onFitnessChange).toHaveBeenCalledWith({
      calories: { enabled: true, weightKg: 75 },
    });
  });

  it("reset returns everything to the documented defaults", () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByTestId("zone-settings-trigger"));
    fireEvent.click(screen.getByTestId("zone-settings-reset"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

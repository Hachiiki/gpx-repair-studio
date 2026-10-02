// @vitest-environment jsdom
/**
 * React Testing Library — the Phase 15 stats dashboard (§EE 15):
 *
 *   - SplitsCard: rows + provenance + honesty flags + the no-timing
 *     honest note + the pace bars + the table disclosure;
 *   - TimeInMotionCard: the summary blocks, the breakdown table, the
 *     stops disclosure;
 *   - StatsPanel's Phase 15 actions (Stats CSV / Print): present and
 *     wired when provided, absent otherwise (merge/recovery studios);
 *   - ElevationProfileChart upgrades: the keyboard readout cursor
 *     (Arrow/Home/End/Escape), the profile table, the area shading.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SplitsCard } from "@/components/statistics/splits-card";
import { TimeInMotionCard } from "@/components/statistics/time-in-motion-card";
import { StatsPanel } from "@/components/statistics/stats-panel";
import { ElevationProfileChart } from "@/components/statistics/elevation-profile-chart";
import type { SplitsResult } from "@/hooks/use-splits";
import type { MotionSummary } from "@/hooks/use-splits";
import type { ElevationProfile } from "@/hooks/use-elevation";
import type { DistanceStats, TimeStats } from "@/hooks/use-gpx-session";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function splits(overrides: Partial<SplitsResult> = {}): SplitsResult {
  return {
    rows: [
      {
        index: 1,
        fromM: 0,
        toM: 1000,
        distanceM: 1000,
        timeMs: 300_000,
        timedLegs: 30,
        gapLegs: 0,
        untimedLegs: 0,
        reversedLegs: 0,
        eleGainM: 12,
        eleLossM: 2,
        elePoints: 30,
        eleEstimated: false,
        provenance: "recorded",
      },
      {
        index: 2,
        fromM: 1000,
        toM: 2000,
        distanceM: 1000,
        timeMs: 320_000,
        timedLegs: 28,
        gapLegs: 1,
        untimedLegs: 2,
        reversedLegs: 0,
        eleGainM: null,
        eleLossM: null,
        elePoints: 0,
        eleEstimated: false,
        provenance: "mixed",
      },
      {
        index: 3,
        fromM: 2000,
        toM: 2400,
        distanceM: 400,
        timeMs: 0,
        timedLegs: 0,
        gapLegs: 0,
        untimedLegs: 12,
        reversedLegs: 0,
        eleGainM: 8,
        eleLossM: 0,
        elePoints: 12,
        eleEstimated: true,
        provenance: "estimated",
      },
    ],
    splitLengthM: 1000,
    totalDistanceM: 2400,
    hasTimingData: true,
    hasElevationData: true,
    totalGainM: 20,
    totalLossM: 2,
    hysteresisThresholdM: 2,
    ...overrides,
  };
}

function motion(overrides: Partial<MotionSummary> = {}): MotionSummary {
  return {
    hasTimingData: true,
    wallTimeMs: 1_800_000,
    movingMs: 1_500_000,
    stoppedMs: 300_000,
    inMotionMs: 1_200_000,
    stopEvents: [
      {
        index: 1,
        startMs: Date.parse("2024-05-01T07:10:00Z"),
        atDistanceM: 1250,
        durationMs: 180_000,
        provenance: "recorded",
      },
      {
        index: 2,
        atDistanceM: 2100,
        durationMs: 120_000,
        provenance: "mixed",
      },
    ],
    longestStopMs: 180_000,
    stopSpeedMps: 0.5,
    gapLegs: 1,
    gapTimeMs: 300_000,
    untimedLegs: 2,
    reversedLegs: 0,
    hasEstimatedLegs: false,
    ...overrides,
  };
}

const DISTANCE: DistanceStats = {
  totalDistanceM: 5000,
  perSegment: [],
  usableLegs: 5,
  excludedLegs: 0,
  excludedByReason: {
    "invalid-coord": 0,
    "out-of-range-coord": 0,
    "zero-coord": 0,
  },
};
const TIME: TimeStats = {
  hasTimingData: true,
  recordedMovingTimeMs: 1500_000,
  wallTimeMs: 1800_000,
  gapTimeMs: 300_000,
  gapLegs: 1,
  reversedLegs: 0,
  untimedLegs: 0,
  pointsWithTime: 6,
  pointsTotal: 6,
};

function profile(): ElevationProfile {
  return {
    points: [
      { xM: 0, ele: 10, kind: "recorded" },
      { xM: 100, ele: 20, kind: "recorded" },
      { xM: 200, ele: undefined, kind: "recorded" },
      { xM: 300, ele: 30, kind: "recorded" },
      { xM: 400, ele: 45, kind: "reconstructed" },
      { xM: 500, ele: 55, kind: "reconstructed" },
      { xM: 600, ele: 40, kind: "recorded" },
    ],
    minEleM: 10,
    maxEleM: 55,
    totalDistanceM: 600,
    hasAnyEle: true,
    recordedCount: 5,
    reconstructedCount: 2,
  };
}

// ---------------------------------------------------------------------------
// SplitsCard
// ---------------------------------------------------------------------------

describe("SplitsCard", () => {
  it("renders the pace chart with one bar per timed split", () => {
    render(<SplitsCard splits={splits()} paceUnit="km" />);
    const bars = screen.getAllByTestId("splits-pace-bar");
    // Split 3 has no time → a dashed tick, not a bar.
    expect(bars).toHaveLength(2);
  });

  it("renders rows with ranges, paces, gains, and provenance badges", () => {
    render(<SplitsCard splits={splits()} paceUnit="km" />);
    expect(screen.getByTestId("split-row-1")).toHaveTextContent("5:00 /km");
    expect(screen.getByTestId("split-row-1")).toHaveTextContent("12 m");
    expect(screen.getByTestId("split-row-3")).toHaveTextContent("—");
    expect(screen.getByTestId("split-row-3")).toHaveTextContent("est");
  });

  it("discloses partial-time flags under the affected splits", () => {
    render(<SplitsCard splits={splits()} paceUnit="km" />);
    const row2 = screen.getByTestId("split-row-2");
    expect(row2).toHaveTextContent("1 gap leg");
    expect(row2).toHaveTextContent("2 untimed legs");
  });

  it("sums the total row and states the hysteresis rule", () => {
    render(<SplitsCard splits={splits()} paceUnit="km" />);
    const table = screen.getByTestId("splits-table");
    expect(table).toHaveTextContent("Total");
    expect(table).toHaveTextContent("2.40 km");
    expect(table).toHaveTextContent("hysteresis deadband");
  });

  it("switches ranges and distances with the pace unit", () => {
    render(<SplitsCard splits={splits()} paceUnit="mi" />);
    const row1 = screen.getByTestId("split-row-1");
    expect(row1).toHaveTextContent("0 mi–0.6 mi");
    expect(row1).toHaveTextContent("0.62 mi");
  });

  it("shows the honest no-timing note and skips the chart", () => {
    render(
      <SplitsCard
        splits={splits({ hasTimingData: false, rows: splits().rows.map((r) => ({ ...r, timeMs: 0, timedLegs: 0 })) })}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("splits-card")).toHaveTextContent(
      "No timing data",
    );
    expect(screen.queryByTestId("splits-pace-chart")).not.toBeInTheDocument();
  });

  it("collapses and reopens the table", () => {
    render(<SplitsCard splits={splits()} paceUnit="km" />);
    fireEvent.click(screen.getByTestId("splits-table-toggle"));
    expect(screen.queryByTestId("splits-table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("splits-table-toggle"));
    expect(screen.getByTestId("splits-table")).toBeInTheDocument();
  });

  // §C-2 regression: a 687-split stress file once rendered every row and
  // blew the 250k DOM-node budget — the table now pages in steps of 60.
  function manySplits(count: number): SplitsResult {
    const rows = Array.from({ length: count }, (_, i) => ({
      index: i + 1,
      fromM: i * 1000,
      toM: (i + 1) * 1000,
      distanceM: 1000,
      timeMs: 300_000,
      timedLegs: 10,
      gapLegs: 0,
      untimedLegs: 0,
      reversedLegs: 0,
      eleGainM: 5,
      eleLossM: 0,
      elePoints: 10,
      eleEstimated: false,
      provenance: "recorded" as const,
    }));
    return {
      rows,
      splitLengthM: 1000,
      totalDistanceM: count * 1000,
      hasTimingData: true,
      hasElevationData: true,
      totalGainM: count * 5,
      totalLossM: 0,
      hysteresisThresholdM: 2,
    };
  }

  it("caps rendered rows on huge files, pages with Show more, keeps the total honest", () => {
    render(<SplitsCard splits={manySplits(130)} paceUnit="km" />);
    // Only the first page of rows mounts.
    expect(screen.getAllByTestId(/split-row-\d+/)).toHaveLength(60);
    const note = screen.getByTestId("splits-cap-note");
    expect(note).toHaveTextContent("Showing 60 of 130 splits");
    expect(note).toHaveTextContent("stats CSV carries every one");

    // The Total row still reconciles over ALL splits, not the page.
    expect(screen.getByTestId("splits-table")).toHaveTextContent("130 splits");
    expect(screen.getByTestId("splits-table")).toHaveTextContent("130.00 km");

    // Show more pages in the next 60.
    fireEvent.click(screen.getByTestId("splits-show-more"));
    expect(screen.getAllByTestId(/split-row-\d+/)).toHaveLength(120);
    expect(screen.getByTestId("splits-cap-note")).toHaveTextContent(
      "Showing 120 of 130 splits",
    );

    // The last page finishes the list and retires the button.
    fireEvent.click(screen.getByTestId("splits-show-more"));
    expect(screen.getAllByTestId(/split-row-\d+/)).toHaveLength(130);
    expect(screen.queryByTestId("splits-show-more")).not.toBeInTheDocument();
    expect(screen.queryByTestId("splits-cap-note")).not.toBeInTheDocument();
  });

  it("small files never see the cap note or the show-more button", () => {
    render(<SplitsCard splits={splits()} paceUnit="km" />);
    expect(screen.queryByTestId("splits-cap-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("splits-show-more")).not.toBeInTheDocument();
  });

  it("dense charts drop per-bar hover titles and say so; sparse charts keep them", () => {
    const { unmount } = render(
      <SplitsCard splits={manySplits(130)} paceUnit="km" />,
    );
    const denseChart = screen.getByTestId("splits-pace-chart");
    expect(denseChart.querySelectorAll("title")).toHaveLength(0);
    expect(denseChart).toHaveTextContent("130 bars");
    expect(denseChart).toHaveTextContent("hover readouts off");
    unmount();

    const sparse = render(<SplitsCard splits={splits()} paceUnit="km" />);
    const titles = sparse.container
      .querySelector('[data-testid="splits-pace-chart"]')
      ?.querySelectorAll("title");
    expect(titles?.length ?? 0).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TimeInMotionCard
// ---------------------------------------------------------------------------

describe("TimeInMotionCard", () => {
  it("shows the in-motion / stopped summary with the stop count", () => {
    render(<TimeInMotionCard motion={motion()} />);
    const summary = screen.getByTestId("motion-summary");
    expect(summary).toHaveTextContent("In motion");
    expect(summary).toHaveTextContent("20:00");
    expect(summary).toHaveTextContent("Stopped");
    expect(summary).toHaveTextContent("2 stops");
    expect(summary).toHaveTextContent("longest 3:00");
  });

  it("renders the breakdown with gap disclosure", () => {
    render(<TimeInMotionCard motion={motion()} />);
    const table = screen.getByTestId("motion-breakdown");
    expect(table).toHaveTextContent("Wall time");
    expect(table).toHaveTextContent("30:00");
    expect(table).toHaveTextContent("excludes 1 gap leg");
    expect(table).toHaveTextContent("never guessed");
  });

  it("lists stops behind the disclosure with their provenance", () => {
    render(<TimeInMotionCard motion={motion()} />);
    expect(screen.queryByTestId("stops-table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stops-table-toggle"));
    const stops = screen.getByTestId("stops-table");
    expect(within(stops).getAllByTestId(/stop-row-/)).toHaveLength(2);
    expect(screen.getByTestId("stop-row-2")).toHaveTextContent("2.10 km");
  });

  it("a stopless summary says so without the list", () => {
    render(<TimeInMotionCard motion={motion({ stopEvents: [], stoppedMs: 0, longestStopMs: 0 })} />);
    expect(screen.getByTestId("motion-summary")).toHaveTextContent(
      "no stops detected",
    );
    expect(screen.queryByTestId("stops-table-toggle")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// StatsPanel — the Phase 15 actions
// ---------------------------------------------------------------------------

describe("StatsPanel — stats CSV & print actions", () => {
  it("renders the buttons and dispatches the intents", () => {
    const onCsv = vi.fn();
    const onPrint = vi.fn();
    render(
      <StatsPanel
        distanceStats={DISTANCE}
        timeStats={TIME}
        paceUnit="km"
        onPaceUnitChange={() => {}}
        onDownloadStatsCsv={onCsv}
        onPrintStats={onPrint}
      />,
    );
    fireEvent.click(screen.getByTestId("download-stats-csv-button"));
    expect(onCsv).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("print-stats-button"));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it("omits the actions when the intents are not provided", () => {
    render(
      <StatsPanel
        distanceStats={DISTANCE}
        timeStats={TIME}
        paceUnit="km"
        onPaceUnitChange={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("download-stats-csv-button"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("print-stats-button")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ElevationProfileChart — the Phase 15 upgrades
// ---------------------------------------------------------------------------

describe("ElevationProfileChart — readout, table, shading", () => {
  it("fills the area under both provenances", () => {
    render(<ElevationProfileChart profile={profile()} />);
    expect(
      screen.getAllByTestId("elevation-profile-area-recorded").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("elevation-profile-area-reconstructed").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("the keyboard cursor moves the readout and Escape clears it", () => {
    render(<ElevationProfileChart profile={profile()} />);
    const svg = screen.getByTestId("elevation-profile-svg");
    svg.focus();
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    let readout = screen.getByTestId("elevation-profile-readout");
    expect(readout).toHaveTextContent("at 0 m — 10 m (recorded)");
    expect(screen.getByTestId("elevation-profile-cursor")).toBeInTheDocument();
    fireEvent.keyDown(svg, { key: "End" });
    readout = screen.getByTestId("elevation-profile-readout");
    expect(readout).toHaveTextContent("at 600 m — 40 m (recorded)");
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(
      screen.queryByTestId("elevation-profile-cursor"),
    ).not.toBeInTheDocument();
  });

  it("the readout names the hole and the estimate", () => {
    render(<ElevationProfileChart profile={profile()} />);
    const svg = screen.getByTestId("elevation-profile-svg");
    svg.focus();
    // Sample 2 is the hole; sample 4 is reconstructed.
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByTestId("elevation-profile-readout")).toHaveTextContent(
      "no elevation recorded",
    );
    fireEvent.keyDown(svg, { key: "Home" });
    for (let i = 0; i < 4; i += 1) {
      fireEvent.keyDown(svg, { key: "ArrowRight" });
    }
    expect(screen.getByTestId("elevation-profile-readout")).toHaveTextContent(
      "reconstructed, estimated",
    );
  });

  it("the profile table opens with interval rows and the disclosure", () => {
    render(<ElevationProfileChart profile={profile()} />);
    expect(screen.queryByTestId("elevation-profile-table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("elevation-profile-table-toggle"));
    const table = screen.getByTestId("elevation-profile-table");
    expect(screen.getByTestId("elevation-profile-chart")).toHaveTextContent(
      "display series",
    );
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
    // No degenerate zero-width trailing interval.
    expect(table.textContent).not.toContain("600 m–600 m");
  });

  // The Phase 15 VLM critique's confirmed defect: a buggy bucket formula
  // once produced one row per display point (161 on a 6.5 km sample). The
  // table is a ≤24-row summary — locked here at both ends.
  function longProfile(): ElevationProfile {
    const points = Array.from({ length: 400 }, (_, i) => ({
      xM: i * 20, // 8 km of display points, 20 m apart
      ele: 10 + Math.round(20 * Math.abs(Math.sin(i / 9))),
      kind: (i % 37 === 0 ? "reconstructed" : "recorded") as
        | "recorded"
        | "reconstructed",
    }));
    return {
      points,
      minEleM: 10,
      maxEleM: 30,
      totalDistanceM: 7980,
      hasAnyEle: true,
      recordedCount: 390,
      reconstructedCount: 10,
    };
  }

  it("the profile table never exceeds 24 intervals, however long the route", () => {
    render(<ElevationProfileChart profile={longProfile()} />);
    fireEvent.click(screen.getByTestId("elevation-profile-table-toggle"));
    const rows = screen
      .getByTestId("elevation-profile-table")
      .querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.length).toBeLessThanOrEqual(24);
    // An 8 km route at a 250 m floor wants the full 24.
    expect(rows.length).toBe(24);
  });

  it("short routes keep a few wide rows, not 24 crumbs", () => {
    render(<ElevationProfileChart profile={profile()} />);
    fireEvent.click(screen.getByTestId("elevation-profile-table-toggle"));
    // The 600 m fixture: ceil(600/250) = 3 intervals.
    const rows = screen
      .getByTestId("elevation-profile-table")
      .querySelectorAll("tbody tr");
    expect(rows.length).toBe(3);
  });
});

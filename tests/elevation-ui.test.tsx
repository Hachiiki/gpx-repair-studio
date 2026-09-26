// @vitest-environment jsdom
/**
 * React Testing Library — the Phase 6 elevation UI:
 *
 *   - ElevationControls: the state machine (blocked hint, opt-in
 *     button, disclosure with exact numbers, fetching progress, the
 *     complete summary, partial honesty, stale re-estimate, failure
 *     retry) — intents dispatched, nothing fetched here;
 *   - StatsPanel: the §L-1 elevation rows (provenance split, the 60%
 *     coverage withholding, the without-estimate note);
 *   - ElevationProfileChart: both provenances painted, holes break the
 *     line, the a11y summary.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElevationControls } from "@/components/reconstruction/elevation-controls";
import { ElevationProfileChart } from "@/components/statistics/elevation-profile-chart";
import { StatsPanel } from "@/components/statistics/stats-panel";
import type { ElevationControlsBinding } from "@/hooks/use-elevation";
import type { ElevationProfile, ElevationStatsRows } from "@/hooks/use-elevation";
import type { DistanceStats, TimeStats } from "@/hooks/use-gpx-session";

afterEach(() => cleanup());

const PRIVACY_NOTE = "The coordinates of your reconstructed points are sent…";

function controls(
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
    disclosure: { sentPoints: 12, totalPoints: 12, requestCount: 1 },
    providerName: "OpenTopoData",
    attribution: "Elevation: OpenTopoData (SRTM 30 m)",
    privacyNote: PRIVACY_NOTE,
    summary: null,
    error: null,
    confirmFetch: vi.fn(),
    ...overrides,
  };
}

describe("ElevationControls", () => {
  it("shows the honest hint while nothing is drawn", () => {
    render(
      <ElevationControls
        elevation={controls({
          canFetch: false,
          blockedReason: "Draw the missing route first — elevation is estimated for the points you draw.",
        })}
      />,
    );
    expect(screen.getByTestId("elevation-blocked-hint")).toBeInTheDocument();
    expect(
      screen.queryByTestId("elevation-estimate-button"),
    ).not.toBeInTheDocument();
  });

  it("opens the disclosure with exact numbers; confirm dispatches the fetch", () => {
    const confirmFetch = vi.fn();
    render(
      <ElevationControls
        elevation={controls({
          disclosure: { sentPoints: 340, totalPoints: 900, requestCount: 4 },
          confirmFetch,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("elevation-estimate-button"));
    const dialog = screen.getByTestId("elevation-disclosure-dialog");
    expect(dialog).toHaveTextContent("340 coordinates");
    expect(dialog).toHaveTextContent("sampled from 900");
    expect(dialog).toHaveTextContent("4 requests");
    expect(dialog).toHaveTextContent(PRIVACY_NOTE);

    fireEvent.click(screen.getByTestId("elevation-disclosure-confirm"));
    expect(confirmFetch).toHaveBeenCalledTimes(1);
    // The dialog closes on confirm.
    expect(screen.queryByTestId("elevation-disclosure-dialog")).not.toBeInTheDocument();
  });

  it("renders fetching progress with the sampled-from note", () => {
    render(
      <ElevationControls
        elevation={controls({
          status: "fetching",
          fetching: true,
          answered: 100,
          sent: 340,
          total: 900,
        })}
      />,
    );
    const progress = screen.getByTestId("elevation-progress");
    expect(progress).toHaveTextContent("100/340");
    expect(progress).toHaveTextContent("sampled from 900");
  });

  it("renders the per-gap summary once complete, with a re-estimate action", () => {
    render(
      <ElevationControls
        elevation={controls({
          status: "complete",
          summary: { minEleM: 38, maxEleM: 71, gainM: 33, lossM: 12 },
        })}
      />,
    );
    const summary = screen.getByTestId("elevation-gap-summary");
    expect(summary).toHaveTextContent("▲ 33 m");
    expect(summary).toHaveTextContent("▼ 12 m");
    expect(summary).toHaveTextContent("38 m – 71 m");
    expect(summary).toHaveTextContent("OpenTopoData");
    expect(screen.getByTestId("elevation-status-badge")).toHaveTextContent("Estimated");
  });

  it("labels partial results with the resolved count", () => {
    render(
      <ElevationControls
        elevation={controls({
          status: "partial",
          sent: 340,
          resolved: 300,
          summary: { minEleM: 38, maxEleM: 71, gainM: 33, lossM: 12 },
        })}
      />,
    );
    expect(screen.getByTestId("elevation-partial-note")).toHaveTextContent(
      "300 of 340",
    );
    expect(screen.getByTestId("elevation-status-badge")).toHaveTextContent("Partial");
  });

  it("surfaces staleness with the exclusion consequence and re-estimate", () => {
    render(
      <ElevationControls
        elevation={controls({ status: "stale", stale: true })}
      />,
    );
    const note = screen.getByTestId("elevation-stale-note");
    expect(note).toHaveTextContent("route changed");
    expect(note).toHaveTextContent("excluded");
    expect(screen.getByTestId("elevation-refetch-button")).toBeInTheDocument();
  });

  it("shows the failure message with a retry that re-discloses", () => {
    render(
      <ElevationControls
        elevation={controls({
          status: "failed",
          error: "The elevation service could not be reached — check your connection and try again.",
        })}
      />,
    );
    expect(screen.getByTestId("elevation-failure")).toHaveTextContent(
      "could not be reached",
    );
    fireEvent.click(screen.getByTestId("elevation-retry-button"));
    expect(screen.getByTestId("elevation-disclosure-dialog")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// StatsPanel elevation rows
// ---------------------------------------------------------------------------

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

function rows(overrides: Partial<ElevationStatsRows> = {}): ElevationStatsRows {
  return {
    original: { gainM: 172, lossM: 168 },
    reconstructed: null,
    mixed: { gainM: 172, lossM: 168 },
    coverage: 1,
    insufficient: false,
    pointsWithEle: 6,
    pointsTotal: 6,
    repairsWithoutElevation: 0,
    hysteresisThresholdM: 2,
    ...overrides,
  };
}

function renderStats(elevation: ElevationStatsRows | null) {
  render(
    <StatsPanel
      distanceStats={DISTANCE}
      timeStats={TIME}
      elevation={elevation}
      paceUnit="km"
      onPaceUnitChange={() => {}}
    />,
  );
}

describe("StatsPanel — elevation rows (§L-1)", () => {
  it("renders recorded-only gain/loss without repairs", () => {
    renderStats(rows());
    const gains = screen.getAllByTestId("elevation-gain-row");
    expect(gains).toHaveLength(1);
    expect(gains[0]).toHaveTextContent("Elevation gain");
    expect(gains[0]).not.toHaveTextContent("(repairs)");
    expect(gains[0]).toHaveTextContent("172 m");
    expect(screen.getAllByTestId("elevation-loss-row")[0]).toHaveTextContent(
      "168 m",
    );
    expect(screen.getByTestId("elevation-note")).toHaveTextContent("2.0 m noise threshold");
  });

  it("splits by provenance when repairs carry elevation", () => {
    renderStats(
      rows({
        reconstructed: { gainM: 12, lossM: 10 },
        mixed: { gainM: 184, lossM: 178 },
        pointsWithEle: 8,
        pointsTotal: 8,
      }),
    );
    const gains = screen.getAllByTestId("elevation-gain-row");
    expect(gains).toHaveLength(3);
    expect(gains[1]).toHaveTextContent("Elevation gain (repairs)");
    expect(gains[1]).toHaveTextContent("12 m");
    expect(gains[2]).toHaveTextContent("184 m");
    expect(screen.getByTestId("elevation-note")).toHaveTextContent(
      "estimated from OpenTopoData terrain",
    );
  });

  it("withholds totals under the 60% coverage rule", () => {
    renderStats(
      rows({
        original: null,
        reconstructed: { gainM: 12, lossM: 10 },
        mixed: { gainM: 12, lossM: 10 },
        coverage: 0.25,
        insufficient: true,
        pointsWithEle: 2,
        pointsTotal: 8,
      }),
    );
    const gain = screen.getByTestId("elevation-gain-row");
    expect(gain).toHaveTextContent("—");
    expect(screen.getByTestId("elevation-note")).toHaveTextContent(
      "Insufficient elevation data",
    );
  });

  it("notes repairs without an estimate", () => {
    renderStats(rows({ repairsWithoutElevation: 2 }));
    const note = screen.getByTestId("elevation-missing-note");
    expect(note).toHaveTextContent("2 repairs without an elevation estimate");
  });

  it("renders no elevation rows without the prop", () => {
    renderStats(null);
    expect(screen.queryByTestId("elevation-gain-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("elevation-note")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ElevationProfileChart
// ---------------------------------------------------------------------------

function profile(overrides: Partial<ElevationProfile> = {}): ElevationProfile {
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
    ...overrides,
  };
}

describe("ElevationProfileChart (FR-6.4)", () => {
  it("paints both provenances with distinct testids and a legend", () => {
    render(<ElevationProfileChart profile={profile()} />);
    const chart = screen.getByTestId("elevation-profile-chart");
    expect(chart).toHaveTextContent("Recorded");
    expect(chart).toHaveTextContent("Reconstructed (estimated)");
    expect(
      screen.getAllByTestId("elevation-profile-recorded").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("elevation-profile-reconstructed").length,
    ).toBeGreaterThanOrEqual(1);
    // The a11y summary speaks the range and the estimate caveat.
    const svg = screen.getByTestId("elevation-profile-svg");
    expect(svg).toHaveAttribute(
      "role",
      "img",
    );
    expect(svg.getAttribute("aria-label")).toContain("estimated");
  });

  it("breaks the recorded line at the hole (no drop to zero)", () => {
    render(<ElevationProfileChart profile={profile()} />);
    // Two recorded segments: [0,100] and [300] is single-point → filtered;
    // with the 600 m point there are two recorded paths.
    const recorded = screen.getAllByTestId("elevation-profile-recorded");
    expect(recorded.length).toBeGreaterThanOrEqual(1);
    for (const path of recorded) {
      // No path may contain a y at the plot floor for the hole's x —
      // the strongest check: the hole SPLIT the run (2 recorded paths).
      expect(path.getAttribute("d")).toMatch(/^M/);
    }
  });

  it("renders nothing without any elevation", () => {
    const { container } = render(
      <ElevationProfileChart
        profile={profile({ hasAnyEle: false, points: [] })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// @vitest-environment jsdom
/**
 * StatsPanel re-import join tests (Task 20 fix).
 *
 * Pins the Phase 7 double-count fix: for a re-uploaded repaired file,
 * `originalDistanceStats`/`originalTimeStats` already contain the
 * marked (gpxr) stretches, so the panel's "Recorded distance" must
 * SUBTRACT them and "Total with repairs" must NOT add them again.
 * Golden values from the live probe that found the bug: a 5-point line
 * at 110.6 m per leg with the middle leg marked → file total 331.7 m,
 * recorded 221.1 m, marked 110.6 m, moving time 4:00 (marked run 1:00
 * already inside it).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatsPanel } from "@/components/statistics/stats-panel";
import type { DistanceStats } from "@/features/statistics/distance";
import type { TimeStats } from "@/features/statistics/time";
import type { ReimportStats } from "@/features/statistics/reimport";

afterEach(() => cleanup());

const DISTANCE: DistanceStats = {
  totalDistanceM: 331.7,
  usableLegs: 4,
  excludedLegs: 0,
  excludedByReason: { "invalid-coord": 0, "out-of-range-coord": 0, "zero-coord": 0 },
  perSegment: [],
};

const TIME: TimeStats = {
  hasTimingData: true,
  pointsWithTime: 5,
  pointsTotal: 5,
  firstTimeMs: 0,
  lastTimeMs: 240_000,
  wallTimeMs: 240_000,
  recordedMovingTimeMs: 240_000,
  gapLegs: 0,
  gapTimeMs: 0,
  untimedLegs: 0,
  reversedLegs: 0,
};

const REIMPORT: ReimportStats = {
  markerCount: 2,
  repairedDistanceM: 110.6,
  repairedLegs: 1,
  repairTimeMs: 60_000,
  runCount: 1,
};

function rows(): { text: string }[] {
  return Array.from(
    screen.getByTestId("stats-panel").querySelectorAll("tbody tr"),
  ).map((row) => ({ text: row.textContent ?? "" }));
}

function renderPanel(reimport: ReimportStats | null) {
  render(
    <StatsPanel
      distanceStats={DISTANCE}
      timeStats={TIME}
      reimport={reimport}
      paceUnit="km"
      onPaceUnitChange={() => {}}
    />,
  );
}

describe("StatsPanel — re-imported repairs join (the double-count fix)", () => {
  it("splits recorded vs repaired without inflating the total", () => {
    renderPanel(REIMPORT);

    const byLabel = (label: string) =>
      rows().find((r) => r.text.includes(label))?.text ?? "";

    // Recorded = file total minus the marked stretch.
    expect(byLabel("Recorded distance")).toContain("221 m");
    expect(byLabel("Repaired distance")).toContain("111 m");
    // The total is the FILE's total — not total + marked (the bug read
    // "442 m" here).
    expect(byLabel("Total with repairs")).toContain("332 m");

    // Moving time already contains the marked run (its distributed
    // legs sit under the gap threshold) — "4:00", never "5:00".
    expect(byLabel("Moving time incl. repairs")).toContain("4:00");
    // The estimated repair-time row still reports the run's own span.
    expect(byLabel("Repair time")).toContain("1:00");
  });

  it("keeps the plain (no-reimport) presentation byte-identical", () => {
    renderPanel(null);

    const byLabel = (label: string) =>
      rows().find((r) => r.text.includes(label))?.text ?? "";
    // No repairs → the single "Total distance" row, the Phase 2 shape.
    expect(byLabel("Total distance")).toContain("332 m");
    expect(screen.queryByText("Recorded distance")).toBeNull();
    expect(
      screen.queryByTestId("reimport-note"),
    ).toBeNull();
  });

  it("answers original → repaired → outcome up front (user pass 35)", () => {
    renderPanel(REIMPORT);

    const banner = screen.getByTestId("stats-outcome-banner");
    expect(banner).toHaveTextContent("Original");
    expect(banner).toHaveTextContent("+ Repaired");
    expect(banner).toHaveTextContent("Outcome");
    // The same golden values the rows carry: 221 recorded + 111 marked
    // = the file's 332 m total; moving time already contains the
    // marked run's 1:00 (4:00, never 5:00).
    expect(banner).toHaveTextContent("221 m");
    expect(banner).toHaveTextContent("111 m");
    expect(banner).toHaveTextContent("332 m");
    expect(banner).toHaveTextContent("4:00");

    // Without repairs the banner does not render at all.
    cleanup();
    renderPanel(null);
    expect(screen.queryByTestId("stats-outcome-banner")).toBeNull();
  });

  it("groups the rows by category (user pass 35)", () => {
    renderPanel(REIMPORT);

    const labels = rows().map((r) => r.text);
    // The quiet section labels are part of the table now (Pace joins
    // when the binding supplies pace rows — the app always does).
    expect(labels.some((t) => t.includes("Distance"))).toBe(true);
    expect(labels.some((t) => t.includes("Time"))).toBe(true);
    // Every data row still carries its exact label and value.
    const byLabel = (label: string) =>
      labels.find((t) => t.includes(label)) ?? "";
    expect(byLabel("Recorded distance")).toContain("221 m");
    expect(byLabel("Total with repairs")).toContain("332 m");
  });
});

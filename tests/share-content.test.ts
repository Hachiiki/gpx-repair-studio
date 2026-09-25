// @vitest-environment jsdom
/**
 * Share card content tests (Task 20) — features/share/cardContent.ts.
 *
 * The honest trio: golden values from the real fixture pipeline, the
 * "—" rules (no timing → no pace/time, non-monotonic → no elapsed),
 * unit conversion, and re-import inclusion notes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseGpx } from "@/features/gpx/parse";
import { validateGpx } from "@/features/gpx/validate";
import { originalDistanceStats } from "@/features/statistics/distance";
import { originalTimeStats, type TimeStats } from "@/features/statistics/time";
import { reimportStats } from "@/features/statistics/reimport";
import { buildShareCardContent } from "@/features/share/cardContent";
import { createDomXmlIo } from "@/lib/utils/xml";
import type { DistanceStats } from "@/features/statistics/distance";

const FIXTURES = "src/features/gpx/fixtures/files";

function fixtureStats(name: string): {
  distance: DistanceStats;
  time: TimeStats;
} {
  const text = readFileSync(`${FIXTURES}/${name}`, "utf8");
  const outcome = parseGpx(text, createDomXmlIo());
  if (!outcome.ok) throw new Error(`parse failed: ${name}`);
  const data = validateGpx(outcome.data).data;
  return {
    distance: originalDistanceStats(data),
    time: originalTimeStats(data, 120000),
  };
}

describe("buildShareCardContent — the recorded trio", () => {
  it("derives distance, pace, and elapsed time from a timed file", () => {
    const { distance, time } = fixtureStats("time-gap.gpx");
    const content = buildShareCardContent({ distance, time, unit: "km" });

    // Golden values from the real pipeline over the fixture.
    expect(content.distance).toBe("48 m");
    expect(content.pace).toBe("6:12 /km");
    expect(content.time).toBe("5m 18s");
    expect(content.complete).toBe(true);
    expect(content.notes).toEqual([]);
    expect(content.includesReimported).toBe(false);
  });

  it("formats an hour-plus elapsed time in the Strava compact form", () => {
    // 21.12 km at 5:00 /km — the spec's example trio: 105.6 min.
    const ms = (1 * 3600 + 45 * 60 + 36) * 1000;
    const content = buildShareCardContent({
      distance: { totalDistanceM: 21120 },
      time: {
        hasTimingData: true,
        pointsWithTime: 2,
        pointsTotal: 2,
        firstTimeMs: 0,
        lastTimeMs: ms,
        wallTimeMs: ms,
        recordedMovingTimeMs: ms,
        gapLegs: 0,
        gapTimeMs: 0,
        untimedLegs: 0,
        reversedLegs: 0,
      },
      unit: "km",
    });

    expect(content.distance).toBe("21.12 km");
    expect(content.pace).toBe("5:00 /km");
    expect(content.time).toBe("1h 45m");
    expect(content.complete).toBe(true);
  });

  it("converts the whole trio for the mile unit", () => {
    const ms = (1 * 3600 + 45 * 60 + 36) * 1000;
    const content = buildShareCardContent({
      distance: { totalDistanceM: 21120 },
      time: {
        hasTimingData: true,
        pointsWithTime: 2,
        pointsTotal: 2,
        wallTimeMs: ms,
        recordedMovingTimeMs: ms,
        gapLegs: 0,
        gapTimeMs: 0,
        untimedLegs: 0,
        reversedLegs: 0,
      },
      unit: "mi",
    });

    expect(content.distance).toBe("13.12 mi");
    expect(content.pace).toBe("8:02 /mi");
    expect(content.time).toBe("1h 45m");
  });

  it("renders an honest distance-only card for a no-time file", () => {
    const { distance, time } = fixtureStats("no-time.gpx");
    const content = buildShareCardContent({ distance, time, unit: "km" });

    expect(content.distance).toBe("14 m");
    expect(content.pace).toBe("—");
    expect(content.time).toBe("—");
    expect(content.complete).toBe(false);
    expect(content.notes).toHaveLength(1);
    expect(content.notes[0]).toContain("no usable timestamps");
  });

  it("renders pace but no elapsed time for non-monotonic timestamps", () => {
    const content = buildShareCardContent({
      distance: { totalDistanceM: 1000 },
      time: {
        hasTimingData: true,
        pointsWithTime: 3,
        pointsTotal: 3,
        recordedMovingTimeMs: 300000,
        gapLegs: 0,
        gapTimeMs: 0,
        untimedLegs: 0,
        reversedLegs: 2,
        // wallTimeMs omitted: last − first would be negative.
      },
      unit: "km",
    });

    expect(content.pace).toBe("5:00 /km");
    expect(content.time).toBe("—");
    expect(content.complete).toBe(false);
    expect(content.notes.some((n) => n.includes("not monotonic"))).toBe(true);
  });

  it("shows “—” pace when all timed legs are gaps or pauses", () => {
    const content = buildShareCardContent({
      distance: { totalDistanceM: 1000 },
      time: {
        hasTimingData: true,
        pointsWithTime: 2,
        pointsTotal: 2,
        wallTimeMs: 3600000,
        recordedMovingTimeMs: 0,
        gapLegs: 1,
        gapTimeMs: 3600000,
        untimedLegs: 0,
        reversedLegs: 0,
      },
      unit: "km",
    });

    expect(content.pace).toBe("—");
    expect(content.time).toBe("1h");
    expect(content.complete).toBe(false);
    expect(content.notes.some((n) => n.includes("moving time"))).toBe(true);
  });

  it("notes included re-imported repairs without changing the math", () => {
    const { distance, time } = fixtureStats("time-gap.gpx");
    const content = buildShareCardContent({
      distance,
      time,
      reimport: {
        markerCount: 49,
        repairedDistanceM: 1100,
        repairedLegs: 10,
        repairTimeMs: 600000,
        runCount: 2,
      },
      unit: "km",
    });

    // The card shows the file as it records itself — totals unchanged.
    expect(content.distance).toBe("48 m");
    expect(content.includesReimported).toBe(true);
    expect(
      content.notes.some((n) => n.includes("49 points")),
    ).toBe(true);
  });
});

describe("reimportStats — the fixture pipeline stays sane", () => {
  it("a plain fixture has no markers", () => {
    const text = readFileSync(`${FIXTURES}/time-gap.gpx`, "utf8");
    const outcome = parseGpx(text, createDomXmlIo());
    if (!outcome.ok) throw new Error("parse failed");
    const stats = reimportStats(validateGpx(outcome.data).data);
    expect(stats.markerCount).toBe(0);
    expect(stats.repairedDistanceM).toBe(0);
  });
});

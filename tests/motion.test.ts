// @vitest-environment jsdom
/**
 * Stopped-time detection goldens (Phase 15, §EE 15.3 verification).
 *
 * Synthetic tracks on one meridian (equal legs — hand-computable
 * speeds): stationary clusters, honest movement, recording gaps (NOT
 * stops), untimed legs, and a reconstruction whose estimated
 * timestamps flag the stop events estimated (through the REAL merge
 * pipeline — the one-merge contract).
 */

import { describe, expect, it } from "vitest";
import { stoppedTimeSummary } from "@/features/statistics/motion";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { vertexId } from "@/types/ids";
import type { GapId, PointId } from "@/types/domain";
import type { MergeResult } from "@/features/reconstruction/merge";
import { parseXml } from "./helpers/gpxTestUtils";

const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};
const P = (i: number): PointId => `t0s0:${i}` as PointId;
const LON = 13.404954;
const latAt = (steps: number) => 52.52 + steps * 0.008;

interface Pt {
  /** Latitude steps of 0.008 (~890 m) — fractional = proportional. */
  latSteps: number | null; // null → repeat the previous point exactly
  dt?: number; // seconds since the previous point
  time?: false; // omit <time>
}

/** Build one segment from compact point specs. */
function xmlOf(points: readonly Pt[]): string {
  let lat = latAt(0);
  let seconds = 0;
  const parts: string[] = [];
  points.forEach((spec, i) => {
    if (spec.latSteps !== null) lat = latAt(spec.latSteps);
    if (spec.dt !== undefined) seconds += spec.dt;
    const children: string[] = [];
    if (spec.time !== false) {
      children.push(
        `<time>2024-05-01T07:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}Z</time>`,
      );
    }
    parts.push(
      `<trkpt lat="${lat.toFixed(6)}" lon="${LON}">${children.join("")}</trkpt>`,
    );
    void i;
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `<trk><name>T</name><trkseg>${parts.join("")}</trkseg></trk>\n</gpx>\n`
  );
}

const mergeOf = (xml: string): MergeResult =>
  mergeRepairs(parseXml(xml), [], TIMED);

describe("stoppedTimeSummary — detection goldens", () => {
  it("a stationary cluster is ONE event with the full duration", () => {
    // 4 fixes at the same spot, 20 s apart, then a real move.
    const merge = mergeOf(
      xmlOf([
        { latSteps: 0, dt: 0 },
        { latSteps: null, dt: 20 },
        { latSteps: null, dt: 20 },
        { latSteps: null, dt: 20 },
        { latSteps: 1, dt: 20 },
      ]),
    );
    const summary = stoppedTimeSummary(merge, { timeGapMs: 60_000 });
    expect(summary.hasTimingData).toBe(true);
    expect(summary.stopEvents).toHaveLength(1);
    expect(summary.stopEvents[0].durationMs).toBe(60_000);
    expect(summary.stoppedMs).toBe(60_000);
    expect(summary.longestStopMs).toBe(60_000);
    expect(summary.movingMs).toBe(80_000); // 4 stationary legs + the move
    closeToInMotion(summary, 20_000);
  });

  it("honest movement reports zero stops", () => {
    // ~890 m legs every 300 s ≈ 3 m/s — well above 0.5.
    const merge = mergeOf(
      xmlOf([
        { latSteps: 0, dt: 0 },
        { latSteps: 1, dt: 300 },
        { latSteps: 2, dt: 300 },
        { latSteps: 3, dt: 300 },
      ]),
    );
    const summary = stoppedTimeSummary(merge, { timeGapMs: 60_000 });
    expect(summary.stopEvents).toHaveLength(0);
    expect(summary.stoppedMs).toBe(0);
    expect(summary.inMotionMs).toBe(summary.movingMs);
  });

  it("move → stop → move yields one event between the moves", () => {
    const merge = mergeOf(
      xmlOf([
        { latSteps: 0, dt: 0 },
        { latSteps: 1, dt: 100 }, // ~8.9 m/s — moving
        { latSteps: null, dt: 30 }, // stopped
        { latSteps: null, dt: 30 }, // stopped
        { latSteps: 2, dt: 100 }, // moving again
      ]),
    );
    const summary = stoppedTimeSummary(merge, { timeGapMs: 60_000 });
    expect(summary.stopEvents).toHaveLength(1);
    expect(summary.stopEvents[0].durationMs).toBe(60_000);
    expect(summary.stopEvents[0].provenance).toBe("recorded");
    expect(summary.stopEvents[0].startMs).toBe(
      Date.parse("2024-05-01T07:01:40Z"),
    );
  });

  it("a recording gap is NOT stopped time", () => {
    // The same spot, but 10 minutes apart — a gap leg, not a stop.
    const merge = mergeOf(
      xmlOf([
        { latSteps: 0, dt: 0 },
        { latSteps: null, dt: 600 },
        { latSteps: 1, dt: 50 },
      ]),
    );
    const summary = stoppedTimeSummary(merge, { timeGapMs: 60_000 });
    expect(summary.stopEvents).toHaveLength(0);
    expect(summary.stoppedMs).toBe(0);
    expect(summary.gapLegs).toBe(1);
    expect(summary.gapTimeMs).toBe(600_000);
  });

  it("untimed legs are counted, never classified", () => {
    const merge = mergeOf(
      xmlOf([
        { latSteps: 0, dt: 0 },
        { latSteps: null, dt: 30, time: false },
        { latSteps: 1, dt: 100 },
      ]),
    );
    const summary = stoppedTimeSummary(merge, { timeGapMs: 60_000 });
    // Both legs touching the untimed point are untimed.
    expect(summary.untimedLegs).toBe(2);
    expect(summary.stopEvents).toHaveLength(0);
  });

  it("wall time is first→last and in-motion reconciles the buckets", () => {
    // 50 s legs stay under the 60 s gap threshold (a 100 s leg would
    // read as a recording gap, not movement).
    const merge = mergeOf(
      xmlOf([
        { latSteps: 0, dt: 0 },
        { latSteps: 1, dt: 50 },
        { latSteps: null, dt: 50 },
        { latSteps: 2, dt: 50 },
      ]),
    );
    const summary = stoppedTimeSummary(merge, { timeGapMs: 60_000 });
    expect(summary.wallTimeMs).toBe(150_000);
    expect(summary.movingMs).toBe(150_000);
    expect(summary.stoppedMs).toBe(50_000);
    expect(summary.inMotionMs).toBe(100_000);
  });
});

describe("stoppedTimeSummary — honesty boundaries", () => {
  it("null merge → the empty summary", () => {
    const summary = stoppedTimeSummary(null);
    expect(summary.hasTimingData).toBe(false);
    expect(summary.stopEvents).toHaveLength(0);
    expect(summary.movingMs).toBe(0);
  });

  it("an untimed file reports no timing data", () => {
    const merge = mergeOf(
      xmlOf([
        { latSteps: 0, time: false },
        { latSteps: 1, time: false },
      ]),
    );
    const summary = stoppedTimeSummary(merge);
    expect(summary.hasTimingData).toBe(false);
  });

  it("reconstructed stretches flag their events estimated", () => {
    // A 600 s gap between two anchors ~89 m apart, filled by one
    // drawn vertex: the distributed timestamps read ~0.15 m/s — a
    // stop whose every leg is estimated.
    const data = parseXml(
      xmlOf([
        { latSteps: 0, dt: 0 },
        { latSteps: 0.1, dt: 600 },
        { latSteps: 1.1, dt: 100 },
      ]),
    );
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${P(0)}/${P(1)}` as GapId,
          beforePointId: P(0),
          afterPointId: P(1),
          vertices: [{ id: vertexId(1), lat: latAt(0.05), lon: LON }],
          resampleSpacingM: "off",
          timeStrategy: { kind: "distance-proportional" },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    // 700 s threshold so the 300 s distributed legs count as moving.
    const summary = stoppedTimeSummary(merge, { timeGapMs: 700_000 });
    expect(summary.hasEstimatedLegs).toBe(true);
    expect(summary.stopEvents.length).toBeGreaterThanOrEqual(1);
    for (const event of summary.stopEvents) {
      expect(event.provenance).toBe("estimated");
    }
  });

  it("the threshold is disclosed on the summary", () => {
    const summary = stoppedTimeSummary(null, { stopSpeedMps: 1.2 });
    expect(summary.stopSpeedMps).toBe(1.2);
  });
});

function closeToInMotion(
  summary: ReturnType<typeof stoppedTimeSummary>,
  expected: number,
) {
  expect(Math.abs(summary.inMotionMs - expected)).toBeLessThan(1e-6);
}

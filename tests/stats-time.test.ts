// @vitest-environment jsdom
/**
 * Unit tests for features/statistics/time.ts (§N-1: hand-computed
 * scenarios for the §L-1 time buckets).
 *
 * The leg semantics under test: same-track consecutive pairs (spanning
 * segment breaks, aligned with detectGaps), never across tracks; gap legs
 * (Δt > threshold) excluded from moving time; reversed legs counted as
 * zero; untimed legs counted; wall time = last − first in document order.
 */

import { describe, expect, it } from "vitest";
import { parseXml } from "./helpers/gpxTestUtils";
import { validateGpx } from "@/features/gpx/validate";
import { originalTimeStats } from "@/features/statistics/time";

function model(xml: string) {
  return validateGpx(parseXml(xml)).data;
}

const T0 = Date.parse("2024-05-01T07:00:00Z");
const at = (offsetSeconds: number) =>
  new Date(T0 + offsetSeconds * 1000).toISOString();

const BASE = (segments: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">` +
  `<trk><name>T</name>${segments.map((s) => `<trkseg>${s}</trkseg>`).join("")}</trk>` +
  `</gpx>`;

const pt = (lat: number, lon: number, time?: string) =>
  time === undefined
    ? `<trkpt lat="${lat}" lon="${lon}"/>`
    : `<trkpt lat="${lat}" lon="${lon}"><time>${time}</time></trkpt>`;

describe("originalTimeStats", () => {
  it("sums continuous 1 Hz legs into moving time", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(0)),
      pt(52.5201, 13.4041, at(1)),
      pt(52.5202, 13.4042, at(2)),
      pt(52.5203, 13.4043, at(3)),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.hasTimingData).toBe(true);
    expect(stats.pointsWithTime).toBe(4);
    expect(stats.recordedMovingTimeMs).toBe(3_000);
    expect(stats.wallTimeMs).toBe(3_000);
    expect(stats.gapLegs).toBe(0);
    expect(stats.gapTimeMs).toBe(0);
    expect(stats.reversedLegs).toBe(0);
    expect(stats.untimedLegs).toBe(0);
    expect(stats.firstTimeMs).toBe(T0);
    expect(stats.lastTimeMs).toBe(T0 + 3_000);
  });

  it("excludes gap legs from moving time but keeps them in wall time", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(0)),
      pt(52.5201, 13.4041, at(3)),
      pt(52.5202, 13.4042, at(303)), // 300 s pause — a gap
      pt(52.5203, 13.4043, at(306)),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.recordedMovingTimeMs).toBe(6_000); // 3 s + 3 s
    expect(stats.gapLegs).toBe(1);
    expect(stats.gapTimeMs).toBe(300_000);
    expect(stats.wallTimeMs).toBe(306_000);
  });

  it("a gap at exactly the threshold is NOT a gap (strictly greater)", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(0)),
      pt(52.5201, 13.4041, at(120)),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.recordedMovingTimeMs).toBe(120_000);
    expect(stats.gapLegs).toBe(0);
  });

  it("a raised threshold reclassifies a former gap as moving time", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(0)),
      pt(52.5201, 13.4041, at(3)),
      pt(52.5202, 13.4042, at(303)),
      pt(52.5203, 13.4043, at(306)),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 300_000);
    expect(stats.gapLegs).toBe(0);
    expect(stats.recordedMovingTimeMs).toBe(306_000);
  });

  it("counts reversed legs as zero duration, never negative", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(10)),
      pt(52.5201, 13.4041, at(4)), // reversed
      pt(52.5202, 13.4042, at(12)), // forward again (from 4)
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.reversedLegs).toBe(1);
    expect(stats.recordedMovingTimeMs).toBe(8_000); // only 4 → 12
  });

  it("equal timestamps are moving legs of zero duration", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(5)),
      pt(52.5201, 13.4041, at(5)),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.reversedLegs).toBe(0);
    expect(stats.recordedMovingTimeMs).toBe(0);
    expect(stats.wallTimeMs).toBe(0);
  });

  it("counts legs with a missing endpoint time as untimed", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(0)),
      pt(52.5201, 13.4041), // no time
      pt(52.5202, 13.4042, at(2)),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.untimedLegs).toBe(2);
    expect(stats.recordedMovingTimeMs).toBe(0);
    expect(stats.pointsWithTime).toBe(2);
    expect(stats.pointsTotal).toBe(3);
    expect(stats.wallTimeMs).toBe(2_000);
  });

  it("reports no timing data when no point carries a time", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404),
      pt(52.5201, 13.4041),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.hasTimingData).toBe(false);
    expect(stats.pointsWithTime).toBe(0);
    expect(stats.wallTimeMs).toBeUndefined();
    expect(stats.recordedMovingTimeMs).toBe(0);
  });

  it("spans legs across segment breaks within a track (matches detectGaps)", () => {
    const data = model(
      BASE([
        `${pt(52.52, 13.404, at(0))}${pt(52.5201, 13.4041, at(3))}`,
        `${pt(52.5202, 13.4042, at(8))}`, // 5 s across the break
      ]),
    );

    const stats = originalTimeStats(data, 120_000);
    expect(stats.recordedMovingTimeMs).toBe(8_000); // 3 s + 5 s break leg
    expect(stats.untimedLegs).toBe(0);
  });

  it("never spans legs across track boundaries", () => {
    const data = model(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<trk><name>A</name><trkseg>${pt(52.52, 13.404, at(0))}</trkseg></trk>` +
        `<trk><name>B</name><trkseg>${pt(52.521, 13.405, at(500))}</trkseg></trk>` +
        `</gpx>`,
    );

    const stats = originalTimeStats(data, 120_000);
    expect(stats.recordedMovingTimeMs).toBe(0); // no legs at all
    expect(stats.gapLegs).toBe(0);
    expect(stats.wallTimeMs).toBe(500_000); // still a file-level span
  });

  it("hides wall time when recording is not monotonic overall", () => {
    const data = model(BASE([
      [      pt(52.52, 13.404, at(100)),
      pt(52.5201, 13.4041, at(0)),
    ].join(""),
    ]));

    const stats = originalTimeStats(data, 120_000);
    expect(stats.wallTimeMs).toBeUndefined();
    expect(stats.reversedLegs).toBe(1);
  });
});

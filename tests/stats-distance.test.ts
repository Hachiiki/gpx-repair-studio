// @vitest-environment jsdom
/**
 * Unit tests for features/statistics/distance.ts (§N-1 statistics:
 * hand-computed scenarios).
 *
 * Expected distances are composed from `geodesicDistanceMeters` — the
 * geodesy primitive is independently golden-tested (tests/geodesy.test.ts);
 * what these tests pin down is the *aggregation policy*: which legs count,
 * which are excluded (and why), and how segment breaks behave.
 */

import { describe, expect, it } from "vitest";
import { parseXml } from "./helpers/gpxTestUtils";
import { validateGpx } from "@/features/gpx/validate";
import {
  originalDistanceStats,
  segmentDistanceStats,
} from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";

/** Parse + validate — the contract of the stats modules. */
function model(xml: string) {
  return validateGpx(parseXml(xml)).data;
}

const BASE = (points: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">` +
  `<trk><name>T</name><trkseg>${points}</trkseg></trk></gpx>`;

const pt = (
  lat: number | string,
  lon: number | string,
  time = "2024-05-01T07:00:00Z",
) => `<trkpt lat="${lat}" lon="${lon}"><time>${time}</time></trkpt>`;

const A = { lat: 52.52, lon: 13.404 };
const B = { lat: 52.521, lon: 13.405 };
const C = { lat: 52.522, lon: 13.406 };

describe("originalDistanceStats", () => {
  it("sums all legs of a clean segment", () => {
    const data = model(BASE([pt(A.lat, A.lon), pt(B.lat, B.lon), pt(C.lat, C.lon)].join("")));
    const stats = originalDistanceStats(data);

    const ab = geodesicDistanceMeters(A, B);
    const bc = geodesicDistanceMeters(B, C);
    expect(stats.totalDistanceM).toBeCloseTo(ab + bc, 6);
    expect(stats.usableLegs).toBe(2);
    expect(stats.excludedLegs).toBe(0);
    expect(stats.perSegment).toHaveLength(1);
    expect(stats.perSegment[0].distanceM).toBeCloseTo(ab + bc, 6);
  });

  it("treats duplicate points as ~zero-length legs (still counted)", () => {
    const data = model(
      BASE([pt(A.lat, A.lon), pt(A.lat, A.lon), pt(B.lat, B.lon)].join("")),
    );
    const stats = originalDistanceStats(data);
    expect(stats.usableLegs).toBe(2);
    expect(stats.totalDistanceM).toBeCloseTo(geodesicDistanceMeters(A, B), 6);
  });

  it("excludes legs touching an unparseable coordinate, with reason", () => {
    const data = model(
      BASE(
        [
          pt(A.lat, A.lon),
          `<trkpt lat="not-a-number" lon="13.4045"><time>2024-05-01T07:00:01Z</time></trkpt>`,
          pt(B.lat, B.lon),
        ].join(""),
      ),
    );
    const stats = originalDistanceStats(data);

    // Both legs around the NaN point are unusable → nothing measurable.
    expect(stats.totalDistanceM).toBe(0);
    expect(stats.excludedLegs).toBe(2);
    expect(stats.excludedByReason["invalid-coord"]).toBe(2);
  });

  it("excludes legs touching an out-of-range coordinate (validate flag)", () => {
    const data = model(
      BASE(
        [
          pt(A.lat, A.lon),
          pt(95, 13.4045, "2024-05-01T07:00:01Z"),
          pt(B.lat, B.lon),
        ].join(""),
      ),
    );
    const stats = originalDistanceStats(data);

    expect(stats.totalDistanceM).toBe(0);
    expect(stats.excludedLegs).toBe(2);
    expect(stats.excludedByReason["out-of-range-coord"]).toBe(2);
  });

  it("excludes legs touching a zero-coordinate (GPS-loss) point", () => {
    const data = model(
      BASE(
        [
          pt(A.lat, A.lon),
          pt(0, 0, "2024-05-01T07:00:01Z"),
          pt(B.lat, B.lon),
        ].join(""),
      ),
    );
    const stats = originalDistanceStats(data);

    // Without the exclusion, the detour to Null Island would add ~7,300 km.
    expect(stats.totalDistanceM).toBe(0);
    expect(stats.excludedLegs).toBe(2);
    expect(stats.excludedByReason["zero-coord"]).toBe(2);
  });

  it("does not bridge segment breaks (no recorded line between segments)", () => {
    const data = model(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<trk><name>T</name>` +
        `<trkseg>${pt(A.lat, A.lon)}${pt(B.lat, B.lon)}</trkseg>` +
        `<trkseg>${pt(C.lat, C.lon)}</trkseg>` +
        `</trk></gpx>`,
    );
    const stats = originalDistanceStats(data);

    // Only A→B; the B→C jump across the break is a gap, not distance.
    expect(stats.totalDistanceM).toBeCloseTo(geodesicDistanceMeters(A, B), 6);
    expect(stats.usableLegs).toBe(1);
    expect(stats.perSegment).toHaveLength(2);
    expect(stats.perSegment[1].distanceM).toBe(0);
  });

  it("handles empty and single-point segments", () => {
    const data = model(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<trk><name>T</name>` +
        `<trkseg></trkseg>` +
        `<trkseg>${pt(A.lat, A.lon)}</trkseg>` +
        `<trkseg>${pt(B.lat, B.lon)}${pt(C.lat, C.lon)}</trkseg>` +
        `</trk></gpx>`,
    );
    const stats = originalDistanceStats(data);

    expect(stats.totalDistanceM).toBeCloseTo(geodesicDistanceMeters(B, C), 6);
    expect(stats.usableLegs).toBe(1);
    expect(stats.perSegment[0]).toEqual({
      segmentId: "t0s0",
      distanceM: 0,
      excludedLegs: 0,
    });
    expect(stats.perSegment[1].excludedLegs).toBe(0);
  });

  it("a trailing unusable point closes no phantom leg", () => {
    const data = model(
      BASE(
        [
          pt(A.lat, A.lon),
          pt(B.lat, B.lon),
          `<trkpt lat="bad" lon="bad"><time>2024-05-01T07:00:02Z</time></trkpt>`,
        ].join(""),
      ),
    );
    const stats = originalDistanceStats(data);
    expect(stats.totalDistanceM).toBeCloseTo(geodesicDistanceMeters(A, B), 6);
    // Only the B→(bad) leg is excluded; there is nothing after it.
    expect(stats.excludedLegs).toBe(1);
  });
});

describe("segmentDistanceStats", () => {
  it("is usable standalone on one segment", () => {
    const data = model(BASE([pt(A.lat, A.lon), pt(B.lat, B.lon)].join("")));
    const stats = segmentDistanceStats(data.segments[0]);
    expect(stats.segmentId).toBe("t0s0");
    expect(stats.distanceM).toBeCloseTo(geodesicDistanceMeters(A, B), 6);
    expect(stats.excludedLegs).toBe(0);
  });
});

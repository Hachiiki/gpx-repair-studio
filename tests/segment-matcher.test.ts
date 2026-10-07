// @vitest-environment jsdom
/**
 * Segment-matcher goldens (Phase 25.2/25.3 verification: "matcher
 * goldens (overlap, dedup, tolerance boundaries)").
 *
 * Strategy: the equator-line convention of tests/records.test.ts —
 * equal Δlon steps give bitwise-equal geodesic legs, so hand-computed
 * goldens are exact. The rules under test:
 *
 *   - crossings: an effort is timed from the nearest recorded points
 *     crossing the anchors, within SEGMENT_DRIFT_TOLERANCE_M;
 *   - the tolerance boundary itself (just-inside / just-outside);
 *   - elapsed time — the clock does not stop;
 *   - direction: only start-crossings that PRECEDE end-crossings
 *     match (an out-and-back's return leg never pairs);
 *   - overlap dedup: overlapping candidates resolve to the fastest;
 *   - one track: crossings never span a track boundary;
 *   - the honesty rule: an effort touching a drawn-in stretch — at
 *     the crossings or between them — is flagged and never a PR;
 *   - untimed / reversed time never fabricate efforts;
 *   - the shelf fingerprint's stability + drift semantics.
 */

import { describe, expect, it } from "vitest";
import {
  SEGMENT_DRIFT_TOLERANCE_M,
  personalRecord,
  segmentEffortRows,
  segmentWalkTracks,
  shelfFingerprint,
  sortEffortRows,
  type SegmentAnchors,
} from "@/features/segments/matcher";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { vertexId } from "@/types/ids";
import type { GapId, PointId } from "@/types/domain";
import type { MergeResult } from "@/features/reconstruction/merge";
import { parseXml } from "./helpers/gpxTestUtils";

const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};
const P = (i: number): PointId => `t0s0:${i}` as PointId;

/** ~300 m equator legs (the coarse convention). */
const LON_STEP = (300 / 6_378_137) * (180 / Math.PI);
/** ~20 m equator legs (the fine convention — tolerance-scale runs). */
const FINE_STEP = (20 / 6_378_137) * (180 / Math.PI);
const lonAt = (steps: number, step = LON_STEP) => -0.02 + steps * step;
const LAT = 0;

/** N equator points at `step` spacing, `dt` s apart, custom lon path. */
function trackXml(
  lons: readonly number[],
  opts: { dt?: number; step?: number; untimed?: boolean; tracks?: number[] } = {},
): string {
  const { dt = 10, step = LON_STEP, untimed = false, tracks = [lons.length] } = opts;
  const trksegs: string[] = [];
  let index = 0;
  let offset = 0;
  for (const size of tracks) {
    const pts: string[] = [];
    for (let i = 0; i < size; i += 1, index += 1) {
      const seconds = index * dt + offset;
      const time = untimed
        ? ""
        : `<time>2024-05-01T${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(
            Math.floor((seconds % 3600) / 60),
          ).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}Z</time>`;
      pts.push(
        `<trkpt lat="${LAT.toFixed(12)}" lon="${lonAt(lons[index]!, step).toFixed(12)}">${time}</trkpt>`,
      );
    }
    offset += 3600;
    trksegs.push(`<trk><name>T</name><trkseg>${pts.join("")}</trkseg></trk>`);
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `${trksegs.join("\n")}\n</gpx>\n`
  );
}

function plainMerge(xml: string): MergeResult {
  return mergeRepairs(parseXml(xml), [], TIMED);
}

/** Anchors at the exact positions of lon indices a and b (spacing L). */
function anchorsAt(a: number, b: number, step = LON_STEP): SegmentAnchors {
  return {
    start: { lat: LAT, lon: lonAt(a, step) },
    end: { lat: LAT, lon: lonAt(b, step) },
    lengthM: geodesicDistanceMeters(
      { lat: LAT, lon: lonAt(a, step) },
      { lat: LAT, lon: lonAt(b, step) },
    ),
  };
}

const rowsOf = (merge: MergeResult, anchors: SegmentAnchors) =>
  segmentEffortRows("s1", "Session one", segmentWalkTracks(merge), anchors, 0);

describe("crossings + elapsed time", () => {
  it("times an exact-anchor effort on the clock that does not stop", () => {
    // 10 points, 300 m legs, 10 s apart; anchors on points 2 → 5.
    const merge = plainMerge(trackXml([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const rows = rowsOf(merge, anchorsAt(2, 5));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.elapsedMs).toBe(30_000);
    expect(rows[0]!.reconstructed).toBe(false);
    expect(rows[0]!.sessionId).toBe("s1");
  });

  it("counts the gap — a mid-segment dropout still times end to end", () => {
    // A 300 s hole between points 4 and 5 (the recorder stopped): the
    // 2 → 6 effort must pay it (elapsed semantics, Strava's own).
    const merge = plainMerge(
      trackXml([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => v)),
    );
    // (the plain helper has no gap; emulate with raw timestamps below)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>T</name><trkseg>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  .map((i) => {
    const seconds = i * 10 + (i >= 5 ? 300 : 0);
    return `<trkpt lat="0" lon="${lonAt(i).toFixed(12)}"><time>2024-05-01T07:${String(
      Math.floor(seconds / 60),
    ).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}Z</time></trkpt>`;
  })
  .join("")}</trkseg></trk></gpx>`;
    const gapped = plainMerge(xml);
    // Point 2 sits at 20 s; point 6 at 60 + 300 (the hole) = 360 s.
    expect(rowsOf(gapped, anchorsAt(2, 6))[0]!.elapsedMs).toBe(340_000);
    expect(merge).toBeDefined();
  });

  it("times from the NEAREST point of a crossing run (finer timing)", () => {
    // Fine 20 m legs: the anchor sits 0.6 legs from point 3 → points
    // 2 and 3 are both within tolerance, point 3 is nearer → the run's
    // representative. Elapsed reads time(3), not time(2).
    const lons = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const merge = plainMerge(trackXml(lons, { step: FINE_STEP, dt: 1 }));
    const anchors: SegmentAnchors = {
      start: { lat: LAT, lon: lonAt(2.6, FINE_STEP) },
      end: { lat: LAT, lon: lonAt(11, FINE_STEP) },
      lengthM: geodesicDistanceMeters(
        { lat: LAT, lon: lonAt(2.6, FINE_STEP) },
        { lat: LAT, lon: lonAt(11, FINE_STEP) },
      ),
    };
    const rows = rowsOf(merge, anchors);
    expect(rows).toHaveLength(1);
    // start rep = point 3 (12 m), end rep = point 11 (0 m): 8 s.
    expect(rows[0]!.elapsedMs).toBe(8_000);
  });
});

describe("the tolerance boundary", () => {
  it("a crossing just inside tolerance still matches", () => {
    // Anchor 39 m NORTH of point 2 (perpendicular): inside 40 m.
    const latOffset = 39 / 111_320;
    const merge = plainMerge(trackXml([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const anchors: SegmentAnchors = {
      start: { lat: latOffset, lon: lonAt(2) },
      end: { lat: LAT, lon: lonAt(5) },
      lengthM: 3 * 300,
    };
    const d = geodesicDistanceMeters(
      { lat: latOffset, lon: lonAt(2) },
      { lat: LAT, lon: lonAt(2) },
    );
    expect(d).toBeLessThanOrEqual(SEGMENT_DRIFT_TOLERANCE_M);
    expect(rowsOf(merge, anchors)).toHaveLength(1);
  });

  it("a crossing just outside tolerance does not match", () => {
    // Anchor 41 m NORTH of point 2: outside 40 m → no start crossing.
    const latOffset = 41 / 111_320;
    const merge = plainMerge(trackXml([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const anchors: SegmentAnchors = {
      start: { lat: latOffset, lon: lonAt(2) },
      end: { lat: LAT, lon: lonAt(5) },
      lengthM: 3 * 300,
    };
    const d = geodesicDistanceMeters(
      { lat: latOffset, lon: lonAt(2) },
      { lat: LAT, lon: lonAt(2) },
    );
    expect(d).toBeGreaterThan(SEGMENT_DRIFT_TOLERANCE_M);
    expect(rowsOf(merge, anchors)).toHaveLength(0);
  });
});

describe("direction + overlap + dedup", () => {
  it("an out-and-back's return leg never pairs (directional matching)", () => {
    // East 0..7 then back west 6..0: the start anchor is crossed at
    // the head AND the tail, the end anchor on both passes — but the
    // return crosses end BEFORE start, so only the outbound effort
    // exists (and the overlapping same-start pair dedups to it).
    const lons = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0];
    const merge = plainMerge(trackXml(lons));
    const rows = rowsOf(merge, anchorsAt(0, 7));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.elapsedMs).toBe(70_000);
  });

  it("two same-direction laps yield two non-overlapping efforts", () => {
    // East 0..10, west back to 0, east to 10 again: the same stretch
    // is walked forward twice → two distinct passages, two efforts.
    const forward = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const back = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    const again = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const merge = plainMerge(trackXml([...forward, ...back, ...again]));
    const rows = rowsOf(merge, anchorsAt(2, 9));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.elapsedMs).toBe(70_000);
    expect(rows[1]!.elapsedMs).toBe(70_000);
  });

  it("overlapping candidates resolve to the fastest (dedup)", () => {
    // The track leaves the start zone and returns: two start runs
    // (points 1 and 3) both precede the end crossing — the LATER
    // start is the faster effort and owns the passage.
    const lons = [0, 2, 6, 2.1, 4, 6, 8, 10];
    const merge = plainMerge(trackXml(lons, { step: FINE_STEP, dt: 1 }));
    const anchors: SegmentAnchors = {
      start: { lat: LAT, lon: lonAt(2, FINE_STEP) },
      end: { lat: LAT, lon: lonAt(10, FINE_STEP) },
      lengthM: geodesicDistanceMeters(
        { lat: LAT, lon: lonAt(2, FINE_STEP) },
        { lat: LAT, lon: lonAt(10, FINE_STEP) },
      ),
    };
    const rows = rowsOf(merge, anchors);
    expect(rows).toHaveLength(1);
    // The surviving candidate starts at point 3 (the second visit,
    // t = 3 s) and ends at point 7 (t = 7 s).
    expect(rows[0]!.elapsedMs).toBe(4_000);
  });
});

describe("the honesty rule (25.3) + the repair dividend (25.4)", () => {
  it("flags an effort whose between-stretch is drawn in — never a PR", () => {
    // A fast manual reconstruction replaces the 3 → 4 leg: the 2 → 6
    // effort still MATCHES (the repair dividend) but is flagged.
    const data = parseXml(trackXml([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${P(3)}/${P(4)}` as GapId,
          beforePointId: P(3),
          afterPointId: P(4),
          vertices: [
            { id: vertexId(1), lat: 0.001, lon: lonAt(3.5) },
            { id: vertexId(2), lat: 0.002, lon: lonAt(3.6) },
          ],
          resampleSpacingM: "off",
          timeStrategy: { kind: "manual-duration", durationMs: 100 },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const rows = rowsOf(merge, anchorsAt(2, 6));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reconstructed).toBe(true);
    // The recorded boundary timestamps survive the repair (point 6
    // still reads its own clock): 20 s → 60 s, hole included.
    expect(rows[0]!.elapsedMs).toBe(40_000);
    expect(personalRecord(rows)).toBeNull();
    const sorted = sortEffortRows(rows);
    expect(sorted[0]!.reconstructed).toBe(true);
  });

  it("a clean effort beside a flagged one takes the PR", () => {
    const clean = {
      sessionId: "a",
      sessionName: "A",
      activityStartMs: null,
      elapsedMs: 90_000,
      reconstructed: false,
    };
    const flagged = {
      sessionId: "b",
      sessionName: "B",
      activityStartMs: null,
      elapsedMs: 40_000,
      reconstructed: true,
    };
    const sorted = sortEffortRows([flagged, clean]);
    expect(sorted[0]).toBe(clean);
    expect(personalRecord(sorted)).toBe(clean);
  });
});

describe("never fabricated", () => {
  it("an untimed track has no efforts", () => {
    const merge = plainMerge(trackXml([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { untimed: true }));
    expect(rowsOf(merge, anchorsAt(2, 5))).toHaveLength(0);
  });

  it("crossings never span a track boundary", () => {
    // Two 5-point tracks: the anchors sit on the LAST point of track 1
    // and the FIRST of track 2 — both crossed, never paired.
    const lons = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const merge = plainMerge(trackXml(lons, { tracks: [5, 5] }));
    expect(rowsOf(merge, anchorsAt(4, 5))).toHaveLength(0);
    // …while both anchors inside one track still match.
    expect(rowsOf(merge, anchorsAt(0, 4))).toHaveLength(1);
  });

  it("rejects a pairing inside the noise floor (the min-along window)", () => {
    // A 30 m sprint: the start and end anchors sit closer together
    // than the drift tolerance, so the crossing pair's along-track
    // span (30 m) never clears the 40 m floor — timing there is
    // noise, and the matcher refuses to guess. The same track at a
    // 160 m span matches cleanly.
    const lons = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const merge = plainMerge(trackXml(lons, { step: FINE_STEP, dt: 1 }));
    const sprint: SegmentAnchors = {
      start: { lat: LAT, lon: lonAt(2, FINE_STEP) },
      end: { lat: LAT, lon: lonAt(3.5, FINE_STEP) },
      lengthM: geodesicDistanceMeters(
        { lat: LAT, lon: lonAt(2, FINE_STEP) },
        { lat: LAT, lon: lonAt(3.5, FINE_STEP) },
      ),
    };
    expect(sprint.lengthM).toBeLessThanOrEqual(SEGMENT_DRIFT_TOLERANCE_M);
    expect(rowsOf(merge, sprint)).toHaveLength(0);
    expect(rowsOf(merge, anchorsAt(2, 10, FINE_STEP))).toHaveLength(1);
  });

  it("a one-point track walks but yields nothing", () => {
    const tracks = segmentWalkTracks(plainMerge(trackXml([0])));
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toHaveLength(1);
  });
});

describe("the shelf fingerprint", () => {
  it("is order-independent and stable", () => {
    const a = shelfFingerprint([
      { id: "x", updatedAt: 1 },
      { id: "y", updatedAt: 2 },
    ]);
    const b = shelfFingerprint([
      { id: "y", updatedAt: 2 },
      { id: "x", updatedAt: 1 },
    ]);
    expect(a).toBe(b);
    expect(shelfFingerprint([])).toBe(shelfFingerprint([]));
  });

  it("drifts on add, remove, and update", () => {
    const base = shelfFingerprint([{ id: "x", updatedAt: 1 }]);
    expect(shelfFingerprint([{ id: "x", updatedAt: 2 }])).not.toBe(base);
    expect(
      shelfFingerprint([
        { id: "x", updatedAt: 1 },
        { id: "y", updatedAt: 1 },
      ]),
    ).not.toBe(base);
    expect(shelfFingerprint([])).not.toBe(base);
  });
});

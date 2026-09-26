// @vitest-environment jsdom
/**
 * Unit tests — features/statistics/elevation.ts (Phase 6): the §L-1
 * gain/loss rows and the FR-6.4 profile series, both derived from the
 * export pipeline's merge.
 *
 * Hand-computed scenarios over a six-point file with a two-vertex
 * repair at the gap: original gain/loss from recorded `<ele>`
 * (10→50 = +40), reconstructed from the samples, mixed as their sum,
 * the 60% coverage rule, and the per-run decimation/smoothing of the
 * profile.
 */

import { describe, expect, it } from "vitest";
import { mergeRepairs, type MergeRepairSite, type MergeResult } from "@/features/reconstruction/merge";
import { parseGpx } from "@/features/gpx/parse";
import { createDomXmlIo } from "@/lib/utils/xml";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { gapId, vertexId } from "@/types/ids";
import type { PointId } from "@/types/domain";
import type { ElevationSample } from "@/features/elevation/samples";
import {
  buildElevationProfile,
  buildElevationStats,
  ELEVATION_PROFILE_MAX_POINTS,
} from "@/features/statistics/elevation";

const io = createDomXmlIo();

function parseFile(withEle: boolean, eleWithHole = false) {
  const ele = (v: number | null) =>
    withEle ? (v === null ? "" : `<ele>${v}</ele>`) : "";
  const result = parseGpx(
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"><time>2024-05-01T07:00:00Z</time>${ele(10)}</trkpt>
    <trkpt lat="52.520051" lon="13.405024"><time>2024-05-01T07:00:03Z</time>${ele(eleWithHole ? null : 20)}</trkpt>
    <trkpt lat="52.520096" lon="13.405094"><time>2024-05-01T07:00:06Z</time>${ele(30)}</trkpt>
    <trkpt lat="52.520141" lon="13.405164"><time>2024-05-01T07:05:09Z</time>${ele(40)}</trkpt>
    <trkpt lat="52.520186" lon="13.405234"><time>2024-05-01T07:05:12Z</time>${ele(50)}</trkpt>
    <trkpt lat="52.520231" lon="13.405304"><time>2024-05-01T07:05:15Z</time>${ele(46)}</trkpt>
  </trkseg></trk>
</gpx>`,
    io,
  );
  if (!result.ok) throw new Error("fixture failed to parse");
  return result.data;
}

const P = (i: number): PointId => `t0s0:${i}` as PointId;
const VERTICES = [
  { id: vertexId(1), lat: 52.5206, lon: 13.4055 },
  { id: vertexId(2), lat: 52.5202, lon: 13.4058 },
];
const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};

function mergeWith(
  samples: readonly ElevationSample[] | null,
  withEle = true,
): MergeResult {
  const data = parseFile(withEle);
  const before = data.segments[0].points[2];
  const after = data.segments[0].points[3];
  const d1 = geodesicDistanceMeters(before, VERTICES[0]);
  const d2 = d1 + geodesicDistanceMeters(VERTICES[0], VERTICES[1]);
  const gap = gapId(P(2), P(3));
  const site: MergeRepairSite = {
    gapId: gap,
    beforePointId: P(2),
    afterPointId: P(3),
    vertices: VERTICES,
    resampleSpacingM: "off",
    timeStrategy: { kind: "distance-proportional" },
    roadLegs: [],
    ...(samples
      ? {
          elevation: {
            providerName: "OpenTopoData",
            fetchedAtRevision: 1,
            fetchedAtRoadSignature: "none",
            samples,
          },
        }
      : {}),
  };
  const result = mergeRepairs(data, [site], TIMED);
  return { ...result, __distances: [d1, d2] } as MergeResult & {
    __distances: [number, number];
  };
}

describe("buildElevationStats", () => {
  it("computes original-only rows when the repair has no elevation", () => {
    const stats = buildElevationStats(mergeWith(null));
    // Recorded 10→50→46: +40 up, −4 down (threshold 2).
    expect(stats.original).toEqual({ gainM: 40, lossM: 4 });
    expect(stats.reconstructed).toBeNull();
    expect(stats.mixed).toEqual({ gainM: 40, lossM: 4 });
    // 6 recorded points all with ele; 2 reconstructed without → 6/8.
    expect(stats.coverage).toBeCloseTo(0.75, 6);
    expect(stats.insufficient).toBe(false);
    expect(stats.repairsWithoutElevation).toBe(1);
    expect(stats.hysteresisThresholdM).toBe(2);
  });

  it("splits gain/loss by provenance and sums the mixed row", () => {
    const merge = mergeWith(null);
    const [d1, d2] = (merge as never as { __distances: [number, number] })
      .__distances;
    const stats = buildElevationStats(
      mergeWith([
        { cumDistanceM: 0, ele: 35 },
        { cumDistanceM: d1, ele: 45 },
        { cumDistanceM: d2, ele: 55 },
      ]),
    );
    expect(stats.original).toEqual({ gainM: 40, lossM: 4 });
    // Interior 45 → 55: +10 up, 0 down.
    expect(stats.reconstructed).toEqual({ gainM: 10, lossM: 0 });
    expect(stats.mixed).toEqual({ gainM: 50, lossM: 4 });
    expect(stats.coverage).toBe(1);
    expect(stats.insufficient).toBe(false);
    expect(stats.repairsWithoutElevation).toBe(0);
  });

  it("withholds totals under the 60% coverage rule (§L-1)", () => {
    // File WITHOUT recorded ele: only the 2 reconstructed points carry
    // elevation → 2/8 = 25% coverage. Geometry is identical to the
    // with-ele fixture, so the sample distances are the same.
    const reference = mergeWith(null);
    const [d1, d2] = (reference as never as { __distances: [number, number] })
      .__distances;
    const stats = buildElevationStats(statsFromNoEleFile(d1, d2));
    expect(stats.insufficient).toBe(true);
    expect(stats.coverage).toBeCloseTo(0.25, 6);
    expect(stats.pointsWithEle).toBe(2);
    expect(stats.pointsTotal).toBe(8);
  });

  it("returns the empty view for a null merge", () => {
    const stats = buildElevationStats(null);
    expect(stats.original).toBeNull();
    expect(stats.reconstructed).toBeNull();
    expect(stats.mixed).toBeNull();
    expect(stats.insufficient).toBe(true);
    expect(stats.pointsTotal).toBe(0);
  });

  it("honors a custom hysteresis threshold", () => {
    const stats = buildElevationStats(mergeWith(null), {
      hysteresisThresholdM: 100,
    });
    // No single excursion reaches 100 m → everything is noise.
    expect(stats.original).toEqual({ gainM: 0, lossM: 0 });
  });
});

/** The no-recorded-ele variant of the fixture (coverage 25%). */
function statsFromNoEleFile(d1: number, d2: number) {
  const data = parseFile(false);
  const gap = gapId(P(2), P(3));
  const site: MergeRepairSite = {
    gapId: gap,
    beforePointId: P(2),
    afterPointId: P(3),
    vertices: VERTICES,
    resampleSpacingM: "off",
    timeStrategy: { kind: "distance-proportional" },
    roadLegs: [],
    elevation: {
      providerName: "OpenTopoData",
      fetchedAtRevision: 1,
      fetchedAtRoadSignature: "none",
      samples: [
        { cumDistanceM: 0, ele: 35 },
        { cumDistanceM: d1, ele: 45 },
        { cumDistanceM: d2, ele: 55 },
      ],
    },
  };
  return mergeRepairs(data, [site], TIMED);
}

describe("buildElevationProfile", () => {
  it("walks the merged route in order with cumulative distances", () => {
    const merge = mergeWith(null);
    const [d1, d2] = (merge as never as { __distances: [number, number] })
      .__distances;
    const profile = buildElevationProfile(
      mergeWith([
        { cumDistanceM: 0, ele: 35 },
        { cumDistanceM: d1, ele: 45 },
        { cumDistanceM: d2, ele: 55 },
      ]),
    );
    expect(profile).not.toBeNull();
    const kinds = profile!.points.map((point) => point.kind);
    // 3 recorded, 2 reconstructed, 3 recorded — route order.
    expect(kinds).toEqual([
      "recorded",
      "recorded",
      "recorded",
      "reconstructed",
      "reconstructed",
      "recorded",
      "recorded",
      "recorded",
    ]);
    // Strictly ascending x; starts at 0.
    expect(profile!.points[0].xM).toBe(0);
    for (let i = 1; i < profile!.points.length; i += 1) {
      expect(profile!.points[i].xM).toBeGreaterThan(profile!.points[i - 1].xM);
    }
    expect(profile!.hasAnyEle).toBe(true);
    expect(profile!.recordedCount).toBe(6);
    expect(profile!.reconstructedCount).toBe(2);
    // Display smoothing (window 5) pulls the run ends inward — the raw
    // extremes 10/55 become ~20/~55; assert the smoothed bounds.
    expect(profile!.minEleM).toBeLessThanOrEqual(25);
    expect(profile!.maxEleM).toBeGreaterThanOrEqual(45);
  });

  it("breaks the line at holes instead of dropping to zero", () => {
    // Recorded point 1 has no <ele> — the recorded run splits around it.
    const data = parseFile(true, true);
    const gap = gapId(P(2), P(3));
    const site: MergeRepairSite = {
      gapId: gap,
      beforePointId: P(2),
      afterPointId: P(3),
      vertices: VERTICES,
      resampleSpacingM: "off",
      timeStrategy: { kind: "distance-proportional" },
      roadLegs: [],
    };
    const profile = buildElevationProfile(mergeRepairs(data, [site], TIMED));
    const hole = profile!.points.find(
      (point) => point.kind === "recorded" && point.ele === undefined,
    );
    expect(hole).toBeDefined();
  });

  it("decimates long profiles to the bounded point count", () => {
    // A dense repair: spacing 10 m over the fixture's ~50 m gap gives a
    // long interior; force the cap low to observe decimation.
    const data = parseFile(true);
    const gap = gapId(P(2), P(3));
    const site: MergeRepairSite = {
      gapId: gap,
      beforePointId: P(2),
      afterPointId: P(3),
      vertices: VERTICES,
      resampleSpacingM: 10,
      timeStrategy: { kind: "distance-proportional" },
      roadLegs: [],
    };
    const merge = mergeRepairs(data, [site], TIMED);
    const full = buildElevationProfile(merge);
    expect(full!.points.length).toBeLessThanOrEqual(ELEVATION_PROFILE_MAX_POINTS);

    const tiny = buildElevationProfile(merge, { maxPoints: 4 });
    // Both kinds survive decimation with their run boundaries intact.
    const kinds = new Set(tiny!.points.map((point) => point.kind));
    expect(kinds.has("recorded")).toBe(true);
    expect(kinds.has("reconstructed")).toBe(true);
    expect(tiny!.points.length).toBeLessThan(full!.points.length);
  });

  it("returns null for a null merge or an ele-less file", () => {
    expect(buildElevationProfile(null)).toBeNull();
    const data = parseFile(false);
    const profile = buildElevationProfile(mergeRepairs(data, [], TIMED));
    expect(profile?.hasAnyEle ?? false).toBe(false);
  });
});

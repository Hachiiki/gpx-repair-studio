/**
 * Heatmap-strip goldens (Phase 25.1 verification: "heatmap perf
 * budget" + the Phase 9 decimation discipline at derivation time).
 *
 *   - identity under the ceiling (a normal file keeps every point);
 *   - power-of-two strides over the ceiling, endpoints pinned;
 *   - the perf budget: a 250k-point shelf-sized track decimates in
 *     well under the render budget;
 *   - the read-side ceiling: drifted shapes are discarded whole;
 *   - the GeoJSON builder: one MultiPoint per session, empties
 *     absent.
 */

import { describe, expect, it } from "vitest";
import {
  HEATMAP_MAX_POINTS_PER_SESSION,
  heatmapStrips,
  readHeatmapStrips,
} from "@/features/heatmap/strips";
import { heatmapCollection } from "@/lib/map/geojson";
import type { MergeResult, MergedTrack } from "@/features/reconstruction/merge";
import type { PointId } from "@/types/domain";

/** A hand-built merged track of plain equator points (pure fixture). */
function syntheticTrack(count: number): MergedTrack {
  return {
    trackIndex: 0,
    runs: [],
    points: Array.from({ length: count }, (_, i) => ({
      order: i,
      point: {
        source: "original" as const,
        id: `p${i}` as PointId,
        lat: 0,
        lon: -0.02 + i * (50 / 6_378_137) * (180 / Math.PI),
        flags: [],
        raw: {} as never,
      },
    })),
    repairCount: 0,
    reconstructedDistanceM: 0,
  };
}

function mergeOf(...tracks: MergedTrack[]): MergeResult {
  return {
    tracks,
    repairCount: 0,
    reconstructedDistanceM: 0,
    insertedPoints: 0,
    elevatedRepairCount: 0,
    elevationProviders: [],
    skipped: [],
  };
}

describe("heatmapStrips — the decimation discipline", () => {
  it("keeps every point under the ceiling (identity)", () => {
    const strips = heatmapStrips(mergeOf(syntheticTrack(100)));
    expect(strips.schemaVersion).toBe(1);
    expect(strips.lonLat.length).toBe(200);
    // Verbatim: first and last pairs are the track's own ends.
    expect(strips.lonLat[0]).toBeCloseTo(syntheticTrack(100).points[0]!.point.lon, 12);
  });

  it("decimates over the ceiling with power-of-two strides", () => {
    // 5000 points → stride 4 (5000/2048 = 2.44 → 2^2).
    const strips = heatmapStrips(mergeOf(syntheticTrack(5000)));
    const kept = strips.lonLat.length / 2;
    expect(kept).toBeLessThanOrEqual(HEATMAP_MAX_POINTS_PER_SESSION + 1);
    expect(kept).toBeGreaterThan(HEATMAP_MAX_POINTS_PER_SESSION / 2);
  });

  it("pins each track's endpoints exactly", () => {
    const a = syntheticTrack(3000);
    const b = syntheticTrack(3000);
    const first = a.points[0]!.point;
    const lastA = a.points[a.points.length - 1]!.point;
    const lastB = b.points[b.points.length - 1]!.point;
    const strips = heatmapStrips(mergeOf(a, b));
    const pairs = strips.lonLat.length / 2;
    // First pair = track A's head; pair at the seam = A's tail; last
    // pair = track B's tail (all exact, stride sampling aside).
    expect(strips.lonLat[0]).toBeCloseTo(first.lon, 12);
    const mid = strips.lonLat[(pairs / 2 - 1) * 2]!;
    expect(mid).toBeCloseTo(lastA.lon, 12);
    expect(strips.lonLat[strips.lonLat.length - 2]!).toBeCloseTo(lastB.lon, 12);
  });

  it("meets the perf budget: 250k points decimate in well under 200 ms", () => {
    const big = syntheticTrack(250_000);
    const started = performance.now();
    const strips = heatmapStrips(mergeOf(big));
    const elapsed = performance.now() - started;
    expect(strips.lonLat.length / 2).toBeLessThanOrEqual(
      HEATMAP_MAX_POINTS_PER_SESSION + 1,
    );
    // The 250k stress profile's own budget headroom, with a wide
    // margin for CI noise (the walk is a single flat pass).
    expect(elapsed).toBeLessThan(200);
  });
});

describe("readHeatmapStrips — the read-side ceiling", () => {
  it("round-trips a derived record", () => {
    const strips = heatmapStrips(mergeOf(syntheticTrack(10)));
    expect(readHeatmapStrips(strips)).toEqual(strips);
  });

  it("discards drifted shapes whole, never partially", () => {
    expect(readHeatmapStrips(null)).toBeNull();
    expect(readHeatmapStrips("nope")).toBeNull();
    expect(readHeatmapStrips({ schemaVersion: 99, lonLat: new Float64Array(4) })).toBeNull();
    expect(readHeatmapStrips({ schemaVersion: 1, lonLat: [1, 2] })).toBeNull();
    expect(
      readHeatmapStrips({ schemaVersion: 1, lonLat: new Float64Array(3) }),
    ).toBeNull();
    const nan = new Float64Array([0, Number.NaN]);
    expect(readHeatmapStrips({ schemaVersion: 1, lonLat: nan })).toBeNull();
  });
});

describe("heatmapCollection — the source builder", () => {
  it("emits one MultiPoint per session, empties absent", () => {
    const collection = heatmapCollection([
      { sessionId: "a", lonLat: new Float64Array([1, 2, 3, 4]) },
      { sessionId: "b", lonLat: new Float64Array(0) },
      { sessionId: "c", lonLat: new Float64Array([5, 6, 7, 8, 9, 10]) },
    ]);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0]!.geometry.type).toBe("MultiPoint");
    expect(collection.features[0]!.geometry.coordinates).toEqual([[1, 2], [3, 4]]);
    expect(collection.features[0]!.properties.sessionId).toBe("a");
    expect(collection.features[1]!.geometry.coordinates).toHaveLength(3);
  });
});

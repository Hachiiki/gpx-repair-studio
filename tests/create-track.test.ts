/**
 * Unit tests — the create track pipeline (features/create/track.ts).
 *
 * The "create from activity stats" Step 2/3 contract:
 *   - reconciliation compares the drawn chain with the recorded distance
 *     and only demands scaling beyond the 1% tolerance;
 *   - scaling is a shape-preserving similarity transform about the
 *     centroid (distances scale by the factor, order/roles ride along);
 *   - buildCreateTrack produces the final population: the recorded
 *     duration spread by movement (first point = start, last point =
 *     start + duration), the final distance ≈ the recorded distance when
 *     scaling is on, and the drawn distance when it is off;
 *   - the route view is one committed-reconstruction line.
 */

import { describe, expect, it } from "vitest";
import {
  buildCreateTrack,
  computeReconciliation,
  createTrackFileName,
  createTrackRouteView,
  CREATE_ROUTE_ID,
  MIN_CREATE_VERTICES,
  scalePathAboutCentroid,
} from "@/features/create/track";
import { resamplePath } from "@/features/reconstruction/resample";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { DrawVertex } from "@/types/domain";
import { vertexId } from "@/types/ids";

const STATS = {
  distanceM: 5230,
  durationMs: 1_955_000, // 32:35
  startMs: Date.UTC(2026, 8, 20, 5, 30),
};

function vertices(...positions: [number, number][]): DrawVertex[] {
  return positions.map(([lat, lon], i) => ({
    id: vertexId(i + 1),
    lat,
    lon,
  }));
}

/** A ~3.55 km L-shaped chain in Berlin (leg lengths chosen for clarity). */
const L_CHAIN = vertices(
  [52.52, 13.405],
  [52.53, 13.405], // ~1.11 km north
  [52.53, 13.455], // ~3.11 km east
);

describe("computeReconciliation", () => {
  it("flags nothing inside the 1% tolerance", () => {
    const r = computeReconciliation(5000, 5030);
    expect(r.needsScaling).toBe(false);
    expect(r.relativeDifference).toBeCloseTo(0.006, 6);
    expect(r.differenceM).toBe(30);
  });

  it("demands scaling beyond the tolerance and reports the factor", () => {
    const r = computeReconciliation(5230, 5410);
    expect(r.needsScaling).toBe(true);
    expect(r.differenceM).toBe(180);
    expect(r.scaleFactor).toBeCloseTo(5230 / 5410, 9);
    expect(r.extreme).toBe(false);
  });

  it("marks extreme factors (much shorter or longer than recorded)", () => {
    expect(computeReconciliation(5230, 1000).extreme).toBe(true);
    expect(computeReconciliation(5230, 20_000).extreme).toBe(true);
    expect(computeReconciliation(5230, 5410).extreme).toBe(false);
  });

  it("degrades honestly on undrawable inputs", () => {
    const r = computeReconciliation(5230, 0);
    expect(r.needsScaling).toBe(false);
    expect(r.scaleFactor).toBeNull();
  });
});

describe("scalePathAboutCentroid", () => {
  it("scales distances by the factor while preserving the shape", () => {
    const path = resamplePath(null, L_CHAIN, null, 25, []);
    const drawn = path[path.length - 1].cumDistanceM;
    const scaled = scalePathAboutCentroid(path, 2);
    const scaledLength = scaled[scaled.length - 1].cumDistanceM;
    expect(scaledLength).toBeCloseTo(drawn * 2, -2); // ~1% (geodesic vs spherical)

    // Shape preservation: every point keeps its relative offset from the
    // centroid (lat/lon scale linearly).
    const latC = path.reduce((s, p) => s + p.lat, 0) / path.length;
    const lonC = path.reduce((s, p) => s + p.lon, 0) / path.length;
    for (let i = 0; i < path.length; i += 1) {
      expect(scaled[i].lat - latC).toBeCloseTo((path[i].lat - latC) * 2, 9);
      expect(scaled[i].lon - lonC).toBeCloseTo((path[i].lon - lonC) * 2, 9);
      expect(scaled[i].role).toBe(path[i].role);
    }
  });

  it("is exact at factor 1 and safe on empty paths", () => {
    expect(scalePathAboutCentroid([], 2)).toEqual([]);
    const path = resamplePath(null, L_CHAIN, null, "off", []);
    expect(scalePathAboutCentroid(path, 1)).toEqual(path);
  });
});

describe("buildCreateTrack", () => {
  it("returns null below the two-vertex minimum", () => {
    expect(
      buildCreateTrack(STATS, {
        vertices: vertices([52.52, 13.405]),
        roadLegs: [],
        spacingM: 25,
        matchDistance: true,
      }),
    ).toBeNull();
    expect(MIN_CREATE_VERTICES).toBe(2);
  });

  it("scales the drawn route to the recorded distance when matching", () => {
    const track = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 25,
      matchDistance: true,
    })!;

    // The drawn chain is ~3.55 km — far from the recorded 5.23 km, so the
    // scale transform applies and the FINAL distance lands on the record.
    expect(track.reconciliation.needsScaling).toBe(true);
    expect(track.scaleApplied).toBe(true);
    expect(track.finalDistanceM).toBeCloseTo(STATS.distanceM, -1);
    expect(track.drawnDistanceM).toBeLessThan(STATS.distanceM);

    // Timestamps: every point stamped, first = start, last = start +
    // duration (the entered total, exactly), monotonic throughout.
    expect(track.times).toHaveLength(track.pointCount);
    const times = track.times.map((t) => t?.value ?? NaN);
    expect(times[0]).toBe(STATS.startMs);
    expect(times[times.length - 1]).toBe(STATS.startMs + STATS.durationMs);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    // Distance-proportional: the geographic midpoint in time ≈ half the
    // duration (even effort along the route).
    const midIndex = Math.floor(times.length / 2);
    const midFraction =
      track.path[midIndex].cumDistanceM / track.finalDistanceM;
    expect(
      (times[midIndex] - times[0]) / (times[times.length - 1] - times[0]),
    ).toBeCloseTo(midFraction, 1);
  });

  it("keeps the drawn distance when matching is off (honest fallback)", () => {
    const track = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 25,
      matchDistance: false,
    })!;
    expect(track.scaleApplied).toBe(false);
    expect(track.finalDistanceM).toBeCloseTo(track.drawnDistanceM, 6);
    // The timestamps still honor the recorded duration exactly.
    const times = track.times.map((t) => t?.value ?? NaN);
    expect(times[times.length - 1] - times[0]).toBe(STATS.durationMs);
  });

  it("does not scale inside the tolerance (drawing noise)", () => {
    // A chain drawn almost exactly 5.23 km: reuse the scaled chain of the
    // matching build (its length IS the recorded distance).
    const scaled = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 25,
      matchDistance: true,
    })!;
    const scaledVertices = scaled.path
      .filter((p) => p.role === "vertex")
      .map((p) => ({ id: p.vertexId!, lat: p.lat, lon: p.lon }));
    const again = buildCreateTrack(STATS, {
      vertices: scaledVertices,
      roadLegs: [],
      spacingM: 25,
      matchDistance: true,
    })!;
    expect(again.reconciliation.needsScaling).toBe(false);
    expect(again.scaleApplied).toBe(false);
  });

  it("densifies with spacing and honors spacing off (clicked points only)", () => {
    const dense = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 10,
      matchDistance: false,
    })!;
    const sparse = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: "off",
      matchDistance: false,
    })!;
    expect(dense.pointCount).toBeGreaterThan(sparse.pointCount);
    expect(sparse.pointCount).toBe(L_CHAIN.length);
  });

  it("applies road legs between the nodes they resolved for", () => {
    // One road leg over the first leg: a bulged geometry a few hundred
    // meters longer than the straight chord.
    const straight = resamplePath(null, L_CHAIN, null, "off", []);
    const leg = {
      a: { lat: L_CHAIN[0].lat, lon: L_CHAIN[0].lon },
      b: { lat: L_CHAIN[1].lat, lon: L_CHAIN[1].lon },
      coordinates: [
        [L_CHAIN[0].lon, L_CHAIN[0].lat],
        [13.4055, 52.528], // bulge
        [L_CHAIN[1].lon, L_CHAIN[1].lat],
      ] as [number, number][],
      routeDistanceM: 1500,
    };
    const withRoad = resamplePath(null, L_CHAIN, null, "off", [leg]);
    expect(withRoad.length).toBe(straight.length + 1);
    expect(withRoad[withRoad.length - 1].cumDistanceM).toBeGreaterThan(
      straight[straight.length - 1].cumDistanceM,
    );
  });
});

describe("createTrackRouteView + file name", () => {
  it("renders as one committed-reconstruction line under the create id", () => {
    const track = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 25,
      matchDistance: true,
    })!;
    const view = createTrackRouteView(track);
    expect(view.lines).toEqual([]);
    expect(view.spans).toEqual([]);
    expect(view.markers).toEqual([]);
    expect(view.reconstructions).toHaveLength(1);
    expect(view.reconstructions[0].gapId).toBe(CREATE_ROUTE_ID);
    expect(view.reconstructions[0].coordinates).toHaveLength(track.pointCount);
    expect(CREATE_ROUTE_ID.startsWith("create/")).toBe(true);
  });

  it("names the file after the activity's start date", () => {
    expect(createTrackFileName(Date.UTC(2026, 8, 20, 5, 30))).toBe(
      "activity-2026-09-20.gpx",
    );
    expect(createTrackFileName(Date.UTC(2025, 0, 3, 23, 59))).toBe(
      "activity-2025-01-03.gpx",
    );
  });
});

describe("geodesic sanity of the scaled population", () => {
  it("recomputes cumulative distances against the ellipsoid", () => {
    const track = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 25,
      matchDistance: true,
    })!;
    let sum = 0;
    for (let i = 1; i < track.path.length; i += 1) {
      sum += geodesicDistanceMeters(track.path[i - 1], track.path[i]);
    }
    expect(sum).toBeCloseTo(track.finalDistanceM, -1);
  });
});

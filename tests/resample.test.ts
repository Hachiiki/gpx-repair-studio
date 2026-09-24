/**
 * Unit tests — resample (features/reconstruction/resample.ts).
 *
 * Resample math (Phase 4 acceptance):
 *   - spacing "off": the path is exactly [before, vertices…, after];
 *   - numeric spacing: anchors/vertices kept EXACTLY as placed, fill points
 *     inserted strictly between, each fill segment ≤ spacing;
 *   - cumulative distances are monotonic and ≈ the geodesic path length;
 *   - interpolation: t=0/1 endpoints, equator midpoints, antimeridian wrap.
 */

import { describe, expect, it } from "vitest";
import { interpolateLatLon } from "@/lib/geo/geodesy";
import {
  resamplePath,
  type PathPoint,
} from "@/features/reconstruction/resample";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { DrawVertex } from "@/types/domain";
import { vertexId } from "@/types/ids";

const BEFORE = { lat: 52.52, lon: 13.405 };
const AFTER = { lat: 52.525, lon: 13.41 };

function vertices(...positions: [number, number][]): DrawVertex[] {
  return positions.map(([lat, lon], i) => ({
    id: vertexId(i + 1),
    lat,
    lon,
  }));
}

describe("interpolateLatLon (from the shared geodesy module)", () => {
  it("returns the endpoints at t=0 / t=1", () => {
    const a = { lat: 52.52, lon: 13.405 };
    const b = { lat: 48.8566, lon: 2.3522 };
    expect(interpolateLatLon(a, b, 0).lat).toBeCloseTo(a.lat, 9);
    expect(interpolateLatLon(a, b, 0).lon).toBeCloseTo(a.lon, 9);
    expect(interpolateLatLon(a, b, 1).lat).toBeCloseTo(b.lat, 9);
    expect(interpolateLatLon(a, b, 1).lon).toBeCloseTo(b.lon, 9);
  });

  it("midpoint of a 2° equatorial arc is 1° (analytic)", () => {
    const mid = interpolateLatLon(
      { lat: 0, lon: 10 },
      { lat: 0, lon: 12 },
      0.5,
    );
    expect(mid.lat).toBeCloseTo(0, 9);
    expect(mid.lon).toBeCloseTo(11, 9);
  });

  it("clamps t and wraps across the antimeridian", () => {
    expect(interpolateLatLon({ lat: 0, lon: 5 }, { lat: 0, lon: 15 }, -1).lon).toBeCloseTo(5, 9);
    expect(interpolateLatLon({ lat: 0, lon: 5 }, { lat: 0, lon: 15 }, 2).lon).toBeCloseTo(15, 9);
    // 179.5 → -179.5 crosses the dateline; midpoint must be 180/-180.
    const mid = interpolateLatLon(
      { lat: 0, lon: 179.5 },
      { lat: 0, lon: -179.5 },
      0.5,
    );
    expect(Math.abs(mid.lon)).toBeCloseTo(180, 6);
  });
});

describe("resamplePath — spacing off", () => {
  it("is exactly anchors + vertices with roles and ids intact", () => {
    const path = resamplePath(
      BEFORE,
      vertices([52.521, 13.406], [52.522, 13.407]),
      AFTER,
      "off",
    );
    expect(path.map((p) => p.role)).toEqual([
      "before-anchor",
      "vertex",
      "vertex",
      "after-anchor",
    ]);
    expect(path[1].vertexId).toBe(vertexId(1));
    expect(path[2].vertexId).toBe(vertexId(2));
    expect(path[0].vertexId).toBeUndefined();
    expect(path.map((p) => p.lat)).toEqual([
      BEFORE.lat,
      52.521,
      52.522,
      AFTER.lat,
    ]);
  });

  it("no vertices: the straight anchor-to-anchor path", () => {
    const path = resamplePath(BEFORE, [], AFTER, "off");
    expect(path).toHaveLength(2);
    expect(path[0].cumDistanceM).toBe(0);
    expect(path[1].cumDistanceM).toBeGreaterThan(400);
  });
});

describe("resamplePath — numeric spacing", () => {
  it("keeps anchors and vertices exactly; only interpolated fill is added", () => {
    const vs = vertices([52.521, 13.406], [52.523, 13.409]);
    const path = resamplePath(BEFORE, vs, AFTER, 10);
    const originals = path.filter((p) => p.role !== "interpolated");
    expect(originals.map((p) => p.lat)).toEqual([
      BEFORE.lat,
      52.521,
      52.523,
      AFTER.lat,
    ]);
    expect(originals[1].vertexId).toBe(vertexId(1));
    const fills = path.filter((p) => p.role === "interpolated");
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(fill.vertexId).toBeUndefined();
    }
  });

  it("inserts no fill on legs shorter than the spacing", () => {
    // before → v1 is ~11 m; v1 → after is ~550 m. With 50 m spacing only
    // the long leg gets fill — nothing may land between before and v1.
    const path = resamplePath(
      BEFORE,
      vertices([52.5201, 13.405]),
      AFTER,
      50,
    );
    const onShortLeg = path.filter(
      (p) => p.role === "interpolated" && p.lat < 52.5201,
    );
    expect(onShortLeg).toHaveLength(0);
    // …and the long leg did get fill.
    expect(
      path.filter((p) => p.role === "interpolated" && p.lat >= 52.5201)
        .length,
    ).toBeGreaterThan(0);
  });

  it("every fill segment is at most the spacing (long equatorial leg)", () => {
    // 1° of equator ≈ 111.19 km; spacing 10 km → 12 intervals.
    const path = resamplePath(
      { lat: 0, lon: 10 },
      [],
      { lat: 0, lon: 11 },
      10_000,
    );
    expect(path).toHaveLength(2 + 11); // 12 intervals → 11 interior fills
    for (let i = 1; i < path.length; i += 1) {
      const leg = geodesicDistanceMeters(path[i - 1], path[i]);
      expect(leg).toBeLessThanOrEqual(10_000 + 1); // +1 mm tolerance
      expect(leg).toBeGreaterThan(9_000);
    }
  });

  it("cumulative distances are monotonic non-decreasing and start at 0", () => {
    const path: PathPoint[] = resamplePath(
      BEFORE,
      vertices([52.521, 13.406], [52.523, 13.409]),
      AFTER,
      25,
    );
    expect(path[0].cumDistanceM).toBe(0);
    for (let i = 1; i < path.length; i += 1) {
      expect(path[i].cumDistanceM).toBeGreaterThanOrEqual(
        path[i - 1].cumDistanceM,
      );
    }
    // The final cumulative is the true geodesic path length of the polyline
    // (anchors + vertices, no fill) — fill points lie ON those legs.
    const polyline = [
      BEFORE,
      { lat: 52.521, lon: 13.406 },
      { lat: 52.523, lon: 13.409 },
      AFTER,
    ];
    let direct = 0;
    for (let i = 1; i < polyline.length; i += 1) {
      direct += geodesicDistanceMeters(polyline[i - 1], polyline[i]);
    }
    expect(path[path.length - 1].cumDistanceM).toBeCloseTo(direct, -2);
  });
});

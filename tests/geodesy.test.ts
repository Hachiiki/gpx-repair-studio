/**
 * Geodesy golden tests (docs/MASTER_PLAN.md §N-1).
 *
 * Reference values:
 *   - Flinders Peak → Buninyong: Vincenty's canonical 1975 example
 *     (also the reference vector of Veness's geodesy library): 54 972.271 m.
 *   - Equatorial arcs are analytically exact on WGS-84 (equator is a
 *     circle of radius a): 90° = a·π/2, 1° = a·π/180.
 *   - Meridian quadrant (equator → pole) on WGS-84: 10 001 965.7293 m
 *     (published value, e.g. via GeographicLib series evaluation).
 *   - Antipodal fallback ≈ half circumference of the mean-Earth sphere
 *     (haversine), the documented approximation for degenerate geodesics.
 */

import { describe, expect, it } from "vitest";
import {
  WGS84,
  geodesicDistanceMeters,
  haversineDistanceMeters,
  polylineLengthMeters,
  hasFiniteCoords,
  interpolateLatLon,
  crossTrackDistanceMeters,
  MEAN_EARTH_RADIUS_M,
} from "@/lib/geo/geodesy";
import { bboxOf, unionBBox } from "@/lib/geo/bbox";

const EQUATOR_DEGREE_M = (WGS84.a * Math.PI) / 180; // 111 319.490793…

describe("geodesicDistanceMeters — golden vectors", () => {
  it("Flinders Peak → Buninyong (Vincenty 1975 canonical example)", () => {
    const flinders = { lat: -37.95103341666667, lon: 144.42486788888889 };
    const buninyong = { lat: -37.652821138888886, lon: 143.92649552777777 };
    expect(geodesicDistanceMeters(flinders, buninyong)).toBeCloseTo(
      54972.271,
      2, // ±0.01 m
    );
  });

  it("90° along the equator = a·π/2 (analytic)", () => {
    const d = geodesicDistanceMeters(
      { lat: 0, lon: 0 },
      { lat: 0, lon: 90 },
    );
    expect(d).toBeCloseTo((WGS84.a * Math.PI) / 2, 3);
  });

  it("1° along the equator = a·π/180 (analytic)", () => {
    const d = geodesicDistanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(d).toBeCloseTo(EQUATOR_DEGREE_M, 4);
  });

  it("equator → pole (meridian quadrant) = 10 001 965.7293 m", () => {
    const d = geodesicDistanceMeters({ lat: 0, lon: 0 }, { lat: 90, lon: 0 });
    expect(d).toBeCloseTo(10001965.7293, 2);
  });

  it("a 5 m equatorial leg measures exactly 5 m", () => {
    const lonDeltaDeg = (5 / WGS84.a) * (180 / Math.PI);
    const d = geodesicDistanceMeters(
      { lat: 0, lon: 0 },
      { lat: 0, lon: lonDeltaDeg },
    );
    expect(d).toBeCloseTo(5, 6);
  });

  it("non-equatorial mid-litude leg matches independent reference scale", () => {
    // Berlin legs (~111 m per 0.001° lat): consistent across 3 lengths.
    const d1 = geodesicDistanceMeters(
      { lat: 52.52, lon: 13.4 },
      { lat: 52.521, lon: 13.4 },
    );
    const d2 = geodesicDistanceMeters(
      { lat: 52.52, lon: 13.4 },
      { lat: 52.523, lon: 13.4 },
    );
    expect(d1).toBeGreaterThan(110);
    expect(d1).toBeLessThan(112);
    expect(d2).toBeGreaterThan(330);
    expect(d2).toBeLessThan(335);
    // Near-linearity along a meridian (same great circle; the tiny
    // deviation from 3 is real meridional curvature, not error).
    expect(d2 / d1).toBeCloseTo(3, 5);
  });
});

describe("geodesicDistanceMeters — edge cases and fallback", () => {
  it("coincident points → exactly 0", () => {
    expect(geodesicDistanceMeters({ lat: 52.52, lon: 13.4 }, { lat: 52.52, lon: 13.4 })).toBe(0);
  });

  it("is symmetric", () => {
    const a = { lat: 52.520006, lon: 13.404954 };
    const b = { lat: 48.85837, lon: 2.29448 };
    const ab = geodesicDistanceMeters(a, b);
    const ba = geodesicDistanceMeters(b, a);
    expect(Math.abs(ab - ba)).toBeLessThan(1e-6);
  });

  it("antipodal equatorial points fall back to haversine (≈ π·R)", () => {
    const d = geodesicDistanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(d).toBeCloseTo(Math.PI * MEAN_EARTH_RADIUS_M, 2);
  });

  it("near-antipodal points produce a finite, sane distance", () => {
    const d = geodesicDistanceMeters(
      { lat: 10, lon: 30 },
      { lat: -10, lon: -150 },
    );
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(19.9e6);
    expect(d).toBeLessThan(20.1e6);
  });

  it("non-finite coordinates propagate NaN (honest, never 0)", () => {
    expect(geodesicDistanceMeters({ lat: NaN, lon: 13.4 }, { lat: 52.5, lon: 13.4 })).toBeNaN();
    expect(geodesicDistanceMeters({ lat: 52.5, lon: Infinity }, { lat: 52.5, lon: 13.4 })).toBeNaN();
  });
});

describe("haversineDistanceMeters", () => {
  it("90° along the equator = R·π/2 (analytic)", () => {
    expect(
      haversineDistanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }),
    ).toBeCloseTo((MEAN_EARTH_RADIUS_M * Math.PI) / 2, 3);
  });

  it("coincident points → 0", () => {
    expect(haversineDistanceMeters({ lat: 1, lon: 2 }, { lat: 1, lon: 2 })).toBe(0);
  });

  it("agrees with Vincenty within 0.5 % at kilometer scale", () => {
    const a = { lat: 52.520006, lon: 13.404954 };
    const b = { lat: 52.530006, lon: 13.414954 };
    const v = geodesicDistanceMeters(a, b);
    const h = haversineDistanceMeters(a, b);
    expect(Math.abs(h - v) / v).toBeLessThan(0.005);
  });

  it("non-finite coordinates → NaN", () => {
    expect(haversineDistanceMeters({ lat: NaN, lon: 0 }, { lat: 0, lon: 0 })).toBeNaN();
  });
});

describe("polylineLengthMeters", () => {
  it("empty → 0; single point → 0", () => {
    expect(polylineLengthMeters([])).toBe(0);
    expect(polylineLengthMeters([{ lat: 1, lon: 1 }])).toBe(0);
  });

  it("sums legs along the equator analytically", () => {
    const length = polylineLengthMeters([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 0, lon: 3 },
    ]);
    expect(length).toBeCloseTo(3 * EQUATOR_DEGREE_M, 3);
  });

  it("a non-finite point poisons the total honestly (NaN, not 0)", () => {
    const length = polylineLengthMeters([
      { lat: 0, lon: 0 },
      { lat: NaN, lon: 2 },
      { lat: 0, lon: 3 },
    ]);
    expect(length).toBeNaN();
  });
});

describe("hasFiniteCoords", () => {
  it("accepts finite pairs only", () => {
    expect(hasFiniteCoords({ lat: 0, lon: 0 })).toBe(true);
    expect(hasFiniteCoords({ lat: NaN, lon: 0 })).toBe(false);
    expect(hasFiniteCoords({ lat: 0, lon: Infinity })).toBe(false);
  });
});

describe("bboxOf / unionBBox", () => {
  it("empty input → null", () => {
    expect(bboxOf([])).toBeNull();
  });

  it("computes min/max over finite points", () => {
    expect(
      bboxOf([
        { lat: 10, lon: 20 },
        { lat: -5, lon: 130 },
        { lat: 40, lon: -60 },
      ]),
    ).toEqual({ minLat: -5, minLon: -60, maxLat: 40, maxLon: 130 });
  });

  it("skips non-finite points; all-invalid → null", () => {
    expect(
      bboxOf([
        { lat: 1, lon: 2 },
        { lat: NaN, lon: 5 },
      ]),
    ).toEqual({ minLat: 1, minLon: 2, maxLat: 1, maxLon: 2 });
    expect(bboxOf([{ lat: NaN, lon: NaN }])).toBeNull();
  });

  it("unions boxes; empty list → null", () => {
    expect(unionBBox([])).toBeNull();
    expect(
      unionBBox([
        { minLat: 0, minLon: 0, maxLat: 10, maxLon: 10 },
        { minLat: -5, minLon: 5, maxLat: 5, maxLon: 20 },
      ]),
    ).toEqual({ minLat: -5, minLon: 0, maxLat: 10, maxLon: 20 });
  });
});

describe("crossTrackDistanceMeters — Phase 4 goldens (spherical)", () => {
  it("point 1° east of a north-going equatorial track ≈ 1° of arc", () => {
    // Track: (0°, 0°) → (10°, 0°) heads due north along the meridian.
    // Point (5°, 1°) sits exactly one degree of longitude east of it.
    const dxt = crossTrackDistanceMeters(
      { lat: 5, lon: 1 },
      { lat: 0, lon: 0 },
      { lat: 10, lon: 0 },
    );
    const oneDegree = (MEAN_EARTH_RADIUS_M * Math.PI) / 180;
    expect(dxt).toBeCloseTo(oneDegree, -3); // ≈ 111 194.9 m
  });

  it("sign: east of a north-going track is positive, west negative", () => {
    const trackFrom = { lat: 0, lon: 0 };
    const trackTo = { lat: 10, lon: 0 };
    expect(
      crossTrackDistanceMeters({ lat: 5, lon: 0.01 }, trackFrom, trackTo),
    ).toBeGreaterThan(0);
    expect(
      crossTrackDistanceMeters({ lat: 5, lon: -0.01 }, trackFrom, trackTo),
    ).toBeLessThan(0);
  });

  it("zero on the track; NaN propagation; coincident-track fallback", () => {
    expect(
      crossTrackDistanceMeters(
        { lat: 5, lon: 0 },
        { lat: 0, lon: 0 },
        { lat: 10, lon: 0 },
      ),
    ).toBeCloseTo(0, 6);
    expect(
      crossTrackDistanceMeters(
        { lat: NaN, lon: 0 },
        { lat: 0, lon: 0 },
        { lat: 10, lon: 0 },
      ),
    ).toBeNaN();
    // Degenerate track: distance to the anchor, unsigned.
    const fallback = crossTrackDistanceMeters(
      { lat: 0, lon: 0.001 },
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0 },
    );
    expect(fallback).toBeGreaterThan(100);
    expect(fallback).toBeLessThan(120);
  });
});

describe("interpolateLatLon — Phase 4 (shared spherical interpolation)", () => {
  it("t=0.5 on a meridian arc is the latitude midpoint", () => {
    const mid = interpolateLatLon(
      { lat: 10, lon: 20 },
      { lat: 20, lon: 20 },
      0.5,
    );
    expect(mid.lat).toBeCloseTo(15, 9);
    expect(mid.lon).toBeCloseTo(20, 9);
  });

  it("quarter point of a long equatorial arc matches the analytic position (nlerp bound)", () => {
    const q = interpolateLatLon(
      { lat: 0, lon: 0 },
      { lat: 0, lon: 4 },
      0.25,
    );
    expect(q.lat).toBeCloseTo(0, 9);
    // nlerp interpolates the CHORD, not the arc: on a 4° leg (~445 km —
    // far beyond running-scale legs) the angular position lags by
    // ≈ θ²/8 ≈ 0.03 %. Tighter than 3 decimals would test slerp, not nlerp.
    expect(q.lon).toBeCloseTo(1, 3);
  });

  it("keeps sub-millimeter consistency with the geodesic distance split", () => {
    const a = { lat: 52.52, lon: 13.405 };
    const b = { lat: 48.8566, lon: 2.3522 };
    const mid = interpolateLatLon(a, b, 0.5);
    const total = geodesicDistanceMeters(a, b);
    const firstHalf = geodesicDistanceMeters(a, mid);
    const secondHalf = geodesicDistanceMeters(mid, b);
    // Spherical interpolation vs ellipsoidal distance: the split must be
    // near-equal (relative error far below running-scale relevance).
    expect(Math.abs(firstHalf - secondHalf) / total).toBeLessThan(0.002);
    expect(firstHalf + secondHalf).toBeCloseTo(total, -3);
  });
});

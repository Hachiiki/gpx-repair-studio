/**
 * Route simplification tests (Task 22) — lib/geo/simplify.ts.
 *
 * The contract, from the spec: "Preserve GPS jitter, max simplify
 * tolerance 5m." Douglas-Peucker with a metre tolerance — deviations
 * above the tolerance survive (that is the jitter), sub-tolerance
 * detail decimates (that is the performance headroom for 100k-point
 * files), endpoints always stay, and the original point objects come
 * back untouched (a rendering view, never a data edit).
 */

import { describe, expect, it } from "vitest";
import {
  simplifyPolyline,
  simplifyPolylines,
} from "@/lib/geo/simplify";
import type { LatLon } from "@/types/domain";

/** Degrees of latitude per metre (constant enough at city scale). */
const DEG_PER_M = 1 / 111_320;

const at = (lat: number, lon: number): LatLon => ({ lat, lon });

/** A straight line along a meridian with N interior points. */
function straightLine(points: number, lat0 = 14.5, lon = 121): LatLon[] {
  return Array.from(
    { length: points },
    (_, i) => at(lat0 + i * 10 * DEG_PER_M, lon),
  );
}

/** A zigzag: lateral offsets alternate ±amplitudeM around a meridian. */
function zigzag(points: number, amplitudeM: number, lon = 121): LatLon[] {
  return Array.from(
    { length: points },
    (_, i) =>
      at(
        14.5 + i * 15 * DEG_PER_M,
        lon + (i % 2 === 0 ? 1 : -1) * amplitudeM * DEG_PER_M,
      ),
  );
}

describe("simplifyPolyline", () => {
  it("keeps both endpoints of every simplification", () => {
    const line = zigzag(64, 8);
    const simplified = simplifyPolyline(line, 5);
    expect(simplified.length).toBeGreaterThanOrEqual(2);
    expect(simplified[0]).toBe(line[0]);
    expect(simplified[simplified.length - 1]).toBe(line[line.length - 1]);
  });

  it("collapses sub-tolerance detail: a straight line drops to its ends", () => {
    const line = straightLine(500);
    const simplified = simplifyPolyline(line, 5);
    // Every interior point lies (far) less than 5m off the chord.
    expect(simplified).toHaveLength(2);
    expect(simplified[0]).toBe(line[0]);
    expect(simplified[1]).toBe(line[line.length - 1]);
  });

  it("preserves GPS jitter above the tolerance (the spec's 5m cap)", () => {
    // ±40m lateral swings — well above 5m: every apex must survive.
    const line = zigzag(33, 40);
    const simplified = simplifyPolyline(line, 5);
    expect(simplified.length).toBe(line.length);
  });

  it("drops jitter below the tolerance", () => {
    // ±1m wobble — inside the cap: collapses to the two endpoints.
    const line = zigzag(33, 1);
    const simplified = simplifyPolyline(line, 5);
    expect(simplified).toHaveLength(2);
  });

  it("preserves exactly-at-threshold apexes and drops below-threshold ones", () => {
    // A single apex 12m off the chord between two far-apart ends.
    const line = [
      at(14.5, 121),
      at(14.5 + 0.0009, 121 + 12 * DEG_PER_M), // ≈12m lateral
      at(14.5 + 0.0018, 121),
    ];
    expect(simplifyPolyline(line, 5)).toHaveLength(3);
    expect(simplifyPolyline(line, 20)).toHaveLength(2);
  });

  it("returns short and degenerate inputs unchanged", () => {
    expect(simplifyPolyline([], 5)).toEqual([]);
    const lone = [at(14.5, 121)];
    expect(simplifyPolyline(lone, 5)).toEqual(lone);
    const pair = [at(14.5, 121), at(14.51, 121.01)];
    expect(simplifyPolyline(pair, 5)).toEqual(pair);
  });

  it("treats a non-positive tolerance as 'keep everything'", () => {
    const line = straightLine(50);
    expect(simplifyPolyline(line, 0)).toHaveLength(50);
    expect(simplifyPolyline(line, -3)).toHaveLength(50);
  });

  it("returns the original point objects (a view, never a copy-edit)", () => {
    const line = zigzag(20, 8);
    const simplified = simplifyPolyline(line, 5);
    for (const point of simplified) {
      expect(line).toContain(point);
    }
  });

  it("survives a 100k-point line without exhausting the stack", () => {
    const line = straightLine(100_000);
    const started = Date.now();
    const simplified = simplifyPolyline(line, 5);
    // Iterative DP: no RangeError, and the answer is instant.
    expect(simplified).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("measures the tolerance in metres, not degrees", () => {
    // The same 30m apex, expressed as a longitude offset at ~14.5°N
    // (where a degree of longitude is ≈107.9km — a pure-degree
    // distance metric would drop it at tolerance 5).
    const cosLat = Math.cos((14.5 * Math.PI) / 180);
    const line = [
      at(14.5, 121),
      at(14.5 + 0.001, 121 + (30 / (111_320 * cosLat))),
      at(14.5 + 0.002, 121),
    ];
    expect(simplifyPolyline(line, 5)).toHaveLength(3);
  });

  it("unwraps the antimeridian: a crossing leg is measured short", () => {
    // Two ends 1km apart across ±180°, with the midpoint on the seam.
    const line = [
      at(-17.9, 179.9995),
      at(-17.9, 180.0005),
      at(-17.9, -179.9995),
    ];
    // Perpendicular deviations are sub-metre → collapses to the ends,
    // and the unwrapped output keeps the original objects.
    const simplified = simplifyPolyline(line, 5);
    expect(simplified).toHaveLength(2);
    expect(simplified[0]).toBe(line[0]);
    expect(simplified[1]).toBe(line[2]);
  });
});

describe("simplifyPolylines", () => {
  it("simplifies each piece independently (gap-split never shares a chord)", () => {
    const pieces = [straightLine(30), zigzag(30, 40), [at(10, 10)]];
    const simplified = simplifyPolylines(pieces, 5);
    expect(simplified).toHaveLength(3);
    expect(simplified[0]).toHaveLength(2);
    expect(simplified[1].length).toBe(pieces[1].length);
    expect(simplified[2]).toEqual(pieces[2]);
  });

  it("returns an empty route unchanged", () => {
    expect(simplifyPolylines([], 5)).toEqual([]);
  });
});

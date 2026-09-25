/**
 * Share card projection tests (Task 20) — lib/geo/mercator.ts.
 *
 * Golden values for the normalized Web-Mercator projection and the
 * fit-and-center behavior: aspect preservation, degenerate content
 * (single point / zero-extent lines), multi-polyline shared fits,
 * antimeridian unwrapping, and non-finite filtering.
 */

import { describe, expect, it } from "vitest";
import {
  MERCATOR_MAX_LAT,
  mercatorX,
  mercatorY,
  projectPolylines,
} from "@/lib/geo/mercator";

describe("mercatorX", () => {
  it("maps −180° → 0, 0° → 0.5, 180° → 1", () => {
    expect(mercatorX(-180)).toBe(0);
    expect(mercatorX(0)).toBeCloseTo(0.5, 12);
    expect(mercatorX(180)).toBe(1);
  });

  it("is linear in longitude", () => {
    expect(mercatorX(90) - mercatorX(0)).toBeCloseTo(0.25, 12);
  });
});

describe("mercatorY", () => {
  it("maps the equator to the middle", () => {
    expect(mercatorY(0)).toBeCloseTo(0.5, 12);
  });

  it("maps the Mercator domain to (nearly) the full range", () => {
    expect(mercatorY(MERCATOR_MAX_LAT)).toBeLessThan(0.001);
    expect(mercatorY(-MERCATOR_MAX_LAT)).toBeGreaterThan(0.999);
  });

  it("clamps latitudes beyond the domain instead of exploding", () => {
    expect(mercatorY(89.9)).toBeLessThan(0.005);
    expect(Number.isFinite(mercatorY(90))).toBe(true);
    expect(Number.isFinite(mercatorY(-90))).toBe(true);
  });

  it("is symmetric about the equator", () => {
    expect(mercatorY(30) + mercatorY(-30)).toBeCloseTo(1, 12);
  });
});

describe("projectPolylines", () => {
  const BOX = { x: 100, y: 50, width: 800, height: 400 };

  it("returns isEmpty for no input", () => {
    const result = projectPolylines([], BOX);
    expect(result.isEmpty).toBe(true);
    expect(result.polylines).toEqual([]);
  });

  it("skips non-finite points but keeps the finite rest", () => {
    const result = projectPolylines(
      [[
        { lat: 0, lon: 0 },
        { lat: Number.NaN, lon: 0 },
        { lat: 0, lon: 0.0001 },
      ]],
      BOX,
    );
    expect(result.isEmpty).toBe(false);
    expect(result.polylines[0]).toHaveLength(2);
  });

  it("fits square content into the box's limiting axis and centers it", () => {
    // A small square around (0, 0): ±0.001° in both axes.
    const result = projectPolylines(
      [[
        { lat: 0.001, lon: -0.001 },
        { lat: 0.001, lon: 0.001 },
        { lat: -0.001, lon: 0.001 },
        { lat: -0.001, lon: -0.001 },
      ]],
      BOX,
    );
    expect(result.isEmpty).toBe(false);
    const xs = result.polylines[0].map((p) => p.x);
    const ys = result.polylines[0].map((p) => p.y);
    // Aspect preserved: width/height ratio stays 1 (the box is 2:1,
    // so the height axis limits and the content centers horizontally).
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width / height).toBeCloseTo(1, 6);
    expect(width).toBeLessThanOrEqual(BOX.width + 1e-6);
    expect(height).toBeCloseTo(BOX.height, 6);
    // Centered in the box.
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(
      BOX.x + BOX.width / 2,
      6,
    );
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(
      BOX.y + BOX.height / 2,
      6,
    );
  });

  it("keeps every polyline's stroke independent (no fabricated connectors)", () => {
    const result = projectPolylines(
      [
        [{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }],
        [{ lat: 5, lon: 5 }, { lat: 5.001, lon: 5 }],
      ],
      BOX,
    );
    expect(result.polylines).toHaveLength(2);
    expect(result.polylines[0]).toHaveLength(2);
    expect(result.polylines[1]).toHaveLength(2);
  });

  it("shares one fit across polylines (one route, one scale)", () => {
    const result = projectPolylines(
      [
        [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }],
        [{ lat: 1, lon: 0 }, { lat: 1, lon: 1 }],
      ],
      BOX,
    );
    const all = result.polylines.flat();
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    // 1°×1° is (near-)square in Mercator — conformal — so the box's
    // 400px height limits: the union spans the full height and the
    // same width, centered (letterboxed), never stretched.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(BOX.height, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(BOX.height, 6);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(
      BOX.x + BOX.width / 2,
      6,
    );
  });

  it("renders a lone point centered as a dot", () => {
    const result = projectPolylines([[{ lat: 10, lon: 20 }]], BOX);
    expect(result.isEmpty).toBe(false);
    expect(result.hasLonePoints).toBe(true);
    expect(result.polylines[0]).toHaveLength(1);
    expect(result.polylines[0][0].x).toBeCloseTo(BOX.x + BOX.width / 2, 6);
    expect(result.polylines[0][0].y).toBeCloseTo(BOX.y + BOX.height / 2, 6);
  });

  it("treats a zero-extent line (perfectly N-S) as degenerate, not exploding", () => {
    const result = projectPolylines(
      [[{ lat: 0, lon: 1 }, { lat: 0.001, lon: 1 }]],
      BOX,
    );
    expect(result.isEmpty).toBe(false);
    expect(Number.isFinite(result.scale)).toBe(true);
    const ys = result.polylines[0].map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(BOX.height, 6);
  });

  it("unwraps antimeridian crossings into the short direction", () => {
    // Fiji-style out-and-back across the seam: 179.9°E → 179.9°W →
    // 179.85°E. Unwrapped, the third point sits NEXT TO the first (the
    // leg home is 0.25° long); naively it would land at the far edge
    // again — a route smeared across the whole world.
    const result = projectPolylines(
      [[
        { lat: -17.7, lon: 179.9 },
        { lat: -17.7, lon: -179.9 },
        { lat: -17.7, lon: 179.85 },
      ]],
      BOX,
    );
    expect(result.isEmpty).toBe(false);
    const [a, b, c] = result.polylines[0];
    // The latitude span is zero, so the fit is x-limited: the content
    // spans the full box width, from the return point to the crossing.
    expect(b.x - Math.min(a.x, c.x)).toBeCloseTo(BOX.width, 1);
    // The crossing is the rightmost point; both home-side points sit
    // well left of it — a short V, not a second world-spanning sweep
    // (naively, the return point would land ~the full world away).
    expect(b.x).toBeGreaterThan(Math.max(a.x, c.x) + 0.7 * BOX.width);
    // And the two home-side points are neighbors (0.05° apart on a
    // 0.25° journey — a small fraction of the fitted span).
    expect(Math.abs(c.x - a.x)).toBeLessThan(0.3 * BOX.width);
    // The zero latitude span still fits inside the box height.
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(BOX.height + 1e-6);
  });
});

/**
 * Zoom-dependent render decimation tests (docs/MASTER_PLAN.md Phase 9).
 *
 * The stride math is the contract: keep ~2 px on-screen spacing at the
 * current zoom, quantized to powers of two, identity below the noise
 * floor, endpoints pinned, never below the recognizable-track minimum.
 */

import { describe, expect, it } from "vitest";
import {
  decimateForZoom,
  decimateLines,
  decimationStride,
  DECIMATE_MIN_COORDS,
  DECIMATE_MIN_RENDERED,
} from "@/lib/map/decimate";
import type { RouteLinePart } from "@/lib/map/geojson";

/** A synthetic line of `n` points along a slow diagonal near Berlin. */
function line(
  n: number,
  segmentId = "s0",
  spacingDeg = 0.00003,
): RouteLinePart {
  const coordinates: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    coordinates.push([13.4 + i * spacingDeg, 52.52 + i * spacingDeg * 0.66]);
  }
  return { segmentId: segmentId as RouteLinePart["segmentId"], trackIndex: 0, coordinates };
}

describe("decimationStride", () => {
  it("is 1 below the coordinate noise floor (identity contract)", () => {
    expect(decimationStride([line(100)], 10)).toBe(1);
    expect(decimationStride([line(DECIMATE_MIN_COORDS - 1)], 2)).toBe(1);
  });

  it("is 1 when the zoom makes everything resolvable (cap ≥ total)", () => {
    // 50k points spread over ~2.5° (spacing 5e-5): at zoom 16 that is
    // ~120k screen pixels — every point earns its 2 px.
    const l = line(50_000, "s0", 0.00005);
    expect(decimationStride([l], 16)).toBe(1);
  });

  it("grows as the zoom falls (denser screen → sparser sampling)", () => {
    const l = line(100_000);
    const strides: number[] = [];
    for (const zoom of [6, 8, 10, 12, 14]) {
      strides.push(decimationStride([l], zoom));
    }
    for (let i = 1; i < strides.length; i += 1) {
      expect(strides[i]).toBeLessThanOrEqual(strides[i - 1]);
    }
    expect(strides[0]).toBeGreaterThan(strides[strides.length - 1]);
  });

  it("quantizes to powers of two (band crossings only)", () => {
    const l = line(100_000);
    for (const zoom of [4, 7, 9, 11]) {
      const stride = decimationStride([l], zoom);
      // Either a pure power of two, or the clamped floor (very low zoom
      // saturates at floor(total / DECIMATE_MIN_RENDERED), where the
      // stride is constant across zooms — no thrash either).
      const pow2 = Number.isInteger(Math.log2(stride));
      const clamped = stride === Math.floor(100_000 / DECIMATE_MIN_RENDERED);
      expect(pow2 || clamped, `zoom ${zoom} → stride ${stride}`).toBe(true);
    }
  });

  it("never leaves the route below the recognizable minimum", () => {
    const l = line(100_000);
    // Whole-world zoom: the cap would be ~10 points; the floor holds.
    const stride = decimationStride([l], 0);
    expect(stride).toBeLessThanOrEqual(Math.floor(100_000 / DECIMATE_MIN_RENDERED));
  });

  it("handles multiple lines (combined extent + total)", () => {
    const a = line(40_000, "s0", 0.00008);
    const b = line(40_000, "s1", 0.00008);
    expect(decimationStride([a, b], 8)).toBeGreaterThan(1);
    expect(decimationStride([a, b], 16)).toBe(1);
  });
});

describe("decimateLines", () => {
  it("returns the input references for stride ≤ 1 (zero-copy identity)", () => {
    const lines = [line(10)];
    expect(decimateLines(lines, 1)).toBe(lines);
    expect(decimateLines(lines, 0)).toBe(lines);
  });

  it("keeps first and last coordinates exactly, samples by stride", () => {
    const l = line(101);
    const [out] = decimateLines([l], 10);
    const coords = out!.coordinates;
    expect(coords[0]).toBe(l.coordinates[0]);
    expect(coords[coords.length - 1]).toBe(l.coordinates[l.coordinates.length - 1]);
    // 0, 10, …, 90, then the pinned 100th.
    expect(coords).toHaveLength(11);
    expect(coords[1]).toBe(l.coordinates[10]);
  });

  it("leaves short lines alone", () => {
    const l = line(2);
    const [out] = decimateLines([l], 8);
    expect(out).toBe(l);
  });

  it("preserves segment identity and order", () => {
    const a = line(200, "s0");
    const b = line(200, "s1");
    const out = decimateLines([a, b], 16);
    expect(out.map((l) => l.segmentId)).toEqual(["s0", "s1"]);
  });
});

describe("decimateForZoom", () => {
  it("identity path returns the same reference and stride 1", () => {
    const lines = [line(100)];
    const result = decimateForZoom(lines, 12);
    expect(result.lines).toBe(lines);
    expect(result.stride).toBe(1);
  });

  it("a 100k-point line at overview zoom renders a small fraction", () => {
    const lines = [line(100_000)];
    const result = decimateForZoom(lines, 9);
    expect(result.stride).toBeGreaterThan(1);
    const kept = result.lines[0]!.coordinates.length;
    expect(kept).toBeLessThan(100_000 / 4);
    expect(kept).toBeGreaterThanOrEqual(DECIMATE_MIN_RENDERED);
    // Visual-lossless bound: kept points stay ~2 px apart at that zoom.
    const extentDeg = 100_000 * 0.00003;
    const pxPerDegree = (512 * 2 ** 9) / 360 * Math.cos((52.52 * Math.PI) / 180);
    const routePx = extentDeg * pxPerDegree;
    expect(kept).toBeGreaterThanOrEqual(routePx / 2 - 2); // ± rounding
  });
});

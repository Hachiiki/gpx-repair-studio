/**
 * Stroke (user pass 48) — the Curve pen's pure processor.
 *
 * Pins the contract the three draw surfaces rely on:
 *   - Douglas-Peucker keeps the shape (bends survive, chords drop) and
 *     always the exact endpoints (user data);
 *   - the node caps differ by use case: routing strokes are coarse
 *     waypoints, local strokes are dense spline food;
 *   - the caller's vertex budget is respected no matter how wild the
 *     stroke is (iterative tolerance, then uniform decimation);
 *   - degenerate strokes (taps, single samples) produce nothing.
 */

import { describe, expect, it } from "vitest";
import {
  CURVE_STROKE_MAX_NODES,
  douglasPeucker,
  ROUTING_STROKE_MAX_NODES,
  simplifyStroke,
} from "@/features/reconstruction/stroke";
import type { LatLon } from "@/types/domain";

/** A hand-drawn-looking S: east, then north-east, then east again. */
const S_CURVE: LatLon[] = [];
for (let i = 0; i <= 60; i += 1) {
  const t = i / 60;
  S_CURVE.push({
    lat: 52.52 + 0.004 * Math.sin(t * Math.PI * 2),
    lon: 13.405 + 0.006 * t,
  });
}

describe("douglasPeucker", () => {
  it("keeps a straight line to its endpoints only", () => {
    const straight: LatLon[] = [];
    for (let i = 0; i <= 50; i += 1) {
      straight.push({ lat: 52.5 + i * 1e-5, lon: 13.4 + i * 1e-5 });
    }
    expect(douglasPeucker(straight, 1)).toHaveLength(2);
  });

  it("keeps the bend of a V and the exact endpoints", () => {
    const v: LatLon[] = [];
    for (let i = 0; i <= 20; i += 1) {
      v.push({ lat: 52.5 - i * 5e-5, lon: 13.4 + i * 1e-4 });
    }
    for (let i = 1; i <= 20; i += 1) {
      v.push({ lat: 52.5 - (20 - i) * 5e-5, lon: 13.4 + (20 + i) * 1e-4 });
    }
    const simplified = douglasPeucker(v, 5);
    expect(simplified.length).toBeGreaterThanOrEqual(3); // start, bend, end
    expect(simplified.length).toBeLessThan(v.length);
    expect(simplified[0]).toEqual(v[0]);
    expect(simplified[simplified.length - 1]).toEqual(v[v.length - 1]);
    // The tip of the V survives — it is the shape.
    const tip = v[20];
    expect(
      simplified.some((p) => p.lat === tip.lat && p.lon === tip.lon),
    ).toBe(true);
  });

  it("never returns fewer than the two endpoints", () => {
    expect(douglasPeucker([], 1)).toEqual([]);
    expect(douglasPeucker([{ lat: 1, lon: 1 }], 1)).toEqual([
      { lat: 1, lon: 1 },
    ]);
  });
});

/** Planar distance (meters) from `p` to the segment `a`→`b`. */
function distanceToSegmentM(p: LatLon, a: LatLon, b: LatLon): number {
  const mLat = 111_320;
  const mLon = 111_320 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
  const ax = a.lon * mLon;
  const ay = a.lat * mLat;
  const bx = b.lon * mLon;
  const by = b.lat * mLat;
  const px = p.lon * mLon;
  const py = p.lat * mLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

describe("simplifyStroke — local (spline food)", () => {
  it("compresses the raw trace but keeps its shape and endpoints", () => {
    const nodes = simplifyStroke(S_CURVE, { routing: false, budget: 128 });
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes.length).toBeLessThan(S_CURVE.length);
    expect(nodes.length).toBeLessThanOrEqual(CURVE_STROKE_MAX_NODES);
    expect(nodes[0]).toEqual(S_CURVE[0]);
    expect(nodes[nodes.length - 1]).toEqual(S_CURVE[S_CURVE.length - 1]);
    // Shape: every raw sample stays close to the SIMPLIFIED POLYLINE
    // (Douglas-Peucker's guarantee at the reached tolerance).
    for (const sample of S_CURVE) {
      let nearest = Infinity;
      for (let i = 0; i + 1 < nodes.length; i += 1) {
        nearest = Math.min(
          nearest,
          distanceToSegmentM(sample, nodes[i], nodes[i + 1]),
        );
      }
      expect(nearest).toBeLessThan(25); // ≲ 25 m at city map scale
    }
  });

  it("respects a tight budget with exactly the endpoints pinned", () => {
    const nodes = simplifyStroke(S_CURVE, { routing: false, budget: 5 });
    expect(nodes.length).toBeLessThanOrEqual(5);
    expect(nodes[0]).toEqual(S_CURVE[0]);
    expect(nodes[nodes.length - 1]).toEqual(S_CURVE[S_CURVE.length - 1]);
  });
});

describe("simplifyStroke — routing (coarse waypoints)", () => {
  it("caps stroke waypoints far below the local cap", () => {
    const nodes = simplifyStroke(S_CURVE, { routing: true, budget: 128 });
    expect(nodes.length).toBeLessThanOrEqual(ROUTING_STROKE_MAX_NODES);
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0]).toEqual(S_CURVE[0]);
    expect(nodes[nodes.length - 1]).toEqual(S_CURVE[S_CURVE.length - 1]);
  });
});

describe("simplifyStroke — degenerate inputs", () => {
  it("returns nothing for a tap (one sample) or no budget", () => {
    expect(simplifyStroke([], { routing: false, budget: 128 })).toEqual([]);
    expect(
      simplifyStroke([{ lat: 52.5, lon: 13.4 }], { routing: false, budget: 128 }),
    ).toEqual([]);
    expect(simplifyStroke(S_CURVE, { routing: false, budget: 0 })).toEqual([]);
    expect(simplifyStroke(S_CURVE, { routing: false, budget: 1 })).toEqual([]);
  });

  it("drops consecutive duplicates and non-finite samples", () => {
    const noisy: LatLon[] = [
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.4 }, // duplicate
      { lat: NaN, lon: 13.401 }, // invalid
      { lat: 52.5001, lon: 13.4002 },
      { lat: 52.5002, lon: 13.4004 },
    ];
    const nodes = simplifyStroke(noisy, { routing: false, budget: 128 });
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0]).toEqual({ lat: 52.5, lon: 13.4 });
    for (const node of nodes) {
      expect(Number.isFinite(node.lat)).toBe(true);
      expect(Number.isFinite(node.lon)).toBe(true);
    }
  });
});

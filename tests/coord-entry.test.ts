/**
 * Coordinate-entry validation tests (Phase 16, §EE 16.3): the sanity
 * gate every typed lat/lng passes — grammar, bounds, precision — plus
 * the nudge math (meters → degrees).
 */

import { describe, expect, it } from "vitest";
import {
  MAX_COORD_DECIMALS,
  nudgeDelta,
  nudgeInBounds,
  NUDGE_STEP_CHOICES,
  parseLatitude,
  parseLongitude,
} from "@/features/reconstruction/coordEntry";

describe("parseLatitude", () => {
  it("accepts plain decimal degrees", () => {
    expect(parseLatitude("52.5206")).toEqual({
      ok: true,
      value: 52.5206,
      rounded: false,
    });
    expect(parseLatitude(" -33.865 ")).toEqual({
      ok: true,
      value: -33.865,
      rounded: false,
    });
    expect(parseLatitude("90")).toEqual({ ok: true, value: 90, rounded: false });
    expect(parseLatitude("-90")).toEqual({
      ok: true,
      value: -90,
      rounded: false,
    });
  });

  it("rejects out-of-bounds values with the bound named", () => {
    const result = parseLatitude("91.2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Latitude must be between -90 and 90");
      expect(result.error).toContain("91.2");
    }
  });

  it("rejects non-decimal grammar honestly", () => {
    for (const bad of [
      "",
      "   ",
      "52°31'14\"",
      "52.5206N",
      "1e2",
      "0x10",
      "52,5206",
      "abc",
      "52.5206,13",
    ]) {
      const result = parseLatitude(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/decimal degrees/i);
    }
  });

  it("rounds more than 7 decimals and says so", () => {
    const result = parseLatitude("52.5206123456");
    expect(result).toEqual({ ok: true, value: 52.5206123, rounded: true });
    expect(parseLatitude("52.5206123")).toEqual({
      ok: true,
      value: 52.5206123,
      rounded: false,
    });
    expect(MAX_COORD_DECIMALS).toBe(7);
  });
});

describe("parseLongitude", () => {
  it("accepts the full range and rejects past it", () => {
    expect(parseLongitude("180")).toEqual({
      ok: true,
      value: 180,
      rounded: false,
    });
    expect(parseLongitude("-180.0000001").ok).toBe(false);
    const over = parseLongitude("-180.0000001");
    if (!over.ok) expect(over.error).toContain("-180 and 180");
  });
});

describe("nudgeDelta", () => {
  it("converts meters to degree deltas, scaling longitude by cos(lat)", () => {
    // At the equator, 10 m north and 10 m east.
    const equator = nudgeDelta(0, 10, 1, 1);
    expect(equator.dLat).toBeCloseTo(10 / 111_320, 12);
    expect(equator.dLon).toBeCloseTo(10 / 111_320, 12);

    // At 60° north, the same east step is twice the degrees.
    const north = nudgeDelta(60, 10, 0, 1);
    expect(north.dLat).toBe(0);
    expect(north.dLon).toBeCloseTo((2 * 10) / 111_320, 6);

    // Negative directions subtract.
    const south = nudgeDelta(0, 10, -1, -1);
    expect(south.dLat).toBeCloseTo(-10 / 111_320, 12);
    expect(south.dLon).toBeCloseTo(-10 / 111_320, 12);
  });

  it("the step choices are the documented trio", () => {
    expect(NUDGE_STEP_CHOICES).toEqual([1, 10, 100]);
  });
});

describe("nudgeInBounds", () => {
  it("permits in-range moves and refuses the world's edge", () => {
    expect(nudgeInBounds(89.9999, 0, 0.0001, 0)).toBe(true);
    expect(nudgeInBounds(90, 0, 0.0001, 0)).toBe(false);
    expect(nudgeInBounds(0, 179.9999, 0, 0.0001)).toBe(true);
    expect(nudgeInBounds(0, 180, 0, 0.0001)).toBe(false);
    expect(nudgeInBounds(0, 0, Number.NaN, 0)).toBe(false);
  });
});

/**
 * Unit tests — activity statistics entry (features/create/stats.ts).
 *
 * The "create from activity stats" Step 1 contract:
 *   - validation blocks only unusable values (missing/zero/out of range);
 *   - units normalize once (km/mi entry → meters + ms/km);
 *   - the time ≈ distance × pace cross-check NEVER blocks — it classifies
 *     (consistent / rounding / mismatch) for the form's notice;
 *   - the implied pace is the file's own arithmetic (duration ÷ distance).
 */

import { describe, expect, it } from "vitest";
import {
  checkStatsConsistency,
  impliedPaceMsPerUnit,
  validateStatsEntry,
} from "@/features/create/stats";

const START = Date.UTC(2026, 8, 20, 5, 30); // 2026-09-20 05:30 UTC

describe("validateStatsEntry", () => {
  it("normalizes a valid km entry to meters and ms/km", () => {
    // 5.23 km at 6:14/km for 32:35.
    const result = validateStatsEntry(
      {
        distance: 5.23,
        paceMinutes: 6,
        paceSeconds: 14,
        durationMs: (32 * 60 + 35) * 1000,
        startMs: START,
      },
      "km",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.distanceM).toBeCloseTo(5230, 6);
    expect(result.stats.paceMsPerKm).toBe((6 * 60 + 14) * 1000);
    expect(result.stats.durationMs).toBe(1955000);
    expect(result.stats.startMs).toBe(START);
  });

  it("normalizes a mi entry to meters and ms/km (unit factors applied once)", () => {
    // 3.25 mi at 10:02/mi.
    const result = validateStatsEntry(
      {
        distance: 3.25,
        paceMinutes: 10,
        paceSeconds: 2,
        durationMs: (32 * 60 + 35) * 1000,
        startMs: START,
      },
      "mi",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.distanceM).toBeCloseTo(3.25 * 1609.344, 6);
    // 10:02 per mile → per kilometer: 602 s × (1000 / 1609.344).
    expect(result.stats.paceMsPerKm).toBeCloseTo(
      602_000 * (1000 / 1609.344),
      3,
    );
  });

  it("rejects missing and non-positive values with per-field messages", () => {
    const result = validateStatsEntry(
      {
        distance: null,
        paceMinutes: null,
        paceSeconds: null,
        durationMs: null,
        startMs: null,
      },
      "km",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.distance).toBeDefined();
    expect(result.errors.pace).toBeDefined();
    expect(result.errors.durationMs).toBeDefined();
    expect(result.errors.start).toBeDefined();
  });

  it("rejects zero distance, zero pace, and zero duration", () => {
    const result = validateStatsEntry(
      {
        distance: 0,
        paceMinutes: 0,
        paceSeconds: 0,
        durationMs: 0,
        startMs: START,
      },
      "km",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.distance).toMatch(/greater than zero/);
    expect(result.errors.pace).toMatch(/greater than zero/);
    expect(result.errors.durationMs).toMatch(/greater than zero/);
    expect(result.errors.start).toBeUndefined();
  });

  it("rejects pace seconds of 60+ (minutes carry, seconds never do)", () => {
    const result = validateStatsEntry(
      {
        distance: 5,
        paceMinutes: 6,
        paceSeconds: 60,
        durationMs: 1955000,
        startMs: START,
      },
      "km",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.pace).toBeDefined();
  });

  it("rejects absurd magnitudes", () => {
    const result = validateStatsEntry(
      {
        distance: 99999,
        paceMinutes: 6,
        paceSeconds: 14,
        durationMs: 1000 * 60 * 60 * 200, // 200 h
        startMs: START,
      },
      "km",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.distance).toMatch(/at most/);
    expect(result.errors.durationMs).toMatch(/under 100 hours/);
  });
});

describe("checkStatsConsistency (time ≈ distance × pace — never enforced)", () => {
  it("classifies a matching triple as consistent (no notice)", () => {
    // 5 km × 6:00/km = 30:00 exactly.
    const notice = checkStatsConsistency({
      distanceM: 5000,
      durationMs: 1_800_000,
      paceMsPerKm: 360_000,
    });
    expect(notice.level).toBe("consistent");
    expect(notice.deviationMs).toBe(0);
  });

  it("classifies watch-level rounding as rounding (the quiet notice)", () => {
    // 5 km × 6:10/km = 30:50 implied — the watch says 31:00 (0.5%).
    const notice = checkStatsConsistency({
      distanceM: 5000,
      durationMs: 1_860_000,
      paceMsPerKm: 370_000,
    });
    expect(notice.level).toBe("rounding");
    expect(Math.abs(notice.deviationMs)).toBeLessThan(15_000);
  });

  it("classifies a probable typo as mismatch — but reports, never blocks", () => {
    // 5.23 km × 6:14/km ≈ 32:33, entered 52:35 (60% off).
    const notice = checkStatsConsistency({
      distanceM: 5230,
      durationMs: 3155000,
      paceMsPerKm: 374_000,
    });
    expect(notice.level).toBe("mismatch");
    expect(notice.deviationRatio).toBeGreaterThan(0.05);
  });

  it("survives a zero pace without throwing (field validators own that case)", () => {
    // Garbage in, honest out: a zero pace implies a zero duration, which
    // mismatches anything — classified, never thrown. The form's field
    // validators reject a zero pace before this ever runs.
    const notice = checkStatsConsistency({
      distanceM: 5000,
      durationMs: 1_800_000,
      paceMsPerKm: 0,
    });
    expect(notice.level).toBe("mismatch");
    expect(Number.isFinite(notice.impliedDurationMs)).toBe(true);
  });
});

describe("impliedPaceMsPerUnit (the file's own arithmetic)", () => {
  it("derives the pace from duration ÷ distance in the display unit", () => {
    // 30:00 over 5 km → 6:00 /km.
    expect(impliedPaceMsPerUnit(1_800_000, 5000, "km")).toBe(360_000);
    // The same activity read in miles: 30:00 over 3.106856 mi → 9:39.6/mi.
    const perMile = impliedPaceMsPerUnit(1_800_000, 5000, "mi")!;
    expect(perMile).toBeCloseTo(360_000 * 1.609344, 3);
  });

  it("returns null for unusable inputs (the honesty dash)", () => {
    expect(impliedPaceMsPerUnit(0, 5000, "km")).toBeNull();
    expect(impliedPaceMsPerUnit(1000, 0, "km")).toBeNull();
  });
});

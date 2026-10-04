/**
 * Compare-math tests (Phase 19, §EE 19.1 verification: "compare-math
 * unit tests").
 *
 * Pins buildCompareStats' contract: pristine files yield zero deltas
 * and recorded provenance; deletions surface as negative point deltas
 * with the modified flag; sorted segments mark the moving-time row
 * estimated; committed repairs fold their distance into the after side
 * and flag it mixed; unavailable inputs render "—" (null), never a
 * fabricated zero.
 */

import { describe, expect, it } from "vitest";
import { buildCompareStats } from "@/features/compare/compareStats";
import type { CompareStatsInput, CompareSideStats } from "@/features/compare/compareStats";
import type { WorkingMeta } from "@/types/domain";

const META: WorkingMeta = {
  deletedPointCount: 0,
  sortedSegmentIds: [],
  overriddenEleCount: 0,
  splitCount: 0,
  duplicatedSegmentCount: 0,
  reorderedSegmentCount: 0,
  hasEdits: false,
};

function meta(patch: Partial<WorkingMeta>): WorkingMeta {
  return { ...META, ...patch, hasEdits: true };
}

const side = (
  patch: Partial<CompareSideStats> = {},
): CompareSideStats => ({
  pointCount: 100,
  distanceM: 10_000,
  movingTimeMs: 1_800_000,
  gainM: 120,
  ...patch,
});

function input(patch: Partial<CompareStatsInput> = {}): CompareStatsInput {
  return {
    original: side(),
    after: side(),
    working: null,
    repair: null,
    elevationEstimated: false,
    ...patch,
  };
}

const row = (result: ReturnType<typeof buildCompareStats>, id: string) =>
  result.rows.find((r) => r.id === id)!;

describe("buildCompareStats — the pristine case", () => {
  it("zero deltas, all recorded, hasChanges false", () => {
    const result = buildCompareStats(input());
    expect(result.hasChanges).toBe(false);
    for (const r of result.rows) {
      expect(r.delta).toBe(0);
      expect(r.provenance).toBe("recorded");
      expect(r.note).toBeNull();
    }
    expect(result.rows.map((r) => r.id)).toEqual([
      "points",
      "distance",
      "moving-time",
      "gain",
    ]);
  });
});

describe("buildCompareStats — working-copy edits", () => {
  it("deleted points read as a negative delta with the modified flag", () => {
    const result = buildCompareStats(
      input({
        after: side({ pointCount: 94, distanceM: 9_850 }),
        working: meta({ deletedPointCount: 6 }),
      }),
    );
    expect(result.hasChanges).toBe(true);
    const points = row(result, "points");
    expect(points.delta).toBe(-6);
    expect(points.provenance).toBe("modified");
    expect(points.note).toContain("6 removed");
    const distance = row(result, "distance");
    expect(distance.delta).toBe(-150);
    expect(distance.provenance).toBe("modified");
  });

  it("a sorted segment marks the moving-time row estimated", () => {
    const result = buildCompareStats(
      input({
        working: meta({ sortedSegmentIds: ["t0s0" as never] }),
      }),
    );
    const time = row(result, "moving-time");
    expect(time.provenance).toBe("estimated");
    expect(time.note).toContain("1 segment order estimated");
  });

  it("smoothed elevations note the gain row", () => {
    const result = buildCompareStats(
      input({
        after: side({ gainM: 118 }),
        working: meta({ overriddenEleCount: 5 }),
      }),
    );
    const gain = row(result, "gain");
    expect(gain.delta).toBe(-2);
    expect(gain.note).toContain("5 elevations smoothed");
  });
});

describe("buildCompareStats — committed repairs", () => {
  it("repair distance folds into the after side and flags mixed", () => {
    const result = buildCompareStats(
      input({
        after: side({ distanceM: 11_200, pointCount: 128 }),
        repair: {
          gapCount: 2,
          reconstructedDistanceM: 1_200,
          reconstructedTimeMs: null,
        },
      }),
    );
    expect(result.hasChanges).toBe(true);
    const distance = row(result, "distance");
    expect(distance.delta).toBe(1_200);
    expect(distance.provenance).toBe("mixed");
    expect(distance.note).toContain("1,200 m of committed repairs");
    // Repairs without duration: the moving-time row says so.
    const time = row(result, "moving-time");
    expect(time.provenance).toBe("estimated");
    expect(time.note).toContain("repair duration not yet estimated");
  });

  it("estimated repair time keeps the moving-time delta finite", () => {
    const result = buildCompareStats(
      input({
        after: side({ movingTimeMs: 1_950_000 }),
        repair: {
          gapCount: 1,
          reconstructedDistanceM: 500,
          reconstructedTimeMs: 150_000,
        },
      }),
    );
    const time = row(result, "moving-time");
    expect(time.delta).toBe(150_000);
    expect(time.provenance).toBe("recorded");
  });
});

describe("buildCompareStats — the honesty rules", () => {
  it("missing timing renders null, never zero", () => {
    const result = buildCompareStats(
      input({
        original: side({ movingTimeMs: null }),
        after: side({ movingTimeMs: null }),
      }),
    );
    const time = row(result, "moving-time");
    expect(time.original).toBeNull();
    expect(time.after).toBeNull();
    expect(time.delta).toBeNull();
    expect(time.note).toContain("no usable timestamps");
  });

  it("insufficient elevation coverage renders null gain", () => {
    const result = buildCompareStats(
      input({
        original: side({ gainM: null }),
        after: side({ gainM: null }),
        elevationEstimated: true,
      }),
    );
    const gain = row(result, "gain");
    expect(gain.original).toBeNull();
    expect(gain.delta).toBeNull();
    expect(gain.note).toContain("coverage below 60%");
  });

  it("estimated elevation flags the gain row estimated", () => {
    const result = buildCompareStats(
      input({
        after: side({ gainM: 130 }),
        elevationEstimated: true,
      }),
    );
    expect(row(result, "gain").provenance).toBe("estimated");
  });
});

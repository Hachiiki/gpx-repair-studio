/**
 * Unit tests — the Phase 5 case matrix (features/reconstruction/
 * timestamps.ts), per docs/MASTER_PLAN.md §J-1 and the Phase 5 test
 * plan: "all case-matrix rows, edge durations".
 *
 * Paths are built with the REAL resamplePath (no mocks): the
 * distribution must be honest against the same cumulative distances the
 * renderer and exporter will consume.
 */

import { describe, expect, it } from "vitest";
import {
  distributeTimestamps,
  MISSING_REASON,
  resolveGapTimePlan,
  type DistributedTime,
  type GapTimePlan,
} from "@/features/reconstruction/timestamps";
import { resamplePath, type PathPoint } from "@/features/reconstruction/resample";
import type { DrawVertex, TimeStrategy } from "@/types/domain";
import { vertexId } from "@/types/ids";

const T0 = Date.UTC(2024, 4, 1, 7, 0, 9); // 07:00:09Z
const T1 = Date.UTC(2024, 4, 1, 7, 5, 9); // 07:05:09Z — 5:00 later
const FIVE_MIN = 5 * 60_000;
const TWELVE_MIN = 12 * 60_000;

const BEFORE = { lat: 52.520141, lon: 13.405164 };
const AFTER = { lat: 52.520186, lon: 13.405234 };

const DISTANCE_PROPORTIONAL: TimeStrategy = { kind: "distance-proportional" };
const UNIFORM: TimeStrategy = { kind: "uniform" };
const manual = (ms: number): TimeStrategy => ({ kind: "manual-duration", durationMs: ms });
const NONE: TimeStrategy = { kind: "none" };

const verts = (...positions: [number, number][]): DrawVertex[] =>
  positions.map(([lat, lon], i) => ({ id: vertexId(i + 1), lat, lon }));

/** A small drawn path: before → 2 vertices → after, 50 m spacing. */
function drawnPath(spacing: number | "off" = 50): PathPoint[] {
  return resamplePath(
    BEFORE,
    verts(
      [52.5206, 13.4055],
      [52.5202, 13.4058],
    ),
    AFTER,
    spacing,
  );
}

function interiorTimes(
  path: readonly PathPoint[],
  times: readonly (DistributedTime | undefined)[],
): number[] {
  const values: number[] = [];
  path.forEach((point, i) => {
    if (point.role === "before-anchor" || point.role === "after-anchor") {
      return; // anchors keep their recorded timestamps, never estimates
    }
    const time = times[i];
    if (time !== undefined) values.push(time.value);
  });
  return values;
}

describe("resolveGapTimePlan — the §J-1 case matrix", () => {
  it("Case 1 (both boundaries, default): derived duration, distance-proportional", () => {
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      DISTANCE_PROPORTIONAL,
    );
    expect(plan.boundaryCase).toBe("both-boundaries");
    expect(plan.method).toBe("distance-proportional");
    expect(plan.durationMs).toBe(FIVE_MIN);
    expect(plan.durationSource).toBe("derived");
    expect(plan.anchorStartMs).toBe(T0);
    expect(plan.recordedEndMs).toBe(T1);
    expect(plan.discrepancyMs).toBeNull();
    expect(plan.missingReason).toBeNull();
  });

  it("Case 1b (both boundaries, uniform): same duration, uniform method", () => {
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      UNIFORM,
    );
    expect(plan.method).toBe("uniform");
    expect(plan.durationMs).toBe(FIVE_MIN);
    expect(plan.durationSource).toBe("derived");
  });

  it("Case 2 (before only): manual duration required, anchored at the start", () => {
    const missing = resolveGapTimePlan({ routeBeforeMs: T0 }, DISTANCE_PROPORTIONAL);
    expect(missing.durationMs).toBeNull();
    expect(missing.missingReason).toBe(MISSING_REASON.oneBoundary);

    const plan = resolveGapTimePlan({ routeBeforeMs: T0 }, manual(TWELVE_MIN));
    expect(plan.boundaryCase).toBe("before-only");
    expect(plan.durationMs).toBe(TWELVE_MIN);
    expect(plan.durationSource).toBe("manual");
    expect(plan.anchorStartMs).toBe(T0);
  });

  it("Case 2 (after only): manual duration required, anchored at the end", () => {
    const missing = resolveGapTimePlan({ routeAfterMs: T1 }, UNIFORM);
    expect(missing.durationMs).toBeNull();
    expect(missing.missingReason).toBe(MISSING_REASON.oneBoundary);

    const plan = resolveGapTimePlan({ routeAfterMs: T1 }, manual(TWELVE_MIN));
    expect(plan.boundaryCase).toBe("after-only");
    expect(plan.durationMs).toBe(TWELVE_MIN);
    expect(plan.anchorStartMs).toBeNull();
    expect(plan.recordedEndMs).toBe(T1);
  });

  it("Case 3 (no boundaries): manual duration; file start anchors when present", () => {
    const missing = resolveGapTimePlan({}, DISTANCE_PROPORTIONAL);
    expect(missing.durationMs).toBeNull();
    expect(missing.missingReason).toBe(MISSING_REASON.noBoundaries);

    const unanchored = resolveGapTimePlan({}, manual(TWELVE_MIN), {
      startMs: null,
      totalDurationMs: null,
    });
    expect(unanchored.durationMs).toBe(TWELVE_MIN);
    expect(unanchored.anchorStartMs).toBeNull();
    expect(unanchored.anchoredByFileStart).toBe(false);

    const anchored = resolveGapTimePlan({}, manual(TWELVE_MIN), {
      startMs: T0,
      totalDurationMs: null,
    });
    expect(anchored.anchorStartMs).toBe(T0);
    expect(anchored.anchoredByFileStart).toBe(true);
  });

  it("Case 4 (both present, user disputes): manual wins, discrepancy flagged", () => {
    const agreeing = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      manual(FIVE_MIN),
    );
    expect(agreeing.durationMs).toBe(FIVE_MIN);
    expect(agreeing.durationSource).toBe("manual");
    expect(agreeing.discrepancyMs).toBeNull(); // agrees exactly

    const disputing = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      manual(TWELVE_MIN),
    );
    expect(disputing.durationMs).toBe(TWELVE_MIN);
    expect(disputing.discrepancyMs).toBe(TWELVE_MIN - FIVE_MIN);
  });

  it("reversed boundary times refuse to derive a duration", () => {
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T1, routeAfterMs: T0 },
      DISTANCE_PROPORTIONAL,
    );
    expect(plan.durationMs).toBeNull();
    expect(plan.missingReason).toBe(MISSING_REASON.reversed);
  });

  it("strategy none disables estimation with a reason", () => {
    for (const boundaries of [
      { routeBeforeMs: T0, routeAfterMs: T1 },
      { routeBeforeMs: T0 },
      {},
    ] as const) {
      const plan = resolveGapTimePlan(boundaries, NONE);
      expect(plan.durationMs).toBeNull();
      expect(plan.missingReason).toBe(MISSING_REASON.strategyNone);
    }
  });
});

describe("distributeTimestamps", () => {
  it("Case 1: interior times are strictly inside [t_before, t_after], by distance", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      DISTANCE_PROPORTIONAL,
    );
    const times = distributeTimestamps(path, plan);
    const values = interiorTimes(path, times);

    // Anchors are NEVER distributed — their recorded timestamps stand.
    expect(times[0]).toBeUndefined();
    expect(times[times.length - 1]).toBeUndefined();
    expect(values.length).toBe(path.length - 2);
    expect(values.every((v) => v > T0 && v < T1)).toBe(true);

    // Monotonic along the path (route order).
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }

    // Every estimate carries its method.
    const first = times.find((t) => t !== undefined)!;
    expect(first.method).toBe("distance-proportional");
  });

  it("distance-proportional honors cumulative distance (mid-path vertex at its own share)", () => {
    // One vertex exactly at the path midpoint (by construction: two
    // equal straight legs) → its time sits at the duration's midpoint.
    const path = resamplePath(
      BEFORE,
      verts([
        (BEFORE.lat + AFTER.lat) / 2,
        (BEFORE.lon + AFTER.lon) / 2,
      ]),
      AFTER,
      "off",
    );
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      DISTANCE_PROPORTIONAL,
    );
    const times = distributeTimestamps(path, plan);
    expect(times[1]!.value).toBeCloseTo(T0 + FIVE_MIN / 2, -1);
  });

  it("Case 1b: uniform spreads by index, distinct from distance when spacing is off", () => {
    // Uneven legs: v0 near the start, v1 far out. Uniform gives each
    // interior point an equal share of the duration regardless of
    // position; distance-proportional tracks the legs.
    const path = drawnPath("off");
    const uniform = distributeTimestamps(
      path,
      resolveGapTimePlan({ routeBeforeMs: T0, routeAfterMs: T1 }, UNIFORM),
    );
    const byDistance = distributeTimestamps(
      path,
      resolveGapTimePlan({ routeBeforeMs: T0, routeAfterMs: T1 }, DISTANCE_PROPORTIONAL),
    );
    expect(uniform[1]!.value).toBeCloseTo(T0 + FIVE_MIN / 3, -1);
    expect(uniform[2]!.value).toBeCloseTo(T0 + (2 * FIVE_MIN) / 3, -1);
    // v0 sits ~65% along the drawn path → its distance share is later.
    expect(byDistance[1]!.value).toBeGreaterThan(uniform[1]!.value);
  });

  it("Case 4: manual interior may overrun the recorded end — the discrepancy is the point", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      manual(TWELVE_MIN),
    );
    const times = distributeTimestamps(path, plan);
    const values = interiorTimes(path, times);
    expect(values.every((v) => v > T0 && v < T0 + TWELVE_MIN)).toBe(true);
    expect(values[values.length - 1]).toBeGreaterThan(T1); // overran
    expect(times.find((t) => t !== undefined)!.method).toBe("manual");
  });

  it("Case 2 (after only): interior counts BACK from the recorded end", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan({ routeAfterMs: T1 }, manual(TWELVE_MIN));
    const times = distributeTimestamps(path, plan);
    const values = interiorTimes(path, times);
    expect(values.every((v) => v > T1 - TWELVE_MIN && v < T1)).toBe(true);
    // Monotonic along the path toward the recorded end.
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it("Case 2 (before only): interior runs forward from the known start", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan({ routeBeforeMs: T0 }, manual(TWELVE_MIN));
    const times = distributeTimestamps(path, plan);
    const values = interiorTimes(path, times);
    expect(values.every((v) => v > T0 && v < T0 + TWELVE_MIN)).toBe(true);
  });

  it("Case 3: unanchored manual duration contributes no point times", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan({}, manual(TWELVE_MIN), {
      startMs: null,
      totalDurationMs: null,
    });
    expect(plan.durationMs).toBe(TWELVE_MIN); // statistics still count it
    expect(distributeTimestamps(path, plan).every((t) => t === undefined)).toBe(true);
  });

  it("Case 3 with a file start: interior spreads from the entered start", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan({}, manual(TWELVE_MIN), {
      startMs: T0,
      totalDurationMs: null,
    });
    const values = interiorTimes(path, distributeTimestamps(path, plan));
    expect(values.every((v) => v > T0 && v < T0 + TWELVE_MIN)).toBe(true);
  });

  it("extend-before spans (reversed path): the anchor keeps the LATEST time", () => {
    // Geometric path anchor → v0 → v1, but route order is v1 → v0 →
    // anchor: times must DECREASE along the path while staying inside
    // (anchor − manual, anchor).
    const path = resamplePath(BEFORE, verts([52.5206, 13.4055], [52.521, 13.406]), null, "off");
    const plan = resolveGapTimePlan({ routeAfterMs: T0 }, manual(TWELVE_MIN));
    const times = distributeTimestamps(path, plan, false);
    const values = interiorTimes(path, times);
    expect(values).toHaveLength(2);
    expect(values[0]).toBeGreaterThan(values[1]);
    expect(values.every((v) => v > T0 - TWELVE_MIN && v < T0)).toBe(true);
  });

  it("zero duration: every interior point gets the anchor time", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T0 },
      DISTANCE_PROPORTIONAL,
    );
    expect(plan.durationMs).toBe(0);
    const values = interiorTimes(path, distributeTimestamps(path, plan));
    expect(values.every((v) => v === T0)).toBe(true);
  });

  it("single-point gap (anchors only): nothing to distribute", () => {
    const path = resamplePath(BEFORE, [], AFTER, "off");
    expect(path).toHaveLength(2);
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      DISTANCE_PROPORTIONAL,
    );
    expect(distributeTimestamps(path, plan)).toEqual([undefined, undefined]);
  });

  it("degenerate zero-length path falls back to index fractions (no NaN)", () => {
    const path = resamplePath(
      BEFORE,
      verts([BEFORE.lat, BEFORE.lon], [BEFORE.lat, BEFORE.lon]),
      AFTER === BEFORE ? AFTER : { ...BEFORE },
      "off",
    );
    // All points coincide → total distance 0.
    expect(path[path.length - 1].cumDistanceM).toBe(0);
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      DISTANCE_PROPORTIONAL,
    );
    const values = interiorTimes(path, distributeTimestamps(path, plan));
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    expect(values.every((v) => v >= T0 && v <= T1)).toBe(true);
  });

  it("unknown duration distributes nothing (the '—' contract)", () => {
    const path = drawnPath();
    for (const plan of [
      resolveGapTimePlan({ routeBeforeMs: T0 }, DISTANCE_PROPORTIONAL),
      resolveGapTimePlan({}, manual(1), { startMs: null, totalDurationMs: null }),
      resolveGapTimePlan({ routeBeforeMs: T1, routeAfterMs: T0 }, DISTANCE_PROPORTIONAL),
    ] as const) {
      expect(
        distributeTimestamps(path, plan as GapTimePlan).every((t) => t === undefined),
      ).toBe(true);
    }
  });

  it("road points are interior too — they receive estimates like any other fill point", () => {
    const roadLeg = {
      a: BEFORE,
      b: { lat: 52.5206, lon: 13.4055 },
      coordinates: [
        [BEFORE.lon, BEFORE.lat],
        [13.4053, 52.52035],
        [13.4054, 52.5205],
        [13.4055, 52.5206],
      ] as [number, number][],
      routeDistanceM: 90,
    };
    const path = resamplePath(
      BEFORE,
      verts([52.5206, 13.4055]),
      AFTER,
      "off",
      [roadLeg],
    );
    expect(path.some((p) => p.role === "road")).toBe(true);
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      DISTANCE_PROPORTIONAL,
    );
    const times = distributeTimestamps(path, plan);
    const roadTimes = path
      .map((p, i) => (p.role === "road" ? times[i] : undefined))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
    expect(roadTimes).toHaveLength(2);
    expect(roadTimes.every((t) => t.value > T0 && t.value < T1)).toBe(true);
  });
});

describe("resolveGapTimePlan — the pace-estimated source (Task 28, PE)", () => {
  const PACE: TimeStrategy = { kind: "pace-estimated" };
  const SPEED = 3; // m/s — a relaxed run
  const FILE_TIMING = { startMs: null, totalDurationMs: null, recordedSpeedMps: SPEED };

  it("duration = drawn path ÷ recorded speed, whatever the boundaries", () => {
    const path = drawnPath();
    const pathLengthM = path[path.length - 1].cumDistanceM;
    expect(pathLengthM).toBeGreaterThan(0);

    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T1 },
      PACE,
      FILE_TIMING,
      pathLengthM,
    );
    expect(plan.method).toBe("pace-estimated");
    expect(plan.durationSource).toBe("estimated");
    expect(plan.durationMs).toBe(Math.round((pathLengthM / SPEED) * 1000));
    expect(plan.anchorStartMs).toBe(T0);
    expect(plan.missingReason).toBeNull();
  });

  it("before-only (an open tail extension): anchors at the boundary", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0 },
      PACE,
      FILE_TIMING,
      path[path.length - 1].cumDistanceM,
    );
    expect(plan.boundaryCase).toBe("before-only");
    expect(plan.durationMs).not.toBeNull();
    expect(plan.anchorStartMs).toBe(T0);
    expect(plan.recordedSpanMs).toBeNull();
    expect(plan.discrepancyMs).toBeNull();
  });

  it("after-only (a missing head): no start anchor — distribution counts back", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan(
      { routeAfterMs: T1 },
      PACE,
      FILE_TIMING,
      path[path.length - 1].cumDistanceM,
    );
    expect(plan.boundaryCase).toBe("after-only");
    expect(plan.anchorStartMs).toBeNull();
    expect(plan.recordedEndMs).toBe(T1);

    const times = distributeTimestamps(path, plan);
    const values = interiorTimes(path, times);
    expect(values).toHaveLength(interiorTimes(path, times).length);
    // Interior counts back from the recorded end: [end − duration, end).
    expect(values.every((v) => v <= T1)).toBe(true);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(T1 - (plan.durationMs ?? 0));
  });

  it("no boundaries: anchors at the file-level start when one exists", () => {
    const path = drawnPath();
    const fileStart = T0 - 60_000;
    const plan = resolveGapTimePlan(
      {},
      PACE,
      { startMs: fileStart, totalDurationMs: null, recordedSpeedMps: SPEED },
      path[path.length - 1].cumDistanceM,
    );
    expect(plan.boundaryCase).toBe("no-boundaries");
    expect(plan.anchorStartMs).toBe(fileStart);
    expect(plan.anchoredByFileStart).toBe(true);
  });

  it("no usable recorded pace → null duration with the honest reason", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0 },
      PACE,
      { startMs: null, totalDurationMs: null, recordedSpeedMps: null },
      path[path.length - 1].cumDistanceM,
    );
    expect(plan.durationMs).toBeNull();
    expect(plan.missingReason).toBe(MISSING_REASON.noPace);
  });

  it("no drawn path yet → null duration with the draw-first reason", () => {
    const plan = resolveGapTimePlan({ routeBeforeMs: T0 }, PACE, FILE_TIMING, 0);
    expect(plan.durationMs).toBeNull();
    expect(plan.missingReason).toBe(MISSING_REASON.noPath);

    const noPath = resolveGapTimePlan({ routeBeforeMs: T0 }, PACE, FILE_TIMING, null);
    expect(noPath.missingReason).toBe(MISSING_REASON.noPath);
  });

  it("both boundaries: a disagreement with the recorded window is surfaced (Case-4 contract)", () => {
    const path = drawnPath();
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T0 + 1000 }, // a ~1 s adjacent window
      PACE,
      FILE_TIMING,
      path[path.length - 1].cumDistanceM,
    );
    expect(plan.recordedSpanMs).toBe(1000);
    expect(plan.durationMs!).toBeGreaterThan(1000);
    expect(plan.discrepancyMs).toBe(plan.durationMs! - 1000);
  });

  it("both boundaries: an estimate that matches the window flags nothing", () => {
    const path = drawnPath();
    const pathLengthM = path[path.length - 1].cumDistanceM;
    const exactSpan = Math.round((pathLengthM / SPEED) * 1000);
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0, routeAfterMs: T0 + exactSpan },
      PACE,
      FILE_TIMING,
      pathLengthM,
    );
    expect(plan.discrepancyMs).toBeNull();
  });

  it("distribution spreads the estimate by distance and carries the method", () => {
    const path = drawnPath();
    const pathLengthM = path[path.length - 1].cumDistanceM;
    const plan = resolveGapTimePlan(
      { routeBeforeMs: T0 },
      PACE,
      FILE_TIMING,
      pathLengthM,
    );
    const times = distributeTimestamps(path, plan);
    const interior = times.filter((t): t is DistributedTime => t !== undefined);
    expect(interior.length).toBeGreaterThan(0);
    expect(interior.every((t) => t.method === "pace-estimated")).toBe(true);
    // Monotonic from the anchor, within the estimated duration.
    const values = interior.map((t) => t.value);
    expect(values[0]).toBeGreaterThanOrEqual(T0);
    expect(values[values.length - 1]).toBeLessThanOrEqual(T0 + (plan.durationMs ?? 0));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

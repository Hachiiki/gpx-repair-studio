// @vitest-environment jsdom
/**
 * Splits-engine goldens (Phase 15, §EE 15.1 verification: "split-math
 * goldens against hand-computed tracks").
 *
 * Strategy: synthetic straight-line tracks along the EQUATOR (equal
 * Δlon → bitwise-equal geodesic legs — the one geometry where
 * hand-computation is exact), with split lengths at fp-safe ratios
 * (boundaries land mid-leg, never on a point, so floor() rounding can
 * never flip an expectation). Every golden is derived from the leg
 * length measured once in the test.
 *
 * The rules under test (the §EE 15.1 honesty core):
 *   - distance AND time attribute to every overlapped split
 *     proportionally (linear time-over-distance inside a leg);
 *   - reversed / gap / untimed legs contribute distance but no time,
 *     counted in the split where the leg lands;
 *   - hysteresis elevation gain attributes where each climb realizes,
 *     Σ splits = the file total;
 *   - provenance: recorded / estimated (reconstructed or marked) /
 *     mixed — through the REAL merge pipeline (the one-merge contract).
 */

import { describe, expect, it } from "vitest";
import { buildSplits, splitsDistanceTotal, splitPaceMsPerMeter } from "@/features/statistics/splits";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { hysteresisGainLoss } from "@/features/elevation/smoothing";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { vertexId } from "@/types/ids";
import type { GapId, PointId } from "@/types/domain";
import type { MergeResult } from "@/features/reconstruction/merge";
import { parseXml } from "./helpers/gpxTestUtils";

const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};
const P = (i: number): PointId => `t0s0:${i}` as PointId;

/** Equator positions: equal Δlon steps → bitwise-equal legs. */
const lonAt = (steps: number) => -0.02 + steps * 0.008;
const LAT = 0;

/** N points along the equator, `dt` s apart, ele rising `de` m per point. */
function lineXml(
  count: number,
  opts: {
    dt?: number;
    de?: number;
    startEle?: number;
    untimed?: number[];
    reversedAt?: number;
    gapAt?: number;
  } = {},
): string {
  const {
    dt = 10,
    de = 0,
    startEle = 100,
    untimed = [],
    reversedAt = -1,
    gapAt = -1,
  } = opts;
  const pts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const seconds = i * dt + (i > reversedAt && reversedAt >= 0 ? -dt * 2 : 0);
    const gapBump = i > gapAt && gapAt >= 0 ? 300 : 0;
    const children: string[] = [`<ele>${startEle + i * de}</ele>`];
    if (!untimed.includes(i)) {
      children.push(
        `<time>2024-05-01T07:${String(Math.floor((seconds + gapBump) / 60)).padStart(2, "0")}:${String((seconds + gapBump) % 60).padStart(2, "0")}Z</time>`,
      );
    }
    pts.push(
      `<trkpt lat="${LAT.toFixed(6)}" lon="${lonAt(i).toFixed(6)}">${children.join("")}</trkpt>`,
    );
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `<trk><name>T</name><trkseg>${pts.join("")}</trkseg></trk>\n</gpx>\n`
  );
}

/** The merge of a pristine parse (no repairs): recorded runs only. */
function plainMerge(xml: string): MergeResult {
  return mergeRepairs(parseXml(xml), [], TIMED);
}

/** The measured leg length (identical for every leg on this line). */
function legM(): number {
  return geodesicDistanceMeters(
    { lat: LAT, lon: lonAt(0) },
    { lat: LAT, lon: lonAt(1) },
  );
}

const closeTo = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, 6);

describe("buildSplits — proportional attribution golden (SL = 0.7 L)", () => {
  // 3 legs; boundaries at 0.7L, 1.4L, 2.1L, 2.8L — all mid-leg.
  const L = legM();
  const splits = buildSplits(plainMerge(lineXml(4)), {
    splitLengthM: 0.7 * L,
  });

  it("produces five splits with hand-computed distances and times", () => {
    expect(splits).not.toBeNull();
    expect(splits!.rows).toHaveLength(5);
    const expectedDistances = [0.7, 0.7, 0.7, 0.7, 0.2].map((f) => f * L);
    const expectedTimes = [7, 7, 7, 7, 2].map((s) => s * 1000);
    splits!.rows.forEach((row, i) => {
      closeTo(row.distanceM, expectedDistances[i]);
      closeTo(row.timeMs, expectedTimes[i]);
      expect(row.provenance).toBe("recorded");
    });
  });

  it("sums exactly to the merged total (the self-check)", () => {
    closeTo(splitsDistanceTotal(splits!), splits!.totalDistanceM);
    closeTo(splits!.totalDistanceM, 3 * L);
  });

  it("pace is time over distance (10 s per leg-length)", () => {
    for (const row of splits!.rows) {
      closeTo(splitPaceMsPerMeter(row)! * L, 10_000);
    }
  });
});

describe("buildSplits — the partial last split (SL = 1.2 L)", () => {
  const L = legM();
  const splits = buildSplits(plainMerge(lineXml(4)), {
    splitLengthM: 1.2 * L,
  });

  it("ends the last window at the route's true end", () => {
    expect(splits!.rows).toHaveLength(3);
    const [a, b, last] = splits!.rows;
    closeTo(a.distanceM, 1.2 * L);
    closeTo(b.distanceM, 1.2 * L);
    closeTo(last.fromM, 2.4 * L);
    closeTo(last.toM, 3 * L);
    closeTo(last.distanceM, 0.6 * L);
    closeTo(last.timeMs, 6_000);
  });
});

describe("buildSplits — a straddling leg splits its time (SL = 1.5 L)", () => {
  const L = legM();
  const splits = buildSplits(plainMerge(lineXml(4)), {
    splitLengthM: 1.5 * L,
  });

  it("attributes 10 s + 5 s to each half of the straddle", () => {
    expect(splits!.rows).toHaveLength(2);
    closeTo(splits!.rows[0].distanceM, 1.5 * L);
    closeTo(splits!.rows[1].distanceM, 1.5 * L);
    closeTo(splits!.rows[0].timeMs, 15_000);
    closeTo(splits!.rows[1].timeMs, 15_000);
  });
});

describe("buildSplits — honesty flags", () => {
  it("counts a gap leg where it lands, contributes no time", () => {
    // gapAt 2 → the 2→3 leg is 310 s; with SL = 0.7L its last overlap
    // is the split covering [2.8L, 3L] — the 5th split.
    const L = legM();
    const splits = buildSplits(plainMerge(lineXml(6, { gapAt: 2 })), {
      splitLengthM: 0.7 * L,
      timeGapMs: 60_000,
    });
    const flagged = splits!.rows.filter((row) => row.gapLegs === 1);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toBe(splits!.rows[4]);
    // Σ time = 4 healthy legs × 10 s (the gap leg contributes none).
    const totalTime = splits!.rows.reduce((sum, row) => sum + row.timeMs, 0);
    closeTo(totalTime, 40_000);
    closeTo(splitsDistanceTotal(splits!), 5 * L);
  });

  it("counts untimed legs on both sides of the missing timestamp", () => {
    const L = legM();
    const splits = buildSplits(plainMerge(lineXml(4, { untimed: [1] })), {
      splitLengthM: 0.7 * L,
    });
    const untimed = splits!.rows.reduce((sum, row) => sum + row.untimedLegs, 0);
    expect(untimed).toBe(2);
    closeTo(
      splits!.rows.reduce((sum, row) => sum + row.timeMs, 0),
      10_000, // only leg 2→3 keeps its time
    );
  });

  it("counts reversed legs without negative time", () => {
    const L = legM();
    const splits = buildSplits(plainMerge(lineXml(4, { reversedAt: 1 })), {
      splitLengthM: 0.7 * L,
    });
    const reversed = splits!.rows.reduce((sum, row) => sum + row.reversedLegs, 0);
    expect(reversed).toBe(1);
    for (const row of splits!.rows) {
      expect(row.timeMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("an untimed file reports no timing anywhere", () => {
    const splits = buildSplits(
      plainMerge(lineXml(5, { untimed: [0, 1, 2, 3, 4] })),
      { splitLengthM: 500 },
    );
    expect(splits!.hasTimingData).toBe(false);
    for (const row of splits!.rows) expect(row.timeMs).toBe(0);
  });
});

describe("buildSplits — elevation attribution (SL = 5 L)", () => {
  // 10 points, ele 100..109 (de = 1); threshold 2 commits at points
  // 2,4,6,8 → cumulative 2L,4L,6L inside split 1 ([0,5L)); 8L inside
  // split 2 ([5L,10L)).
  const L = legM();
  const merge = plainMerge(lineXml(10, { de: 1 }));
  const splits = buildSplits(merge, {
    splitLengthM: 5 * L,
    hysteresisThresholdM: 2,
  });

  it("Σ split gains equals the file's hysteresis gain", () => {
    const series = merge.tracks[0].points.map(
      (view) => (view.point as { ele?: number }).ele,
    );
    const file = hysteresisGainLoss(series, 2);
    const sum = splits!.rows.reduce((acc, r) => acc + (r.eleGainM ?? 0), 0);
    closeTo(sum, file.gainM);
    closeTo(sum, 8); // 100 → 109 in 2 m deadband steps: 2+2+2+2
  });

  it("attributes each climb to the split where it realizes", () => {
    // Commits at points 2,4 (cumulative 2L, 4L — inside split 1
    // ([0,5L))) and points 6,8 (6L, 8L — inside split 2 ([5L,10L))).
    closeTo(splits!.rows[0].eleGainM!, 4);
    closeTo(splits!.rows[1].eleGainM!, 4);
    expect(splits!.rows[0].eleEstimated).toBe(false);
    expect(splits!.rows[1].elePoints).toBeGreaterThan(0);
  });
});

describe("buildSplits — provenance through the real merge", () => {
  const L = legM();
  // A gap at leg 3→4 (310 s) filled by a drawn vertex off the line.
  const data = parseXml(lineXml(8, { gapAt: 3 }));
  const merge = mergeRepairs(
    data,
    [
      {
        gapId: `gap/${P(3)}/${P(4)}` as GapId,
        beforePointId: P(3),
        afterPointId: P(4),
        vertices: [
          { id: vertexId(1), lat: 0.001, lon: lonAt(3.5) },
          { id: vertexId(2), lat: 0.002, lon: lonAt(3.6) },
        ],
        resampleSpacingM: "off",
        timeStrategy: { kind: "distance-proportional" },
        roadLegs: [],
      },
    ],
    TIMED,
  );
  const splits = buildSplits(merge, {
    splitLengthM: 0.7 * L,
    timeGapMs: 60_000,
  });

  it("flags splits crossing the reconstruction, keeps others recorded", () => {
    const kinds = splits!.rows.map((row) => row.provenance);
    expect(kinds).toContain("mixed");
    expect(kinds).toContain("recorded");
    expect(kinds[0]).toBe("recorded");
    // Only the splits the reconstruction actually touches change kind.
    const mixed = splits!.rows.filter((row) => row.provenance !== "recorded");
    expect(mixed.length).toBeLessThan(splits!.rows.length);
  });

  it("re-imported markers flag their splits estimated (the §H-7 leg rule)", () => {
    const L = legM();
    // (a) A stretch whose every point AND leg is marked reads estimated.
    const allMarked = buildSplits(plainMerge(lineXml(4)), {
      splitLengthM: 1.5 * L,
      markedPointIds: new Set<PointId>([P(0), P(1), P(2), P(3)]),
    });
    expect(allMarked!.rows.every((row) => row.provenance === "estimated")).toBe(
      true,
    );

    // (b) Anchor-adjacent legs (ONE marked endpoint) stay recorded —
    // SL = 2.5L: split 1 gets only the tail of leg 2 (point 2 marked,
    // point 3 not) plus the unmarked point 3 → recorded, not mixed.
    const interiorMarked = buildSplits(plainMerge(lineXml(4)), {
      splitLengthM: 2.5 * L,
      markedPointIds: new Set<PointId>([P(1), P(2)]),
    });
    expect(interiorMarked!.rows[0].provenance).toBe("mixed");
    expect(interiorMarked!.rows[1].provenance).toBe("recorded");
  });
});

describe("buildSplits — edge cases", () => {
  it("null merge and empty routes yield null", () => {
    expect(buildSplits(null)).toBeNull();
  });

  it("a single point (no legs) yields null — no honest split of nothing", () => {
    expect(buildSplits(plainMerge(lineXml(1)), { splitLengthM: 100 })).toBeNull();
  });

  it("rejects non-positive split lengths", () => {
    expect(buildSplits(plainMerge(lineXml(3)), { splitLengthM: 0 })).toBeNull();
  });

  it("a boundary landing exactly on the route end opens no phantom split", () => {
    // 2 legs, SL = L: the boundary 2L is the route's end; the last
    // point clamps into the final split (floor() may round either way).
    const L = legM();
    const splits = buildSplits(plainMerge(lineXml(3)), { splitLengthM: L });
    expect(splits!.rows).toHaveLength(2);
    closeTo(splits!.rows[1].distanceM, L);
  });
});

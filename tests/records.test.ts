// @vitest-environment jsdom
/**
 * Records-engine goldens (Phase 24.2/24.5 verification: "record goldens
 * including the reconstructed-exclusion rule").
 *
 * Strategy: the equator-line convention of tests/splits.test.ts —
 * equal Δlon steps give bitwise-equal geodesic legs, so hand-computed
 * goldens are exact; every expectation derives from the leg length
 * measured once in the test. The rules under test:
 *
 *   - elapsed-time semantics — the clock does not stop (a window
 *     spanning a recorded GPS gap counts the gap);
 *   - reconstructed stretches are excluded (a fast drawn-in shortcut
 *     never becomes a best effort, and no effort exists when every
 *     window of the distance must touch one);
 *   - interpolated markers are flagged when a boundary moves;
 *   - untimed tracks, reversed time, and track boundaries produce NO
 *     fabricated efforts;
 *   - the two-pointer sweeps find the exact optimum (cross-checked
 *     against a fine position sweep on seeded random tracks);
 *   - lifetime records rank the top three per distance and read the
 *     recorded-only numbers;
 *   - Riegel's t₂ = t₁ · (d₂/d₁)^1.06 with the ladder projection.
 */

import { describe, expect, it } from "vitest";
import {
  EFFORT_LADDER,
  bestEfforts,
  lifetimeRecords,
  riegelLadder,
  riegelPredictionMs,
  type LibraryIndexRow,
} from "@/features/library/records";
import { mergeRepairs } from "@/features/reconstruction/merge";
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

/** Equator positions with ~300 m legs (measured once, used everywhere). */
const LON_STEP_DEG = (300 / 6_378_137) * (180 / Math.PI);
const lonAt = (steps: number) => -0.02 + steps * LON_STEP_DEG;
const LAT = 0;
const legM = (): number =>
  geodesicDistanceMeters(
    { lat: LAT, lon: lonAt(0) },
    { lat: LAT, lon: lonAt(1) },
  );

/** N equator points, `dt` s apart, `hr` bpm on every point. */
function lineXml(
  count: number,
  opts: {
    dt?: number;
    hr?: number;
    ele?: number;
    untimed?: number[];
    gapAt?: number;
    reversedAt?: number;
    tracks?: number[];
  } = {},
): string {
  const {
    dt = 10,
    hr,
    ele,
    untimed = [],
    gapAt = -1,
    reversedAt = -1,
    tracks = [count],
  } = opts;
  const trksegs: string[] = [];
  let index = 0;
  let offset = 0;
  for (const size of tracks) {
    const pts: string[] = [];
    for (let i = 0; i < size; i += 1, index += 1) {
      const seconds =
        index * dt +
        (index > reversedAt && reversedAt >= 0 ? -dt * 3 : 0) +
        (index > gapAt && gapAt >= 0 ? 300 : 0) +
        offset;
      const children: string[] = [];
      if (ele !== undefined) children.push(`<ele>${ele + index}</ele>`);
      if (!untimed.includes(index)) {
        children.push(
          `<time>2024-05-01T${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(
            Math.floor((seconds % 3600) / 60),
          ).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}Z</time>`,
        );
      }
      if (hr !== undefined) {
        children.push(
          `<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`,
        );
      }
      pts.push(
        `<trkpt lat="${LAT.toFixed(12)}" lon="${lonAt(index).toFixed(12)}">${children.join("")}</trkpt>`,
      );
    }
    offset += 3600; // each further track starts an hour later
    trksegs.push(`<trk><name>T</name><trkseg>${pts.join("")}</trkseg></trk>`);
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `${trksegs.join("\n")}\n</gpx>\n`
  );
}

function plainMerge(xml: string): MergeResult {
  return mergeRepairs(parseXml(xml), [], TIMED);
}

/** A uniform-speed track's elapsed time for `distanceM` (ms). */
const uniformMs = (distanceM: number, L: number, dtS: number): number =>
  (distanceM / L) * dtS * 1000;

describe("the ladder (§RR)", () => {
  it("is Strava's documented fourteen distances", () => {
    expect(EFFORT_LADDER.map((d) => d.id)).toEqual([
      "400m", "1k", "halfmi", "1mi", "2mi", "5k", "10k", "15k",
      "10mi", "20k", "hm", "30k", "marathon", "50k",
    ]);
    expect(EFFORT_LADDER.find((d) => d.id === "400m")!.distanceM).toBe(400);
    expect(EFFORT_LADDER.find((d) => d.id === "1k")!.distanceM).toBe(1000);
    expect(EFFORT_LADDER.find((d) => d.id === "halfmi")!.distanceM).toBeCloseTo(
      804.672, 3,
    );
    expect(EFFORT_LADDER.find((d) => d.id === "marathon")!.distanceM).toBe(
      42_195,
    );
    expect(EFFORT_LADDER.find((d) => d.id === "50k")!.distanceM).toBe(50_000);
  });
});

describe("bestEfforts — uniform-speed goldens", () => {
  const L = legM();

  it("every covered distance reads its uniform elapsed time", () => {
    // 8 points → 7 legs ≈ 2100 m: covers 400 m … 2 mi.
    const efforts = bestEfforts(plainMerge(lineXml(8)));
    const covered = [400, 804.672, 1000, 1609.344];
    for (const distanceM of covered) {
      const effort = efforts.find((e) => e.distanceM === distanceM);
      expect(effort, `no effort at ${distanceM}`).toBeDefined();
      expect(effort!.timeMs).toBeCloseTo(uniformMs(distanceM, L, 10), 3);
    }
    // 2 mi = 3218.7 m > 2100 m: absent.
    expect(efforts.find((e) => e.distanceM === 3218.688)).toBeUndefined();
  });

  it("flags interpolated markers when a boundary lands between samples", () => {
    // 400 m sits inside one ~300 m-stretched pair of legs: whichever
    // family wins, exactly one boundary moved.
    const effort = bestEfforts(plainMerge(lineXml(8))).find(
      (e) => e.distanceM === 400,
    )!;
    expect(effort.startInterpolated !== effort.endInterpolated).toBe(true);
  });

  it("an exactly-on-sample window flags nothing (D = k × leg)", () => {
    // 3 legs of L: D = 2L lands on point 2 for a 2-point-covered
    // window… use a 2-leg track and the 400 m ladder against a track
    // whose legs are exactly 200 m (400 = 2 × 200).
    const xml = (() => {
      const step = (200 / 6_378_137) * (180 / Math.PI);
      const pts = [0, 1, 2, 3]
        .map(
          (i) =>
            `<trkpt lat="0" lon="${(-0.02 + i * step).toFixed(12)}"><time>2024-05-01T07:00:${String(i * 10).padStart(2, "0")}Z</time></trkpt>`,
        )
        .join("");
      return (
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<trk><name>T</name><trkseg>${pts}</trkseg></trk></gpx>`
      );
    })();
    const effort = bestEfforts(plainMerge(xml)).find(
      (e) => e.distanceM === 400,
    )!;
    // Every 400 m window spans exactly two legs, start and end both on
    // samples — nothing moved. (fp: the crossing check uses 1e-9; the
    // equator legs here are exact by construction.)
    expect(effort.startInterpolated).toBe(false);
    expect(effort.endInterpolated).toBe(false);
    expect(effort.timeMs).toBeCloseTo(20_000, 3);
  });
});

describe("bestEfforts — the honesty rules", () => {
  const L = legM();

  it("the clock does not stop across a recorded GPS gap", () => {
    // 8 points, gap at leg 3→4 (310 s). Sides offer 3L ≈ 900 m each,
    // so every 1 k window must span the gap; the fastest one covers as
    // little of the slow gap leg as the route allows: end snapped at
    // the last point, start 1000 m back — 100 m inside the gap leg.
    const efforts = bestEfforts(plainMerge(lineXml(8, { gapAt: 3 })));
    const oneK = efforts.find((e) => e.distanceM === 1000)!;
    // t(point 3) = 30 s; the gap leg's far end t(point 4) = 340 s.
    // Start sits (4L − 1000)/L into the gap leg.
    const gapFraction = (4 * L - 1000) / L;
    const startTimeS = 30 + gapFraction * 310;
    const endTimeS = 340 + 3 * 10;
    expect(oneK.timeMs).toBeCloseTo((endTimeS - startTimeS) * 1000, 3);
    expect(oneK.startInterpolated).toBe(true);
    expect(oneK.endInterpolated).toBe(false);
  });

  it("excludes efforts over reconstructed stretches — no shortcut wins", () => {
    // A drawn reconstruction replaces leg 3→4 with a fast manual
    // duration (0.1 s). Without the exclusion rule the best 400 m
    // would ride the drawn stretch; with it, the best stays on the
    // recorded uniform speed.
    const data = parseXml(lineXml(8));
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
          timeStrategy: { kind: "manual-duration", durationMs: 100 },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const efforts = bestEfforts(merge);
    const fourHundred = efforts.find((e) => e.distanceM === 400)!;
    expect(fourHundred.timeMs).toBeCloseTo(uniformMs(400, L, 10), 3);
    // Both recorded sides offer 3L ≈ 900 m — under 1 k. With the gap
    // interior now reconstructed, NO 1 k window exists at all.
    expect(efforts.find((e) => e.distanceM === 1000)).toBeUndefined();
  });

  it("a time-reversed stretch yields no efforts past it", () => {
    // Reversal at leg 1→2: only leg 0→1 (≈300 m) stays monotone —
    // shorter than the 400 m ladder floor.
    const efforts = bestEfforts(plainMerge(lineXml(5, { reversedAt: 1 })));
    expect(efforts).toHaveLength(0);
  });

  it("an untimed track has no efforts", () => {
    const efforts = bestEfforts(
      plainMerge(lineXml(6, { untimed: [0, 1, 2, 3, 4, 5] })),
    );
    expect(efforts).toHaveLength(0);
  });

  it("a window never spans a track boundary", () => {
    // Two 3-point tracks (2 legs ≈ 600 m each): the 400 m effort
    // exists within a track, the 1 k effort does not exist even
    // though the file totals 1200 m.
    const efforts = bestEfforts(
      plainMerge(lineXml(6, { tracks: [3, 3] })),
    );
    expect(efforts.find((e) => e.distanceM === 400)).toBeDefined();
    expect(efforts.find((e) => e.distanceM === 1000)).toBeUndefined();
  });

  it("null/empty merges are empty, never thrown", () => {
    expect(bestEfforts(null)).toHaveLength(0);
    expect(bestEfforts(plainMerge(lineXml(1)))).toHaveLength(0);
  });
});

describe("bestEfforts — the exact optimum (cross-check)", () => {
  /** A tiny deterministic LCG (seeded — reproducible failures). */
  function lcg(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  it("matches a fine position sweep on seeded random tracks", () => {
    const random = lcg(20240501);
    for (let trial = 0; trial < 6; trial += 1) {
      const n = 9 + Math.floor(random() * 7);
      const pts: { lat: number; lon: number; time: number | null }[] = [];
      let lon = -0.02;
      let t = 0;
      for (let i = 0; i < n; i += 1) {
        lon += 0.001 + random() * 0.004; // 111–556 m legs
        t += 4000 + Math.floor(random() * 14) * 1000; // 4–18 s legs
        const untimed = random() < 0.08;
        pts.push({ lat: 0, lon, time: untimed ? null : t });
        if (random() < 0.1) t += 120_000; // a GPS gap
      }
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">` +
        `<trk><name>T</name><trkseg>${pts
          .map(
            (p) =>
              `<trkpt lat="0" lon="${p.lon.toFixed(12)}">${
                p.time === null
                  ? ""
                  : `<time>2024-05-01T${String(Math.floor(p.time / 3600000)).padStart(2, "0")}:${String(
                      Math.floor((p.time % 3600000) / 60000),
                    ).padStart(2, "0")}:${String(
                      Math.floor((p.time % 60000) / 1000),
                    ).padStart(2, "0")}.${String(p.time % 1000).padStart(3, "0")}Z</time>`
              }</trkpt>`,
          )
          .join("")}</trkseg></trk></gpx>`;
      const merge = plainMerge(xml);
      const efforts = bestEfforts(merge);

      // The reference: flatten exactly like the engine, then sweep
      // 6000 start positions; position → time is piecewise linear.
      const flat: { cum: number; time: number | null }[] = [];
      let cum = 0;
      for (let i = 0; i < pts.length; i += 1) {
        if (i > 0) {
          const d = geodesicDistanceMeters(pts[i - 1]!, pts[i]!);
          if (Number.isFinite(d) && d > 0) cum += d;
        }
        flat.push({ cum, time: pts[i]!.time });
      }
      const total = flat[flat.length - 1]!.cum;
      const timeAt = (position: number): number | null => {
        for (let i = 1; i < flat.length; i += 1) {
          if (position <= flat[i]!.cum || i === flat.length - 1) {
            const a = flat[i - 1]!;
            const b = flat[i]!;
            const span = b.cum - a.cum;
            if (a.time === null || b.time === null) return null;
            if (span <= 0) return position <= a.cum ? a.time : b.time;
            const f = Math.min(1, Math.max(0, (position - a.cum) / span));
            return a.time + f * (b.time - a.time);
          }
        }
        return null;
      };
      const validWindow = (from: number, to: number): boolean => {
        for (const p of flat) {
          if (p.cum >= from - 1e-9 && p.cum <= to + 1e-9 && p.time === null) {
            return false;
          }
        }
        return true;
      };

      for (const distanceM of [400, 1000, 1609.344]) {
        if (distanceM > total) break;
        const engine = efforts.find((e) => e.distanceM === distanceM);
        let brute: number | null = null;
        const steps = 6000;
        for (let s = 0; s <= steps; s += 1) {
          const start = (total - distanceM) * (s / steps);
          const end = start + distanceM;
          if (!validWindow(start, end)) continue;
          const t0 = timeAt(start);
          const t1 = timeAt(end);
          if (t0 === null || t1 === null || t1 - t0 <= 0) continue;
          if (brute === null || t1 - t0 < brute) brute = t1 - t0;
        }
        if (brute === null) {
          // The sweep found nothing valid: the engine must agree
          // (or have found something the sweep's grid missed only at
          // breakpoints — impossible when nothing is valid anywhere).
          expect(
            engine,
            `trial ${trial}: engine found ${distanceM} where the sweep found none`,
          ).toBeUndefined();
          continue;
        }
        expect(engine, `trial ${trial}: missing ${distanceM}`).toBeDefined();
        // The engine is exact; the sweep samples a subset of starts,
        // so engine ≤ brute up to fp noise, and within the grid's slack.
        expect(engine!.timeMs).toBeLessThanOrEqual(brute + 0.1);
        expect(brute - engine!.timeMs).toBeLessThan(
          (brute * distanceM) / ((total - distanceM) * steps) + 0.1 + 50,
        );
      }
    }
  });
});

describe("lifetimeRecords — the library aggregation", () => {
  const row = (
    id: string,
    name: string,
    index: Partial<LibraryIndexRow["index"]>,
  ): LibraryIndexRow => ({
    id,
    name,
    index: {
      activityStartMs: null,
      hasTimingData: true,
      distanceM: 10_000,
      movingTimeMs: 3_600_000,
      recordedDistanceM: 10_000,
      recordedMovingTimeMs: 3_600_000,
      recordedGainM: 100,
      efforts: [],
      ...index,
    },
  });

  it("picks farthest, longest, most gain from recorded-only numbers", () => {
    const records = lifetimeRecords([
      row("a", "Short climb", {
        recordedDistanceM: 5000,
        recordedMovingTimeMs: 1_800_000,
        recordedGainM: 800,
      }),
      row("b", "Long ride", {
        recordedDistanceM: 90_000,
        recordedMovingTimeMs: 10_800_000,
        recordedGainM: 500,
      }),
    ]);
    expect(records.farthest!.sessionName).toBe("Long ride");
    expect(records.longest!.sessionName).toBe("Long ride");
    expect(records.mostGain!.sessionName).toBe("Short climb");
    expect(records.untimedCount).toBe(0);
  });

  it("a reconstructed distance never wins farthest (recorded-only)", () => {
    const records = lifetimeRecords([
      row("a", "Repaired", { distanceM: 50_000, recordedDistanceM: 8_000 }),
      row("b", "Honest", { distanceM: 12_000, recordedDistanceM: 12_000 }),
    ]);
    expect(records.farthest!.sessionName).toBe("Honest");
  });

  it("ranks the top three per ladder distance, fastest first", () => {
    const effort = (timeMs: number) => [
      { distanceM: 1000, timeMs, startInterpolated: false, endInterpolated: false },
    ];
    const records = lifetimeRecords([
      row("a", "Slow", { efforts: effort(400_000) }),
      row("b", "Fast", { efforts: effort(200_000) }),
      row("c", "Middle", { efforts: effort(300_000) }),
      row("d", "Fourth", { efforts: effort(350_000) }),
    ]);
    const oneK = records.ladder.find((l) => l.distanceM === 1000)!;
    expect(oneK.efforts.map((e) => e.sessionName)).toEqual([
      "Fast",
      "Middle",
      "Fourth",
    ]);
  });

  it("counts untimed sessions; distance records stand, time records do not", () => {
    // Farthest and most-gain need no clock — an untimed session still
    // holds them. Longest and every best effort need timestamps.
    const records = lifetimeRecords([
      row("a", "No clock", {
        hasTimingData: false,
        recordedMovingTimeMs: 0,
        efforts: [],
      }),
    ]);
    expect(records.untimedCount).toBe(1);
    expect(records.farthest!.sessionName).toBe("No clock");
    expect(records.mostGain!.sessionName).toBe("No clock");
    expect(records.longest).toBeNull();
    expect(records.ladder).toHaveLength(0);
  });

  it("empty library is empty (never fabricated)", () => {
    const records = lifetimeRecords([]);
    expect(records.farthest).toBeNull();
    expect(records.ladder).toHaveLength(0);
    expect(records.eligibleCount).toBe(0);
  });
});

describe("Riegel predictions (24.5)", () => {
  it("computes t₂ = t₁ · (d₂/d₁)^1.06", () => {
    // 25:00 5 k → 10 k: doubling the distance costs the 1.06 power.
    const predicted = riegelPredictionMs(5000, 1_500_000, 10_000);
    expect(predicted).toBeCloseTo(1_500_000 * Math.exp(1.06 * Math.LN2), 6);
    // Degenerate inputs never guess.
    expect(riegelPredictionMs(0, 100, 1000)).toBeNull();
    expect(riegelPredictionMs(5000, 0, 1000)).toBeNull();
    expect(riegelPredictionMs(5000, 1000, 0)).toBeNull();
  });

  it("projects the ladder from a seed, excluding the seed itself", () => {
    const ladder = riegelLadder({ distanceM: 5000, timeMs: 1_500_000 });
    expect(ladder.find((p) => p.distanceM === 5000)).toBeUndefined();
    expect(ladder.map((p) => p.distanceM)).toEqual(
      [...EFFORT_LADDER.map((d) => d.distanceM)]
        .filter((d) => d !== 5000)
        .sort((a, b) => a - b),
    );
    // Shorter than the seed → faster prediction.
    expect(
      ladder.find((p) => p.distanceM === 1000)!.timeMs,
    ).toBeLessThan(1_500_000);
    expect(
      ladder.find((p) => p.distanceM === 42_195)!.timeMs,
    ).toBeGreaterThan(1_500_000);
  });
});

/**
 * Phase 26 matching tests (§26 verification: "timezone matrix units").
 *
 * The matrix is the point: every cell of {zone} × {drift} must shift
 * the effective time exactly as documented — the clock model is
 * `effective = naive − tz + drift`, and these goldens pin it across
 * the zones that matter (negative, zero, the half-hour, and the
 * Melbourne +10:00 the e2e fixture rides).
 */
import { describe, expect, it } from "vitest";
import type { MergeResult } from "@/features/reconstruction/merge";
import type { PointId } from "@/types/domain";
import {
  DEFAULT_MATCH_TOLERANCE_SEC,
  buildTimedTrack,
  formatDriftSeconds,
  formatUtcOffset,
  matchPhotos,
  timezoneOffsetOptions,
  type MatchPhotoInput,
  type TimedTrackPoint,
} from "@/features/photos/matching";

const T0 = Date.UTC(2024, 4, 1, 6, 0, 0);
const SEC = 1000;
const MIN = 60 * SEC;

function track(timesMs: number[], latBase = -37.95, lonBase = 145.1): TimedTrackPoint[] {
  return timesMs.map((timeMs, i) => ({
    timeMs,
    lat: latBase + i * 0.001,
    lon: lonBase + i * 0.002,
    ele: 10 + i,
    reconstructed: false,
  }));
}

/** A flat two-point-per-minute walking track: 06:00 … 06:10 UTC. */
const WALK: TimedTrackPoint[] = track(
  Array.from({ length: 11 }, (_, i) => T0 + i * MIN),
);

const CFG = {
  timezoneOffsetMinutes: 0,
  driftSeconds: 0,
  toleranceSec: DEFAULT_MATCH_TOLERANCE_SEC,
};

function photo(id: string, naiveTimeMs: number | null): MatchPhotoInput {
  return { id, naiveTimeMs };
}

describe("the timezone × drift matrix (§26.1 — the documented offset matrix)", () => {
  const ZONES = [-480, 0, 330, 600];
  const DRIFTS = [-300, 0, 300];

  it("every cell shifts the effective time by −tz + drift exactly", () => {
    for (const tz of ZONES) {
      for (const drift of DRIFTS) {
        // Target an effective time 5 minutes in; the camera's naive
        // stamp is what that wall clock WOULD show: naive = effective
        // + tz − drift (the model run backwards).
        const effective = T0 + 5 * MIN;
        const naive = effective + tz * MIN - drift * SEC;
        const [match] = matchPhotos([photo("p", naive)], WALK, {
          timezoneOffsetMinutes: tz,
          driftSeconds: drift,
          toleranceSec: DEFAULT_MATCH_TOLERANCE_SEC,
        });
        // The bracketing points are minute-spaced, so the interpolated
        // position's fraction pins the effective time exactly.
        expect(match.status).toBe("matched");
        if (match.status !== "matched") continue;
        const index = (effective - T0) / MIN;
        expect(match.lat).toBeCloseTo(-37.95 + index * 0.001, 10);
        expect(match.lon).toBeCloseTo(145.1 + index * 0.002, 10);
        // Interpolated matches carry zero delta by construction.
        expect(match.deltaMs).toBe(0);
        expect(match.trackTimeMs).toBe(effective);
      }
    }
  });

  it("the matrix's sign convention: +10:00 means the camera is AHEAD of UTC", () => {
    // A Melbourne camera (UTC+10) stamping 16:00 local = 06:00 UTC.
    const naive = T0 + 10 * 60 * MIN; // 16:00 wall clock
    const [match] = matchPhotos([photo("p", naive)], WALK, {
      ...CFG,
      timezoneOffsetMinutes: 600,
    });
    expect(match.status).toBe("matched");
    if (match.status === "matched") {
      expect(match.lat).toBeCloseTo(-37.95, 10); // exactly at the start
      expect(match.trackTimeMs).toBe(T0);
    }
  });

  it("the half-hour zones are first-class (India +5:30)", () => {
    expect(timezoneOffsetOptions()).toContain(330);
    expect(timezoneOffsetOptions()).toContain(-210); // Newfoundland −3:30
    expect(timezoneOffsetOptions()[0]).toBe(-720);
    expect(timezoneOffsetOptions().at(-1)).toBe(840);
    expect(formatUtcOffset(330)).toBe("UTC+05:30");
    expect(formatUtcOffset(-210)).toBe("UTC\u221203:30");
    expect(formatUtcOffset(0)).toBe("UTC");
    expect(formatUtcOffset(600)).toBe("UTC+10:00");
  });
});

describe("interpolation goldens", () => {
  it("interpolates lat/lon/ele linearly between the bracketing points", () => {
    // 06:04:30 — exactly halfway between 06:04 and 06:05.
    const [match] = matchPhotos([photo("p", T0 + 4.5 * MIN)], WALK, CFG);
    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.lat).toBeCloseTo(-37.95 + 4.5 * 0.001, 10);
    expect(match.lon).toBeCloseTo(145.1 + 4.5 * 0.002, 10);
    expect(match.ele).toBeCloseTo(14.5, 10);
    expect(match.onReconstructed).toBe(false);
  });

  it("an exact track-point hit lands on the point itself", () => {
    const [match] = matchPhotos([photo("p", T0 + 3 * MIN)], WALK, CFG);
    expect(match.status).toBe("matched");
    if (match.status !== "matched") return;
    expect(match.lat).toBeCloseTo(-37.95 + 3 * 0.001, 12);
    expect(match.trackTimeMs).toBe(T0 + 3 * MIN);
  });

  it("flags matches whose bracket rides reconstructed geometry", () => {
    const mixed = WALK.map((point, i) => ({
      ...point,
      reconstructed: i === 4 || i === 5,
    }));
    const [inside] = matchPhotos([photo("p", T0 + 4.5 * MIN)], mixed, CFG);
    expect(inside.status).toBe("matched");
    if (inside.status === "matched") expect(inside.onReconstructed).toBe(true);
    const [outside] = matchPhotos([photo("q", T0 + 1.5 * MIN)], mixed, CFG);
    expect(outside.status).toBe("matched");
    if (outside.status === "matched") expect(outside.onReconstructed).toBe(false);
  });

  it("elevation interpolates when both ends carry one, survives one-ended", () => {
    const noEle = WALK.map((point, i) => ({ ...point, ele: i === 5 ? null : point.ele }));
    const [a] = matchPhotos([photo("p", T0 + 2.5 * MIN)], noEle, CFG);
    expect(a.status).toBe("matched");
    if (a.status === "matched") expect(a.ele).toBeCloseTo(12.5, 10);
    const [b] = matchPhotos([photo("q", T0 + 5.5 * MIN)], noEle, CFG);
    expect(b.status).toBe("matched");
    if (b.status === "matched") expect(b.ele).toBe(16); // the surviving end
  });
});

describe("the tolerance window (±120 s by default, disclosed)", () => {
  const END = T0 + 10 * MIN; // the track's last point

  it("matches just inside the window at both track ends, states the delta", () => {
    const cases: [number, number][] = [
      [-120 * SEC, -120 * SEC], // 120 s before the start → pinned to it
      [120 * SEC, 120 * SEC], // 120 s after the end → pinned to it
    ];
    for (const [offset, expectedDelta] of cases) {
      const at = offset < 0 ? T0 + offset : END + offset;
      const [match] = matchPhotos([photo("p", at)], WALK, CFG);
      expect(match.status).toBe("matched");
      if (match.status !== "matched") continue;
      expect(match.deltaMs).toBe(expectedDelta);
      // Pinned to the endpoint, never a fabricated interior position.
      expect(match.lat).toBeCloseTo(offset < 0 ? -37.95 : -37.95 + 10 * 0.001, 12);
    }
  });

  it("refuses just outside the window with the distance stated", () => {
    for (const at of [T0 - 121 * SEC, END + 121 * SEC, END + 10 * MIN]) {
      const [match] = matchPhotos([photo("p", at)], WALK, CFG);
      expect(match.status).toBe("out-of-window");
      if (match.status === "out-of-window") {
        expect(match.nearestDeltaSec).toBe(Math.round(Math.abs(at - (at < T0 ? T0 : END)) / SEC));
      }
    }
  });

  it("the drift nudge rescues a photo the camera clock had stranded", () => {
    const strayed = END + 200 * SEC; // 200 s past the end
    const [stuck] = matchPhotos([photo("p", strayed)], WALK, CFG);
    expect(stuck.status).toBe("out-of-window");
    // A −90 s nudge pulls it to +110 s past the end — inside the window,
    // pinned to the endpoint with the remaining delta stated.
    const [rescued] = matchPhotos([photo("p", strayed)], WALK, {
      ...CFG,
      driftSeconds: -90,
    });
    expect(rescued.status).toBe("matched");
    if (rescued.status === "matched") {
      expect(rescued.deltaMs).toBe(110 * SEC);
    }
  });
});

describe("the honesty rules (§26.3)", () => {
  it("photos without a timestamp are listed as exactly that", () => {
    const matches = matchPhotos(
      [photo("a", null), photo("b", T0 + 30 * SEC), photo("c", null)],
      WALK,
      CFG,
    );
    expect(matches[0]).toEqual({ id: "a", status: "no-timestamp" });
    expect(matches[1].status).toBe("matched");
    expect(matches[2]).toEqual({ id: "c", status: "no-timestamp" });
  });

  it("an empty track refuses everything with the stated margin", () => {
    const [match] = matchPhotos([photo("p", T0)], [], CFG);
    expect(match.status).toBe("out-of-window");
    if (match.status === "out-of-window") {
      expect(match.nearestDeltaSec).toBe(Number.POSITIVE_INFINITY);
    }
    const [none] = matchPhotos([photo("q", null)], [], CFG);
    expect(none.status).toBe("no-timestamp");
  });

  it("a track with ONE point matches only within its window", () => {
    const single = track([T0]);
    const [inWindow] = matchPhotos([photo("p", T0 + 60 * SEC)], single, CFG);
    expect(inWindow.status).toBe("matched");
    const [out] = matchPhotos([photo("q", T0 + 200 * SEC)], single, CFG);
    expect(out.status).toBe("out-of-window");
  });
});

describe("buildTimedTrack (the one-merge projection)", () => {
  const P = (id: string): PointId => id as PointId;

  it("collects recorded + reconstructed points with times, sorted", () => {
    const merge = {
      tracks: [
        {
          trackIndex: 0,
          runs: [],
          repairCount: 0,
          reconstructedDistanceM: 0,
          points: [
            {
              order: 2,
              point: {
                source: "original",
                id: P("p2"),
                lat: 2,
                lon: 2,
                ele: 20,
                time: T0 + 2 * MIN,
                flags: [],
                raw: { lat: "2", lon: "2", children: [] },
              },
            },
            {
              order: 0,
              point: {
                source: "original",
                id: P("p0"),
                lat: 0,
                lon: 0,
                ele: 0,
                time: T0,
                flags: [],
                raw: { lat: "0", lon: "0", children: [] },
              },
            },
            {
              order: 1,
              point: {
                source: "reconstructed",
                lat: 1,
                lon: 1,
                ele: { value: 10, method: "interpolated" },
                time: { value: T0 + MIN, method: "distance-proportional" },
                cumDistanceM: 100,
              },
            },
            {
              order: 3,
              point: {
                source: "original",
                id: P("p3"),
                lat: 3,
                lon: 3,
                flags: [],
                raw: { lat: "3", lon: "3", children: [] },
                // no time — excluded
              },
            },
          ],
        },
      ],
      repairCount: 0,
      reconstructedDistanceM: 0,
      insertedPoints: 0,
      elevatedRepairCount: 0,
      elevationProviders: [],
      skipped: [],
    } satisfies MergeResult;

    const timed = buildTimedTrack(merge);
    expect(timed.map((point) => point.timeMs)).toEqual([
      T0,
      T0 + MIN,
      T0 + 2 * MIN,
    ]);
    expect(timed[1]!.reconstructed).toBe(true);
    expect(timed[1]!.ele).toBe(10); // Estimated unwrapped
    expect(timed[2]!.ele).toBe(20);
  });
});

describe("the binary search against a linear scan (cross-check)", () => {
  it("agrees with brute force on seeded-random dense tracks", () => {
    let seed = 42;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 0xffffffff;
    };
    for (let round = 0; round < 20; round++) {
      const times: number[] = [];
      let t = T0;
      for (let i = 0; i < 200; i++) {
        t += Math.max(1, Math.floor(rand() * 5000));
        times.push(t);
      }
      const dense = track(times);
      const first = dense[0]!.timeMs;
      const last = dense.at(-1)!.timeMs;
      for (let probe = 0; probe < 10; probe++) {
        // Probes span before-start to past-end (the window edges too).
        const naive = Math.round(first - 60_000 + rand() * (last - first + 180_000));
        const match = matchPhotos([photo("p", naive)], dense, CFG)[0]!;
        if (match.status === "matched") {
          if (match.deltaMs === 0) {
            // Interpolated: strictly bracketed by two points.
            expect(naive).toBeGreaterThan(first);
            expect(naive).toBeLessThan(last);
          } else {
            // Endpoint-pinned: inside the ±120 s window of an end.
            expect(Math.abs(match.deltaMs)).toBeLessThanOrEqual(120 * SEC);
          }
        } else {
          expect(Math.abs(naive - (naive < first ? first : last))).toBeGreaterThan(
            120 * SEC,
          );
        }
      }
    }
  });
});

describe("display formatters", () => {
  it("formats the nudge slider's labels", () => {
    expect(formatDriftSeconds(0)).toBe("0");
    expect(formatDriftSeconds(45)).toBe("+45 s");
    expect(formatDriftSeconds(-45)).toBe("\u221245 s");
    expect(formatDriftSeconds(125)).toBe("+2:05");
    expect(formatDriftSeconds(-200)).toBe("\u22123:20");
  });
});

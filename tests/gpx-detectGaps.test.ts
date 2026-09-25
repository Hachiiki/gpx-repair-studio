// @vitest-environment jsdom
/**
 * Gap detection tests (docs/MASTER_PLAN.md §H-4, §N-1).
 *
 * Threshold boundaries (exact-at-limit), speed anomalies, segment breaks,
 * evidence merging, severity ranking, and flag-aware evidence handling.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAP_THRESHOLDS,
  detectGaps,
} from "@/features/gpx/detectGaps";
import { validateGpx } from "@/features/gpx/validate";
import { buildGpxXml, parseFixture, parseXml } from "./helpers/gpxTestUtils";

describe("time gaps", () => {
  it("time-gap.gpx — 5-minute jump detected as one suspect gap", () => {
    const parsed = parseFixture("time-gap.gpx");
    const data = validateGpx(parsed).data;
    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(1);
    const gap = gaps[0];
    expect(gap.kind).toBe("time-gap");
    expect(gap.severity).toBe("suspect"); // 300 s < 10 × 120 s
    expect(gap.elapsedMs).toBe(300_000);
    expect(gap.before).toEqual({ segmentId: "t0s0", pointId: "t0s0:3" });
    expect(gap.after).toEqual({ segmentId: "t0s0", pointId: "t0s0:4" });
    expect(gap.id).toBe("gap/t0s0:3/t0s0:4");
    expect(gap.impliedDistanceM).toBeGreaterThan(5);
    expect(gap.impliedDistanceM).toBeLessThan(15);
    expect(gap.impliedSpeed).toBeGreaterThan(0);
    expect(gap.status).toBe("new");
  });

  it("boundary: exactly 120 s is NOT a gap; 120.001 s is", () => {
    const atLimit = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00.000Z" },
        { lat: 52.5201, lon: 13.4, time: "2024-05-01T07:02:00.000Z" },
      ]),
    );
    expect(detectGaps(atLimit)).toHaveLength(0);

    const overLimit = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00.000Z" },
        { lat: 52.5201, lon: 13.4, time: "2024-05-01T07:02:00.001Z" },
      ]),
    );
    expect(detectGaps(overLimit)).toHaveLength(1);
    expect(detectGaps(overLimit)[0].kind).toBe("time-gap");
  });

  it("severity: a 20-minute jump is severe (10 × default threshold)", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00Z" },
        { lat: 52.5201, lon: 13.4, time: "2024-05-01T07:20:00Z" },
      ]),
    );
    expect(detectGaps(data)[0].severity).toBe("severe");
  });

  it("custom thresholds are honored", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00Z" },
        { lat: 52.5201, lon: 13.4, time: "2024-05-01T07:00:06Z" },
      ]),
    );
    expect(detectGaps(data)).toHaveLength(0);
    expect(detectGaps(data, { timeGapMs: 5_000 })).toHaveLength(1);
  });
});

describe("speed anomalies", () => {
  it("speed-anomaly.gpx — single severe anomaly on the fast leg", () => {
    const parsed = parseFixture("speed-anomaly.gpx");
    const data = validateGpx(parsed).data;
    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(1);
    const gap = gaps[0];
    expect(gap.kind).toBe("speed-anomaly");
    expect(gap.severity).toBe("severe"); // ~58 km/h ≥ 2 × 25 km/h
    expect(gap.before.pointId).toBe("t0s0:2");
    expect(gap.after.pointId).toBe("t0s0:3");
    expect(gap.impliedSpeed!).toBeGreaterThan(2 * (25 / 3.6));
    expect(gap.impliedDistanceM!).toBeGreaterThan(400);
  });

  it("Δt guard: a fast leg with Δt ≤ 10 s is immune", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00Z" },
        { lat: 52.5237, lon: 13.4091, time: "2024-05-01T07:00:05Z" },
      ]),
    );
    expect(detectGaps(data)).toHaveLength(0);
  });

  it("boundary: implied speed exactly at the threshold is not a candidate", () => {
    // Build a known fast leg, read its deterministic implied speed, then
    // set the threshold exactly there (strictly-greater comparison).
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00Z" },
        { lat: 52.521, lon: 13.4, time: "2024-05-01T07:00:30Z" },
      ]),
    );
    const [probe] = detectGaps(data, { speedAnomalyKmh: 1 });
    const impliedKmh = (probe.impliedSpeed as number) * 3.6;
    expect(detectGaps(data, { speedAnomalyKmh: impliedKmh })).toHaveLength(0);
    expect(
      detectGaps(data, { speedAnomalyKmh: impliedKmh - 0.001 }).length,
    ).toBe(1);
  });

  it("invalid coordinates cannot produce speed evidence", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00Z" },
        { lat: "abc", lon: 13.4, time: "2024-05-01T07:00:30Z" },
        { lat: 52.53, lon: 13.4, time: "2024-05-01T07:01:00Z" },
      ]),
    );
    expect(detectGaps(data)).toHaveLength(0);
  });
});

describe("segment breaks", () => {
  it("multi-segment.gpx — adjacent segments produce info breaks", () => {
    const data = validateGpx(parseFixture("multi-segment.gpx")).data;
    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(2);
    expect(gaps.every((g) => g.kind === "segment-break" && g.severity === "info")).toBe(true);
    expect(gaps[0].before).toEqual({ segmentId: "t0s0", pointId: "t0s0:2" });
    expect(gaps[0].after).toEqual({ segmentId: "t0s1", pointId: "t0s1:0" });
  });

  it("an empty segment between two segments yields a break around it", () => {
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
<trk><trkseg>
<trkpt lat="52.52" lon="13.40"><time>2024-05-01T07:00:00Z</time></trkpt>
</trkseg>
<trkseg/>
<trkseg>
<trkpt lat="52.5201" lon="13.4001"><time>2024-05-01T07:00:03Z</time></trkpt>
</trkseg>
</trk></gpx>`,
    );
    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].kind).toBe("segment-break");
    expect(gaps[0].before.pointId).toBe("t0s0:0");
    expect(gaps[0].after.segmentId).toBe("t0s2");
  });

  it("boundaries never span tracks", () => {
    const data = parseFixture("multi-track.gpx");
    // 10-minute jump between Loop A and Loop B is NOT a gap.
    expect(detectGaps(data)).toHaveLength(0);
  });
});

describe("evidence merging and ranking", () => {
  it("segment-break-time-gap.gpx — one merged gap, time-gap wins", () => {
    const data = validateGpx(parseFixture("segment-break-time-gap.gpx")).data;
    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(1);
    const gap = gaps[0];
    expect(gap.kind).toBe("time-gap"); // priority over segment-break
    expect(gap.elapsedMs).toBe(600_000);
    expect(gap.before.segmentId).toBe("t0s0");
    expect(gap.after.segmentId).toBe("t0s1"); // segment-break evidence visible
    expect(gap.severity).toBe("suspect");
  });

  it("severity-ranked output: severe, suspect, then info", () => {
    // One file with all three: fast leg (severe), 5-min gap (suspect),
    // plain segment break (info).
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
<trk><trkseg>
<trkpt lat="52.52" lon="13.40"><time>2024-05-01T07:00:00Z</time></trkpt>
<trkpt lat="52.5237" lon="13.4091"><time>2024-05-01T07:00:30Z</time></trkpt>
</trkseg>
<trkseg>
<trkpt lat="52.5240" lon="13.4100"><time>2024-05-01T07:00:33Z</time></trkpt>
<trkpt lat="52.5241" lon="13.4101"><time>2024-05-01T07:05:33Z</time></trkpt>
</trkseg></trk></gpx>`,
    );
    const gaps = detectGaps(data);
    expect(gaps.map((g) => g.severity)).toEqual(["severe", "suspect", "info"]);
    expect(gaps.map((g) => g.kind)).toEqual([
      "speed-anomaly",
      "time-gap",
      "segment-break",
    ]);
  });
});

describe("no-candidate situations", () => {
  it("no-time.gpx — nothing detectable without timestamps", () => {
    expect(detectGaps(parseFixture("no-time.gpx"))).toHaveLength(0);
  });

  it("valid-1.1.gpx — a healthy file has no gaps", () => {
    expect(detectGaps(validateGpx(parseFixture("valid-1.1.gpx")).data)).toHaveLength(0);
  });

  it("mixed-anomalies.gpx — Δt guard suppresses 3 s zero-coord jumps", () => {
    const data = validateGpx(parseFixture("mixed-anomalies.gpx")).data;
    // The (0,0) jumps span only 3 s; the speed detector's Δt guard
    // (default 10 s) correctly ignores sub-guard legs — that damage is the
    // validator's finding (zero-coord/speed-spike flags), not a repairable
    // gap. No segment breaks or time gaps exist either.
    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(0);
    // Raising the evidence window via thresholds is the user's call:
    // with no guard, the (0,0) transition is a severe speed anomaly.
    const unguarded = detectGaps(data, { speedDtGuardMs: 0 });
    expect(unguarded).toHaveLength(1);
    expect(unguarded[0].kind).toBe("speed-anomaly");
    expect(unguarded[0].severity).toBe("severe");
  });

  it("works on raw (unvalidated) parse output", () => {
    const gaps = detectGaps(parseFixture("time-gap.gpx"));
    expect(gaps).toHaveLength(1);
  });
});

describe("defaults", () => {
  it("exposes the documented running-world defaults", () => {
    expect(DEFAULT_GAP_THRESHOLDS).toEqual({
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    });
  });
});

describe("re-imported repair seams (Phase 7)", () => {
  it("legs touching marked points never produce gap candidates", () => {
    // A repaired export re-imported: the marked interior sits between
    // points 1 and 2 in its own marked stretch. The seams (0→marked,
    // marked→2) and the interior leg are all suppressed — even though the
    // interior timestamps would read as a "time gap" to a naive detector.
    const data = parseXml(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxr="https://gpx-repair.studio/schema/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"><time>2024-05-01T07:00:00Z</time></trkpt>
    <trkpt lat="52.520051" lon="13.405024"><time>2024-05-01T07:00:03Z</time></trkpt>
    <trkpt lat="52.520401" lon="13.405524"><time>2024-05-01T07:09:03Z</time><extensions><gpxr:reconstructed timeMethod="manual"/></extensions></trkpt>
    <trkpt lat="52.520446" lon="13.405594"><time>2024-05-01T07:09:06Z</time></trkpt>
    <trkpt lat="52.520491" lon="13.405664"><time>2024-05-01T07:09:09Z</time></trkpt>
  </trkseg></trk>
</gpx>`);
    expect(data.repairMarkers).toHaveLength(1);

    // Without the marker the 9-minute jump is a severe time gap; with it,
    // the boundary is a repair seam — detection stays silent.
    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(0);
  });
});

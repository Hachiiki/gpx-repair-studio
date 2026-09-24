// @vitest-environment jsdom
/**
 * Validator tests (docs/MASTER_PLAN.md §H-3, §N-1).
 *
 * Nothing is auto-corrected; flags are enriched on a copied model; parse
 * issues are carried through without duplication.
 */

import { describe, expect, it } from "vitest";
import { validateGpx } from "@/features/gpx/validate";
import { buildGpxXml, parseFixture, parseXml } from "./helpers/gpxTestUtils";

describe("clean documents produce no findings", () => {
  it("valid-1.1.gpx — zero issues, zero flags", () => {
    const parsed = parseFixture("valid-1.1.gpx");
    const { data, issues } = validateGpx(parsed);
    expect(issues).toEqual([]);
    for (const point of data.segments[0].points) {
      expect(point.flags).toEqual([]);
    }
  });

  it("validation is idempotent", () => {
    const first = validateGpx(parseFixture("valid-1.1.gpx"));
    const second = validateGpx(first.data);
    expect(second.issues).toEqual(first.issues);
    expect(second.data).toEqual(first.data);
  });
});

describe("semantic checks", () => {
  it("bad-coords.gpx — out-of-range coords flagged + reported", () => {
    const parsed = parseFixture("bad-coords.gpx");
    const { data, issues } = validateGpx(parsed);
    const points = data.segments[0].points;
    expect(points[3].flags).toContain("out-of-range-coord"); // lat 91.5
    expect(points[4].flags).toContain("out-of-range-coord"); // lon -200
    const issue = issues.find((i) => i.kind === "out-of-range-coord")!;
    expect(issue.points).toHaveLength(2);
    expect(issue.severity).toBe("warning");
    // Parse issues are carried through, not duplicated.
    const invalidCoordIssues = issues.filter((i) => i.kind === "invalid-coord");
    expect(invalidCoordIssues).toHaveLength(1);
  });

  it("out-of-range elevation reported (issue only, value untouched)", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, ele: 12000, time: "2024-05-01T07:00:00Z" },
        { lat: 52.5201, lon: 13.4001, ele: -500, time: "2024-05-01T07:00:03Z" },
      ]),
    );
    const { issues } = validateGpx(data);
    const issue = issues.find((i) => i.kind === "out-of-range-ele")!;
    expect(issue.points).toHaveLength(2);
    expect(data.segments[0].points[0].ele).toBe(12000); // value kept as recorded
  });

  it("zero-coords.gpx — zero-coordinate run reported", () => {
    const parsed = parseFixture("zero-coords.gpx");
    const { issues } = validateGpx(parsed);
    const issue = issues.find((i) => i.kind === "zero-coord")!;
    expect(issue.points).toHaveLength(3);
    expect(issue.severity).toBe("warning");
  });

  it("backwards-time.gpx — reversal flagged on the later point", () => {
    const parsed = parseFixture("backwards-time.gpx");
    const { data, issues } = validateGpx(parsed);
    const flags = data.segments[0].points.map((p) => p.flags.join(","));
    expect(flags).toEqual(["", "time-reversed", "time-reversed"]);
    const issue = issues.find((i) => i.kind === "time-reversed")!;
    expect(issue.points).toHaveLength(2);
  });

  it("duplicate-points.gpx — duplicates flagged (info)", () => {
    const parsed = parseFixture("duplicate-points.gpx");
    const { data, issues } = validateGpx(parsed);
    const flags = data.segments[0].points.map((p) => p.flags.join(","));
    expect(flags).toEqual(["", "dup", "dup", ""]);
    const issue = issues.find((i) => i.kind === "duplicate-point")!;
    expect(issue.severity).toBe("info");
    expect(issue.points).toHaveLength(2);
  });

  it("speed-spike — geodesic implied speed above threshold", () => {
    // ~485 m in 30 s ≈ 58 km/h.
    const data = parseXml(
      buildGpxXml([
        { lat: 52.520096, lon: 13.405094, time: "2024-05-01T07:00:00Z" },
        { lat: 52.5237, lon: 13.4091, time: "2024-05-01T07:00:30Z" },
      ]),
    );
    const { data: validated, issues } = validateGpx(data);
    expect(validated.segments[0].points[1].flags).toContain("speed-spike");
    expect(issues.find((i) => i.kind === "speed-spike")!.points).toHaveLength(1);
  });

  it("speed-spike threshold is configurable", () => {
    // ~111 m in 30 s ≈ 13 km/h.
    const xml = buildGpxXml([
      { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00Z" },
      { lat: 52.521, lon: 13.4, time: "2024-05-01T07:00:30Z" },
    ]);
    expect(validateGpx(parseXml(xml)).issues.find((i) => i.kind === "speed-spike")).toBeUndefined();
    expect(
      validateGpx(parseXml(xml), { speedSpikeKmh: 10 }).issues.find((i) => i.kind === "speed-spike"),
    ).toBeDefined();
  });

  it("speed evidence skips invalid/out-of-range coordinates", () => {
    // The jump to a NaN point and back cannot produce a speed spike.
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.4, time: "2024-05-01T07:00:00Z" },
        { lat: "abc", lon: 13.4, time: "2024-05-01T07:00:30Z" },
        { lat: 52.53, lon: 13.4, time: "2024-05-01T07:01:00Z" },
      ]),
    );
    const { issues } = validateGpx(data);
    expect(issues.find((i) => i.kind === "speed-spike")).toBeUndefined();
  });

  it("naive-time.gpx — parse unreliability carried through exactly once", () => {
    const parsed = parseFixture("naive-time.gpx");
    const { issues } = validateGpx(parsed);
    expect(issues.filter((i) => i.kind === "unreliable-time")).toHaveLength(1);
    expect(issues.find((i) => i.kind === "unreliable-time")!.points).toHaveLength(4);
  });
});

describe("structural checks", () => {
  it("empty-segment.gpx — empty <trkseg> reported", () => {
    const parsed = parseFixture("empty-segment.gpx");
    const { issues } = validateGpx(parsed);
    const issue = issues.find((i) => i.kind === "empty-segment")!;
    expect(issue.segments).toEqual(["t0s0"]);
  });

  it("single-point-segment.gpx — single point reported (info)", () => {
    const parsed = parseFixture("single-point-segment.gpx");
    const issue = validateGpx(parsed).issues.find((i) => i.kind === "single-point-segment")!;
    expect(issue.segments).toEqual(["t0s0"]);
    expect(issue.severity).toBe("info");
  });

  it("track without segments reported", () => {
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="x" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Empty Track</name></trk>
</gpx>`,
    );
    const issue = validateGpx(data).issues.find((i) => i.kind === "track-without-segments")!;
    expect(issue.message).toContain("0");
  });

  it("no-time.gpx — file-level 'no timing data' info", () => {
    const parsed = parseFixture("no-time.gpx");
    const issue = validateGpx(parsed).issues.find((i) => i.kind === "no-timing-data")!;
    expect(issue.severity).toBe("info");
  });
});

describe("immutability of the input model", () => {
  it("validateGpx never mutates its input", () => {
    const parsed = parseFixture("mixed-anomalies.gpx");
    const before = JSON.stringify(parsed);
    const { data } = validateGpx(parsed);
    expect(JSON.stringify(parsed)).toBe(before);
    expect(data).not.toBe(parsed);
    // The result is a new frozen model with enriched flags.
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(data.segments[0].points)).toBe(true);
  });

  it("clean points keep object identity; damaged points are copied", () => {
    const parsed = parseFixture("backwards-time.gpx");
    const { data } = validateGpx(parsed);
    expect(data.segments[0].points[0]).toBe(parsed.segments[0].points[0]);
    expect(data.segments[0].points[1]).not.toBe(parsed.segments[0].points[1]);
  });
});

describe("kitchen-sink fixture", () => {
  it("mixed-anomalies.gpx — all relational findings in one pass", () => {
    const parsed = parseFixture("mixed-anomalies.gpx");
    const { data, issues } = validateGpx(parsed);
    const kinds = issues.map((i) => i.kind).sort();
    expect(kinds).toEqual(
      ["duplicate-point", "speed-spike", "time-reversed", "zero-coord"].sort(),
    );
    // Per-point flags (parse flags first, validator additions after):
    // p1 clean; p2 dup of p1; p3 (0,0) zero-coord + huge-jump speed-spike;
    // p4 (0,0) zero-coord + dup of p3; p5 reversed after p4; p6 clean.
    const flags = data.segments[0].points.map((p) => [...p.flags]);
    expect(flags).toEqual([
      [],
      ["dup"],
      ["zero-coord", "speed-spike"],
      ["zero-coord", "dup"],
      ["time-reversed"],
      [],
    ]);
  });
});

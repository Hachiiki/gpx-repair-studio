// @vitest-environment jsdom
/**
 * Parser fixture corpus tests (docs/MASTER_PLAN.md §N-1).
 *
 * Every committed fixture must produce the expected typed model or typed
 * error — nothing in between, nothing silently repaired.
 */

import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { generateSyntheticGpx } from "@/features/gpx/fixtures/generators";
import {
  buildGpxXml,
  loadFixture,
  makeIo,
  parseFixture,
  parseXml,
} from "./helpers/gpxTestUtils";

const T0 = Date.parse("2024-05-01T07:00:00Z");

describe("valid documents", () => {
  it("valid-1.1.gpx — full model", () => {
    const data = parseFixture("valid-1.1.gpx");
    expect(data.fileMeta).toMatchObject({
      creator: "Garmin Connect",
      version: "1.1",
      name: "Morning Run",
      time: T0,
    });
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0]).toMatchObject({ trackIndex: 0, name: "Morning Run", type: "running" });
    expect(data.segments).toHaveLength(1);
    const points = data.segments[0].points;
    expect(points).toHaveLength(6);
    expect(points[0]).toMatchObject({
      source: "original",
      id: "t0s0:0",
      lat: 52.520006,
      lon: 13.404954,
      ele: 41.6,
      time: T0,
      flags: [],
    });
    // Verbatim capture: attribute values and child order.
    expect(points[0].raw.lat).toBe("52.520006");
    expect(points[0].raw.lon).toBe("13.404954");
    expect(points[0].raw.children).toEqual([
      { kind: "ele", text: "41.6" },
      { kind: "time", text: "2024-05-01T07:00:00Z" },
    ]);
    expect(points[5].id).toBe("t0s0:5");
    expect(points[5].time).toBe(T0 + 15000);
    expect(data.issues).toEqual([]);
    expect(data.rootExtras).toEqual([]);
  });

  it("valid-1.0.gpx — version, namespace, root-level metadata", () => {
    const data = parseFixture("valid-1.0.gpx");
    expect(data.fileMeta.version).toBe("1.0");
    expect(data.fileMeta.name).toBe("Old Trail");
    expect(data.fileMeta.time).toBe(Date.parse("2019-07-06T05:30:00Z"));
    expect(data.segments[0].points).toHaveLength(4);
    expect(data.issues).toEqual([]);
  });

  it("no-namespace.gpx — tolerated; absent creator stays absent", () => {
    const data = parseFixture("no-namespace.gpx");
    expect(data.segments[0].points).toHaveLength(3);
    expect(data.fileMeta.creator).toBeUndefined();
    expect(data.fileMeta.raw.creator).toBeUndefined();
  });

  it("prefixed-namespace.gpx — same geometry as default-ns dialect", () => {
    const prefixed = parseFixture("prefixed-namespace.gpx");
    const plain = parseFixture("valid-1.1.gpx");
    expect(prefixed.segments[0].points.map((p) => [p.lat, p.lon, p.ele, p.time]))
      .toEqual(plain.segments[0].points.slice(0, 3).map((p) => [p.lat, p.lon, p.ele, p.time]));
  });

  it("multi-track.gpx — two tracks with independent segments", () => {
    const data = parseFixture("multi-track.gpx");
    expect(data.tracks.map((t) => t.name)).toEqual(["Loop A", "Loop B"]);
    expect(data.segments.map((s) => s.id)).toEqual(["t0s0", "t1s0"]);
    expect(data.segments.map((s) => s.trackIndex)).toEqual([0, 1]);
  });

  it("multi-segment.gpx — three segments, one track", () => {
    const data = parseFixture("multi-segment.gpx");
    expect(data.segments.map((s) => s.id)).toEqual(["t0s0", "t0s1", "t0s2"]);
    expect(data.segments.map((s) => s.points.length)).toEqual([3, 2, 2]);
  });

  it("wpt-rte.gpx — waypoints and routes captured as verbatim snapshots", () => {
    const data = parseFixture("wpt-rte.gpx");
    expect(data.waypoints).toHaveLength(2);
    expect(data.waypoints[0].name).toBe("Brandenburger Tor");
    expect(data.waypoints[0].rawXml).toContain("<sym>Flag, Blue</sym>");
    expect(data.waypoints[1].rawXml).toContain("gpxx:WaypointExtension");
    expect(data.routes).toHaveLength(1);
    expect(data.routes[0].name).toBe("Sightseeing Route");
    expect(data.routes[0].rawXml).toContain("<rtept");
  });

  it("garmin-extensions.gpx — vendor extensions preserved at all levels", () => {
    const data = parseFixture("garmin-extensions.gpx");
    const point = data.segments[0].points[0];
    // Child order preserved: ele, time, then the extension snapshot.
    expect(point.raw.children).toHaveLength(3);
    expect(point.raw.children[2]).toMatchObject({ kind: "extra" });
    expect((point.raw.children[2] as { xml: string }).xml).toContain("152");
    // Track-level extension anchored before the first segment.
    expect(data.tracks[0].extras).toHaveLength(1);
    expect(data.tracks[0].extras[0].afterSegmentCount).toBe(0);
    expect(data.tracks[0].extras[0].xml).toContain("TrackStatsExtension");
    // Metadata-level extension kept.
    expect(data.fileMeta.metadataExtras).toHaveLength(1);
    expect(data.fileMeta.metadataExtras[0]).toContain("DisplayColor");
    expect(data.issues).toEqual([]);
  });

  it("bom.gpx — UTF-8 BOM tolerated", () => {
    const data = parseFixture("bom.gpx");
    expect(data.fileMeta.creator).toBe("BOM Writer");
    expect(data.segments[0].points).toHaveLength(2);
  });

  it("unicode-names.gpx — Unicode preserved end-to-end", () => {
    const data = parseFixture("unicode-names.gpx");
    expect(data.fileMeta.name).toBe("Morgensport – 晨间跑步 – Désirée's loop");
    expect(data.tracks[0].name).toBe("Stadtrandlauf 🏃‍♂️");
    expect(data.tracks[0].type).toBe("бег");
    expect(data.waypoints[0].name).toBe("水塔 / Wasserturm");
  });

  it("cdata.gpx — CDATA content parsed as text; structure kept as extras", () => {
    const data = parseFixture("cdata.gpx");
    expect(data.fileMeta.name).toBe("Run #12 & «bonus»");
    expect(data.tracks[0].name).toBe("Track with CDATA <3");
    // <desc> is not modeled — preserved verbatim in metadata extras.
    expect(data.fileMeta.metadataExtras.join(" ")).toContain("Some <unescaped> notes & remarks");
  });

  it("pretty-indented.gpx — whitespace tolerated, padded text kept verbatim", () => {
    const data = parseFixture("pretty-indented.gpx");
    expect(data.fileMeta.name).toBe("Padded Name");
    const point = data.segments[0].points[0];
    expect(point.ele).toBe(41.6);
    const eleChild = point.raw.children[0] as { kind: string; text: string };
    expect(eleChild.text).toContain("41.60"); // trailing zero preserved byte-exactly
  });

  it("extra-children.gpx — unknown trees anchored and preserved", () => {
    const data = parseFixture("extra-children.gpx");
    expect(data.rootExtras).toHaveLength(1);
    expect(data.rootExtras[0]).toContain("root-level");
    const segment = data.segments[0];
    expect(segment.extras).toHaveLength(1);
    expect(segment.extras[0].afterPointCount).toBe(1);
    expect(segment.extras[0].xml).toContain("segext");
    expect(data.tracks[0].extras).toHaveLength(1);
    expect(data.tracks[0].extras[0].afterSegmentCount).toBe(1);
    // Repeated <ele>: first modeled, second kept as extra in document order.
    const second = segment.points[1];
    expect(second.raw.children.map((c) => c.kind)).toEqual(["ele", "extra", "time"]);
    expect((second.raw.children[1] as { xml: string }).xml).toContain("41.8");
    expect(second.ele).toBe(41.7);
  });
});

describe("hard failures (typed errors)", () => {
  it("malformed.gpx — parsererror with line/column", () => {
    const result = parseGpx(loadFixture("malformed.gpx"), makeIo());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error = result.error;
      expect(error.kind).toBe("malformed-xml");
      if (error.kind === "malformed-xml") {
        expect(error.message.length).toBeGreaterThan(0);
        expect(typeof error.line).toBe("number");
        expect(typeof error.column).toBe("number");
      }
    }
  });

  it("truncated.gpx — parsererror", () => {
    const result = parseGpx(loadFixture("truncated.gpx"), makeIo());
    expect(result).toMatchObject({ ok: false, error: { kind: "malformed-xml" } });
  });

  it("empty string — parsererror", () => {
    const result = parseGpx("", makeIo());
    expect(result).toMatchObject({ ok: false, error: { kind: "malformed-xml" } });
  });

  it("not-gpx.gpx — root element is not <gpx>", () => {
    const result = parseGpx(loadFixture("not-gpx.gpx"), makeIo());
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "not-a-gpx-document", rootElement: "foo" },
    });
  });

  it("bad-version.gpx — unknown version", () => {
    const result = parseGpx(loadFixture("bad-version.gpx"), makeIo());
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid-version", found: "1.2" },
    });
  });

  it("missing version attribute — typed error", () => {
    const result = parseGpx(
      '<?xml version="1.0"?><gpx creator="x" xmlns="http://www.topografix.com/GPX/1/1"/>',
      makeIo(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid-version", found: null },
    });
  });
});

describe("tolerated damage (flags + issues, never silent drops)", () => {
  it("bad-coords.gpx — invalid coords/ele flagged, raw strings kept", () => {
    const data = parseFixture("bad-coords.gpx");
    const points = data.segments[0].points;
    expect(points).toHaveLength(8);
    // p2: lat="abc"
    expect(points[1].flags).toContain("invalid-coord");
    expect(Number.isNaN(points[1].lat)).toBe(true);
    expect(points[1].raw.lat).toBe("abc");
    // p3: lat attribute absent
    expect(points[2].raw.lat).toBeNull();
    expect(points[2].flags).toContain("invalid-coord");
    // p4/p5: out-of-range values are parsed and kept (validator flags them)
    expect(points[3].lat).toBe(91.5);
    expect(points[3].flags).not.toContain("invalid-coord");
    expect(points[4].lon).toBe(-200);
    // p6: empty lat attribute
    expect(points[5].raw.lat).toBe("");
    expect(points[5].flags).toContain("invalid-coord");
    // p7: ele="oops"
    expect(points[6].ele).toBeUndefined();
    expect(points[6].flags).toContain("invalid-ele");
    // p8: ele=12000 parses fine (range is the validator's job)
    expect(points[7].ele).toBe(12000);
    // Aggregated parse issues with point references.
    const kinds = data.issues.map((i) => i.kind);
    expect(kinds).toContain("invalid-coord");
    expect(kinds).toContain("invalid-ele");
    const invalidCoord = data.issues.find((i) => i.kind === "invalid-coord")!;
    expect(invalidCoord.points).toHaveLength(3);
    expect(invalidCoord.severity).toBe("error");
  });

  it("zero-coords.gpx — (0,0) points flagged at parse", () => {
    const data = parseFixture("zero-coords.gpx");
    const flags = data.segments[0].points.map((p) => p.flags.join(","));
    expect(flags).toEqual(["", "zero-coord", "zero-coord", "zero-coord", ""]);
  });

  it("naive-time.gpx — naive timestamps kept verbatim, flagged unreliable", () => {
    const data = parseFixture("naive-time.gpx");
    for (const point of data.segments[0].points) {
      expect(point.time).toBeUndefined();
      expect(point.flags).toContain("unreliable-time");
    }
    const issue = data.issues.find((i) => i.kind === "unreliable-time")!;
    expect(issue.points).toHaveLength(4);
    const timeChild = data.segments[0].points[0].raw.children[1] as { kind: string; text: string };
    expect(timeChild.text).toBe("2024-05-01T08:00:00");
  });

  it("backwards-time.gpx — parsed as-is; reversal is the validator's finding", () => {
    const data = parseFixture("backwards-time.gpx");
    const times = data.segments[0].points.map((p) => p.time);
    expect(times).toEqual([T0 + 10000, T0 + 5000, T0]);
    expect(data.issues).toEqual([]);
  });

  it("duplicate-points.gpx — parsed as-is; duplication is the validator's finding", () => {
    const data = parseFixture("duplicate-points.gpx");
    expect(data.issues).toEqual([]);
    expect(data.segments[0].points).toHaveLength(4);
  });

  it("empty-segment.gpx — empty segment retained in the model", () => {
    const data = parseFixture("empty-segment.gpx");
    expect(data.segments).toHaveLength(2);
    expect(data.segments[0].points).toHaveLength(0);
    expect(data.segments[1].points).toHaveLength(2);
  });

  it("no-time.gpx — points without time or ele", () => {
    const data = parseFixture("no-time.gpx");
    for (const point of data.segments[0].points) {
      expect(point.time).toBeUndefined();
      expect(point.ele).toBeUndefined();
      expect(point.raw.children).toEqual([]);
    }
  });
});

describe("strict ISO-8601 timestamp handling", () => {
  it("accepts Z, numeric offsets, and fractional seconds", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 1, lon: 1, time: "2024-05-01T07:00:00Z" },
        { lat: 1, lon: 1.001, time: "2024-05-01T09:00:00+02:00" },
        { lat: 1, lon: 1.002, time: "2024-05-01T07:00:05.250Z" },
        { lat: 1, lon: 1.003, time: "2024-05-01T04:00:00-05:00" },
      ]),
    );
    const times = data.segments[0].points.map((p) => p.time);
    expect(times).toEqual([
      Date.parse("2024-05-01T07:00:00Z"),
      Date.parse("2024-05-01T07:00:00Z"),
      Date.parse("2024-05-01T07:00:05.250Z"),
      Date.parse("2024-05-01T09:00:00Z"),
    ]);
  });

  it("rejects naive, date-only, malformed, and impossible timestamps", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 1, lon: 1, time: "2024-05-01T07:00:00" },
        { lat: 1, lon: 1.001, time: "2024-05-01" },
        { lat: 1, lon: 1.002, time: "not a date" },
        { lat: 1, lon: 1.003, time: "2024-02-30T07:00:00Z" },
      ]),
    );
    for (const point of data.segments[0].points) {
      expect(point.time).toBeUndefined();
      expect(point.flags).toContain("unreliable-time");
    }
  });

  it("flags an unreliable file-level <time> as an issue", () => {
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="x" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>n</name><time>2024-05-01 07:00:00</time></metadata>
<trk><trkseg><trkpt lat="1" lon="2"><time>2024-05-01T07:00:00Z</time></trkpt></trkseg></trk>
</gpx>`,
    );
    expect(data.fileMeta.time).toBeUndefined();
    expect(data.fileMeta.raw.metadataTime).toBe("2024-05-01 07:00:00");
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].kind).toBe("unreliable-time");
  });
});

describe("immutability (deep-frozen outside production)", () => {
  it("model is deeply frozen and mutation throws", () => {
    const data = parseFixture("valid-1.1.gpx");
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(data.segments)).toBe(true);
    expect(Object.isFrozen(data.segments[0].points)).toBe(true);
    expect(Object.isFrozen(data.segments[0].points[0])).toBe(true);
    expect(Object.isFrozen(data.segments[0].points[0].flags)).toBe(true);
    expect(Object.isFrozen(data.segments[0].points[0].raw)).toBe(true);
    expect(Object.isFrozen(data.issues)).toBe(true);
    expect(() => {
      (data.segments[0].points[0] as unknown as { lat: number }).lat = 0;
    }).toThrow();
  });

  it("parsing the same input twice yields deeply equal models", () => {
    const a = parseFixture("garmin-extensions.gpx");
    const b = parseFixture("garmin-extensions.gpx");
    expect(a).toEqual(b);
  });
});

describe("synthetic large file (generator)", () => {
  it("parses 100 000 points with clean flags (loose timing, not a budget)", () => {
    const xml = generateSyntheticGpx({ pointCount: 100_000, seed: 1234 });
    const result = parseGpx(xml, makeIo());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const points = result.data.segments[0].points;
    expect(points).toHaveLength(100_000);
    expect(result.data.issues).toEqual([]);
    // Monotonic times with the expected cadence (spot check).
    expect(points[50_000].time!).toBeGreaterThan(points[49_999].time!);
    expect(points[99_999].time! - points[0].time!).toBeGreaterThan(99_000_000);
    for (const point of points.slice(0, 100)) {
      expect(point.flags).toEqual([]);
    }
  }, 120_000);
});

// @vitest-environment jsdom
/**
 * TCX parser tests (Phase 14 — §EE 14.2).
 *
 * Fixture goldens: structure mapping (Activity→track, Track→segment,
 * Course→track + CoursePoint→wpt), hr/cad/watts passthrough, the
 * position-less skip rule, strict time handling, and the typed
 * not-a-tcx error. Every fixture also parses through the Phase 9
 * worker tokenizer (the parity rule the GPX corpus follows).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTcx } from "@/features/formats/parse-tcx";
import { createDomXmlIo } from "@/lib/utils/xml";
import { createWorkerXmlIo } from "@/lib/gpx/worker-xml";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { parseGpx } from "@/features/gpx/parse";
import { detectGaps, DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";

const FIXTURES = join(process.cwd(), "src/features/formats/fixtures/files");

function loadTcx(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function parseFixtureTcx(name: string) {
  const result = parseTcx(loadTcx(name), createDomXmlIo());
  if (!result.ok) throw new Error(`fixture ${name} failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

describe("parseTcx — ride.tcx (the golden activity)", () => {
  const data = parseFixtureTcx("ride.tcx");

  it("maps the Activity to one track with Id/Notes/Sport", () => {
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].name).toBe("2024-05-01T06:00:00.000Z");
    expect(data.tracks[0].type).toBe("Biking");
    expect(data.tracks[0].desc).toContain("Café ride");
  });

  it("maps every <Track> to one segment (laps never cut geometry)", () => {
    expect(data.segments).toHaveLength(2);
    expect(data.segments.map((s) => s.id)).toEqual(["t0s0", "t0s1"]);
  });

  it("keeps 7 positioned points of track 1 (the indoor one is skipped)", () => {
    expect(data.segments[0].points).toHaveLength(7);
    const first = data.segments[0].points[0];
    expect(first.lat).toBeCloseTo(-37.95, 8);
    expect(first.lon).toBeCloseTo(145.1, 8);
    expect(first.ele).toBeCloseTo(42.0, 6);
    expect(first.time).toBe(Date.parse("2024-05-01T06:00:00.000Z"));
  });

  it("carries hr/cad as read-only metrics, watts included", () => {
    const first = data.segments[0].points[0];
    expect(first.metrics).toEqual({ hr: 120, cad: 82 });
    const third = data.segments[0].points[2];
    expect(third.metrics).toEqual({ hr: 134, cad: 84, watts: 210 });
  });

  it("discloses the skip and the passthrough as conversion notes", () => {
    const kinds = data.issues.map((i) => i.kind);
    expect(kinds).toContain("conversion-note");
    const skip = data.issues.find((i) => i.message.includes("without position"));
    expect(skip?.severity).toBe("warning");
    expect(skip?.message).toContain("1 trackpoint");
    const passthrough = data.issues.find((i) => i.message.includes("Heart rate"));
    expect(passthrough?.message).toContain("11 points");
  });

  it("takes the creator from <Author><Name>", () => {
    expect(data.fileMeta.creator).toBe("Garmin Connect");
    expect(data.fileMeta.version).toBe("1.1");
  });

  it("detects the 5-minute time gap inside the second track", () => {
    const gaps = detectGaps(data, DEFAULT_GAP_THRESHOLDS);
    const timeGaps = gaps.filter((g) => g.kind === "time-gap");
    // Two legitimate boundaries: the cross-track stop (track 1 ended at
    // 06:00:18, track 2 began 06:05:00) and the 6-minute hole inside
    // track 2 (06:05:03 → 06:11:00).
    expect(timeGaps).toHaveLength(2);
    expect(
    timeGaps.some((g) => (g.elapsedMs ?? 0) >= 5 * 60 * 1000),
    ).toBe(true);
  });

  it("round-trips through GPX export with values intact", () => {
    const io = createDomXmlIo();
    const xml = exportGpxIdentity(data, io);
    const back = parseGpx(xml, io);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.segments).toHaveLength(2);
    const p = back.data.segments[0].points[0];
    expect(p.lat).toBeCloseTo(-37.95, 10);
    expect(p.ele).toBeCloseTo(42.0, 6);
    expect(p.time).toBe(Date.parse("2024-05-01T06:00:00.000Z"));
    /*
     * The hr/cad passthrough survives the GPX round-trip as the
     * synthesized gpxtpx extension — a re-parse keeps it as a verbatim
     * raw extra (parseGpx deliberately does not populate `metrics`;
     * TCX/FIT imports do). The VALUES must be present in the bytes.
     */
    const hrExtra = p.raw.children.find(
      (c) => c.kind === "extra" && c.xml.includes("gpxtpx:hr"),
    );
    expect(hrExtra).toBeDefined();
    if (hrExtra?.kind === "extra") {
      expect(hrExtra.xml).toContain("<gpxtpx:hr>120</gpxtpx:hr>");
      expect(hrExtra.xml).toContain("<gpxtpx:cad>82</gpxtpx:cad>");
    }
  });
});

describe("parseTcx — course.tcx", () => {
  const data = parseFixtureTcx("course.tcx");

  it("maps the Course to a named track", () => {
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].name).toBe("Morning Loop");
    expect(data.segments[0].points).toHaveLength(4);
  });

  it("maps CoursePoints to waypoints with escaped names intact", () => {
    expect(data.waypoints).toHaveLength(2);
    expect(data.waypoints[0].name).toBe("Start & Café");
    expect(data.waypoints[1].name).toBe('Summit "Uetliberg"');
    // The snapshot is self-contained well-formed XML.
    const io = createDomXmlIo();
    const doc = io.parse(data.waypoints[0].rawXml);
    expect(doc.getElementsByTagNameNS("*", "wpt").length).toBe(1);
  });

  it("round-trips the waypoints through a GPX export", () => {
    const io = createDomXmlIo();
    const xml = exportGpxIdentity(data, io);
    const back = parseGpx(xml, io);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.data.waypoints.map((w) => w.name)).toEqual([
        "Start & Café",
        'Summit "Uetliberg"',
      ]);
    }
  });
});

describe("parseTcx — indoor.tcx (position-less)", () => {
  const data = parseFixtureTcx("indoor.tcx");

  it("keeps the track with zero points and discloses the skips", () => {
    expect(data.tracks).toHaveLength(1);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(0);
    const skip = data.issues.find((i) => i.message.includes("without position"));
    expect(skip?.message).toContain("3 trackpoints");
  });
});

describe("parseTcx — wrong-root.tcx", () => {
  it("fails typed with not-a-tcx-document", () => {
    const result = parseTcx(loadTcx("wrong-root.tcx"), createDomXmlIo());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a typed error");
    expect(result.error.kind).toBe("not-a-tcx-document");
    if (result.error.kind !== "not-a-tcx-document") throw new Error("unreachable");
    expect(result.error.rootElement).toBe("html");
  });
});

describe("parseTcx — inline documents", () => {
  it("fails typed on malformed XML", () => {
    const result = parseTcx("<TrainingCenterDatabase><Activities>", createDomXmlIo());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("malformed-xml");
  });

  it("tolerates a no-namespace document", () => {
    const xml =
      `<TrainingCenterDatabase><Activities><Activity Sport="Running">` +
      `<Id>x</Id><Lap><Track><Trackpoint><Time>2024-01-01T00:00:00Z</Time>` +
      `<Position><LatitudeDegrees>10</LatitudeDegrees><LongitudeDegrees>20</LongitudeDegrees></Position>` +
      `</Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const result = parseTcx(xml, createDomXmlIo());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0].points).toHaveLength(1);
      expect(result.data.segments[0].points[0].lat).toBe(10);
    }
  });

  it("drops a naive timestamp and flags it", () => {
    const xml =
      `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">` +
      `<Activities><Activity Sport="Running"><Id>x</Id><Lap><Track>` +
      `<Trackpoint><Time>2024-01-01T00:00:00</Time>` +
      `<Position><LatitudeDegrees>10</LatitudeDegrees><LongitudeDegrees>20</LongitudeDegrees></Position>` +
      `</Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const result = parseTcx(xml, createDomXmlIo());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0].points[0].time).toBeUndefined();
      expect(result.data.segments[0].points[0].flags).toContain("unreliable-time");
    }
  });
});

describe("parseTcx — worker tokenizer parity (Phase 9)", () => {
  it("parses every fixture to the same model under both XmlIo engines", () => {
    for (const name of ["ride.tcx", "course.tcx", "indoor.tcx", "wrong-root.tcx"]) {
      const dom = parseTcx(loadTcx(name), createDomXmlIo());
      const worker = parseTcx(loadTcx(name), createWorkerXmlIo({}));
      expect(worker.ok).toBe(dom.ok);
      if (dom.ok && worker.ok) {
        expect(worker.data.tracks).toEqual(dom.data.tracks);
        expect(worker.data.segments.map((s) => s.points.length)).toEqual(
          dom.data.segments.map((s) => s.points.length),
        );
        expect(worker.data.segments.map((s) => s.points.map((p) => [p.lat, p.lon, p.ele, p.time]))).toEqual(
          dom.data.segments.map((s) => s.points.map((p) => [p.lat, p.lon, p.ele, p.time])),
        );
        expect(worker.data.waypoints.map((w) => w.name)).toEqual(
          dom.data.waypoints.map((w) => w.name),
        );
        expect(worker.data.issues).toEqual(dom.data.issues);
      }
    }
  });
});

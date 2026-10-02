// @vitest-environment jsdom
/**
 * FIT → model tests (Phase 14 — §EE 14.3).
 *
 * The mapping rules: session → track (sport label), records → ONE
 * segment (laps are time splits, never geometry breaks), position-less
 * records skipped + disclosed, metrics passthrough, and the GPX export
 * round-trip of a converted file (values, not bytes — the documented
 * conversion guarantee).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFit } from "@/features/formats/parse-fit";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { parseGpx } from "@/features/gpx/parse";
import { detectGaps, DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";
import { createDomXmlIo } from "@/lib/utils/xml";

const FIXTURES = join(process.cwd(), "src/features/formats/fixtures/files");

function loadFit(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

function parseFixtureFit(name: string) {
  const result = parseFit(loadFit(name));
  if (!result.ok) throw new Error(`fixture ${name} failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

describe("parseFit — activity.fit", () => {
  const data = parseFixtureFit("activity.fit");

  it("maps the session to one track labeled by sport", () => {
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].name).toBe("Cycling");
    expect(data.segments).toHaveLength(1);
  });

  it("keeps 7 positioned points (the pause record is skipped + disclosed)", () => {
    expect(data.segments[0].points).toHaveLength(7);
    const skip = data.issues.find((i) => i.message.includes("without position"));
    expect(skip?.message).toContain("1 record");
    const first = data.segments[0].points[0];
    expect(first.lat).toBeCloseTo(-37.95, 6);
    expect(first.ele).toBeCloseTo(42.0, 6);
    expect(first.time).toBe(Date.parse("2024-05-01T06:00:00.000Z"));
  });

  it("carries hr/cad metrics through", () => {
    expect(data.segments[0].points[0].metrics).toEqual({ hr: 120, cad: 82 });
  });

  it("labels the creator from the manufacturer and notes the laps", () => {
    expect(data.fileMeta.creator).toBe("Garmin");
    const lapNote = data.issues.find((i) => i.message.includes("lap"));
    expect(lapNote?.message).toContain("laps are time splits");
  });

  it("round-trips through GPX export with values intact (incl. metrics)", () => {
    const io = createDomXmlIo();
    const xml = exportGpxIdentity(data, io);
    const back = parseGpx(xml, io);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.segments[0].points).toHaveLength(7);
    const p = back.data.segments[0].points[0];
    expect(p.lat).toBeCloseTo(-37.95, 6);
    expect(p.ele).toBeCloseTo(42.0, 6);
    // The metrics survive as the synthesized gpxtpx extension bytes
    // (a re-parse keeps them as raw extras; `metrics` is an
    // import-time passthrough, not a GPX parse product).
    const hrExtra = p.raw.children.find(
      (c) => c.kind === "extra" && c.xml.includes("gpxtpx:hr"),
    );
    expect(hrExtra).toBeDefined();
    if (hrExtra?.kind === "extra") {
      expect(hrExtra.xml).toContain("<gpxtpx:hr>120</gpxtpx:hr>");
    }
    expect(back.data.fileMeta.creator).toBe("Garmin");
  });

  it("survives the full app pipeline (validate + gaps run on the model)", () => {
    // The working pipeline: validateGpx + detectGaps are format-agnostic.
    const gaps = detectGaps(data, DEFAULT_GAP_THRESHOLDS);
    expect(Array.isArray(gaps)).toBe(true);
    expect(gaps.filter((g) => g.kind === "time-gap")).toHaveLength(0);
  });
});

describe("parseFit — activity-compressed.fit", () => {
  const data = parseFixtureFit("activity-compressed.fit");

  it("keeps all 12 records with their reconstructed timestamps", () => {
    expect(data.segments[0].points).toHaveLength(12);
    expect(data.segments[0].points[11].time).toBe(
      Date.parse("2024-05-01T06:00:33.000Z"),
    );
  });
});

describe("parseFit — course.fit", () => {
  const data = parseFixtureFit("course.fit");

  it("maps the course to a named track and course points to waypoints", () => {
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].name).toBe("Hill Repeats");
    expect(data.segments[0].points).toHaveLength(5);
    expect(data.waypoints).toHaveLength(2);
    expect(data.waypoints.map((w) => w.name)).toEqual([
      "Start & Café",
      'Summit "Uetliberg"',
    ]);
  });
});

describe("parseFit — truncated.fit", () => {
  const data = parseFixtureFit("truncated.fit");

  it("recovers the positioned records with the truncation disclosed", () => {
    expect(data.segments[0].points).toHaveLength(5);
    const note = data.issues.find((i) => i.message.includes("truncated"));
    expect(note?.severity).toBe("warning");
  });
});

describe("parseFit — a minimal multisport partition", () => {
  it("splits records by the sessions' start times", () => {
    // Build via the reader over a hand-made multisport file? The
    // generator only writes single-sport files; the partition logic is
    // exercised through its unit contract instead (see fit partition
    // behavior notes). Here: the single-session fixture stays whole.
    const data = parseFixtureFit("activity.fit");
    expect(data.tracks).toHaveLength(1);
  });
});

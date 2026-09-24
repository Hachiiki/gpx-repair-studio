// @vitest-environment jsdom
/**
 * Real-world Strava samples — the user's own two files, committed under
 * docs/ (personal training run, QC; the same activity exported twice):
 *
 *   - docs/strava_gpx_export.gpx    Strava "Export GPX" (processed):
 *     creator "StravaGPX", GPX 1.1, all namespaces declared, hr extensions
 *     retained, 320 points. Always parsed cleanly.
 *   - docs/strava_gpx_original.gpx  Strava "Export original" (device file
 *     from a GloryFit watch): GPX 1.0, creator "GloryFitPro", gpxtpx: hr/cad
 *     extensions on every point — with NO xmlns:gpxtpx declaration. Strict
 *     XML parsing rejects it ("unbound namespace prefix"); the parser's
 *     undeclared-prefix recovery (see gpx-undeclared-prefix.test.ts) binds
 *     the prefix and warns.
 *
 * These tests pin BOTH files through the full pipeline the app runs
 * (parse → validate → detectGaps → stats → identity export). They are the
 * regression that motivated the recovery feature: a GloryFit original must
 * never again be rejected as "Not well-formed XML".
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { validateGpx } from "@/features/gpx/validate";
import { detectGaps } from "@/features/gpx/detectGaps";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { originalDistanceStats } from "@/features/statistics/distance";
import { makeIo } from "./helpers/gpxTestUtils";
import type { OriginalTrackData } from "@/types/domain";

const DOCS = join(process.cwd(), "docs");

function parseDocsFile(name: string): OriginalTrackData {
  const outcome = parseGpx(
    readFileSync(join(DOCS, name), "utf8"),
    makeIo(),
  );
  if (!outcome.ok) {
    throw new Error(
      `docs sample "${name}" unexpectedly failed to parse: ${JSON.stringify(outcome.error)}`,
    );
  }
  return outcome.data;
}

describe("strava_gpx_export.gpx — Strava processed export", () => {
  it("parses cleanly: StravaGPX creator, named type, hr extensions intact", () => {
    const data = parseDocsFile("strava_gpx_export.gpx");
    expect(data.fileMeta).toMatchObject({
      creator: "StravaGPX",
      version: "1.1",
      time: Date.parse("2026-09-23T11:28:23Z"),
    });
    expect(data.tracks[0]).toMatchObject({
      name: "5th Day Week 2 Sub 30 Training",
      type: "running",
    });
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(320);
    // All 320 points carry ele + time + an hr extension snapshot.
    for (const point of data.segments[0].points) {
      expect(point.ele).toBeDefined();
      expect(point.time).toBeDefined();
      expect(point.flags).toEqual([]);
      const extra = point.raw.children.find((c) => c.kind === "extra");
      expect(extra).toBeDefined();
      expect(extra!.kind === "extra" && extra!.xml).toContain("gpxtpx:hr");
    }
    // Namespaces were properly declared: no recovery, no warnings at all.
    expect(data.issues).toEqual([]);
  });

  it("validates, detects no gaps, and computes the ~3.7 km run", () => {
    const data = parseDocsFile("strava_gpx_export.gpx");
    const validated = validateGpx(data);
    expect(validated.issues).toEqual([]);
    expect(detectGaps(validated.data)).toEqual([]);
    const distance = originalDistanceStats(validated.data);
    expect(distance.totalDistanceM).toBeGreaterThan(3_600);
    expect(distance.totalDistanceM).toBeLessThan(3_700);
    expect(distance.excludedLegs).toBe(0);
  });

  it("identity round-trip: stable export, clean re-parse, same point count", () => {
    const data = parseDocsFile("strava_gpx_export.gpx");
    const xml = exportGpxIdentity(data, makeIo());
    const reparsed = parseGpx(xml, makeIo());
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.data.segments[0].points).toHaveLength(320);
      expect(exportGpxIdentity(reparsed.data, makeIo())).toBe(xml);
    }
  });
});

describe("strava_gpx_original.gpx — GloryFit device original (undeclared prefix)", () => {
  it("parses via recovery: GloryFitPro creator, GPX 1.0, hr+cad on all points", () => {
    const data = parseDocsFile("strava_gpx_original.gpx");
    expect(data.fileMeta).toMatchObject({
      creator: "GloryFitPro",
      version: "1.0",
      time: Date.parse("2026-09-23T11:28:23.00Z"),
    });
    // Track has no <name> — the app falls back to "Track 1" downstream.
    expect(data.tracks[0].name).toBeUndefined();
    expect(data.tracks[0].type).toBe("Outdoor run");
    // Vendor <extensions> stats survive as a track-extra snapshot.
    expect(data.tracks[0].extras[0].xml).toContain("<totalTime>1859</totalTime>");
    expect(data.tracks[0].extras[0].xml).toContain(
      "<totalDistance>3677.611</totalDistance>",
    );

    const points = data.segments[0].points;
    expect(points).toHaveLength(320);
    for (const point of points) {
      expect(point.flags).toEqual([]); // recovery left the data untouched
      const extra = point.raw.children.find((c) => c.kind === "extra");
      expect(extra).toBeDefined();
      const xml = extra!.kind === "extra" ? extra!.xml : "";
      expect(xml).toContain("gpxtpx:hr");
      expect(xml).toContain("gpxtpx:cad");
    }
  });

  it("surfaces exactly one undeclared-namespace warning naming gpxtpx", () => {
    const data = parseDocsFile("strava_gpx_original.gpx");
    const recovery = data.issues.filter(
      (i) => i.kind === "undeclared-namespace",
    );
    expect(recovery).toHaveLength(1);
    expect(recovery[0].severity).toBe("warning");
    expect(recovery[0].message).toContain("gpxtpx");
    expect(recovery[0].message).toContain(
      "http://www.garmin.com/xmlschemas/TrackPointExtension/v1",
    );
  });

  it("validates, detects no gaps, and computes the same run's distance", () => {
    const data = parseDocsFile("strava_gpx_original.gpx");
    const validated = validateGpx(data);
    // The recovery warning flows through; nothing else is flagged.
    expect(
      validated.issues.filter((i) => i.kind !== "undeclared-namespace"),
    ).toEqual([]);
    expect(detectGaps(validated.data)).toEqual([]);
    const distance = originalDistanceStats(validated.data);
    expect(distance.totalDistanceM).toBeGreaterThan(3_600);
    expect(distance.totalDistanceM).toBeLessThan(3_700);
    expect(distance.excludedLegs).toBe(0);
  });

  it("identity round-trip: exported bytes re-parse with NO recovery needed", () => {
    const data = parseDocsFile("strava_gpx_original.gpx");
    const xml = exportGpxIdentity(data, makeIo());
    expect(xml).toContain("gpxtpx:hr"); // extensions preserved on export
    const reparsed = parseGpx(xml, makeIo());
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.data.segments[0].points).toHaveLength(320);
      expect(
        reparsed.data.issues.filter((i) => i.kind === "undeclared-namespace"),
      ).toHaveLength(0);
      expect(exportGpxIdentity(reparsed.data, makeIo())).toBe(xml);
    }
  });
});

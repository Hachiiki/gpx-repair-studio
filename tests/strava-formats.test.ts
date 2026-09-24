// @vitest-environment jsdom
/**
 * Strava export formats — full-pipeline regression coverage.
 *
 * Two committed fixtures mirror the two files Strava serves:
 *   - strava-export.gpx          "Export GPX" (Strava's re-encoded copy):
 *     creator "StravaGPX", <metadata> with time but NO name, the activity
 *     name on <trk>, and Strava's NUMERIC activity-type code (<type>9</type>
 *     = Run) — points carry ele+time only (hr/cad stripped by Strava).
 *   - strava-original-garmin.gpx "Export original" (the device's own file):
 *     device creator, Garmin gpxtpx/gpxx namespaces, <type>running</type>,
 *     and a gpxtpx TrackPointExtension (hr/cad) on every point.
 *
 * Both run through the REAL pipeline exactly as the app does
 * (use-gpx-session): parseGpx → validateGpx → detectGpx → distance stats,
 * plus the identity export round-trip (they are also in
 * PARSEABLE_FIXTURES, so the corpus-wide round-trip suite covers them).
 *
 * Motivated by user-reported concern about Strava compatibility; if either
 * Strava shape ever regresses (parse failure, lost type code, dropped
 * extensions, mis-detected gap), these tests fail.
 */

import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { validateGpx } from "@/features/gpx/validate";
import { detectGaps } from "@/features/gpx/detectGaps";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { originalDistanceStats } from "@/features/statistics/distance";
import { makeIo, parseFixture } from "./helpers/gpxTestUtils";

describe("strava-export.gpx — Strava 'Export GPX' (processed)", () => {
  it("parses: StravaGPX creator, nameless metadata, numeric <type>9</type> kept verbatim", () => {
    const data = parseFixture("strava-export.gpx");
    expect(data.fileMeta).toMatchObject({
      creator: "StravaGPX",
      version: "1.1",
      time: Date.parse("2026-09-20T21:00:00Z"),
    });
    // Classic StravaGPX: <metadata> carries time only — no file-level name.
    expect(data.fileMeta.name).toBeUndefined();
    expect(data.tracks[0]).toMatchObject({
      name: "QC Circle Morning Run",
      type: "9", // Strava's numeric Run code, captured verbatim
    });
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(20);
    expect(data.issues).toEqual([]);
    // Strava's processed export strips hr/cad — points are ele+time only.
    const allBare = data.segments[0].points.every(
      (p) => p.raw.children.length === 2,
    );
    expect(allBare).toBe(true);
  });

  it("validates cleanly and detects exactly one suspect time-gap (the 5 min hole)", () => {
    const validated = validateGpx(parseFixture("strava-export.gpx"));
    expect(validated.issues).toEqual([]);
    const gaps = detectGaps(validated.data);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      kind: "time-gap",
      severity: "suspect", // 310 s < 10 × 120 s severe threshold
      elapsedMs: 310_000,
      status: "new",
    });
    // The spatial jump stays below the speed-anomaly threshold: pure
    // time evidence, exactly like a real paused-watch recording.
    expect(gaps[0].impliedSpeed).toBeDefined();
    expect(gaps[0].impliedSpeed!).toBeLessThan(25 / 3.6);
  });

  it("computes distance stats and round-trips the Strava type code", () => {
    const data = parseFixture("strava-export.gpx");
    expect(originalDistanceStats(data).totalDistanceM).toBeGreaterThan(400);
    const xml = exportGpxIdentity(data, makeIo());
    expect(xml).toContain("<type>9</type>");
    const reparsed = parseGpx(xml, makeIo());
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.data.tracks[0].type).toBe("9");
      expect(reparsed.data.segments[0].points).toHaveLength(20);
    }
  });
});

describe("strava-original-garmin.gpx — Strava 'Export original' (device file)", () => {
  it("parses: device creator, named type, every point's hr/cad captured verbatim", () => {
    const data = parseFixture("strava-original-garmin.gpx");
    expect(data.fileMeta).toMatchObject({
      creator: "Garmin Forerunner 265",
      version: "1.1",
      name: "QC Circle Morning Run",
      time: Date.parse("2026-09-21T21:30:00Z"),
    });
    expect(data.tracks[0]).toMatchObject({
      name: "QC Circle Morning Run",
      type: "running", // Garmin uses the word, not Strava's numeric code
    });
    expect(data.segments[0].points).toHaveLength(18);
    expect(data.issues).toEqual([]);

    // Every point carries the gpxtpx extension snapshot (ele, time, extra).
    const points = data.segments[0].points;
    for (const point of points) {
      const extras = point.raw.children.filter((c) => c.kind === "extra");
      expect(extras).toHaveLength(1);
      expect(extras[0].xml).toContain("gpxtpx:TrackPointExtension");
      expect(extras[0].xml).toContain("gpxtpx:hr>");
      expect(extras[0].xml).toContain("gpxtpx:cad>");
    }
    // Anchored values still parsed despite the prefixed namespace.
    expect(points.every((p) => p.ele !== undefined && p.time !== undefined)).toBe(
      true,
    );
  });

  it("validates cleanly and detects exactly one severe time-gap (the 30 min hole)", () => {
    const validated = validateGpx(parseFixture("strava-original-garmin.gpx"));
    expect(validated.issues).toEqual([]);
    const gaps = detectGaps(validated.data);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      kind: "time-gap",
      severity: "severe", // 1810 s ≥ 10 × 120 s
      elapsedMs: 1_810_000,
      status: "new",
    });
    expect(gaps[0].impliedSpeed).toBeDefined();
    expect(gaps[0].impliedSpeed!).toBeLessThan(25 / 3.6);
  });

  it("round-trips the Garmin extensions with namespaces intact", () => {
    const data = parseFixture("strava-original-garmin.gpx");
    const xml = exportGpxIdentity(data, makeIo());
    expect(xml).toContain("gpxtpx:TrackPointExtension");
    expect(xml).toContain("gpxtpx:hr");
    const reparsed = parseGpx(xml, makeIo());
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      const points = reparsed.data.segments[0].points;
      expect(points).toHaveLength(18);
      expect(points.every((p) => p.ele !== undefined)).toBe(true);
    }
  });
});

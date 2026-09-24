// @vitest-environment jsdom
/**
 * Demo sample integrity (download/demo-*.gpx).
 *
 * The two committed demo samples exist for MANUAL testing (upload them
 * through the real UI; regenerate with `bun scripts/generate-demo-gpx.ts`).
 * They must keep exhibiting exactly the scenario their names claim —
 * otherwise the manual-testing expectations go stale silently. These tests
 * run the samples through the REAL parser and gap detector, so a manual
 * tester can trust the printed expectations (gap count, kind, severity).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { detectGaps } from "@/features/gpx/detectGaps";
import { makeIo } from "./helpers/gpxTestUtils";
import type { OriginalTrackData } from "@/types/domain";

const DEMO_DIR = join(process.cwd(), "download");

/** Parse a demo sample that is expected to succeed; throws otherwise. */
function parseDemo(name: string): OriginalTrackData {
  const result = parseGpx(readFileSync(join(DEMO_DIR, name), "utf8"), makeIo());
  if (!result.ok) {
    throw new Error(
      `demo sample "${name}" unexpectedly failed to parse: ${JSON.stringify(result.error)}`,
    );
  }
  return result.data;
}

describe("demo-qc-run-with-gaps.gpx", () => {
  it("parses cleanly — one track, one segment, 1260 timed points, no issues", () => {
    const data = parseDemo("demo-qc-run-with-gaps.gpx");
    expect(data.issues).toEqual([]);
    expect(data.tracks).toHaveLength(1);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(1260);
    expect(data.fileMeta.name).toBe("QC Circle Morning Run (demo - 2 GPS gaps)");
  });

  it("detects exactly two time-gaps — severe 26 min first, then suspect 4 min", () => {
    const gaps = detectGaps(parseDemo("demo-qc-run-with-gaps.gpx"));
    expect(gaps).toHaveLength(2);

    // Sorted severe -> suspect (detector contract).
    expect(gaps[0]).toMatchObject({
      kind: "time-gap",
      severity: "severe",
      elapsedMs: 1_561_000, // 26 min hole + 1 s of normal cadence
      status: "new",
    });
    expect(gaps[1]).toMatchObject({
      kind: "time-gap",
      severity: "suspect",
      elapsedMs: 241_000, // 4 min hole + 1 s
      status: "new",
    });

    // The spatial jumps stay below the speed-anomaly threshold (25 km/h):
    // both gaps are pure time evidence, like real paused-watch recordings.
    expect(gaps[0].impliedSpeed).toBeDefined();
    expect(gaps[0].impliedSpeed!).toBeLessThan(25 / 3.6);
    expect(gaps[1].impliedSpeed).toBeDefined();
    expect(gaps[1].impliedSpeed!).toBeLessThan(25 / 3.6);

    // Anchor points must exist for the reconstruction editor.
    expect(gaps[0].before.pointId).not.toBe(gaps[0].after.pointId);
    expect(gaps[1].before.pointId).not.toBe(gaps[1].after.pointId);
  });
});

describe("demo-clean-run.gpx", () => {
  it("parses cleanly and detects zero gaps — the happy path", () => {
    const data = parseDemo("demo-clean-run.gpx");
    expect(data.issues).toEqual([]);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(900);
    expect(detectGaps(data)).toEqual([]);
  });
});

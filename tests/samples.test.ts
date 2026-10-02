// @vitest-environment jsdom
/**
 * Phase 12 — bundled sample integrity (src/samples, §EE 12.1).
 *
 * The samples ship inside the app as "Try a sample" payloads, so they
 * must keep exhibiting exactly what their summaries claim — through
 * the REAL parser and gap detector, like tests/demo-samples.test.ts
 * pins the manual demo files. If a regeneration changes behavior,
 * these tests fail before the UX quietly lies.
 */

import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { detectGaps } from "@/features/gpx/detectGaps";
import { makeSampleFile, SAMPLES } from "@/samples";
import { makeIo } from "./helpers/gpxTestUtils";
import type { OriginalTrackData } from "@/types/domain";

/** Parse a sample through the real pipeline; throws on failure. */
async function parseSample(id: "repair-ride" | "clean-run" | "merge-a" | "merge-b"): Promise<OriginalTrackData> {
  const result = parseGpx(await makeSampleFile(id).text(), makeIo());
  if (!result.ok) {
    throw new Error(
      `sample "${id}" unexpectedly failed to parse: ${JSON.stringify(result.error)}`,
    );
  }
  return result.data;
}

describe("sample registry", () => {
  it("names every sample honestly (fileName says 'sample')", () => {
    for (const definition of Object.values(SAMPLES)) {
      expect(definition.fileName).toContain("sample");
      expect(definition.summary.length).toBeGreaterThan(10);
    }
  });

  it("builds real Files with the GPX mime type and content", async () => {
    const file = makeSampleFile("repair-ride");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe(SAMPLES["repair-ride"].fileName);
    expect(file.type).toBe("application/gpx+xml");
    const text = await file.text();
    expect(text).toContain("<gpx");
    expect(text.length).toBeGreaterThan(1000);
  });
});

describe("sample-repair-ride (repair + recovery sample)", () => {
  it("parses cleanly — one track, one segment, 400 timed points, no issues", async () => {
    const data = await parseSample("repair-ride");
    expect(data.issues).toEqual([]);
    expect(data.tracks).toHaveLength(1);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(400);
    // Every point carries a timestamp (the recovery tool's requirement).
    expect(data.segments[0].points.every((p) => p.time !== undefined)).toBe(
      true,
    );
  });

  it("detects exactly two time-gaps: one suspect, one severe", async () => {
    const data = await parseSample("repair-ride");
    const gaps = detectGaps(data);
    const timeGaps = gaps.filter((gap) => gap.kind === "time-gap");
    expect(timeGaps).toHaveLength(2);
    expect(timeGaps.some((gap) => gap.severity === "suspect")).toBe(true);
    expect(timeGaps.some((gap) => gap.severity === "severe")).toBe(true);
  });
});

describe("sample-clean-run (share sample)", () => {
  it("parses cleanly with no gaps and no issues", async () => {
    const data = await parseSample("clean-run");
    expect(data.issues).toEqual([]);
    expect(detectGaps(data)).toHaveLength(0);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(220);
  });
});

describe("sample merge pair (merge sample)", () => {
  it("is two parseable one-track files with no issues", async () => {
    for (const id of ["merge-a", "merge-b"] as const) {
      const data = await parseSample(id);
      expect(data.tracks, `${id} tracks`).toHaveLength(1);
      expect(data.issues, `${id} issues`).toEqual([]);
    }
  });

  it("part 2 starts 20 minutes (+ one interval) after part 1 ends", async () => {
    const a = await parseSample("merge-a");
    const b = await parseSample("merge-b");
    const aLast = a.segments[0].points.at(-1);
    const bFirst = b.segments[0].points[0];
    expect(aLast?.time).toBeDefined();
    expect(bFirst.time).toBeDefined();
    // The generator's coffee stop: 20 min between the files, plus one
    // 3 s recording interval (part 2's clock starts after one tick).
    expect(bFirst.time! - aLast!.time!).toBe(20 * 60 * 1000 + 3 * 1000);
  });
});

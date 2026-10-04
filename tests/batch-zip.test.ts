// @vitest-environment jsdom
/**
 * Unit tests — the batch ZIP + manifest (features/batch/batchZip.ts,
 * Phase 18). The §EE 18.2 verification: "ZIP integrity tests".
 *
 *   - the archive round-trips through fflate's unzipSync with every
 *     entry byte-identical to what the builder holds;
 *   - one repaired GPX per file + MANIFEST.txt, in queue order;
 *   - duplicate stems get " - 2" suffixes — nothing overwritten;
 *   - the manifest's per-file sentences use the working meta counts
 *     (the same numbers the GPX repair note carries), files with no
 *     edits say "no changes", and the applied preset line names the
 *     chain's fix labels;
 *   - the exported GPX IS the working copy: deleted points absent,
 *     the honest note present — the same pipeline a single-file
 *     export runs (a batch export and a manual export of the same
 *     work can never disagree).
 */

import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";
import {
  buildBatchZipEntries,
  buildManifest,
  type BatchExportItem,
} from "@/features/batch/batchZip";
import { deepValidate } from "@/features/validation/deepValidate";
import { editFromPlan, planFix } from "@/features/validation/fixes";
import { applyWorkingEdits } from "@/features/validation/workingCopy";
import { makeIo, parseFixture } from "./helpers/gpxTestUtils";
import type { WorkingEdit } from "@/types/domain";

const NO_TIMING = {
  fileTiming: { startMs: null, totalDurationMs: null },
  fileHasTimingData: true,
};

/** The store's apply path: plan → edit, per fix (the batch flow). */
function fixesFor(
  fixture: string,
  kinds: readonly Parameters<typeof planFix>[2][],
): { data: ReturnType<typeof parseFixture>; edits: WorkingEdit[] } {
  const data = parseFixture(fixture);
  let view = data;
  const log: WorkingEdit[] = [];
  let seq = 0;
  for (const kind of kinds) {
    const report = deepValidate(view);
    const plan = planFix(view, report, kind);
    if (!plan) continue;
    seq += 1;
    log.push(editFromPlan(plan, `batch/${seq}`, 1_000));
    view = applyWorkingEdits(data, log);
  }
  return { data, edits: log };
}

const SETTINGS = { mode: "structure-preserving" as const, prettyPrint: false };

describe("batch ZIP integrity", () => {
  it("round-trips through unzipSync with every entry intact + a manifest", () => {
    const clean = parseFixture("valid-1.1.gpx");
    const items: BatchExportItem[] = [
      { fileName: "ride.gpx", data: clean, edits: [] },
    ];
    const { entries } = buildBatchZipEntries(items, SETTINGS, makeIo());
    expect(entries.map((e) => e.name)).toEqual([
      "ride.repaired.gpx",
      "MANIFEST.txt",
    ]);

    // The hook's exact construction: zipSync over the built entries.
    const zipped = zipSync(
      Object.fromEntries(entries.map((e) => [e.name, e.bytes])),
      { level: 6 },
    );
    const unzipped = unzipSync(zipped);
    expect(Object.keys(unzipped).sort()).toEqual([
      "MANIFEST.txt",
      "ride.repaired.gpx",
    ]);
    // Byte-identical after the round trip.
    const gpxBytes = unzipped["ride.repaired.gpx"]!;
    expect(Array.from(gpxBytes)).toEqual(
      Array.from(entries[0]!.bytes as Uint8Array),
    );
    const text = new TextDecoder().decode(gpxBytes);
    expect(text).toContain("<gpx");
  });

  it("suffixes duplicate stems — nothing is silently overwritten", () => {
    const data = parseFixture("valid-1.1.gpx");
    const items: BatchExportItem[] = [
      { fileName: "ride.gpx", data, edits: [] },
      { fileName: "ride.gpx", data, edits: [] },
      { fileName: "ride.gpx", data, edits: [] },
    ];
    const { entries } = buildBatchZipEntries(items, SETTINGS, makeIo());
    expect(entries.map((e) => e.name)).toEqual([
      "ride.repaired.gpx",
      "ride.repaired - 2.gpx",
      "ride.repaired - 3.gpx",
      "MANIFEST.txt",
    ]);
  });

  it("exports the WORKING copy: deletions absent, the honest note present", () => {
    const { data, edits } = fixesFor("deep-defects.gpx", [
      "remove-spikes",
      "smooth-elevations",
    ]);
    expect(edits.length).toBeGreaterThan(0);

    const { entries } = buildBatchZipEntries(
      [{ fileName: "deep-defects.gpx", data, edits }],
      SETTINGS,
      makeIo(),
    );
    const text = new TextDecoder().decode(entries[0]!.bytes as Uint8Array);

    // The fix actually changed the working copy → the export must say so.
    expect(text).toContain("Repaired with GPX Repair Studio");
    expect(text).toMatch(/point[s]? (was|were) removed/);

    // The manifest's counts are the SAME meta the note carries.
    const manifest = new TextDecoder().decode(
      entries.at(-1)!.bytes as Uint8Array,
    );
    expect(manifest).toContain("— deep-defects.gpx");
    expect(manifest).toMatch(/point[s]? (was|were) removed/);
    expect(manifest).toContain("export: deep-defects.repaired.gpx");
  });

  it("an unedited file exports unchanged and the manifest says so plainly", () => {
    const data = parseFixture("valid-1.1.gpx");
    const { entries } = buildBatchZipEntries(
      [{ fileName: "valid-1.1.gpx", data, edits: [] }],
      SETTINGS,
      makeIo(),
    );
    const manifest = new TextDecoder().decode(
      entries.at(-1)!.bytes as Uint8Array,
    );
    expect(manifest).toContain(
      "working copy: no changes (exported as recorded)",
    );
    expect(manifest).toContain("0 of 1 file changed");
  });

  it("the applied-preset line names the chain's fix labels", () => {
    const { data, edits } = fixesFor("deep-defects.gpx", ["remove-spikes"]);
    const { entries } = buildBatchZipEntries(
      [
        {
          fileName: "deep-defects.gpx",
          data,
          edits,
          presetName: "Spike & outlier sweep",
        },
      ],
      SETTINGS,
      makeIo(),
    );
    const manifest = new TextDecoder().decode(
      entries.at(-1)!.bytes as Uint8Array,
    );
    expect(manifest).toContain("applied: Spike & outlier sweep —");
    expect(edits[0]!.label.length).toBeGreaterThan(0);
  });
});

describe("buildManifest (direct)", () => {
  const data = parseFixture("valid-1.1.gpx");

  it("counts files and findings honestly (header + footer)", () => {
    const manifest = buildManifest(
      [
        { fileName: "a.gpx", data, edits: [] },
        { fileName: "b.gpx", data, edits: [] },
      ],
      [
        {
          exportName: "a.repaired.gpx",
          deletedPoints: 0,
          sortedSegments: 0,
          smoothedElevations: 0,
          changed: false,
        },
        {
          exportName: "b.repaired.gpx",
          deletedPoints: 4,
          sortedSegments: 1,
          smoothedElevations: 2,
          changed: true,
        },
      ],
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(manifest).toContain("2 files");
    expect(manifest).toContain("Exported 2026-01-01T00:00:00.000Z");
    expect(manifest).toContain("1 of 2 files changed");
    expect(manifest).toContain("4 points were removed");
    expect(manifest).toContain(
      "1 segment was reordered by timestamp (order is estimated)",
    );
    expect(manifest).toContain("2 elevations were smoothed");
    expect(manifest).toContain("no file was uploaded anywhere");
  });

  it("states the recorded point count per file", () => {
    let points = 0;
    for (const segment of data.segments) points += segment.points.length;
    const manifest = buildManifest(
      [{ fileName: "valid-1.1.gpx", data, edits: [] }],
      [
        {
          exportName: "x.repaired.gpx",
          deletedPoints: 0,
          sortedSegments: 0,
          smoothedElevations: 0,
          changed: false,
        },
      ],
      new Date(0),
    );
    expect(manifest).toContain(`parsed: ${points} recorded points`);
  });
});

// @vitest-environment jsdom
/**
 * Export × working-copy round-trips (Phase 13, §EE verification: "e2e
 * full find→preview→fix→export flow" — the unit half).
 *
 * Pins the exporter's honesty with confirmed fixes on the working copy:
 * deleted points are absent from the bytes, sorted segments emit in
 * time order, smoothed elevations carry the gpxr:modified marker, the
 * metadata note discloses every change, and ANY edit upgrades a 1.0
 * file to 1.1. Re-parsing the export keeps the fixes (the round trip).
 */

import { describe, expect, it } from "vitest";
import { makeIo, parseFixture, parseXml } from "./helpers/gpxTestUtils";
import { exportGpxIdentity, exportGpxRepaired } from "@/features/gpx/exportGpx";
import { deepValidate } from "@/features/validation/deepValidate";
import { editFromPlan, planFix } from "@/features/validation/fixes";
import { applyWorkingEdits } from "@/features/validation/workingCopy";
import { mergeRepairs } from "@/features/reconstruction/merge";
import type { WorkingEdit } from "@/types/domain";

const pid = (i: number) => `t0s0:${i}` as import("@/types/domain").PointId;

const NO_TIMING = {
  fileTiming: { startMs: null, totalDurationMs: null },
  fileHasTimingData: true,
};

/** Serialize a working view with the plain settings (Mode A, no pretty). */
function serialize(view: ReturnType<typeof applyWorkingEdits>): string {
  return exportGpxRepaired(
    view,
    mergeRepairs(view, [], NO_TIMING),
    { mode: "structure-preserving", prettyPrint: false },
    makeIo(),
  );
}

/** The store's apply path: plan \u2192 edit \u2192 working view, per fix. */
function applyPlans(
  data: ReturnType<typeof parseFixture>,
  kinds: readonly Parameters<typeof planFix>[2][],
): ReturnType<typeof applyWorkingEdits> {
  let view = data;
  const log: WorkingEdit[] = [];
  let seq = 0;
  for (const kind of kinds) {
    const report = deepValidate(view);
    const plan = planFix(view, report, kind);
    if (!plan) continue;
    seq += 1;
    log.push(editFromPlan(plan, `fix/${seq}`, 1_000));
    view = applyWorkingEdits(data, log); // cumulative, like the store
  }
  return view;
}

describe("export with working-copy fixes", () => {
  const data = parseFixture("deep-defects.gpx");

  it("deletions: the removed points are absent from the bytes", () => {
    const view = applyPlans(data, ["remove-spikes"]);
    const xml = serialize(view);
    expect(xml).not.toContain(`:${pid(10)}"`);
    expect((xml.match(/<trkpt/g) ?? []).length).toBe(43);
  });

  it("sort: points emit in timestamp order", () => {
    const view = applyPlans(data, ["sort-by-time"]);
    const xml = serialize(view);
    const times = [...xml.matchAll(/<time>([^<]+)<\/time>/g)].map(
      (m) => new Date(m[1]).getTime(),
    );
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("smoothing: the replaced elevation + gpxr:modified marker emit", () => {
    const view = applyPlans(data, ["smooth-elevations"]);
    const xml = serialize(view);
    expect(xml).toContain("gpxr:modified");
    expect(xml).toContain('eleMethod="interpolated"');
    // The recorded 118 m spike is gone from the bytes.
    expect(xml).not.toContain("<ele>118</ele>");
  });

  it("the metadata note discloses the working copy's changes", () => {
    const view = applyPlans(data, [
      "remove-spikes",
      "sort-by-time",
      "smooth-elevations",
    ]);
    const xml = serialize(view);
    expect(xml).toContain("Working copy:");
    expect(xml).toContain("2 damaged points were removed");
    expect(xml).toContain("1 segment was reordered by timestamp");
    expect(xml).toContain("1 elevation was smoothed");
  });

  it("a pristine export keeps the identity layout (no note, no creator)", () => {
    const xml = serialize(data);
    expect(xml).not.toContain("Working copy:");
    expect(xml).not.toContain('creator="GPX Repair Studio"');
    expect(xml).toContain('creator="Deep Defects Generator 1"');
  });

  it("the round trip: re-parsing the export keeps the fixes", () => {
    const view = applyPlans(data, ["remove-spikes", "smooth-elevations"]);
    const xml = serialize(view);
    const reparsed = parseXml(xml);
    expect(reparsed.segments[0].points).toHaveLength(43);
    // The smoothed elevation survived with its value; the marker rides
    // the verbatim extension snapshot (ids re-index after the deletions
    // — the export's points number 43, so original point 20 is now 18).
    const smoothed = reparsed.segments[0].points.find((p) =>
      p.raw.children.some((c) => c.kind === "extra"),
    );
    expect(smoothed).toBeDefined();
    expect(smoothed?.ele).toBeGreaterThanOrEqual(49);
    expect(smoothed?.ele).toBeLessThanOrEqual(51);
  });
});

describe("export upgrades with edits (GPX 1.0 input)", () => {
  const XML_10 =
    `<?xml version="1.0"?><gpx version="1.0" creator="Old Watch" ` +
    `xmlns="http://www.topografix.com/GPX/1/0"><trk><trkseg>` +
    `<trkpt lat="52.5" lon="13.4"><ele>40</ele><time>2024-05-01T10:00:00Z</time></trkpt>` +
    `<trkpt lat="52.5001" lon="13.4"><ele>41</ele><time>2024-05-01T10:00:03Z</time></trkpt>` +
    `<trkpt lat="52.5002" lon="13.4"><ele>42</ele><time>2024-05-01T10:00:06Z</time></trkpt>` +
    `</trkseg></trk></gpx>`;

  it("an edit forces the 1.1 upgrade + creator + note", () => {
    const data = parseXml(XML_10);
    expect(data.fileMeta.version).toBe("1.0");
    const view = applyWorkingEdits(data, [
      {
        id: "fix/1",
        label: "Remove 1 speed spike",
        reason: "spike",
        appliedAt: 1,
        entries: [{ kind: "point-deletion", pointId: pid(1) }],
      },
    ]);
    const xml = serialize(view);
    expect(xml).toContain('version="1.1"');
    expect(xml).toContain('creator="GPX Repair Studio"');
    expect(xml).toContain("Original creator: Old Watch.");
  });

  it("without edits the 1.0 file stays 1.0 (identity)", () => {
    const data = parseXml(XML_10);
    const xml = serialize(data);
    expect(xml).toContain('version="1.0"');
    expect(xml).toContain('creator="Old Watch"');
    // And equals the identity export byte-for-byte.
    const identity = exportGpxIdentity(data, makeIo());
    expect(xml).toBe(identity);
  });
});

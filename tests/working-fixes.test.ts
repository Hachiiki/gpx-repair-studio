// @vitest-environment jsdom
/**
 * Fix planning + preset chains (Phase 13, §EE 13.4/13.5 verification:
 * "fix round-trip unit tests" + "preset integration tests").
 *
 * Pins: every fix plans from the CURRENT report only when it has work;
 * the entries are exactly the previewed ones; applying them clears the
 * finding (detector → fix → re-detect is clean); presets chain over
 * intermediate states; nothing applies without the caller's decision.
 */

import { describe, expect, it } from "vitest";
import { parseFixture } from "./helpers/gpxTestUtils";
import { deepValidate } from "@/features/validation/deepValidate";
import {
  editFromPlan,
  planFix,
  planPreset,
  PRESETS,
  reasonOfFix,
} from "@/features/validation/fixes";
import { applyWorkingEdits } from "@/features/validation/workingCopy";

const pid = (i: number) => `t0s0:${i}`;

/** Apply a plan the way the store would and re-run the detectors. */
function appliedAndRevalidated(
  data: ReturnType<typeof parseFixture>,
  plans: readonly ReturnType<typeof planFix>[],
) {
  let view = data;
  for (const [index, plan] of plans.entries()) {
    if (!plan) continue;
    view = applyWorkingEdits(view, [
      editFromPlan(plan, `fix/${index + 1}`, 1_000),
    ]);
  }
  return { view, report: deepValidate(view) };
}

describe("planFix — each fix targets its own finding", () => {
  const data = parseFixture("deep-defects.gpx");
  const report = deepValidate(data);

  it("plans the teleport removal (both flagged points)", () => {
    const plan = planFix(data, report, "remove-spikes");
    expect(plan?.entries).toEqual([
      { kind: "point-deletion", pointId: pid(10) },
      { kind: "point-deletion", pointId: pid(11) },
    ]);
    expect(plan?.summary[0]).toContain("2 recorded points leave");
  });

  it("plans keep-first dedupe (the anchor survives)", () => {
    const plan = planFix(data, report, "dedupe");
    expect(plan?.entries.map((e) => (e as { pointId: string }).pointId)).toEqual(
      [pid(12), pid(13), pid(14)],
    );
  });

  it("plans the sort with the untimed-points disclosure", () => {
    const plan = planFix(data, report, "sort-by-time");
    expect(plan?.entries).toEqual([{ kind: "segment-sort", segmentId: "t0s0" }]);
    expect(plan?.summary.join(" ")).not.toContain("without a usable timestamp");
  });

  it("plans the smoothing with the interpolated replacement", () => {
    const plan = planFix(data, report, "smooth-elevations");
    expect(plan?.entries).toHaveLength(1);
    const entry = plan?.entries[0] as {
      kind: string;
      pointId: string;
      ele: number;
      originalEle: number;
    };
    expect(entry.kind).toBe("elevation-override");
    expect(entry.pointId).toBe(pid(20));
    expect(entry.originalEle).toBe(118);
    // Interpolated between the ~50 m neighbours.
    expect(entry.ele).toBeGreaterThanOrEqual(49);
    expect(entry.ele).toBeLessThanOrEqual(52);
  });

  it("plans the drift collapse (first point of the run survives)", () => {
    const plan = planFix(data, report, "remove-drift");
    const ids = plan?.entries.map((e) => (e as { pointId: string }).pointId);
    expect(ids).toHaveLength(14);
    expect(ids).not.toContain(pid(21));
    expect(ids?.[0]).toBe(pid(22));
  });

  it("returns null when the report has nothing for the fix", () => {
    const clean = parseFixture("multi-segment.gpx");
    const cleanReport = deepValidate(clean);
    expect(planFix(clean, cleanReport, "remove-spikes")).toBeNull();
    expect(planFix(clean, cleanReport, "dedupe")).toBeNull();
    expect(planFix(clean, cleanReport, "sort-by-time")).toBeNull();
    expect(planFix(clean, cleanReport, "smooth-elevations")).toBeNull();
    expect(planFix(clean, cleanReport, "remove-drift")).toBeNull();
  });
});

describe("planFix — thin (the resample slot)", () => {
  const data = parseFixture("deep-defects.gpx");
  const report = deepValidate(data);

  it("thins to the requested spacing, keeping segment endpoints", () => {
    const plan = planFix(data, report, "thin", {}, { thinSpacingM: 60 });
    expect(plan).not.toBeNull();
    const ids = plan?.entries.map((e) => (e as { pointId: string }).pointId);
    // Clean steps are 33 m: every other point goes; first/last stay.
    expect(ids).not.toContain(pid(0));
    expect(ids).not.toContain(pid(44));
    expect(ids).toContain(pid(1));
    expect(ids).not.toContain(pid(2));
  });

  it("keeps every point at a spacing nothing satisfies", () => {
    // The closest pair in the fixture is ~0.14 m apart; 0.1 m keeps all.
    const plan = planFix(data, report, "thin", {}, { thinSpacingM: 0.1 });
    expect(plan).toBeNull();
  });
});

describe("fix round-trips — the finding clears after the fix", () => {
  const data = parseFixture("deep-defects.gpx");

  it("remove-spikes clears the speed findings", () => {
    const report = deepValidate(data);
    const { view, report: after } = appliedAndRevalidated(data, [
      planFix(data, report, "remove-spikes"),
    ]);
    expect(view.segments[0].points).toHaveLength(43);
    expect(after.issues.find((i) => i.kind === "speed-spike")).toBeUndefined();
  });

  it("dedupe clears the duplicate findings", () => {
    const report = deepValidate(data);
    const { view, report: after } = appliedAndRevalidated(data, [
      planFix(data, report, "dedupe"),
    ]);
    expect(view.segments[0].points).toHaveLength(42);
    expect(
      after.issues.find((i) => i.kind === "duplicate-cluster"),
    ).toBeUndefined();
  });

  it("sort-by-time clears the monotonicity findings", () => {
    const report = deepValidate(data);
    const { report: after } = appliedAndRevalidated(data, [
      planFix(data, report, "sort-by-time"),
    ]);
    expect(
      after.issues.find((i) => i.kind === "non-monotonic-time"),
    ).toBeUndefined();
  });

  it("smooth-elevations clears the elevation findings", () => {
    const report = deepValidate(data);
    const { report: after } = appliedAndRevalidated(data, [
      planFix(data, report, "smooth-elevations"),
    ]);
    expect(
      after.issues.find((i) => i.kind === "elevation-outlier"),
    ).toBeUndefined();
  });

  it("remove-drift clears the drift findings", () => {
    const report = deepValidate(data);
    const { view, report: after } = appliedAndRevalidated(data, [
      planFix(data, report, "remove-drift"),
    ]);
    expect(view.segments[0].points).toHaveLength(31);
    expect(after.issues.find((i) => i.kind === "gps-drift")).toBeUndefined();
  });
});

describe("planPreset — detector→fix chains", () => {
  const data = parseFixture("deep-defects.gpx");

  it("ships the four named bundles", () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      "drift-cleanup",
      "dedupe-sort",
      "resample-thin",
      "spike-sweep",
    ]);
  });

  it("drift-cleanup chains drift removal then dedupe over the RESULT", () => {
    const report = deepValidate(data);
    const plans = planPreset(data, report, "drift-cleanup");
    expect(plans).not.toBeNull();
    expect(plans?.map((p) => p.kind)).toEqual(["remove-drift", "dedupe"]);
    // Step 2 planned against the post-drift-removal state: the duplicate
    // cluster (12-14) still stands, so dedupe still has work.
    expect(plans?.[1].entries).toHaveLength(3);
  });

  it("dedupe-sort chains dedupe then sort", () => {
    const report = deepValidate(data);
    const plans = planPreset(data, report, "dedupe-sort");
    expect(plans?.map((p) => p.kind)).toEqual(["dedupe", "sort-by-time"]);
  });

  it("resample-thin is the single thin step", () => {
    const report = deepValidate(data);
    const plans = planPreset(data, report, "resample-thin");
    expect(plans?.map((p) => p.kind)).toEqual(["thin"]);
  });

  it("spike-sweep chains spike removal then elevation smoothing", () => {
    const report = deepValidate(data);
    const plans = planPreset(data, report, "spike-sweep");
    expect(plans?.map((p) => p.kind)).toEqual([
      "remove-spikes",
      "smooth-elevations",
    ]);
  });

  it("a clean file yields no plans (the whole chain is a no-op)", () => {
    const clean = parseFixture("multi-segment.gpx");
    const cleanReport = deepValidate(clean);
    expect(planPreset(clean, cleanReport, "drift-cleanup")).toBeNull();
    expect(planPreset(clean, cleanReport, "spike-sweep")).toBeNull();
  });

  it("applying a preset's steps clears its findings (integration)", () => {
    const report = deepValidate(data);
    const plans = planPreset(data, report, "drift-cleanup") ?? [];
    const { view, report: after } = appliedAndRevalidated(data, plans);
    expect(view.segments[0].points).toHaveLength(28); // 45 - 14 drift - 3 dupes
    expect(after.issues.find((i) => i.kind === "gps-drift")).toBeUndefined();
    expect(
      after.issues.find((i) => i.kind === "duplicate-cluster"),
    ).toBeUndefined();
    // The other damage types are untouched by this preset's contract.
    expect(after.issues.find((i) => i.kind === "speed-spike")?.count).toBe(2);
  });
});

describe("editFromPlan — the log entry", () => {
  it("carries the plan's entries with the fix's reason", () => {
    const data = parseFixture("deep-defects.gpx");
    const report = deepValidate(data);
    const plan = planFix(data, report, "remove-spikes");
    const entry = editFromPlan(plan!, "fix/7", 12345);
    expect(entry).toEqual({
      id: "fix/7",
      label: plan?.label,
      reason: "spike",
      appliedAt: 12345,
      entries: plan?.entries,
    });
    expect(reasonOfFix("sort-by-time")).toBe("sort");
    expect(reasonOfFix("thin")).toBe("thin");
  });
});

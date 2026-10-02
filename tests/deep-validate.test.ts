// @vitest-environment jsdom
/**
 * Deep-validation detector goldens (Phase 13, §EE 13.1 verification:
 * "detector goldens on synthetic defective files").
 *
 * The committed fixture `deep-defects.gpx` carries exactly one instance
 * of every damage type (see scripts/gen-deep-defects-fixture.py for the
 * authoritative geometry). These tests pin WHAT the detectors find —
 * kinds, counts, and the exact point ids — plus the option boundaries
 * (thresholds move findings) and the honest boundaries (damage the
 * checks must NOT flag).
 */

import { describe, expect, it } from "vitest";
import { parseFixture, parseXml } from "./helpers/gpxTestUtils";
import {
  deepValidate,
  DEFAULT_DEEP_OPTIONS,
  fixKindsForIssue,
} from "@/features/validation/deepValidate";

const FIXTURE = "deep-defects.gpx";

/** The point ids of the fixture's single segment (`t0s0:{i}`). */
function pid(i: number): string {
  return `t0s0:${i}`;
}

function kinds(report: ReturnType<typeof deepValidate>): string[] {
  return report.issues.map((issue) => issue.kind);
}

describe("deepValidate goldens on the defective fixture", () => {
  const data = parseFixture(FIXTURE);

  it("parses with 45 points in one segment", () => {
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].points).toHaveLength(45);
  });

  it("finds every damage type with the exact counts", () => {
    const report = deepValidate(data);
    expect(report.totalCount).toBe(23);
    expect(kinds(report)).toEqual([
      "speed-spike",
      "duplicate-cluster",
      "gps-drift",
      "elevation-outlier",
      "non-monotonic-time",
      "missing-elevation",
    ]);
  });

  it("flags the teleport pair (later point of each >130 km/h leg)", () => {
    const report = deepValidate(data);
    const issue = report.issues.find((i) => i.kind === "speed-spike");
    expect(issue?.severity).toBe("error");
    expect(issue?.count).toBe(2);
    expect(issue?.points.map((p) => p.pointId)).toEqual([pid(10), pid(11)]);
  });

  it("flags the near-duplicate cluster but not its anchor", () => {
    const report = deepValidate(data);
    const issue = report.issues.find((i) => i.kind === "duplicate-cluster");
    expect(issue?.count).toBe(3);
    expect(issue?.points.map((p) => p.pointId)).toEqual([
      pid(12),
      pid(13),
      pid(14),
    ]);
  });

  it("flags the drift run's members but keeps its first point", () => {
    const report = deepValidate(data);
    const issue = report.issues.find((i) => i.kind === "gps-drift");
    expect(issue?.count).toBe(14);
    expect(issue?.points.map((p) => p.pointId)).toEqual(
      Array.from({ length: 14 }, (_, k) => pid(22 + k)),
    );
  });

  it("flags the elevation spike exactly once", () => {
    const report = deepValidate(data);
    const issue = report.issues.find((i) => i.kind === "elevation-outlier");
    expect(issue?.count).toBe(1);
    expect(issue?.points.map((p) => p.pointId)).toEqual([pid(20)]);
  });

  it("counts the two backwards time transitions with their segments", () => {
    const report = deepValidate(data);
    const issue = report.issues.find((i) => i.kind === "non-monotonic-time");
    expect(issue?.count).toBe(2);
    expect(issue?.points.map((p) => p.pointId)).toEqual([pid(15), pid(18)]);
    expect(issue?.segments).toEqual(["t0s0"]);
  });

  it("reports the missing-elevation run once, listing its points", () => {
    const report = deepValidate(data);
    const issue = report.issues.find((i) => i.kind === "missing-elevation");
    expect(issue?.severity).toBe("info");
    expect(issue?.count).toBe(1);
    expect(issue?.points).toHaveLength(6);
    expect(issue?.points[0].pointId).toBe(pid(36));
    expect(issue?.points[5].pointId).toBe(pid(41));
  });
});

describe("deepValidate honest boundaries", () => {
  it("reports nothing on a clean, dense recording", () => {
    const data = parseFixture("multi-segment.gpx");
    const report = deepValidate(data);
    expect(report.issues).toEqual([]);
    expect(report.totalCount).toBe(0);
  });

  it("does not flag parse-level damage (zero-coord stays the Phase 1 report's)", () => {
    // bad-coords carries Null-Island / invalid points — deep checks skip
    // unusable coordinates rather than re-reporting parse damage.
    const data = parseFixture("bad-coords.gpx");
    const report = deepValidate(data);
    expect(kinds(report)).not.toContain("speed-spike");
  });

  it("keeps legs within segments (a break is the recorder's own cut)", () => {
    const data = parseFixture("segment-break-time-gap.gpx");
    const report = deepValidate(data);
    expect(kinds(report)).not.toContain("speed-spike");
  });
});

describe("deepValidate option boundaries", () => {
  const data = parseFixture(FIXTURE);

  it("a higher spike threshold clears the teleport findings", () => {
    const report = deepValidate(data, { speedSpikeKmh: 2000 });
    expect(kinds(report)).not.toContain("speed-spike");
  });

  it("a larger duplicate window still keeps the cluster (3 members, window 5)", () => {
    const report = deepValidate(data, { duplicateWindow: 5 });
    const issue = report.issues.find((i) => i.kind === "duplicate-cluster");
    expect(issue?.count).toBe(3);
  });

  it("a longer minimum drift duration dismisses the 42 s blob", () => {
    const report = deepValidate(data, { driftMinDurationMs: 60_000 });
    expect(kinds(report)).not.toContain("gps-drift");
  });

  it("a wider drift radius does not manufacture drift from clean motion", () => {
    const report = deepValidate(data, { driftRadiusM: 500 });
    const issue = report.issues.find((i) => i.kind === "gps-drift");
    // Clean 33 m steps are 11 m/s legs — far above 0.5 m/s; the radius
    // cannot make fast legs drift.
    expect(issue?.count).toBe(14);
  });

  it("elevation z-score can be disabled (step check still catches the spike)", () => {
    const report = deepValidate(data, { elevationZScore: 0 });
    const issue = report.issues.find((i) => i.kind === "elevation-outlier");
    expect(issue?.count).toBe(1);
  });

  it("defaults are the spec's (130 km/h spike, 1 m duplicates, 0.5 m/s drift)", () => {
    expect(DEFAULT_DEEP_OPTIONS.speedSpikeKmh).toBe(130);
    expect(DEFAULT_DEEP_OPTIONS.duplicateRadiusM).toBe(1);
    expect(DEFAULT_DEEP_OPTIONS.driftSpeedMps).toBe(0.5);
    expect(DEFAULT_DEEP_OPTIONS.driftMinDurationMs).toBe(30_000);
  });
});

describe("deepValidate on hand-built edges", () => {
  const TRK = (points: string) =>
    `<?xml version="1.0"?><gpx version="1.1" creator="t" ` +
    `xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${points}</trkseg></trk></gpx>`;
  const pt = (
    i: number,
    lat: number,
    lon: number,
    t: number,
    ele?: number,
  ) =>
    `<trkpt lat="${lat}" lon="${lon}">` +
    (ele !== undefined ? `<ele>${ele}</ele>` : "") +
    `<time>2024-05-01T10:00:${String(t).padStart(2, "0")}Z</time></trkpt>`;

  it("an untimed drift run is measured by the 1 s cadence assumption", () => {
    // 40 untimed points on the same spot: 39 legs x 1 s >= 30 s assumed.
    const points = Array.from(
      { length: 40 },
      (_, i) => `<trkpt lat="52.5" lon="13.4"><ele>40</ele></trkpt>`,
    ).join("");
    const data = parseXml(TRK(points));
    const report = deepValidate(data);
    expect(kinds(report)).toContain("gps-drift");
  });

  it("equal timestamps are not backwards (monotonicity allows equality)", () => {
    const data = parseXml(
      TRK(pt(0, 52.5, 13.4, 5, 40) + pt(1, 52.501, 13.4, 5, 41)),
    );
    const report = deepValidate(data);
    expect(kinds(report)).not.toContain("non-monotonic-time");
  });

  it("a sustained climb is not an elevation spike (one-sided steps pass)", () => {
    const climb = Array.from({ length: 12 }, (_, i) =>
      pt(i, 52.5 + 0.0003 * i, 13.4, i * 3, 40 + 8 * i),
    ).join("");
    const data = parseXml(TRK(climb));
    const report = deepValidate(data);
    expect(kinds(report)).not.toContain("elevation-outlier");
  });

  it("issue kinds map to their offered fixes (missing-elevation: none)", () => {
    expect(fixKindsForIssue("speed-spike")).toEqual(["remove-spikes"]);
    expect(fixKindsForIssue("duplicate-cluster")).toEqual(["dedupe"]);
    expect(fixKindsForIssue("gps-drift")).toEqual(["remove-drift"]);
    expect(fixKindsForIssue("elevation-outlier")).toEqual(["smooth-elevations"]);
    expect(fixKindsForIssue("non-monotonic-time")).toEqual(["sort-by-time"]);
    expect(fixKindsForIssue("missing-elevation")).toEqual([]);
  });
});

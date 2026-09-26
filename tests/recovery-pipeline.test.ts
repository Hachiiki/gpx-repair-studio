/**
 * Unit tests — the Gap Recovery pipeline end-to-end (Task 26).
 *
 * The section's acceptance criteria, exercised through the REAL pure
 * machinery it reuses (parse → validate → detect → recovery store draw →
 * merge → export → re-parse), on the committed time-gap fixture — an
 * activity whose clock kept running for 5 minutes while GPS coordinates
 * went missing:
 *
 *   1. the missing GPS time interval is detected (both anchors + span);
 *   2. drawing + committing a route generates points ALONG the drawn
 *      path, WITH timestamps strictly inside the missing interval;
 *   3. every original point survives verbatim (count and timestamps);
 *   4. the activity's elapsed time is provably unchanged;
 *   5. the exported file marks every generated point as reconstructed
 *      (gpxr provenance) and re-parses as an already-repaired file;
 *   6. distance grows by the drawn route, not the straight line.
 *
 * Needs jsdom (the XML facade uses DOMParser).
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { detectGaps } from "@/features/gpx/detectGaps";
import { parseGpx } from "@/features/gpx/parse";
import { validateGpx } from "@/features/gpx/validate";
import {
  exportGpxRepaired,
} from "@/features/gpx/exportGpx";
import { mergeRepairs, type MergeRepairSite } from "@/features/reconstruction/merge";
import { originalTimeStats } from "@/features/statistics/time";
import { createDomXmlIo } from "@/lib/utils/xml";
import { useRecoveryStore } from "@/state/recovery-store";
import { gapId as gapIdOf, gapIdEnd as gapIdOfEnd, pointId, segmentId } from "@/types/ids";
import { parseFixture } from "./helpers/gpxTestUtils";
import type {
  OriginalTrackData,
  OriginalTrackPoint,
} from "@/types/domain";

/** The fixture's gap: point 3 (07:00:09) → point 4 (07:05:09), 5 minutes. */
const GAP_BEFORE_MS = Date.parse("2024-05-01T07:00:09Z");
const GAP_AFTER_MS = Date.parse("2024-05-01T07:05:09Z");
const GAP_SPAN_MS = GAP_AFTER_MS - GAP_BEFORE_MS; // 300 000 ms

/** A plausible drawn detour for the missing section (clear of the chord). */
const DRAWN = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
];

function parseValidated(xml: string): OriginalTrackData {
  const outcome = parseGpx(xml, createDomXmlIo());
  if (!outcome.ok) throw new Error("fixture failed to parse");
  return validateGpx(outcome.data).data;
}

/** The fixture, parsed + validated — the section's starting point. */
function analyzed(): OriginalTrackData {
  return validateGpx(parseFixture("time-gap.gpx")).data;
}

/** All points of the model in document order. */
function allPoints(data: OriginalTrackData) {
  return data.segments.flatMap((segment) => [...segment.points]);
}

beforeEach(() => {
  useRecoveryStore.getState().reset();
});

describe("missing GPS interval detection", () => {
  it("finds the section where elapsed time continued but coordinates are missing", () => {
    const data = analyzed();
    const gaps = detectGaps(data, {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    });

    expect(gaps).toHaveLength(1);
    const gap = gaps[0];
    expect(gap.kind).toBe("time-gap");
    expect(gap.elapsedMs).toBe(GAP_SPAN_MS);
    expect(gap.before.pointId).toBe("t0s0:3");
    expect(gap.after.pointId).toBe("t0s0:4");
  });
});

describe("draw → generate → integrate (through the recovery store)", () => {
  it("generates points along the drawn route with timestamps inside the missing interval", () => {
    const data = analyzed();
    const gaps = detectGaps(data, {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    });
    const gap = gaps[0];

    // The section's drawing flow: open the editor, draw, densify, commit.
    const store = useRecoveryStore.getState();
    store.openEditor(gap.id);
    for (const point of DRAWN) store.addVertex(point);
    store.setResampleSpacing(gap.id, 10);
    store.closeEditor();

    const recon = useRecoveryStore.getState().reconstructions[gap.id];
    expect(recon.vertices).toHaveLength(2);

    // The export hook's site join, verbatim (bounded detected gap).
    const site: MergeRepairSite = {
      gapId: gap.id,
      beforePointId: gap.before.pointId,
      afterPointId: gap.after.pointId,
      vertices: recon.vertices,
      resampleSpacingM: recon.resampleSpacingM,
      timeStrategy: recon.timeStrategy,
      roadLegs: [],
    };
    const merge = mergeRepairs(data, [site], {
      fileTiming: { startMs: null, totalDurationMs: null },
      fileHasTimingData: true,
    });

    expect(merge.repairCount).toBe(1);
    expect(merge.skipped).toEqual([]);
    expect(merge.insertedPoints).toBeGreaterThan(2);

    // The interior run: strictly between the anchors, in route order.
    const run = merge.tracks[0].runs.find((r) => r.kind === "reconstructed");
    expect(run).toBeDefined();
    if (run?.kind !== "reconstructed") return;
    const interior = run.points;

    for (const point of interior) {
      expect(point.source).toBe("reconstructed");
      expect(point.time).toBeDefined();
      if (point.time === undefined) continue;
      expect(point.time.method).toBe("distance-proportional");
      // Seamlessly inside the missing interval — never before/after it.
      expect(point.time.value).toBeGreaterThan(GAP_BEFORE_MS);
      expect(point.time.value).toBeLessThan(GAP_AFTER_MS);
    }
    // Timestamps strictly increase across the interior.
    const times = interior
      .map((p) => p.time?.value)
      .filter((t): t is number => t !== undefined);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it("preserves every original point and the activity's elapsed time", () => {
    const data = analyzed();
    const gaps = detectGaps(data, {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    });
    const gap = gaps[0];

    const store = useRecoveryStore.getState();
    store.openEditor(gap.id);
    for (const point of DRAWN) store.addVertex(point);
    store.closeEditor();
    const recon = useRecoveryStore.getState().reconstructions[gap.id];

    const merge = mergeRepairs(
      data,
      [
        {
          gapId: gap.id,
          beforePointId: gap.before.pointId,
          afterPointId: gap.after.pointId,
          vertices: recon.vertices,
          resampleSpacingM: recon.resampleSpacingM,
          timeStrategy: recon.timeStrategy,
          roadLegs: [],
        },
      ],
      { fileTiming: { startMs: null, totalDurationMs: null }, fileHasTimingData: true },
    );

    // Every original point survives, in order, untouched.
    const originals = allPoints(data);
    const mergedOriginals = merge.tracks[0].points.filter(
      (view) => view.point.source === "original",
    );
    expect(mergedOriginals).toHaveLength(originals.length);
    originals.forEach((point, index) => {
      expect(mergedOriginals[index].point).toBe(point);
    });

    // Elapsed time: first → last recorded timestamp, provably unchanged
    // (the anchors are the same objects; nothing outside the interval
    // was rewritten).
    const before = originalTimeStats(data, 120_000);
    const anchorTimes = mergedOriginals
      .map((view) => view.point as OriginalTrackPoint)
      .filter((p) => p.time !== undefined)
      .map((p) => p.time!);
    const first = anchorTimes[0];
    const last = anchorTimes[anchorTimes.length - 1];
    expect(first).toBe(before.firstTimeMs);
    expect(last).toBe(before.lastTimeMs);
    expect(last - first).toBe(before.wallTimeMs);

    // The generated points sit strictly between the gap anchors in the
    // merged order (route continuity: … before, interior…, after …).
    const orders = merge.tracks[0].points;
    const beforeIdx = orders.findIndex(
      (v) => v.point.source === "original" && v.point.id === gap.before.pointId,
    );
    const afterIdx = orders.findIndex(
      (v) => v.point.source === "original" && v.point.id === gap.after.pointId,
    );
    expect(afterIdx).toBe(beforeIdx + merge.insertedPoints + 1);
  });

  it("adds the drawn route's length, not the straight-line chord", () => {
    const data = analyzed();
    const gaps = detectGaps(data, {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    });
    const gap = gaps[0];

    const store = useRecoveryStore.getState();
    store.openEditor(gap.id);
    for (const point of DRAWN) store.addVertex(point);
    store.closeEditor();
    const recon = useRecoveryStore.getState().reconstructions[gap.id];

    const merge = mergeRepairs(
      data,
      [
        {
          gapId: gap.id,
          beforePointId: gap.before.pointId,
          afterPointId: gap.after.pointId,
          vertices: recon.vertices,
          resampleSpacingM: recon.resampleSpacingM,
          timeStrategy: recon.timeStrategy,
          roadLegs: [],
        },
      ],
      { fileTiming: { startMs: null, totalDurationMs: null }, fileHasTimingData: true },
    );

    // The drawn path is a visible detour: longer than the ~9 m chord.
    expect(gap.impliedDistanceM).toBeDefined();
    expect(merge.reconstructedDistanceM).toBeGreaterThan(
      (gap.impliedDistanceM ?? 0) * 3,
    );
  });
});

describe("export → re-import honesty", () => {
  it("marks every generated point and re-parses with the elapsed time intact", () => {
    const data = analyzed();
    const gaps = detectGaps(data, {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    });
    const gap = gaps[0];

    const store = useRecoveryStore.getState();
    store.openEditor(gap.id);
    for (const point of DRAWN) store.addVertex(point);
    store.setResampleSpacing(gap.id, 10);
    store.closeEditor();
    const recon = useRecoveryStore.getState().reconstructions[gap.id];

    const merge = mergeRepairs(
      data,
      [
        {
          gapId: gap.id,
          beforePointId: gap.before.pointId,
          afterPointId: gap.after.pointId,
          vertices: recon.vertices,
          resampleSpacingM: recon.resampleSpacingM,
          timeStrategy: recon.timeStrategy,
          roadLegs: [],
        },
      ],
      { fileTiming: { startMs: null, totalDurationMs: null }, fileHasTimingData: true },
    );

    const xml = exportGpxRepaired(
      data,
      merge,
      { mode: "structure-preserving", prettyPrint: true },
      createDomXmlIo(),
    );

    // Provenance markers on the generated points.
    expect(xml).toContain("gpxr:reconstructed");
    const markerCount = (xml.match(/gpxr:reconstructed/g) ?? []).length;
    expect(markerCount).toBeGreaterThanOrEqual(merge.insertedPoints);

    // Re-parse: the export is a valid GPX whose originals survived.
    const reparsed = parseValidated(xml);
    expect(reparsed.repairMarkers).toBeDefined();
    expect(reparsed.repairMarkers?.length).toBeGreaterThanOrEqual(
      merge.insertedPoints,
    );

    const originalPoints = allPoints(data);
    const reimportedOriginals = allPoints(reparsed).filter(
      (p) => !reparsed.repairMarkers?.some((m) => m.pointId === p.id),
    );
    expect(reimportedOriginals).toHaveLength(originalPoints.length);

    // The re-imported activity keeps the same elapsed time.
    const before = originalTimeStats(data, 120_000);
    const after = originalTimeStats(reparsed, 120_000);
    expect(after.firstTimeMs).toBe(before.firstTimeMs);
    expect(after.lastTimeMs).toBe(before.lastTimeMs);
    expect(after.wallTimeMs).toBe(before.wallTimeMs);

    // And the recovered boundary no longer reads as a recording gap: the
    // marked legs are repair seams, not missing GPS.
    const regaps = detectGaps(reparsed, {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    });
    expect(regaps).toHaveLength(0);
  });
});

describe("unmeasured sections — draw without detection (Task 28)", () => {
  /** The app's recorded speed basis, as the recovery draw hook computes it. */
  const SPEED_MPS = 2.5;

  /** A mid-route pick on point 1 → the [1, 2] adjacent boundary. */
  const SEG = segmentId(0, 0);
  const P1 = pointId(SEG, 1);
  const P2 = pointId(SEG, 2);
  const INSERT_ID = gapIdOf(P1, P2);
  const ANCHOR_MS = Date.parse("2024-05-01T07:00:03Z"); // point 1's time

  function pointTime(data: OriginalTrackData, id: string): number {
    for (const segment of data.segments) {
      const point = segment.points.find((p) => p.id === id);
      if (point?.time !== undefined) return point.time;
    }
    throw new Error(`point ${id} not found or untimed`);
  }

  it("an insert span estimates its time from the file's pace, not the 3 s window", () => {
    const data = analyzed();

    // The Task-28 flow: pick a mid-route point, draw, commit. The span's
    // default strategy is the app-calculated one.
    const store = useRecoveryStore.getState();
    store.addInsertSpan(P1, P2);
    expect(useRecoveryStore.getState().activeGapId).toBe(INSERT_ID);
    for (const point of DRAWN) store.addVertex(point);
    store.setResampleSpacing(INSERT_ID, 10);
    store.closeEditor();
    const recon = useRecoveryStore.getState().reconstructions[INSERT_ID];
    expect(recon.timeStrategy).toEqual({ kind: "pace-estimated" });

    // The export hook's site join for a bounded manual span, verbatim.
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: INSERT_ID,
          beforePointId: P1,
          afterPointId: P2,
          vertices: recon.vertices,
          resampleSpacingM: recon.resampleSpacingM,
          timeStrategy: recon.timeStrategy,
          roadLegs: [],
        },
      ],
      {
        fileTiming: {
          startMs: null,
          totalDurationMs: null,
          recordedSpeedMps: SPEED_MPS,
        },
        fileHasTimingData: true,
      },
    );

    expect(merge.repairCount).toBe(1);
    expect(merge.skipped).toEqual([]);

    const run = merge.tracks[0].runs.find((r) => r.kind === "reconstructed");
    if (run?.kind !== "reconstructed") throw new Error("no reconstructed run");
    const interior = run.points;
    expect(interior.length).toBeGreaterThan(2);

    // The estimate's duration: path length ÷ speed. The merge's own
    // distance figure is the same path's length.
    const expectedMs = (merge.reconstructedDistanceM / SPEED_MPS) * 1000;
    expect(expectedMs).toBeGreaterThan(10_000); // a real detour, not the 3 s window

    const times = interior.map((p) => p.time);
    expect(times.every((t) => t !== undefined)).toBe(true);
    for (const time of times) {
      if (time === undefined) continue;
      expect(time.method).toBe("pace-estimated");
      // Strictly after the anchor, within the estimated duration.
      expect(time.value).toBeGreaterThan(ANCHOR_MS);
      expect(time.value).toBeLessThan(ANCHOR_MS + expectedMs);
    }
    const values = times.map((t) => t!.value);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }

    // The adjacent original boundary keeps its recorded timestamp —
    // originals are never rewritten, even for app-calculated sections.
    expect(pointTime(data, "t0s0:2")).toBe(Date.parse("2024-05-01T07:00:06Z"));
  });

  it("an open tail extension estimates forward from the route's last point", () => {
    const data = analyzed();
    const LAST_MS = Date.parse("2024-05-01T07:05:18Z"); // point 7's time
    const LAST = pointId(SEG, 7);
    const EXTEND_ID = gapIdOfEnd(LAST);

    const store = useRecoveryStore.getState();
    store.addExtendSpan(LAST, "after");
    expect(useRecoveryStore.getState().activeGapId).toBe(EXTEND_ID);
    for (const point of DRAWN) store.addVertex(point);
    store.closeEditor();
    const recon = useRecoveryStore.getState().reconstructions[EXTEND_ID];

    const merge = mergeRepairs(
      data,
      [
        {
          gapId: EXTEND_ID,
          beforePointId: LAST,
          extendSide: "after",
          vertices: recon.vertices,
          resampleSpacingM: recon.resampleSpacingM,
          timeStrategy: recon.timeStrategy,
          roadLegs: [],
        },
      ],
      {
        fileTiming: {
          startMs: null,
          totalDurationMs: null,
          recordedSpeedMps: SPEED_MPS,
        },
        fileHasTimingData: true,
      },
    );

    expect(merge.repairCount).toBe(1);
    // The interior run is the LAST run of the track (appended after the
    // anchor, nothing follows it).
    const runs = merge.tracks[0].runs;
    const lastRun = runs[runs.length - 1];
    if (lastRun.kind !== "reconstructed") throw new Error("expected tail run");
    expect(lastRun.points.length).toBeGreaterThan(0);
    for (const point of lastRun.points) {
      expect(point.time).toBeDefined();
      if (point.time === undefined) continue;
      expect(point.time.method).toBe("pace-estimated");
      expect(point.time.value).toBeGreaterThan(LAST_MS);
    }

    // Originals intact: every recorded point still present, in order.
    const mergedOriginals = merge.tracks[0].points.filter(
      (view) => view.point.source === "original",
    );
    expect(mergedOriginals).toHaveLength(allPoints(data).length);
  });

  it("without a usable pace the unmeasured section exports geometry without fabricated times", () => {
    const data = analyzed();
    const LAST = pointId(SEG, 7);
    const EXTEND_ID = gapIdOfEnd(LAST);
    const store = useRecoveryStore.getState();
    store.addExtendSpan(LAST, "after");
    for (const point of DRAWN) store.addVertex(point);
    store.closeEditor();
    const recon = useRecoveryStore.getState().reconstructions[EXTEND_ID];

    const merge = mergeRepairs(
      data,
      [
        {
          gapId: EXTEND_ID,
          beforePointId: LAST,
          extendSide: "after",
          vertices: recon.vertices,
          resampleSpacingM: recon.resampleSpacingM,
          timeStrategy: recon.timeStrategy,
          roadLegs: [],
        },
      ],
      {
        fileTiming: {
          startMs: null,
          totalDurationMs: null,
          recordedSpeedMps: null,
        },
        fileHasTimingData: true,
      },
    );

    const runs = merge.tracks[0].runs;
    const lastRun = runs[runs.length - 1];
    if (lastRun.kind !== "reconstructed") throw new Error("expected tail run");
    // Honesty contract: no duration → no timestamps, never fabricated.
    expect(lastRun.points.every((p) => p.time === undefined)).toBe(true);
    expect(lastRun.points.length).toBeGreaterThan(0);
  });
});

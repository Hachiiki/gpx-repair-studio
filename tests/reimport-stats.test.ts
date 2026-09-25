// @vitest-environment jsdom
/**
 * Re-import statistics tests (§H-7, Phase 7): the distance/time split the
 * app shows when a previously exported, repaired file is re-uploaded.
 *
 * The models come from ACTUAL exports (merge → exportGpxRepaired →
 * parseGpx) so the tests pin the full loop: what the exporter writes is
 * exactly what the stats re-derive.
 */

import { describe, expect, it } from "vitest";
import { reimportStats } from "@/features/statistics/reimport";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { exportGpxRepaired } from "@/features/gpx/exportGpx";
import { parseGpx } from "@/features/gpx/parse";
import { createDomXmlIo } from "@/lib/utils/xml";
import { vertexId } from "@/types/ids";
import type { GapId, PointId } from "@/types/domain";
import { parseXml } from "./helpers/gpxTestUtils";

const io = createDomXmlIo();
const TIMED = { fileHasTimingData: true, fileTiming: { startMs: null, totalDurationMs: null } };
const P = (i: number): PointId => `t0s0:${i}` as PointId;

function roundTripRepaired(
  xml: string,
  site: Parameters<typeof mergeRepairs>[1][number],
): ReturnType<typeof reimportStats> {
  const data = parseXml(xml);
  const merge = mergeRepairs(data, [site], TIMED);
  const exported = exportGpxRepaired(
    data,
    merge,
    { mode: "structure-preserving", prettyPrint: false },
    io,
  );
  const result = parseGpx(exported, io);
  if (!result.ok) throw new Error("export failed to re-parse");
  return reimportStats(result.data);
}

const TIME_GAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"><time>2024-05-01T07:00:00Z</time></trkpt>
    <trkpt lat="52.520051" lon="13.405024"><time>2024-05-01T07:00:03Z</time></trkpt>
    <trkpt lat="52.520096" lon="13.405094"><time>2024-05-01T07:00:06Z</time></trkpt>
    <trkpt lat="52.520141" lon="13.405164"><time>2024-05-01T07:00:09Z</time></trkpt>
    <trkpt lat="52.520186" lon="13.405234"><time>2024-05-01T07:05:09Z</time></trkpt>
    <trkpt lat="52.520231" lon="13.405304"><time>2024-05-01T07:05:12Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

describe("reimportStats", () => {
  it("no markers → all zeros", () => {
    const stats = reimportStats(parseXml(TIME_GAP_XML));
    expect(stats).toEqual({
      markerCount: 0,
      repairedDistanceM: 0,
      repairedLegs: 0,
      repairTimeMs: null,
      runCount: 0,
    });
  });

  it("a re-imported repair: markers counted, distance > 0, duration = distributed span", () => {
    const stats = roundTripRepaired(TIME_GAP_XML, {
      gapId: `gap/${P(3)}/${P(4)}` as GapId,
      beforePointId: P(3),
      afterPointId: P(4),
      vertices: [
        { id: vertexId(1), lat: 52.5206, lon: 13.4055 },
        { id: vertexId(2), lat: 52.5202, lon: 13.4058 },
      ],
      resampleSpacingM: "off",
      timeStrategy: { kind: "distance-proportional" },
      roadLegs: [],
    });

    // Two marked points, one marked leg between them.
    expect(stats.markerCount).toBe(2);
    expect(stats.repairedLegs).toBe(1);
    expect(stats.repairedDistanceM).toBeGreaterThan(30);
    expect(stats.runCount).toBe(1);
    // The distributed span: distance-proportional over [t3, t4] — the
    // marked run's (last − first) is a positive fraction of the 300 s gap.
    expect(stats.repairTimeMs).not.toBeNull();
    expect(stats.repairTimeMs!).toBeGreaterThan(0);
    expect(stats.repairTimeMs!).toBeLessThanOrEqual(300_000);
  });

  it("untimed repairs re-import with no repair time (no fabrication)", () => {
    const stats = roundTripRepaired(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"/>
    <trkpt lat="52.520096" lon="13.405094"/>
  </trkseg></trk>
</gpx>`,
      {
        gapId: `gap/${P(0)}/${P(1)}` as GapId,
        beforePointId: P(0),
        afterPointId: P(1),
        vertices: [{ id: vertexId(1), lat: 52.5205, lon: 13.4054 }],
        resampleSpacingM: "off",
        timeStrategy: { kind: "distance-proportional" },
        roadLegs: [],
      },
    );
    expect(stats.markerCount).toBe(1);
    expect(stats.repairedLegs).toBe(0); // single marked point: no marked leg
    expect(stats.repairTimeMs).toBeNull();
  });

  it("a multi-point marked run contributes its duration; a single-point run honestly cannot", () => {
    // Two interior vertices → a marked run whose (last − first) span is a
    // positive fraction of the manual 45 s.
    const twoPoints = roundTripRepaired(TIME_GAP_XML, {
      gapId: `gap/${P(1)}/${P(2)}` as GapId,
      beforePointId: P(1),
      afterPointId: P(2),
      vertices: [
        { id: vertexId(1), lat: 52.5205, lon: 13.4054 },
        { id: vertexId(2), lat: 52.5206, lon: 13.4056 },
      ],
      resampleSpacingM: "off",
      timeStrategy: { kind: "manual-duration", durationMs: 45_000 },
      roadLegs: [],
    });
    expect(twoPoints.runCount).toBe(1);
    expect(twoPoints.markerCount).toBe(2);
    expect(twoPoints.repairTimeMs).not.toBeNull();
    expect(twoPoints.repairTimeMs!).toBeGreaterThan(0);
    expect(twoPoints.repairTimeMs!).toBeLessThanOrEqual(45_000);

    // One interior vertex → a single-point run: last === first, so no
    // duration is derivable from the file — "—", never fabricated.
    const single = roundTripRepaired(TIME_GAP_XML, {
      gapId: `gap/${P(1)}/${P(2)}` as GapId,
      beforePointId: P(1),
      afterPointId: P(2),
      vertices: [{ id: vertexId(1), lat: 52.5205, lon: 13.4054 }],
      resampleSpacingM: "off",
      timeStrategy: { kind: "manual-duration", durationMs: 45_000 },
      roadLegs: [],
    });
    expect(single.runCount).toBe(1);
    expect(single.markerCount).toBe(1);
    expect(single.repairTimeMs).toBeNull();
  });
});

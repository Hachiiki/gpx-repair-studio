// @vitest-environment jsdom
/**
 * Unit tests — merge elevation attachment (Phase 6) + the export wiring.
 *
 * Pins:
 *   - a site with fresh samples attaches `Estimated<number>` elevations
 *     to its interior points (`elevation-api` at sample hits,
 *     `interpolated` between them);
 *   - a site without samples is untouched (no `ele`, byte-identical to
 *     the Phase 7 behavior);
 *   - extend-before reversals keep values aligned to their points;
 *   - `elevatedRepairCount` / `elevationProviders` feed the attribution;
 *   - the exporter writes `<ele>` + `eleMethod` markers + the metadata
 *     attribution sentence.
 */

import { describe, expect, it } from "vitest";
import { mergeRepairs, type MergeRepairSite } from "@/features/reconstruction/merge";
import { exportGpxRepaired } from "@/features/gpx/exportGpx";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { parseGpx } from "@/features/gpx/parse";
import { createDomXmlIo } from "@/lib/utils/xml";
import { gapId, gapIdStart, vertexId } from "@/types/ids";
import type { GapId, OriginalTrackData, PointId } from "@/types/domain";
import type { ElevationSample } from "@/features/elevation/samples";

const io = createDomXmlIo();

function parseFile(withEle: boolean): OriginalTrackData {
  const ele = (v: number) => (withEle ? `<ele>${v}</ele>` : "");
  const result = parseGpx(
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"><time>2024-05-01T07:00:00Z</time>${ele(10)}</trkpt>
    <trkpt lat="52.520051" lon="13.405024"><time>2024-05-01T07:00:03Z</time>${ele(20)}</trkpt>
    <trkpt lat="52.520096" lon="13.405094"><time>2024-05-01T07:00:06Z</time>${ele(30)}</trkpt>
    <trkpt lat="52.520141" lon="13.405164"><time>2024-05-01T07:05:09Z</time>${ele(40)}</trkpt>
    <trkpt lat="52.520186" lon="13.405234"><time>2024-05-01T07:05:12Z</time>${ele(50)}</trkpt>
  </trkseg></trk>
</gpx>`,
    io,
  );
  if (!result.ok) throw new Error("fixture failed to parse");
  return result.data;
}

const P = (i: number): PointId => `t0s0:${i}` as PointId;
const VERTICES = [
  { id: vertexId(1), lat: 52.5206, lon: 13.4055 },
  { id: vertexId(2), lat: 52.5202, lon: 13.4058 },
];

const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};

/** Cumulative distances of the two-vertex interior (spacing "off"). */
function interiorDistances(data: OriginalTrackData): [number, number] {
  const before = data.segments[0].points[2];
  const after = data.segments[0].points[3];
  const d1 = geodesicDistanceMeters(before, VERTICES[0]);
  const d2 = d1 + geodesicDistanceMeters(VERTICES[0], VERTICES[1]);
  const _ = after; // (after-anchor exists; not needed for the distances)
  return [d1, d2];
}

function gapSite(samples: readonly ElevationSample[] | null): MergeRepairSite {
  const gap = gapId(P(2), P(3));
  return {
    gapId: gap,
    beforePointId: P(2),
    afterPointId: P(3),
    vertices: VERTICES,
    resampleSpacingM: "off",
    timeStrategy: { kind: "distance-proportional" },
    roadLegs: [],
    ...(samples
      ? {
          elevation: {
            providerName: "OpenTopoData",
            fetchedAtRevision: 1,
            fetchedAtRoadSignature: "none",
            samples,
          },
        }
      : {}),
  };
}

describe("merge — elevation attachment", () => {
  it("attaches sample-hit elevations as elevation-api", () => {
    const data = parseFile(true);
    const [d1, d2] = interiorDistances(data);
    const result = mergeRepairs(
      data,
      [gapSite([
        { cumDistanceM: 0, ele: 35 },
        { cumDistanceM: d1, ele: 45 },
        { cumDistanceM: d2, ele: 55 },
        { cumDistanceM: d1 + d2, ele: 42 },
      ])],
      TIMED,
    );

    const track = result.tracks[0];
    const recon = track.runs.find((run) => run.kind === "reconstructed");
    expect(recon && recon.kind === "reconstructed").toBe(true);
    const points = recon!.kind === "reconstructed" ? recon!.points : [];
    expect(points).toHaveLength(2);
    // Exact hits at d1/d2 (t === 0 → direct values).
    expect(points[0].ele).toEqual({ value: 45, method: "elevation-api" });
    expect(points[1].ele).toEqual({ value: 55, method: "elevation-api" });
    // Totals for the attribution.
    expect(result.elevatedRepairCount).toBe(1);
    expect(result.elevationProviders).toEqual(["OpenTopoData"]);
  });

  it("interpolates between samples with the interpolated method", () => {
    const data = parseFile(true);
    const [d1, d2] = interiorDistances(data);
    // Samples bracket the whole chain but skip the vertices themselves.
    const result = mergeRepairs(
      data,
      [gapSite([
        { cumDistanceM: 0, ele: 30 },
        { cumDistanceM: d1 + d2, ele: 60 },
      ])],
      TIMED,
    );

    const recon = result.tracks[0].runs.find((run) => run.kind === "reconstructed");
    const points = recon!.kind === "reconstructed" ? recon!.points : [];
    // v1 sits at t = d1/(d1+d2) along the sample span; the value is the
    // linear blend — and the METHOD is the honest "interpolated".
    expect(points[0].ele?.method).toBe("interpolated");
    expect(points[1].ele?.method).toBe("interpolated");
    const t1 = d1 / (d1 + d2);
    expect(points[0].ele?.value).toBeCloseTo(30 + 30 * t1, 6);
    expect(points[1].ele?.value).toBeCloseTo(30 + 30 * (d2 / (d1 + d2)), 6);
  });

  it("leaves sites without samples untouched", () => {
    const data = parseFile(true);
    const result = mergeRepairs(data, [gapSite(null)], TIMED);
    const recon = result.tracks[0].runs.find((run) => run.kind === "reconstructed");
    const points = recon!.kind === "reconstructed" ? recon!.points : [];
    expect(points[0].ele).toBeUndefined();
    expect(points[1].ele).toBeUndefined();
    expect(result.elevatedRepairCount).toBe(0);
    expect(result.elevationProviders).toEqual([]);
  });

  it("keeps values aligned through the extend-before reversal", () => {
    const data = parseFile(true);
    // The last recorded point is the anchor; the drawn chain runs
    // anchor → vertices, route order is reversed (vertices → anchor).
    const anchor = data.segments[0].points[4];
    const d1 = geodesicDistanceMeters(anchor, VERTICES[0]);
    const d2 = d1 + geodesicDistanceMeters(VERTICES[0], VERTICES[1]);
    const gap = gapIdStart(anchor.id);
    const site: MergeRepairSite = {
      gapId: gap as GapId,
      afterPointId: anchor.id,
      extendSide: "before",
      vertices: VERTICES,
      resampleSpacingM: "off",
      timeStrategy: { kind: "distance-proportional" },
      roadLegs: [],
      elevation: {
        providerName: "OpenTopoData",
        fetchedAtRevision: 1,
        fetchedAtRoadSignature: "none",
        samples: [
          { cumDistanceM: 0, ele: 70 },
          { cumDistanceM: d1, ele: 80 },
          { cumDistanceM: d2, ele: 90 },
        ],
      },
    };

    const result = mergeRepairs(data, [site], TIMED);
    const recon = result.tracks[0].runs.find((run) => run.kind === "reconstructed");
    const points = recon!.kind === "reconstructed" ? recon!.points : [];
    // Reversed route order: v2 (ele 90) first, v1 (ele 80) second — the
    // values ride their points, not their indices.
    expect(points[0].ele).toEqual({ value: 90, method: "elevation-api" });
    expect(points[1].ele).toEqual({ value: 80, method: "elevation-api" });
  });
});

describe("export — elevation wiring (§H-7 + §K-2 attribution)", () => {
  it("writes <ele> and eleMethod markers and the attribution note", () => {
    const data = parseFile(true);
    const [d1, d2] = interiorDistances(data);
    const merge = mergeRepairs(
      data,
      [gapSite([
        { cumDistanceM: 0, ele: 35 },
        { cumDistanceM: d1, ele: 45 },
        { cumDistanceM: d2, ele: 55 },
      ])],
      TIMED,
    );

    const xml = exportGpxRepaired(
      data,
      merge,
      { mode: "structure-preserving", prettyPrint: false },
      io,
    );

    // Reconstructed points carry <ele>…
    expect(xml).toContain("<ele>45</ele>");
    expect(xml).toContain("<ele>55</ele>");
    // …the provenance marker names the method…
    expect(xml).toContain('eleMethod="elevation-api"');
    // …and the metadata note credits the terrain source.
    expect(xml).toContain(
      "Elevation of reconstructed points estimated from OpenTopoData",
    );
    // Original points stay verbatim (recorded ele values, untouched).
    expect(xml).toContain("<ele>10</ele>");
    expect(xml).toContain("<ele>50</ele>");
  });

  it("emits no elevation attribution without elevated repairs", () => {
    const data = parseFile(true);
    const merge = mergeRepairs(data, [gapSite(null)], TIMED);
    const xml = exportGpxRepaired(
      data,
      merge,
      { mode: "structure-preserving", prettyPrint: false },
      io,
    );
    expect(xml).not.toContain("eleMethod");
    expect(xml).not.toContain("estimated from OpenTopoData");
  });
});

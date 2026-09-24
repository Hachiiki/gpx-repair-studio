// @vitest-environment jsdom
/**
 * Unit tests — Phase 4 additions to the map view join:
 *
 *   - buildRouteView with committed reconstructions: the authored path
 *     replaces the unknown span (markers stay), anchors always connected
 *     (first/last path coordinates are the boundary points), spacing
 *     densifies the rendered line;
 *   - the new GeoJSON builders (reconstruction lines, handles, midpoints,
 *     draft line, rubber band).
 *
 * jsdom: the fixture pipeline needs DOMParser (shared XmlIo adapter).
 */

import { describe, expect, it } from "vitest";
import { detectGaps } from "@/features/gpx/detectGaps";
import { validateGpx } from "@/features/gpx/validate";
import {
  buildRouteView,
  type ReconstructionRenderRef,
  type RouteGapRef,
} from "@/hooks/use-map-controller";
import {
  drawHandleCollection,
  drawMidpointCollection,
  draftLineCollection,
  reconstructionLineCollection,
  rubberBandCollection,
} from "@/lib/map/geojson";
import { buildGpxXml, parseXml } from "./helpers/gpxTestUtils";
import { DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";
import type {
  DetectedGap,
  DrawVertex,
  OriginalTrackData,
  PointId,
} from "@/types/domain";
import { vertexId } from "@/types/ids";

function gapRefs(
  data: OriginalTrackData,
  gaps: readonly DetectedGap[],
): RouteGapRef[] {
  const points = new Map<PointId, { lat: number; lon: number }>();
  for (const segment of data.segments) {
    for (const point of segment.points) {
      points.set(point.id, { lat: point.lat, lon: point.lon });
    }
  }
  const refs: RouteGapRef[] = [];
  for (const gap of gaps) {
    const before = points.get(gap.before.pointId);
    const after = points.get(gap.after.pointId);
    if (!before || !after) continue;
    refs.push({
      id: gap.id,
      kind: gap.kind,
      severity: gap.severity,
      before: { pointId: gap.before.pointId, ...before },
      after: { pointId: gap.after.pointId, ...after },
    });
  }
  return refs;
}

/** A document with one detectable time gap (5 minutes between p2 and p3). */
function gappedDocument() {
  const data = parseXml(
    buildGpxXml([
      { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
      { lat: 52.521, lon: 13.406, time: "2024-05-01T10:00:30Z" },
      { lat: 52.522, lon: 13.407, time: "2024-05-01T10:00:40Z" },
      { lat: 52.526, lon: 13.411, time: "2024-05-01T10:06:00Z" },
      { lat: 52.527, lon: 13.412, time: "2024-05-01T10:06:30Z" },
    ]),
  );
  const validated = validateGpx(data);
  const gaps = detectGaps(validated.data, DEFAULT_GAP_THRESHOLDS);
  return { data: validated.data, gaps, refs: gapRefs(validated.data, gaps) };
}

function recon(
  gapId: string,
  vertices: DrawVertex[],
  spacingM: number | "off" = "off",
): ReconstructionRenderRef {
  return { gapId: gapId as never, vertices, spacingM };
}

describe("buildRouteView — committed reconstructions", () => {
  it("replaces the unknown span with the authored path; markers stay", () => {
    const { data, gaps, refs } = gappedDocument();
    expect(gaps.length).toBe(1);
    const vertices: DrawVertex[] = [
      { id: vertexId(1), lat: 52.523, lon: 13.408 },
      { id: vertexId(2), lat: 52.525, lon: 13.41 },
    ];

    const plain = buildRouteView(data, refs);
    expect(plain.spans).toHaveLength(1);
    expect(plain.reconstructions).toHaveLength(0);

    const repaired = buildRouteView(data, refs, [recon(gaps[0].id, vertices)]);
    expect(repaired.spans).toHaveLength(0);
    expect(repaired.reconstructions).toHaveLength(1);
    // Boundary markers survive (they mark the recorded↔authored seams).
    expect(repaired.markers).toHaveLength(2);
  });

  it("always connects the anchors exactly (first/last coordinates)", () => {
    const { data, gaps, refs } = gappedDocument();
    const vertices: DrawVertex[] = [
      { id: vertexId(1), lat: 52.523, lon: 13.408 },
    ];
    const repaired = buildRouteView(data, refs, [recon(gaps[0].id, vertices)]);
    const coordinates = repaired.reconstructions[0].coordinates;

    const before = refs[0].before;
    const after = refs[0].after;
    expect(coordinates[0]).toEqual([before.lon, before.lat]);
    expect(coordinates[coordinates.length - 1]).toEqual([after.lon, after.lat]);
    // …and the user vertex sits in the middle, in order.
    expect(coordinates[1]).toEqual([13.408, 52.523]);
    expect(coordinates).toHaveLength(3);
  });

  it("densifies the path when spacing is set (fill points only)", () => {
    const { data, gaps, refs } = gappedDocument();
    const vertices: DrawVertex[] = [
      { id: vertexId(1), lat: 52.523, lon: 13.408 },
    ];
    const off = buildRouteView(data, refs, [
      recon(gaps[0].id, vertices, "off"),
    ]);
    const dense = buildRouteView(data, refs, [
      recon(gaps[0].id, vertices, 10),
    ]);
    expect(dense.reconstructions[0].coordinates.length).toBeGreaterThan(
      off.reconstructions[0].coordinates.length,
    );
    // The exact user vertex is still present in the densified path.
    expect(dense.reconstructions[0].coordinates).toContainEqual([13.408, 52.523]);
  });

  it("an empty vertex list renders nothing (span stays)", () => {
    const { data, gaps, refs } = gappedDocument();
    const view = buildRouteView(data, refs, [recon(gaps[0].id, [])]);
    expect(view.spans).toHaveLength(1);
    expect(view.reconstructions).toHaveLength(0);
  });

  it("an ACTIVE reconstruction suppresses the span but renders no line (draft owns it)", () => {
    const { data, gaps, refs } = gappedDocument();
    const vertices: DrawVertex[] = [
      { id: vertexId(1), lat: 52.523, lon: 13.408 },
    ];
    const view = buildRouteView(data, refs, [
      { ...recon(gaps[0].id, vertices), active: true },
    ]);
    expect(view.spans).toHaveLength(0); // unknown yielded to the draft
    expect(view.reconstructions).toHaveLength(0); // draft renders, not this
    expect(view.markers).toHaveLength(2); // seams stay
  });

  it("multiple gaps: repairs render independently", () => {
    const data = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
        { lat: 52.521, lon: 13.406, time: "2024-05-01T10:00:30Z" },
        { lat: 52.524, lon: 13.409, time: "2024-05-01T10:05:00Z" },
        { lat: 52.525, lon: 13.410, time: "2024-05-01T10:05:20Z" },
        { lat: 52.528, lon: 13.413, time: "2024-05-01T10:11:00Z" },
      ]),
    );
    const validated = validateGpx(data);
    const gaps = detectGaps(validated.data, DEFAULT_GAP_THRESHOLDS);
    const refs = gapRefs(validated.data, gaps);
    expect(gaps).toHaveLength(2);

    const view = buildRouteView(validated.data, refs, [
      recon(gaps[0].id, [{ id: vertexId(1), lat: 52.522, lon: 13.407 }]),
      recon(gaps[1].id, [
        { id: vertexId(2), lat: 52.526, lon: 13.411 },
        { id: vertexId(3), lat: 52.527, lon: 13.412 },
      ]),
    ]);
    expect(view.spans).toHaveLength(0);
    expect(view.reconstructions).toHaveLength(2);
    expect(view.reconstructions[0].coordinates).toHaveLength(3);
    expect(view.reconstructions[1].coordinates).toHaveLength(4);
  });
});

describe("GeoJSON builders — Phase 4 sources", () => {
  it("reconstructionLineCollection emits one dashed line feature per gap", () => {
    const collection = reconstructionLineCollection([
      { gapId: "g1" as never, coordinates: [[13.4, 52.5], [13.41, 52.51]] },
      { gapId: "g2" as never, coordinates: [[13.5, 52.5], [13.51, 52.51]] },
    ]);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0].properties.gapId).toBe("g1");
    expect(collection.features[0].geometry.coordinates[0]).toEqual([
      13.4, 52.5,
    ]);
  });

  it("drawHandleCollection carries vertexId + index for hit testing", () => {
    const collection = drawHandleCollection([
      {
        gapId: "g1" as never,
        vertexId: vertexId(1),
        index: 0,
        lat: 52.5,
        lon: 13.4,
      },
    ]);
    expect(collection.features[0].properties).toEqual({
      gapId: "g1",
      vertexId: "v1",
      index: 0,
    });
    expect(collection.features[0].geometry.coordinates).toEqual([13.4, 52.5]);
  });

  it("drawMidpointCollection carries the insertion index", () => {
    const collection = drawMidpointCollection([
      { gapId: "g1" as never, insertIndex: 2, lat: 52.5, lon: 13.4 },
    ]);
    expect(collection.features[0].properties.insertIndex).toBe(2);
  });

  it("draftLineCollection hides single-point paths (no degenerate lines)", () => {
    expect(draftLineCollection([[13.4, 52.5]]).features).toHaveLength(0);
    expect(
      draftLineCollection([
        [13.4, 52.5],
        [13.41, 52.51],
      ]).features,
    ).toHaveLength(1);
    expect(draftLineCollection([]).features).toHaveLength(0);
  });

  it("rubberBandCollection is empty unless both ends exist", () => {
    expect(rubberBandCollection(null, { lat: 1, lon: 1 }).features).toHaveLength(0);
    expect(rubberBandCollection({ lat: 0, lon: 0 }, null).features).toHaveLength(0);
    const withBoth = rubberBandCollection(
      { lat: 52.5, lon: 13.4 },
      { lat: 52.51, lon: 13.41 },
    );
    expect(withBoth.features).toHaveLength(1);
    expect(withBoth.features[0].geometry.coordinates).toEqual([
      [13.4, 52.5],
      [13.41, 52.51],
    ]);
  });
});

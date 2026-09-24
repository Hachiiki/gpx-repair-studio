// @vitest-environment jsdom
/**
 * Unit tests — buildRouteView (hooks/use-map-controller.ts): the pure
 * domain → map-view join.
 *
 * Verified behaviors:
 *   - a clean segment renders as one solid line;
 *   - lines split at gap boundaries (the unknown span is never drawn as
 *     recorded line) and at unusable points (invalid / Null-Island);
 *   - each gap yields one dashed span + two boundary markers;
 *   - gaps with unusable boundary points yield no span/markers (the hole
 *     in the line is the honest signal);
 *   - segment-break gaps connect the last/first points of their segments.
 *
 * jsdom: the hook module imports the (browser-only) MapController for its
 * type only at runtime boundary — module evaluation is jsdom-safe — and the
 * fixture pipeline needs DOMParser (shared XmlIo adapter).
 */

import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { detectGaps } from "@/features/gpx/detectGaps";
import { validateGpx } from "@/features/gpx/validate";
import {
  buildRouteView,
  type RouteGapRef,
} from "@/hooks/use-map-controller";
import {
  buildGpxXml,
  parseFixture,
  parseXml,
} from "./helpers/gpxTestUtils";
import type {
  DetectedGap,
  OriginalTrackData,
  PointId,
} from "@/types/domain";
import { DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";

/**
 * Resolve a detected gap's boundary coordinates from the model — the same
 * join `useGpxSession` performs for `GapRow`, reduced to the fields
 * `buildRouteView` consumes.
 */
function gapRefs(data: OriginalTrackData, gaps: readonly DetectedGap[]): RouteGapRef[] {
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

/** Full pipeline over a fixture: parse → validate → detect → refs. */
function fixtureRoute(name: string) {
  const parsed = parseFixture(name);
  const validated = validateGpx(parsed);
  const gaps = detectGaps(validated.data, DEFAULT_GAP_THRESHOLDS);
  return {
    data: validated.data,
    view: buildRouteView(validated.data, gapRefs(validated.data, gaps)),
    gaps,
  };
}

/** Inline pipeline for hand-built documents. */
function xmlRoute(xml: string) {
  const parsed = parseXml(xml);
  const validated = validateGpx(parsed);
  const gaps = detectGaps(validated.data, DEFAULT_GAP_THRESHOLDS);
  return {
    data: validated.data,
    view: buildRouteView(validated.data, gapRefs(validated.data, gaps)),
    gaps,
  };
}

describe("buildRouteView — clean geometry", () => {
  it("renders one segment without gaps as a single line", () => {
    const { view } = xmlRoute(
      buildGpxXml([
        { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
        { lat: 52.521, lon: 13.406, time: "2024-05-01T10:00:10Z" },
        { lat: 52.522, lon: 13.407, time: "2024-05-01T10:00:20Z" },
        { lat: 52.523, lon: 13.408, time: "2024-05-01T10:00:30Z" },
      ]),
    );
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].coordinates).toEqual([
      [13.405, 52.52],
      [13.406, 52.521],
      [13.407, 52.522],
      [13.408, 52.523],
    ]);
    expect(view.spans).toEqual([]);
    expect(view.markers).toEqual([]);
    expect(view.usablePointCount).toBe(4);
  });

  it("never connects lines across segments (multi-segment fixture)", () => {
    const { view, data } = fixtureRoute("multi-segment.gpx");
    expect(view.lines.length).toBeGreaterThan(1);
    // Every line belongs to exactly one segment.
    const segmentIds = new Set(data.segments.map((s) => s.id));
    for (const line of view.lines) {
      expect(segmentIds.has(line.segmentId)).toBe(true);
    }
  });
});

describe("buildRouteView — gap splitting", () => {
  it("splits the recorded line at a time gap and emits span + markers", () => {
    const { view, gaps } = fixtureRoute("time-gap.gpx");

    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(view.spans).toHaveLength(gaps.length);
    expect(view.markers).toHaveLength(gaps.length * 2);

    // Two line pieces: before the gap and after it.
    expect(view.lines).toHaveLength(2);
    const [before, after] = view.lines;
    const gap = gaps[0];

    // Both boundary points are included in the lines…
    const beforeLineEnds = before.coordinates[before.coordinates.length - 1];
    const afterLineStart = after.coordinates[0];
    // …and the span connects exactly those two positions.
    const [spanFrom, spanTo] = view.spans[0].coordinates;
    expect(beforeLineEnds).toEqual(spanFrom);
    expect(afterLineStart).toEqual(spanTo);

    expect(view.spans[0].gapId).toBe(gap.id);
    expect(view.spans[0].kind).toBe(gap.kind);
    expect(view.spans[0].severity).toBe(gap.severity);

    const roles = view.markers.map((m) => m.role);
    expect(roles).toContain("before");
    expect(roles).toContain("after");
    expect(view.markers.map((m) => m.pointId).sort()).toEqual(
      [gap.before.pointId, gap.after.pointId].sort(),
    );
  });

  it("treats a segment break as a span between the adjacent segments", () => {
    const { view, gaps } = fixtureRoute("multi-segment.gpx");
    const breakGap = gaps.find((g) => g.kind === "segment-break");
    expect(breakGap).toBeDefined();

    const span = view.spans.find((s) => s.gapId === breakGap!.id);
    expect(span).toBeDefined();
    // The span's endpoints are the last point of one segment and the
    // first point of the next (checked via marker point ids).
    const markers = view.markers.filter((m) => m.gapId === breakGap!.id);
    expect(markers.map((m) => m.pointId).sort()).toEqual(
      [breakGap!.before.pointId, breakGap!.after.pointId].sort(),
    );
  });
});

describe("buildRouteView — damaged coordinates", () => {
  it("breaks the line at Null-Island points and skips them", () => {
    const { view } = xmlRoute(
      buildGpxXml([
        { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
        { lat: 52.521, lon: 13.406, time: "2024-05-01T10:00:10Z" },
        { lat: 0, lon: 0, time: "2024-05-01T10:00:20Z" },
        { lat: 52.523, lon: 13.408, time: "2024-05-01T10:00:30Z" },
        { lat: 52.524, lon: 13.409, time: "2024-05-01T10:00:40Z" },
      ]),
    );

    // Two clean line pieces around the unusable point; no line touches (0,0).
    expect(view.lines).toHaveLength(2);
    const allCoords = view.lines.flatMap((l) => l.coordinates);
    expect(allCoords).not.toContainEqual([0, 0]);
    expect(allCoords).toHaveLength(4);
    expect(view.usablePointCount).toBe(4);
  });

  it("emits no span or markers when a gap boundary is unusable", () => {
    // A time gap whose *after* point is a Null-Island artifact: the span
    // cannot be drawn honestly, but the line still breaks at the damage.
    const { view, gaps } = xmlRoute(
      buildGpxXml([
        { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
        { lat: 52.521, lon: 13.406, time: "2024-05-01T10:00:10Z" },
        { lat: 0, lon: 0, time: "2024-05-01T10:20:00Z" },
        { lat: 52.523, lon: 13.408, time: "2024-05-01T10:20:10Z" },
      ]),
    );

    expect(gaps.length).toBeGreaterThanOrEqual(1);
    const spanIds = new Set(view.spans.map((s) => s.gapId));
    const markerIds = new Set(view.markers.map((m) => m.gapId));
    for (const gap of gaps) {
      if (gap.after.pointId === "t0s0:2" || gap.before.pointId === "t0s0:2") {
        expect(spanIds.has(gap.id)).toBe(false);
        expect(markerIds.has(gap.id)).toBe(false);
      }
    }
    // The damaged point itself is excluded from all geometry.
    expect(view.lines.flatMap((l) => l.coordinates)).not.toContainEqual([0, 0]);
  });

  it("renders no lines at all when every coordinate is damaged", () => {
    const { view } = xmlRoute(
      buildGpxXml([
        { lat: 0, lon: 0, time: "2024-05-01T10:00:00Z" },
        { lat: 0, lon: 0, time: "2024-05-01T10:00:10Z" },
      ]),
    );
    expect(view.lines).toEqual([]);
    expect(view.usablePointCount).toBe(0);
  });

  it("excludes out-of-range coordinates from the rendered lines", () => {
    const { view } = xmlRoute(
      buildGpxXml([
        { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
        { lat: 120, lon: 13.406, time: "2024-05-01T10:00:10Z" },
        { lat: 52.522, lon: 13.407, time: "2024-05-01T10:00:20Z" },
      ]),
    );
    // The out-of-range point breaks the line; the remaining usable points
    // are single-point stubs, which cannot form lines — nothing is drawn
    // across the damage (usablePointCount still counts them).
    expect(view.lines).toEqual([]);
    expect(view.usablePointCount).toBe(2);
  });
});

describe("buildRouteView — whole-corpus sanity", () => {
  it("never draws coordinates outside the usable set for any fixture", () => {
    const fixtures = [
      "zero-coords.gpx",
      "mixed-anomalies.gpx",
      "bad-coords.gpx",
      "segment-break-time-gap.gpx",
      "speed-anomaly.gpx",
    ] as const;
    for (const name of fixtures) {
      const { view } = fixtureRoute(name);
      for (const line of view.lines) {
        expect(line.coordinates.length).toBeGreaterThanOrEqual(2);
        for (const [lon, lat] of line.coordinates) {
          expect(Math.abs(lat)).toBeLessThanOrEqual(90);
          expect(Math.abs(lon)).toBeLessThanOrEqual(180);
          expect(Number.isFinite(lat) && Number.isFinite(lon)).toBe(true);
          expect(lat === 0 && lon === 0).toBe(false);
        }
      }
      // Markers always come in before/after pairs per span.
      expect(view.markers.length).toBe(view.spans.length * 2);
    }
  });
});

describe("buildRouteView — manual repair spans (draw-anywhere)", () => {
  /** A clean 8-point run — nothing detected, everything manual. */
  function cleanRoute() {
    return xmlRoute(
      buildGpxXml([
        { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
        { lat: 52.521, lon: 13.406, time: "2024-05-01T10:00:10Z" },
        { lat: 52.522, lon: 13.407, time: "2024-05-01T10:00:20Z" },
        { lat: 52.523, lon: 13.408, time: "2024-05-01T10:00:30Z" },
        { lat: 52.524, lon: 13.409, time: "2024-05-01T10:00:40Z" },
        { lat: 52.525, lon: 13.41, time: "2024-05-01T10:00:50Z" },
        { lat: 52.526, lon: 13.411, time: "2024-05-01T10:01:00Z" },
        { lat: 52.527, lon: 13.412, time: "2024-05-01T10:01:10Z" },
      ]),
    );
  }

  /** Build a manual-span ref over two of the model's points. */
  function manualRef(
    data: OriginalTrackData,
    beforeOrdinal: number,
    afterOrdinal: number,
  ): RouteGapRef {
    const points = [...data.segments[0].points];
    const before = points[beforeOrdinal];
    const after = points[afterOrdinal];
    return {
      id: `gap/${before.id}/${after.id}` as RouteGapRef["id"],
      kind: "manual",
      severity: "info",
      before: { pointId: before.id, lat: before.lat, lon: before.lon },
      after: { pointId: after.id, lat: after.lat, lon: after.lon },
    };
  }

  it("a manual span adds markers but never splits the line or draws a span", () => {
    const { data, view: without } = cleanRoute();
    expect(without.spans).toEqual([]);

    const span = manualRef(data, 2, 5); // a stretch WITH recorded points
    const view = buildRouteView(data, [], [], [span]);

    // The recorded geometry is untouched: same single line, same points.
    expect(view.lines).toEqual(without.lines);
    expect(view.usablePointCount).toBe(without.usablePointCount);
    // No unknown span — the stretch is recorded, the user redraws by choice.
    expect(view.spans).toEqual([]);
    // Exactly the two seam markers.
    expect(view.markers).toHaveLength(2);
    expect(view.markers.map((m) => m.role).sort()).toEqual([
      "after",
      "before",
    ]);
    expect(view.reconstructions).toEqual([]);
  });

  it("a committed manual-span reconstruction renders over the recorded line", () => {
    const { data } = cleanRoute();
    const span = manualRef(data, 2, 5);
    const vertices = [
      { id: "v1" as never, lat: 52.5225, lon: 13.4075 },
      { id: "v2" as never, lat: 52.5235, lon: 13.4085 },
    ];
    const view = buildRouteView(data, [], [
      { gapId: span.id, vertices, spacingM: "off" },
    ], [span]);

    // Path: before-anchor (point 2) → vertices → after-anchor (point 5).
    expect(view.reconstructions).toHaveLength(1);
    expect(view.reconstructions[0].gapId).toBe(span.id);
    expect(view.reconstructions[0].coordinates).toEqual([
      [13.407, 52.522],
      [13.4075, 52.5225],
      [13.4085, 52.5235],
      [13.41, 52.525],
    ]);
    // The recorded line is still there — both stay visible (immutable
    // original + user's claim on top).
    expect(view.lines).toHaveLength(1);
    expect(view.markers).toHaveLength(2);
  });

  it("a manual span whose boundary is also detected defers to the detected rendering", () => {
    // time-gap fixture: detect the gap, then pass the SAME boundary as a
    // manual span plus the detected ref.
    const { data, view: detectedView, gaps } = fixtureRoute("time-gap.gpx");
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    const gap = gaps[0];
    const points = new Map<PointId, { lat: number; lon: number }>();
    for (const segment of data.segments) {
      for (const point of segment.points) {
        points.set(point.id, { lat: point.lat, lon: point.lon });
      }
    }
    const manualClone: RouteGapRef = {
      id: gap.id, // same boundary → same deterministic id
      kind: "manual",
      severity: "info",
      before: {
        pointId: gap.before.pointId,
        ...points.get(gap.before.pointId)!,
      },
      after: { pointId: gap.after.pointId, ...points.get(gap.after.pointId)! },
    };
    const refs = gapRefs(data, gaps);

    const view = buildRouteView(data, refs, [], [manualClone]);
    // Not doubled: one span, two markers — exactly the detected rendering.
    expect(view.spans).toHaveLength(detectedView.spans.length);
    expect(view.markers).toHaveLength(detectedView.markers.length);
  });

  it("a manual span with unusable anchors yields nothing (honest hole)", () => {
    const parsed = parseXml(
      buildGpxXml([
        { lat: 52.52, lon: 13.405, time: "2024-05-01T10:00:00Z" },
        { lat: 0, lon: 0, time: "2024-05-01T10:00:10Z" },
        { lat: 52.522, lon: 13.407, time: "2024-05-01T10:00:20Z" },
      ]),
    );
    const validated = validateGpx(parsed);
    const damaged = validated.data.segments[0].points[1]; // Null Island
    const ok1 = validated.data.segments[0].points[0];
    const ok2 = validated.data.segments[0].points[2];
    const view = buildRouteView(validated.data, [], [], [
      {
        id: `gap/${ok1.id}/${damaged.id}` as RouteGapRef["id"],
        kind: "manual",
        severity: "info",
        before: { pointId: ok1.id, lat: ok1.lat, lon: ok1.lon },
        after: { pointId: damaged.id, lat: damaged.lat, lon: damaged.lon },
      },
      {
        id: `gap/${damaged.id}/${ok2.id}` as RouteGapRef["id"],
        kind: "manual",
        severity: "info",
        before: { pointId: damaged.id, lat: damaged.lat, lon: damaged.lon },
        after: { pointId: ok2.id, lat: ok2.lat, lon: ok2.lon },
      },
    ]);
    expect(view.markers).toEqual([]);
    expect(view.reconstructions).toEqual([]);
  });
});

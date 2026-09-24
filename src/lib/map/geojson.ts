/**
 * GeoJSON source data for the map layers (docs/MASTER_PLAN.md §F: lib/map).
 *
 * Pure data shaping: plain view data in, structurally valid GeoJSON feature
 * collections out. No `maplibre-gl` import (not even type-only) — these
 * plain objects are handed to `GeoJSONSource#setData` by the controller and
 * consumed by MapLibre's structural GeoJSON types, so this module stays
 * testable in a bare node environment.
 *
 * The *domain → view* join (which points form which line, where lines break
 * at gaps and damage) lives in `hooks/use-map-controller.ts`
 * (`buildRouteView`); this module only converts finished view data into
 * GeoJSON.
 *
 * Coordinate order is GeoJSON's: `[lon, lat]`.
 *
 * Phase 3 — Map Display. Phase 4 — reconstruction lines + draw-session
 * sources (handles, midpoints, draft line, rubber band).
 */

import type {
  GapId,
  GapKind,
  GapSeverity,
  PointId,
  SegmentId,
  VertexId,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Minimal structural GeoJSON types
// ---------------------------------------------------------------------------

export interface GeoJsonLineFeature<P> {
  type: "Feature";
  properties: P;
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface GeoJsonPointFeature<P> {
  type: "Feature";
  properties: P;
  geometry: { type: "Point"; coordinates: [number, number] };
}

export interface GeoJsonFeatureCollection<F> {
  type: "FeatureCollection";
  features: F[];
}

// ---------------------------------------------------------------------------
// Route view data (built by hooks/use-map-controller.ts)
// ---------------------------------------------------------------------------

/** One renderable piece of the recorded route (split at gaps and damage). */
export interface RouteLinePart {
  segmentId: SegmentId;
  trackIndex: number;
  /** `[lon, lat]` pairs, in recording order. */
  coordinates: [number, number][];
}

/** The straight dashed span between a gap's boundary points. */
export interface GapSpanPart {
  gapId: GapId;
  kind: GapKind;
  severity: GapSeverity;
  /** Exactly two positions: before → after. */
  coordinates: [[number, number], [number, number]];
}

/** A clickable marker at a gap boundary. */
export interface GapBoundaryMarker {
  gapId: GapId;
  pointId: PointId;
  role: "before" | "after";
  severity: GapSeverity;
  lat: number;
  lon: number;
}

/**
 * The rendered geometry of one committed reconstruction (hook-built via
 * `resamplePath` — anchors included, spacing applied). A gap with a
 * rendered reconstruction no longer draws its unknown dashed span.
 */
export interface ReconstructionPart {
  gapId: GapId;
  /** `[lon, lat]` pairs: before-anchor → path → after-anchor. */
  coordinates: [number, number][];
}

/** Everything the map renders for one parsed file. */
export interface RouteViewData {
  lines: readonly RouteLinePart[];
  spans: readonly GapSpanPart[];
  markers: readonly GapBoundaryMarker[];
  /** Committed reconstructions (active editor gap excluded — draft mode). */
  reconstructions: readonly ReconstructionPart[];
  /** Usable recorded points represented by `lines` (for text alternatives). */
  usablePointCount: number;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function routeLineCollection(
  lines: readonly RouteLinePart[],
): GeoJsonFeatureCollection<
  GeoJsonLineFeature<{ segmentId: SegmentId; trackIndex: number }>
> {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature" as const,
      properties: {
        segmentId: line.segmentId,
        trackIndex: line.trackIndex,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: line.coordinates,
      },
    })),
  };
}

export function gapSpanCollection(
  spans: readonly GapSpanPart[],
): GeoJsonFeatureCollection<
  GeoJsonLineFeature<{
    gapId: GapId;
    kind: GapKind;
    severity: GapSeverity;
  }>
> {
  return {
    type: "FeatureCollection",
    features: spans.map((span) => ({
      type: "Feature" as const,
      properties: {
        gapId: span.gapId,
        kind: span.kind,
        severity: span.severity,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: span.coordinates,
      },
    })),
  };
}

export function gapMarkerCollection(
  markers: readonly GapBoundaryMarker[],
): GeoJsonFeatureCollection<
  GeoJsonPointFeature<{
    gapId: GapId;
    pointId: PointId;
    role: "before" | "after";
    severity: GapSeverity;
  }>
> {
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature" as const,
      properties: {
        gapId: marker.gapId,
        pointId: marker.pointId,
        role: marker.role,
        severity: marker.severity,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [marker.lon, marker.lat],
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Reconstruction + draw-session builders (Phase 4)
// ---------------------------------------------------------------------------

/** Committed reconstruction lines — dashed emerald, one feature per gap. */
export function reconstructionLineCollection(
  parts: readonly ReconstructionPart[],
): GeoJsonFeatureCollection<GeoJsonLineFeature<{ gapId: GapId }>> {
  return {
    type: "FeatureCollection",
    features: parts.map((part) => ({
      type: "Feature" as const,
      properties: { gapId: part.gapId },
      geometry: {
        type: "LineString" as const,
        coordinates: part.coordinates,
      },
    })),
  };
}

/** A draggable/deletable vertex handle of the active draft. */
export interface DrawHandleData {
  gapId: GapId;
  vertexId: VertexId;
  index: number;
  lat: number;
  lon: number;
}

/**
 * A "+"-style insertion handle at the geodesic midpoint of one path leg.
 * `insertIndex` is the vertex-list index a click will insert at (the leg
 * between path[j] and path[j+1] inserts at vertex index j).
 */
export interface DrawMidpointData {
  gapId: GapId;
  insertIndex: number;
  lat: number;
  lon: number;
}

export function drawHandleCollection(
  handles: readonly DrawHandleData[],
): GeoJsonFeatureCollection<
  GeoJsonPointFeature<{ gapId: GapId; vertexId: VertexId; index: number }>
> {
  return {
    type: "FeatureCollection",
    features: handles.map((handle) => ({
      type: "Feature" as const,
      properties: {
        gapId: handle.gapId,
        vertexId: handle.vertexId,
        index: handle.index,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [handle.lon, handle.lat],
      },
    })),
  };
}

export function drawMidpointCollection(
  midpoints: readonly DrawMidpointData[],
): GeoJsonFeatureCollection<GeoJsonPointFeature<{ gapId: GapId; insertIndex: number }>> {
  return {
    type: "FeatureCollection",
    features: midpoints.map((midpoint) => ({
      type: "Feature" as const,
      properties: {
        gapId: midpoint.gapId,
        insertIndex: midpoint.insertIndex,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [midpoint.lon, midpoint.lat],
      },
    })),
  };
}

/** The active draft path (anchors + vertices, drag override applied). */
export function draftLineCollection(
  coordinates: readonly [number, number][],
): GeoJsonFeatureCollection<GeoJsonLineFeature<{ draft: true }>> {
  return {
    type: "FeatureCollection",
    features:
      coordinates.length >= 2
        ? [
            {
              type: "Feature" as const,
              properties: { draft: true },
              geometry: {
                type: "LineString" as const,
                coordinates: coordinates as [number, number][],
              },
            },
          ]
        : [],
  };
}

/** The rubber band: last path point → cursor (empty when hidden). */
export function rubberBandCollection(
  from: { lat: number; lon: number } | null,
  to: { lat: number; lon: number } | null,
): GeoJsonFeatureCollection<GeoJsonLineFeature<{ rubber: true }>> {
  if (!from || !to) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature" as const,
        properties: { rubber: true },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [from.lon, from.lat],
            [to.lon, to.lat],
          ],
        },
      },
    ],
  };
}

/**
 * The first picked span anchor (span-pick mode). A single marker — the
 * second pick completes the span and ends the mode, so no list is needed.
 */
export function pickAnchorCollection(
  anchor: { lat: number; lon: number } | null,
): GeoJsonFeatureCollection<GeoJsonPointFeature<{ pick: true }>> {
  return {
    type: "FeatureCollection",
    features: anchor
      ? [
          {
            type: "Feature" as const,
            properties: { pick: true },
            geometry: {
              type: "Point" as const,
              coordinates: [anchor.lon, anchor.lat],
            },
          },
        ]
      : [],
  };
}

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
 * Phase 3 — Map Display.
 */

import type {
  GapId,
  GapKind,
  GapSeverity,
  PointId,
  SegmentId,
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

/** Everything the map renders for one parsed file. */
export interface RouteViewData {
  lines: readonly RouteLinePart[];
  spans: readonly GapSpanPart[];
  markers: readonly GapBoundaryMarker[];
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

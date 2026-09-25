/**
 * Web-Mercator view projection for off-map route rendering
 * (docs/MASTER_PLAN.md §F: lib/geo — Task 20, share card).
 *
 * The workspace map projects through MapLibre's camera; the share card
 * has no camera (transparent background, no tiles), so it needs the same
 * projection as a small, pure, dependency-free function. This module is
 * that one implementation: normalized Web-Mercator coordinates followed
 * by a uniform fit-and-center into a pixel box, aspect preserved.
 *
 * Honesty rules carry over from the map: points are rendered where they
 * were recorded — no smoothing, no simplification, no invented geometry.
 * Longitudes are unwrapped across the ±180° seam so antimeridian-crossing
 * routes (Fiji, NZ, Alaska) draw as the continuous line the athlete ran
 * instead of a smeared horizontal streak; the projection is a *view*
 * transformation and never changes the underlying coordinates.
 *
 * Pure TypeScript: no DOM, no framework. Golden-value tests live in
 * tests/share-projection.test.ts.
 */

import type { LatLon } from "@/types/domain";

/** Web Mercator's latitude domain (±85.051129°); clamps beyond blow up. */
export const MERCATOR_MAX_LAT = 85.051129;

/** Normalized x in [0, 1] (lon −180…180 → 0…1). */
export function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

/** Normalized y in [0, 1] (lat +85.05… → 0, lat −85.05… → 1). */
export function mercatorY(lat: number): number {
  const clamped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

/** A projected 2D point in normalized [0, 1] space. */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** A pixel box to fit content into (card coordinates). */
export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single continuous projected polyline in card pixels. */
export type ProjectedPolyline = readonly { x: number; y: number }[];

/** The result of projecting polylines into a fit box. */
export interface ProjectionResult {
  /** Polylines in card pixels; single-point polylines stay single points. */
  polylines: readonly ProjectedPolyline[];
  /** True when no finite input point existed (nothing to draw). */
  isEmpty: boolean;
  /** True when at least one polyline is a lone point (rendered as a dot). */
  hasLonePoints: boolean;
  /** The uniform scale applied (normalized units → pixels). */
  scale: number;
}

/**
 * Unwrap longitudes so consecutive points never jump more than 180°:
 * a leg crossing the antimeridian keeps its true short direction by
 * shifting one endpoint's lon by ±360 (working outside [−180, 180] is
 * fine — mercatorX is linear in lon). Per-polyline, independent.
 */
function unwrapLongitudes(points: readonly LatLon[]): number[] {
  const lons = points.map((p) => p.lon);
  for (let i = 1; i < lons.length; i += 1) {
    const delta = lons[i] - lons[i - 1];
    if (delta > 180) lons[i] -= 360;
    else if (delta < -180) lons[i] += 360;
  }
  return lons;
}

/**
 * Project geographic polylines into `box`, preserving aspect ratio and
 * centering the content. Polylines are fitted together (one shared
 * scale/offset — they are one route), each stays an independent stroke
 * (multi-track files never get fabricated connectors). Points with
 * non-finite coordinates are skipped (the bbox convention).
 */
export function projectPolylines(
  polylines: readonly (readonly LatLon[])[],
  box: FitBox,
): ProjectionResult {
  const normalized: NormalizedPoint[][] = [];
  let totalFinite = 0;

  for (const line of polylines) {
    const lons = unwrapLongitudes(line);
    const projected: NormalizedPoint[] = [];
    for (let i = 0; i < line.length; i += 1) {
      const { lat } = line[i];
      if (!Number.isFinite(lat) || !Number.isFinite(lons[i])) continue;
      projected.push({ x: mercatorX(lons[i]), y: mercatorY(lat) });
    }
    if (projected.length > 0) {
      normalized.push(projected);
      totalFinite += projected.length;
    }
  }

  if (totalFinite === 0) {
    return { polylines: [], isEmpty: true, hasLonePoints: false, scale: 0 };
  }

  // Bounds over every projected point (lone dots included).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const line of normalized) {
    for (const p of line) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const contentW = Math.max(maxX - minX, 0);
  const contentH = Math.max(maxY - minY, 0);
  // Degenerate content (a single point, or a perfectly N-S / E-W line)
  // has a zero extent on one axis: scale by the other axis, or fall
  // back to a no-op scale of 1 when both are zero.
  const scale =
    contentW === 0 && contentH === 0
      ? 1
      : Math.min(
          contentW > 0 ? box.width / contentW : Infinity,
          contentH > 0 ? box.height / contentH : Infinity,
        );

  // Center the (possibly degenerate) content in the box.
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const offsetX = box.x + box.width / 2 - centerX * scale;
  const offsetY = box.y + box.height / 2 - centerY * scale;

  const hasLonePoints = normalized.some((line) => line.length === 1);
  const out: ProjectedPolyline[] = normalized.map((line) =>
    line.map((p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY })),
  );

  return { polylines: out, isEmpty: false, hasLonePoints, scale };
}

/**
 * Bounding boxes over WGS-84 coordinates (docs/MASTER_PLAN.md §F: lib/geo).
 *
 * Used by the map view (Phase 3) to frame gap regions with padding and by
 * statistics/inspection panels. Pure functions; golden/hand-computed tests
 * live in tests/geodesy.test.ts.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript: no DOM, no framework, no I/O.
 */

import type { LatLon } from "@/types/domain";
import { hasFiniteCoords } from "./geodesy";

/** Axis-aligned geographic bounding box. */
export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * Smallest bounding box containing all *finite* points.
 * Points with non-finite coordinates are skipped (a NaN extent would make
 * the box useless for map framing); returns `null` when nothing remains.
 */
export function bboxOf(points: readonly LatLon[]): BBox | null {
  let bbox: BBox | null = null;
  for (const p of points) {
    if (!hasFiniteCoords(p)) continue;
    if (bbox === null) {
      bbox = { minLat: p.lat, minLon: p.lon, maxLat: p.lat, maxLon: p.lon };
    } else {
      if (p.lat < bbox.minLat) bbox.minLat = p.lat;
      if (p.lat > bbox.maxLat) bbox.maxLat = p.lat;
      if (p.lon < bbox.minLon) bbox.minLon = p.lon;
      if (p.lon > bbox.maxLon) bbox.maxLon = p.lon;
    }
  }
  return bbox;
}

/** Smallest bounding box containing all given boxes; `null` if none. */
export function unionBBox(boxes: readonly BBox[]): BBox | null {
  let union: BBox | null = null;
  for (const box of boxes) {
    if (union === null) {
      union = { ...box };
    } else {
      union.minLat = Math.min(union.minLat, box.minLat);
      union.minLon = Math.min(union.minLon, box.minLon);
      union.maxLat = Math.max(union.maxLat, box.maxLat);
      union.maxLon = Math.max(union.maxLon, box.maxLon);
    }
  }
  return union;
}

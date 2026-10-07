/**
 * Heatmap strips — Phase 25.1 (docs/plans/v3/
 * phase-25-heatmap-personal-segments.md): the decimated geometry one
 * saved session contributes to the map's heatmap layer.
 *
 * Population: the WHOLE merged route, repairs included — the same
 * population the library card numbers use (§24.1). The heatmap is a
 * visualization of the library's routes, exactly as the map renders a
 * restored session (recorded ink + signal repairs), not a record
 * claimant — records and segment efforts keep their own recorded-only
 * rule (25.3, features/segments/matcher.ts).
 *
 * Decimation: the Phase 9 discipline (lib/map/decimate.ts) applied at
 * DERIVATION time instead of render time — a personal library can hold
 * dozens of 100k-point files, and the toggle must not ship millions of
 * coordinates to the map. Power-of-two strides, per-track endpoints
 * pinned, a per-session point ceiling. Normal files (under the
 * ceiling) keep every point: the strips are the track, verbatim.
 *
 * The record is versioned like every stored record
 * (HEATMAP_STRIPS_SCHEMA_VERSION); reads keep a ceiling — discard,
 * never guess.
 *
 * Phase 25 — Heatmap & personal segments. Pure TypeScript.
 */

import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import type { OriginalTrackPoint } from "@/types/domain";

/** Bump when the strips shape changes; the read side keeps a ceiling. */
export const HEATMAP_STRIPS_SCHEMA_VERSION = 1;

/**
 * The per-session point ceiling. A 250k-point file decimates to ≤2048
 * points (stride 128); a 2k-point file keeps everything (stride 1).
 * 100 saved sessions therefore never exceed ~200k coordinates in the
 * heatmap source — the same order the Phase 9 render budget describes.
 */
export const HEATMAP_MAX_POINTS_PER_SESSION = 2048;

/** One session's decimated track geometry (exactly what IndexedDB holds). */
export interface HeatmapStrips {
  schemaVersion: typeof HEATMAP_STRIPS_SCHEMA_VERSION;
  /** Flat [lon, lat, lon, lat, …] pairs, document order, tracks joined. */
  lonLat: Float64Array;
}

/** The largest power-of-two stride that fits the per-session ceiling. */
function strideForBudget(total: number): number {
  if (total <= HEATMAP_MAX_POINTS_PER_SESSION) return 1;
  const ratio = total / HEATMAP_MAX_POINTS_PER_SESSION;
  // Quantize UP to a power of two (denser than required is never a
  // fidelity problem; sparser would drop below the ceiling's intent).
  return 2 ** Math.ceil(Math.log2(ratio));
}

/** Sample `coords` at `stride` with the exact endpoint pinned (Phase 9). */
function sampleWithPinnedEnds(
  coords: [number, number][],
  stride: number,
): [number, number][] {
  if (stride <= 1 || coords.length <= 2) return coords;
  const kept: [number, number][] = [];
  for (let i = 0; i < coords.length; i += stride) {
    kept.push(coords[i]!);
  }
  const last = coords[coords.length - 1]!;
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

/**
 * Derive one session's strips from its merged route. Usable points
 * only — the same `recon || isUsableStatsPoint` predicate the index
 * walk uses (features/library/index-session.ts), so a damaged
 * coordinate never paints heat where no honest geometry exists.
 */
export function heatmapStrips(merge: MergeResult): HeatmapStrips {
  const perTrack: [number, number][][] = [];
  let total = 0;
  for (const track of merge.tracks) {
    const coords: [number, number][] = [];
    for (const view of track.points) {
      const point = view.point;
      const usable =
        point.source === "reconstructed" ||
        isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;
      coords.push([point.lon, point.lat]);
    }
    if (coords.length > 0) {
      perTrack.push(coords);
      total += coords.length;
    }
  }

  const stride = strideForBudget(total);
  const sampled = perTrack.map((coords) => sampleWithPinnedEnds(coords, stride));
  const length = sampled.reduce((sum, coords) => sum + coords.length, 0);
  const lonLat = new Float64Array(length * 2);
  let cursor = 0;
  for (const coords of sampled) {
    for (const [lon, lat] of coords) {
      lonLat[cursor] = lon;
      lonLat[cursor + 1] = lat;
      cursor += 2;
    }
  }
  return { schemaVersion: HEATMAP_STRIPS_SCHEMA_VERSION, lonLat };
}

/**
 * Validate stored strips (shape + version ceiling). A drifted record
 * is discarded, never partially read.
 */
export function readHeatmapStrips(value: unknown): HeatmapStrips | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== HEATMAP_STRIPS_SCHEMA_VERSION) return null;
  if (!(raw.lonLat instanceof Float64Array)) return null;
  if (raw.lonLat.length % 2 !== 0) return null;
  // Every stored pair must be finite — a single NaN would paint nothing
  // (or everything, depending on the renderer); neither is honest.
  for (let i = 0; i < raw.lonLat.length; i += 2) {
    if (!Number.isFinite(raw.lonLat[i]!) || !Number.isFinite(raw.lonLat[i + 1]!)) {
      return null;
    }
  }
  return {
    schemaVersion: HEATMAP_STRIPS_SCHEMA_VERSION,
    lonLat: raw.lonLat,
  };
}

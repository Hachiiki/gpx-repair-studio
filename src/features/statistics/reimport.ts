/**
 * Re-imported repair statistics (docs/MASTER_PLAN.md §H-7, §L — Phase 7).
 *
 * When a previously exported, repaired file is re-uploaded, its
 * `repairMarkers` split the recording into recorded stretches and
 * reconstructed stretches. These stats quantify that distinction the same
 * way the editor-driven join quantifies fresh repairs:
 *
 *   - **Distance** — a leg with BOTH endpoints marked is reconstructed
 *     distance (it was drawn, not recorded); legs with at most one marked
 *     endpoint stay recorded (the anchor-adjacent legs are real
 *     geometry — tiny, and honestly recorded-adjacent). Damaged
 *     coordinates keep the §L-2 exclusion rule of `distance.ts`.
 *   - **Time** — each maximal run of consecutive marked points is one
 *     re-imported repair; its duration is (last − first) timestamp, which
 *     is exactly the span the original repair distributed (its method
 *     rides along on the markers for provenance).
 *
 * Pure function of the parsed model — no editor state involved. The stats
 * panel combines these with the live-repair join; both keep their own
 * provenance badges ("estimated").
 *
 * Phase 7 — Merge & Export. Pure TypeScript: no React, no DOM.
 */

import type { OriginalTrackData } from "@/types/domain";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { isUsableStatsPoint } from "@/features/statistics/distance";

/** Re-imported repair statistics (all zeros when no markers exist). */
export interface ReimportStats {
  /** Marked points found in the file. */
  markerCount: number;
  /** Legs whose endpoints are both marked (drawn geometry, meters). */
  repairedDistanceM: number;
  /** Number of such legs. */
  repairedLegs: number;
  /**
   * Σ durations of the marked runs (ms) — the spans the original repairs
   * distributed. `null` when no marked point carries a usable timestamp.
   */
  repairTimeMs: number | null;
  /** Maximal runs of consecutive marked points (per segment). */
  runCount: number;
}

const EMPTY: ReimportStats = {
  markerCount: 0,
  repairedDistanceM: 0,
  repairedLegs: 0,
  repairTimeMs: null,
  runCount: 0,
};

/** Compute the re-imported repair statistics of a parsed model. Pure. */
export function reimportStats(data: OriginalTrackData): ReimportStats {
  const markers = data.repairMarkers;
  if (markers === undefined || markers.length === 0) return { ...EMPTY };

  const marked = new Set(markers.map((marker) => marker.pointId));
  let repairedDistanceM = 0;
  let repairedLegs = 0;
  let repairTimeMs: number | null = null;
  let runCount = 0;

  for (const segment of data.segments) {
    // One walk per segment: legs and maximal marked runs together.
    let runStart: number | null = null;
    const points = segment.points;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const isMarked = marked.has(point.id);
      if (isMarked && runStart === null) {
        runStart = i;
        runCount += 1;
      } else if (!isMarked && runStart !== null) {
        const endTime = points[i - 1].time;
        const startTime = points[runStart].time;
        if (endTime !== undefined && startTime !== undefined) {
          const duration = endTime - startTime;
          if (Number.isFinite(duration) && duration > 0) {
            repairTimeMs = (repairTimeMs ?? 0) + duration;
          }
        }
        runStart = null;
      }

      if (i > 0 && isMarked && marked.has(points[i - 1].id)) {
        const prev = points[i - 1];
        if (isUsableStatsPoint(prev) && isUsableStatsPoint(point)) {
          const legM = geodesicDistanceMeters(prev, point);
          if (Number.isFinite(legM)) repairedDistanceM += legM;
          repairedLegs += 1;
        }
      }
    }
    // A marked run ending at the segment's last point closes here.
    if (runStart !== null) {
      const endTime = points[points.length - 1].time;
      const startTime = points[runStart].time;
      if (endTime !== undefined && startTime !== undefined) {
        const duration = endTime - startTime;
        if (Number.isFinite(duration) && duration > 0) {
          repairTimeMs = (repairTimeMs ?? 0) + duration;
        }
      }
    }
  }

  return {
    markerCount: markers.length,
    repairedDistanceM,
    repairedLegs,
    repairTimeMs,
    runCount,
  };
}

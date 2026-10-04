/**
 * The batch summary's pure core (Phase 19 — §EE 19.2 "per-batch
 * manifest variant"): one row per queued file — parse status, its
 * numbers, what the applied edits changed, and a tiny track thumbnail
 * — plus the aggregate line the printed sheet leads with.
 *
 * The counts reuse the working-meta vocabulary (workingMetaOf — the
 * same words MANIFEST.txt writes), and the thumbnail is the static
 * snapshot of the WORKING copy (what the export will contain). Failed
 * files stay in the table with their status word and no numbers — the
 * sheet never hides a failure.
 *
 * Phase 19 — Compare, summaries & guided flows. Pure TypeScript.
 */

import { workingMetaOf } from "@/features/validation/workingCopy";
import { originalDistanceStats } from "@/features/statistics/distance";
import {
  buildTrackSnapshotSvg,
  snapshotLinesOf,
  type SnapshotLine,
} from "@/features/compare/trackSnapshot";
import type {
  OriginalTrackData,
  WorkingEdit,
  WorkingTrackData,
} from "@/types/domain";

/** The distilled per-file view this builder needs (store-shape free). */
export interface BatchSummaryItem {
  fileName: string;
  status: "queued" | "parsing" | "parsed" | "failed";
  /** The frozen original (parsed files only). */
  data: OriginalTrackData | null;
  /** The applied working-copy fixes. */
  edits: readonly WorkingEdit[];
  /** The derived working copy (parsed files only). */
  working: WorkingTrackData | null;
  presetName: string | null;
}

/** Thumbnail geometry cap — 50 files must print like one. */
const THUMB_TOLERANCE_M = 25;
const THUMB_WIDTH = 168;
const THUMB_HEIGHT = 84;

export interface BatchSummaryRow {
  fileName: string;
  status: "parsed" | "failed" | "pending";
  pointCount: number | null;
  distanceM: number | null;
  deletedPoints: number;
  sortedSegments: number;
  smoothedElevations: number;
  changed: boolean;
  presetName: string | null;
  /** The working copy's thumbnail (null when unparseable). */
  snapshotSvg: string | null;
}

export interface BatchSummary {
  rows: readonly BatchSummaryRow[];
  aggregate: {
    total: number;
    parsed: number;
    failed: number;
    changed: number;
    deletedPoints: number;
    recordedPoints: number;
    recordedDistanceM: number;
  };
}

/** Build the printable batch summary (rows + aggregate). */
export function buildBatchSummary(
  items: readonly BatchSummaryItem[],
): BatchSummary {
  const rows: BatchSummaryRow[] = [];
  let parsed = 0;
  let failed = 0;
  let changed = 0;
  let deletedPoints = 0;
  let recordedPoints = 0;
  let recordedDistanceM = 0;

  for (const item of items) {
    if (item.status !== "parsed" || item.data === null) {
      rows.push({
        fileName: item.fileName,
        status: item.status === "failed" ? "failed" : "pending",
        pointCount: null,
        distanceM: null,
        deletedPoints: 0,
        sortedSegments: 0,
        smoothedElevations: 0,
        changed: false,
        presetName: item.presetName,
        snapshotSvg: null,
      });
      if (item.status === "failed") failed++;
      continue;
    }
    parsed++;
    const meta = workingMetaOf(item.edits);
    if (meta.hasEdits) changed++;
    deletedPoints += meta.deletedPointCount;

    let pointCount = 0;
    for (const segment of item.data.segments) {
      pointCount += segment.points.length;
    }
    recordedPoints += pointCount;
    const distanceM = originalDistanceStats(item.data).totalDistanceM;
    recordedDistanceM += distanceM;

    const lines: SnapshotLine[] = snapshotLinesOf(item.data);
    const snapshotSvg =
      lines.length > 0
        ? buildTrackSnapshotSvg({
            lines,
            // Thumbnails print ink-on-paper (the light anchors),
            // whatever the screen theme is.
            colors: { base: "#222222", changed: "#FC4C02" },
            width: THUMB_WIDTH,
            height: THUMB_HEIGHT,
            padding: 6,
            simplifyToleranceM: THUMB_TOLERANCE_M,
            label: item.fileName,
          })
        : null;

    rows.push({
      fileName: item.fileName,
      status: "parsed",
      pointCount,
      distanceM,
      deletedPoints: meta.deletedPointCount,
      sortedSegments: meta.sortedSegmentIds.length,
      smoothedElevations: meta.overriddenEleCount,
      changed: meta.hasEdits,
      presetName: item.presetName,
      snapshotSvg,
    });
  }

  return {
    rows,
    aggregate: {
      total: items.length,
      parsed,
      failed,
      changed,
      deletedPoints,
      recordedPoints,
      recordedDistanceM,
    },
  };
}

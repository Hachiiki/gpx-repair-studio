/**
 * The repair summary's provenance table (Phase 19 — §EE 19.2).
 *
 * One row per modification KIND with its count — the same vocabulary
 * the GPX repair note, the manifest, and the working-copy disclosure
 * use (workingMetaOf and the edit labels), never a second computation.
 * The table answers "what exactly did this app do to my file?" in one
 * glance, on screen and on the printed sheet.
 *
 * Kinds (the plan's list — estimated, filtered, snapped, sorted — plus
 * the surgery and repair populations the later phases added):
 *   - filtered   — points removed by fixes
 *   - estimated  — elevations smoothed, re-imported markers
 *   - sorted     — segments reordered by timestamp (order estimated)
 *   - structure  — splits, copies, manual reorders (surgery)
 *   - authored   — gaps reconstructed in the editor
 *   - snapped    — reconstruction legs that follow roads
 *   - skipped    — detected gaps the user chose to leave alone
 *
 * Phase 19 — Compare, summaries & guided flows. Pure TypeScript.
 */

import type { LocalLabel } from "@/i18n/types";
import { workingMetaOf } from "@/features/validation/workingCopy";
import type { GapId, RoadLeg, WorkingEdit } from "@/types/domain";

/** The modification categories (the table's rows, in reading order). */
export type RepairSummaryKind =
  | "filtered"
  | "estimated"
  | "sorted"
  | "structure"
  | "authored"
  | "snapped"
  | "skipped";

export interface RepairSummaryRow {
  kind: RepairSummaryKind;
  /**
   * Phase 21 — the row's label KEY (e.g. "summary.row.filtered");
   * render sites translate it in the active locale.
   */
  labelKey: string;
  count: number;
  /** The provenance word the row renders (the badge vocabulary). */
  provenance: "recorded" | "estimated" | "modified";
  /** Optional one-line disclosure KEY (the honest detail). */
  detailKey: string | null;
}

/** What the repair population contributes (draw.repairTimeStats + legs). */
export interface RepairSummaryRepairRef {
  gapCount: number;
  /** Committed reconstructions that follow roads (Phase 17). */
  snappedLegs: readonly RoadLeg[];
}

export interface RepairSummaryInput {
  edits: readonly WorkingEdit[];
  repair: RepairSummaryRepairRef | null;
  /** Gap ids the user explicitly skipped in the editor. */
  skippedGapIds: readonly GapId[];
  /** Re-imported gpxr markers (a previously repaired file). */
  reimportMarkerCount: number;
}

export interface RepairSummary {
  rows: readonly RepairSummaryRow[];
  /** Σ counts — "N modifications" in one number. */
  totalChanges: number;
  /** The applied-fix history (label + time), log order — the sheet's
   * audit list. Empty when nothing was applied. */
  history: readonly { label: LocalLabel; appliedAt: number }[];
}

/** The provenance word each kind renders (the badge vocabulary). */
const PROVENANCE_BY_KIND: Record<
  RepairSummaryKind,
  "recorded" | "estimated" | "modified"
> = {
  filtered: "modified",
  estimated: "estimated",
  sorted: "estimated",
  structure: "modified",
  authored: "estimated",
  snapped: "estimated",
  skipped: "recorded",
};

/**
 * Assemble the provenance rows. Zero-count kinds are omitted (a
 * summary states what happened, not what did not); the caller decides
 * how to say "nothing changed" when the table is empty.
 */
export function buildRepairSummary(
  input: RepairSummaryInput,
): RepairSummary {
  const meta = workingMetaOf(input.edits);
  const repair = input.repair;
  const rows: RepairSummaryRow[] = [];

  if (meta.deletedPointCount > 0) {
    rows.push({
      kind: "filtered",
      provenance: PROVENANCE_BY_KIND.filtered,
      labelKey: "summary.row.filtered",
      count: meta.deletedPointCount,
      detailKey: "summary.detail.filtered",
    });
  }
  if (meta.sortedSegmentIds.length > 0) {
    rows.push({
      kind: "sorted",
      provenance: PROVENANCE_BY_KIND.sorted,
      labelKey: "summary.row.sorted",
      count: meta.sortedSegmentIds.length,
      detailKey: "summary.detail.sorted",
    });
  }
  if (meta.overriddenEleCount > 0) {
    rows.push({
      kind: "estimated",
      provenance: PROVENANCE_BY_KIND.estimated,
      labelKey: "summary.row.smoothed",
      count: meta.overriddenEleCount,
      detailKey: "summary.detail.smoothed",
    });
  }
  if (meta.splitCount > 0) {
    rows.push({
      kind: "structure",
      provenance: PROVENANCE_BY_KIND.structure,
      labelKey: "summary.row.split",
      count: meta.splitCount,
      detailKey: "summary.detail.split",
    });
  }
  if (meta.duplicatedSegmentCount > 0) {
    rows.push({
      kind: "structure",
      provenance: PROVENANCE_BY_KIND.structure,
      labelKey: "summary.row.duplicated",
      count: meta.duplicatedSegmentCount,
      detailKey: "summary.detail.duplicated",
    });
  }
  if (meta.reorderedSegmentCount > 0) {
    rows.push({
      kind: "structure",
      provenance: PROVENANCE_BY_KIND.structure,
      labelKey: "summary.row.reordered",
      count: meta.reorderedSegmentCount,
      detailKey: "summary.detail.reordered",
    });
  }
  if ((repair?.gapCount ?? 0) > 0) {
    rows.push({
      kind: "authored",
      provenance: PROVENANCE_BY_KIND.authored,
      labelKey: "summary.row.gaps",
      count: repair?.gapCount ?? 0,
      detailKey: "summary.detail.gaps",
    });
  }
  const snappedLegs = repair?.snappedLegs.length ?? 0;
  if (snappedLegs > 0) {
    rows.push({
      kind: "snapped",
      provenance: PROVENANCE_BY_KIND.snapped,
      labelKey: "summary.row.snapped",
      count: snappedLegs,
      detailKey: "summary.detail.snapped",
    });
  }
  if (input.skippedGapIds.length > 0) {
    rows.push({
      kind: "skipped",
      provenance: PROVENANCE_BY_KIND.skipped,
      labelKey: "summary.row.gapsLeft",
      count: input.skippedGapIds.length,
      detailKey: "summary.detail.gapsLeft",
    });
  }
  if (input.reimportMarkerCount > 0) {
    rows.push({
      kind: "estimated",
      provenance: PROVENANCE_BY_KIND.estimated,
      labelKey: "summary.row.reimported",
      count: input.reimportMarkerCount,
      detailKey: "summary.detail.reimported",
    });
  }

  const totalChanges = rows
    .filter((row) => row.kind !== "skipped")
    .reduce((sum, row) => sum + row.count, 0);

  const history = input.edits.map((edit) => ({
    label: edit.label,
    appliedAt: edit.appliedAt,
  }));

  return { rows, totalChanges, history };
}

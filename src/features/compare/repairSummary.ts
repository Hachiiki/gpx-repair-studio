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
  /** The row's label (e.g. "Points removed by fixes"). */
  label: string;
  count: number;
  /** The provenance word the row renders (the badge vocabulary). */
  provenance: "recorded" | "estimated" | "modified";
  /** Optional one-line disclosure (the honest detail). */
  detail: string | null;
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
  history: readonly { label: string; appliedAt: number }[];
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
      label: "Points removed by fixes",
      count: meta.deletedPointCount,
      detail: "deleted from the working copy — the original keeps them",
    });
  }
  if (meta.sortedSegmentIds.length > 0) {
    rows.push({
      kind: "sorted",
      provenance: PROVENANCE_BY_KIND.sorted,
      label: "Segments sorted by time",
      count: meta.sortedSegmentIds.length,
      detail: "the new order is estimated (stated in the export note)",
    });
  }
  if (meta.overriddenEleCount > 0) {
    rows.push({
      kind: "estimated",
      provenance: PROVENANCE_BY_KIND.estimated,
      label: "Elevations smoothed",
      count: meta.overriddenEleCount,
      detail: "interpolated replacements — gpxr:modified markers in the export",
    });
  }
  if (meta.splitCount > 0) {
    rows.push({
      kind: "structure",
      provenance: PROVENANCE_BY_KIND.structure,
      label: "Segments split",
      count: meta.splitCount,
      detail: "cut after a chosen point; both pieces keep their points",
    });
  }
  if (meta.duplicatedSegmentCount > 0) {
    rows.push({
      kind: "structure",
      provenance: PROVENANCE_BY_KIND.structure,
      label: "Segment copies inserted",
      count: meta.duplicatedSegmentCount,
      detail: "copied with fresh point ids, right after the source",
    });
  }
  if (meta.reorderedSegmentCount > 0) {
    rows.push({
      kind: "structure",
      provenance: PROVENANCE_BY_KIND.structure,
      label: "Manual reorders",
      count: meta.reorderedSegmentCount,
      detail: "segments moved within their track",
    });
  }
  if ((repair?.gapCount ?? 0) > 0) {
    rows.push({
      kind: "authored",
      provenance: PROVENANCE_BY_KIND.authored,
      label: "Gaps reconstructed",
      count: repair?.gapCount ?? 0,
      detail: "drawn in the editor — solid signal lines on the map",
    });
  }
  const snappedLegs = repair?.snappedLegs.length ?? 0;
  if (snappedLegs > 0) {
    rows.push({
      kind: "snapped",
      provenance: PROVENANCE_BY_KIND.snapped,
      label: "Road-following legs",
      count: snappedLegs,
      detail: "reconstruction legs snapped to real roads (opt-in)",
    });
  }
  if (input.skippedGapIds.length > 0) {
    rows.push({
      kind: "skipped",
      provenance: PROVENANCE_BY_KIND.skipped,
      label: "Gaps left as recorded",
      count: input.skippedGapIds.length,
      detail: "excluded from the export's repair population by choice",
    });
  }
  if (input.reimportMarkerCount > 0) {
    rows.push({
      kind: "estimated",
      provenance: PROVENANCE_BY_KIND.estimated,
      label: "Re-imported repair markers",
      count: input.reimportMarkerCount,
      detail: "this file already carried gpxr repairs from a prior session",
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

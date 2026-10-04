/**
 * English dictionary — compare card, side-by-side dialog, repair summary (Phase 21).
 *
 * Extracted from the compare domain's components:
 *   - compare-card.tsx, compare-side-by-side.tsx → `compare.card.*`,
 *     `compare.sideBySide.*`, `compare.mode.*`, `compare.table.*`,
 *     `compare.flag.*`
 *   - batch-summary-section.tsx                → `compare.batch.*`
 *   - summary-print-header.tsx                 → `compare.print.*`
 *   - repair-summary-card.tsx                  → `compare.summary.*`
 *
 * English values are the app's existing copy, moved VERBATIM — the
 * dictionary is the contract every locale checks against. Row labels,
 * notes, and disclosure sentences produced by the pure domain modules
 * (features/compare/*) are NOT here; they render as provided.
 */

export const compare = {
  /** The mode segmented control (compare-card.tsx). */
  "compare.mode.off": "Off",
  "compare.mode.overlay": "Overlay",
  "compare.mode.sideBySide": "Side by side",

  /** The delta table's flag chips (the badge vocabulary + Modified). */
  "compare.flag.recorded": "Recorded",
  "compare.flag.modified": "Modified",
  "compare.flag.estimated": "Estimated",
  "compare.flag.mixed": "Mixed",

  /** Delta-table column heads (compare card + repair summary card). */
  "compare.table.metric": "Metric",
  "compare.table.original": "Original",
  "compare.table.after": "After",
  "compare.table.change": "Change",
  "compare.table.provenance": "Provenance",

  /** CompareCard (compare-card.tsx). */
  "compare.card.title": "Before / after",
  "compare.card.descChanged":
    "What changed against the original recording — on the map and in the numbers.",
  "compare.card.descUnchanged":
    "Nothing has changed yet — the working copy still matches the original recording.",
  "compare.card.modeA11y": "Compare mode",
  "compare.card.overlayNote":
    "The map now shows the original as a dashed ghost under the working copy; the stretches your fixes touched are dashed orange. The legend spells out both.",
  "compare.card.overlayNoteNoChanges":
    "With nothing changed yet, the ghost sits exactly under the working copy — it will diverge where your edits land.",

  /** CompareSideBySideDialog (compare-side-by-side.tsx). */
  "compare.sideBySide.title": "Before / after, side by side",
  "compare.sideBySide.desc":
    "Both pictures share one scale — the same track shape, the same zoom. The left panel is the original recording; the right is what the export will contain.",
  "compare.sideBySide.empty":
    "Nothing to compare yet — the panels build once a file is parsed.",
  "compare.sideBySide.panelOriginal": "Original — as recorded",
  "compare.sideBySide.panelOriginalDesc":
    "The immutable recording. Changed stretches are dashed orange.",
  "compare.sideBySide.panelAfter": "After — edits and repairs",
  "compare.sideBySide.panelAfterDesc":
    "The working copy plus committed repairs. The ghost underneath is the original.",
  "compare.sideBySide.legendTrack": "Track (solid)",
  "compare.sideBySide.legendGhost": "Original ghost",

  /** The shared changed-stretch legend word. */
  "compare.legendChanged": "Changed / repaired",

  /** BatchSummarySection (batch-summary-section.tsx). */
  "compare.batch.title": "Batch summary",
  "compare.batch.desc":
    "{parsed} parsed · {changed} changed · {points} points removed by fixes. The printable sheet lists every file with its own numbers and thumbnail.",
  "compare.batch.print": "Print",
  "compare.batch.subject.one": "{count} file",
  "compare.batch.subject.many": "{count} files",
  "compare.batch.colFile": "File",
  "compare.batch.colPoints": "Points",
  "compare.batch.colDistance": "Distance",
  "compare.batch.colChanges": "Changes",
  "compare.batch.colTrack": "Track",
  "compare.batch.statusParsed": "parsed",
  "compare.batch.statusFailed": "failed",
  "compare.batch.statusReading": "reading",
  "compare.batch.changeRemoved": "{count} removed",
  "compare.batch.changeSorted": "{count} sorted",
  "compare.batch.changeSmoothed": "{count} smoothed",
  "compare.batch.noChanges": "none",
  "compare.batch.thumbA11y": "Track thumbnail of {fileName}",

  /** SummaryPrintHeader (summary-print-header.tsx); the wordmark stays. */
  "compare.print.repairTitle": "Repair summary sheet",
  "compare.print.batchTitle": "Batch repair summary",
  "compare.print.privacyLine":
    "Computed locally in the browser — no data left this device.",

  /** RepairSummaryCard (repair-summary-card.tsx). */
  "compare.summary.title": "Repair summary",
  "compare.summary.desc.one":
    "Every modification, counted and disclosed — {count} change in total.",
  "compare.summary.desc.many":
    "Every modification, counted and disclosed — {count} changes in total.",
  "compare.summary.descNone":
    "No modifications yet — the export will match the original recording.",
  "compare.summary.print": "Print",
  "compare.summary.modifications": "Modifications",
  "compare.summary.colWhat": "What",
  "compare.summary.colCount": "Count",
  "compare.summary.colDisclosure": "Disclosure",
  "compare.summary.empty":
    "No fixes, surgery, or repairs have been applied to this file yet. Anything you confirm will be counted here — and the original file on disk is never touched.",
  "compare.summary.appliedFixes": "Applied fixes, in order",
  "compare.summary.snapshot": "Track snapshot",
  "compare.summary.snapshotA11y":
    "Track snapshot: the working copy in ink, the original ghosted underneath, changed stretches in orange",
  "compare.summary.snapshotFallback": "No renderable track geometry.",
  "compare.summary.legendWorking": "Working copy",
  "compare.summary.legendGhost": "Original (ghost)",

  "compare.stat.points": "Recorded points",
  "compare.stat.distance": "Distance",
  "compare.stat.movingTime": "Moving time",
  "compare.stat.elevation": "Elevation gain",
} as const;

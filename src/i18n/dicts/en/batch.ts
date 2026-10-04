/**
 * English dictionary — batch intake, studio, presets, export (Phase 21).
 *
 * Extracted from the batch domain's components. Keys are namespaced
 * `batch.*`. English values are the app's existing copy, moved
 * VERBATIM — the dictionary is the contract every locale checks
 * against.
 */

export const batch = {
  /**
   * The §EE 18 status vocabulary — the sacred words shared by the
   * intake's per-file chips and the studio's queue table.
   */
  "batch.status.queued": "Queued",
  "batch.status.reading": "Reading",
  "batch.status.parsed": "Parsed",
  "batch.status.failed": "Failed",
  "batch.status.fixed": "Fixed",
  "batch.status.issuesFound": "Issues found",
  "batch.status.clean": "Clean",
  "batch.status.exported": "Exported",

  /** batch-intake.tsx — the multi-file drop zone + collected queue. */
  "batch.intake.title": "Drop your GPX, TCX, or FIT files here",
  "batch.intake.orPrefix": "one or many — or",
  "batch.intake.browse": "click to browse",
  "batch.intake.privacyLine":
    "Files are read locally in this tab — nothing is uploaded anywhere.",
  "batch.intake.refusedOne":
    "\"{name}\" was not added — the queue holds at most {max} files.",
  "batch.intake.refusedMany":
    "{count} files were not added — the queue holds at most {max} files.",
  "batch.intake.filesAria": "Collected files",
  "batch.intake.waiting": "Waiting…",
  "batch.intake.reading": "Reading…",
  "batch.intake.pointsOne": "{count} point",
  "batch.intake.pointsMany": "{count} points",
  "batch.intake.deepChecksOne": "deep checks {count} finding",
  "batch.intake.deepChecksMany": "deep checks {count} findings",
  "batch.intake.removeAria": "Remove {name} from the queue",
  "batch.intake.workQueue": "Work the queue ({count} parsed)",

  /** batch-studio.tsx — the composition root: aggregate line + Add files. */
  "batch.studio.sectionAria": "Batch queue studio",
  "batch.studio.title": "The batch queue",
  "batch.studio.summaryParsed": "{count} parsed",
  "batch.studio.summaryFailed": "{count} failed",
  "batch.studio.summaryFixed": "{count} fixed",
  "batch.studio.summaryFindings": "{count} with findings",
  "batch.studio.summaryClean": "{count} clean",
  "batch.studio.recordedPoints": "{count} recorded points",
  "batch.studio.recordedDistance": "{distance} recorded",
  "batch.studio.pointsRemoved": " · {count} points removed by fixes",
  "batch.studio.aggregateNote":
    ". Everything stays in this browser; the originals are never modified.",
  "batch.studio.addFiles": "Add files",

  /** batch-queue-card.tsx — the studio's queue table. */
  "batch.queue.title": "The queue",
  "batch.queue.fileOne": "{count} file",
  "batch.queue.fileMany": "{count} files",
  "batch.queue.parsedCount": "{count} parsed",
  "batch.queue.failedCount": " · {count} failed",
  "batch.queue.fixedCount": " · {count} fixed",
  "batch.queue.findingsOne":
    "{count} file has findings a preset could address — start with the suggestions below.",
  "batch.queue.findingsMany":
    "{count} files have findings a preset could address — start with the suggestions below.",
  "batch.queue.undoLastFix": "Undo last fix",
  "batch.queue.removeAria": "Remove {name} from the queue",
  "batch.queue.recordedPointsOne": "{count} recorded point",
  "batch.queue.recordedPointsMany": "{count} recorded points",
  "batch.queue.deepChecksClean": "deep checks clean",
  "batch.queue.deepChecksOne": "deep checks: {count} finding",
  "batch.queue.deepChecksMany": "deep checks: {count} findings",
  "batch.queue.fixWithPreset": "fix with a preset",
  "batch.queue.lastFix": "Last fix: {label}",
  "batch.queue.earlierFixes": " (+{count} earlier)",

  /** batch-preset-card.tsx + batch-preset-dialog.tsx — the preset door. */
  "batch.preset.title": "Batch fixes",
  "batch.preset.description":
    "Run one preset across every parsed file — previewed per file, applied only on your confirm.",
  "batch.preset.chipAria": "Preset {name}. {description}",
  "batch.preset.note":
    "Presets use the shipped deep-check settings; tune an individual file in the repair studio. Nothing here touches the originals.",
  "batch.preset.dialogTitleOne": "{count} file",
  "batch.preset.dialogTitleMany": "{count} files",
  "batch.preset.dialogDescription":
    "Preview what would change in every file. Nothing is applied until you confirm — the originals are never rewritten.",
  "batch.preset.stepOne": "{count} step",
  "batch.preset.stepMany": "{count} steps",
  "batch.preset.nothingToDo": "nothing to do",
  "batch.preset.cancel": "Cancel",
  "batch.preset.apply": "Apply to the queue",

  /** batch-export-card.tsx — the ZIP download + export settings. */
  "batch.export.title": "Export the batch",
  "batch.export.description":
    "One ZIP: a repaired GPX per parsed file + a manifest of what changed.",
  "batch.export.modeAria": "Export mode",
  "batch.export.modeStructure": "Structure-preserving",
  "batch.export.modeMerged": "Merged single segment",
  "batch.export.prettyPrint": "Pretty-print the XML",
  "batch.export.note":
    "Files with no applied fixes export unchanged (byte-identical to the identity export). Duplicate names get a suffix — nothing is overwritten. Everything is zipped in this tab.",
  "batch.export.downloadOne": "Download the ZIP ({count} file)",
  "batch.export.downloadMany": "Download the ZIP ({count} files)",
  "batch.export.lastExportOne":
    "Last export covered {count} file — you can export again anytime (files with later fixes are simply re-zipped).",
  "batch.export.lastExportMany":
    "Last export covered {count} files — you can export again anytime (files with later fixes are simply re-zipped).",
} as const;

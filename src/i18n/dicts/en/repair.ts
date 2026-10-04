/**
 * English dictionary — repair domain (Phase 21).
 *
 * Copy for the repair tool's surfaces: the upload zone, gap cards,
 * validation and surgery panels, the export dialog, and session
 * errors. The reference exemplar for the extraction pattern is
 * components/gpx/upload-zone.tsx + this file's `upload.*` keys.
 */

export const repair = {
  /** The upload zone (upload-zone.tsx). */
  "upload.title": "Drop your GPX, TCX, or FIT file here",
  "upload.or": "or",
  "upload.browse": "click to browse",
  "upload.privacyLine":
    "Processed entirely in your browser — the file never leaves this device.",
  "upload.noFileHandy": "No file handy?",
  "upload.trySample": "Try {label}",

  /** The sample nouns (app-shell's sampleLabelKey contract). */
  "sample.ride": "a sample ride",
  "sample.run": "a sample run",

  /**
   * The repair workspace's cards and dialogs (Task 66-a). Values are
   * the components' existing copy, moved verbatim — byte-identical.
   */

  /** gpx-summary-card.tsx — file-level metadata of the loaded activity. */
  "summary.title": "File summary",
  "summary.format": "Format",
  "summary.creator": "Creator",
  "summary.unknownCreator": "Unknown",
  "summary.tracks": "Tracks",
  "summary.segments": "Segments",
  "summary.trackPoints": "Track points",
  "summary.waypoints": "Waypoints",
  "summary.routes": "Routes",
  "summary.timing": "Timing",
  "summary.pointsTimed": "{timed} of {total} points timed",
  "summary.noTimingData": "No timing data",

  /** segment-list.tsx — the recorded structure: tracks → segments. */
  "segmentList.title": "Segments",
  "segmentList.header": "{segments} across {tracks}",
  "segmentList.segmentOne": "{count} segment",
  "segmentList.segmentMany": "{count} segments",
  "segmentList.trackOne": "{count} track",
  "segmentList.trackMany": "{count} tracks",
  "segmentList.trackFallback": "Track {number}",
  "segmentList.points": "{count} points",
  "segmentList.excludedLegsOne": "(+{count} leg excluded)",
  "segmentList.excludedLegsMany": "(+{count} legs excluded)",
  "segmentList.noTimestamps": "No timestamps",
  "segmentList.flagged": "{count} flagged",

  /** session-error-alert.tsx — the actionable failure of a load attempt. */
  "sessionError.atLine": "at line {line}",
  "sessionError.atColumn": ", column {column}",

  /** gap-threshold-settings.tsx — the gap-detection threshold controls. */
  "gapThresholds.openButton": "Detection settings",
  "gapThresholds.note":
    "Changes re-run gap detection on the original data. The file itself is never modified.",
  "gapThresholds.timeLabel": "Time gap threshold",
  "gapThresholds.timeHint": "Timestamp jumps longer than this count as gaps.",
  "gapThresholds.speedLabel": "Speed anomaly threshold",
  "gapThresholds.speedHint":
    "Legs implying a straight-line speed above this count as gaps.",
  "gapThresholds.guardLabel": "Short-leg guard",
  "gapThresholds.guardHint":
    "Legs with a time delta at or below this are immune to the speed check.",
  "gapThresholds.reset": "Reset to defaults",

  /** validation-report.tsx — the validator's findings, grouped by severity. */
  "validation.title": "Validation report",
  "validation.noProblems": "No problems found",
  "validation.healthy": "The recording looks healthy.",
  "validation.severity.error": "error",
  "validation.severity.warning": "warning",
  "validation.severity.info": "info",
  "validation.noun.error": "errors",
  "validation.noun.warning": "warnings",
  "validation.noun.info": "notes",
  "validation.kind.invalidCoord": "Invalid coordinates",
  "validation.kind.outOfRangeCoord": "Out-of-range coordinates",
  "validation.kind.zeroCoord": "Zero-coordinate run",
  "validation.kind.invalidEle": "Invalid elevation",
  "validation.kind.outOfRangeEle": "Out-of-range elevation",
  "validation.kind.unreliableTime": "Unreliable timestamp",
  "validation.kind.undeclaredNamespace": "Undeclared namespace prefix",
  "validation.kind.timeReversed": "Reversed timestamps",
  "validation.kind.speedSpike": "Speed spike",
  "validation.kind.duplicatePoint": "Duplicate points",
  "validation.kind.emptySegment": "Empty segment",
  "validation.kind.singlePointSegment": "Single-point segment",
  "validation.kind.trackWithoutSegments": "Track without segments",
  "validation.kind.noTimingData": "No timing data",
  "validation.kind.reimportedRepair": "Previously repaired",
  "validation.kind.conversionNote": "Import note",

  /** deep-validation-card.tsx — the find→fix surface (Phase 13). */
  "deepValidation.title": "Deep validation",
  "deepValidation.summaryLine": "{summary} in the working copy",
  "deepValidation.noDamage": "No fixable recording damage found",
  "deepValidation.cleanBody":
    "Deep checks hunt teleports, duplicates, drift, clock and elevation damage. This working copy is clean.",
  "deepValidation.kind.speedSpike": "Speed spikes",
  "deepValidation.kind.duplicateCluster": "Duplicate points",
  "deepValidation.kind.gpsDrift": "GPS drift",
  "deepValidation.kind.elevationOutlier": "Elevation outliers",
  "deepValidation.kind.nonMonotonicTime": "Clock runs backwards",
  "deepValidation.kind.missingElevation": "Missing elevation",
  "deepValidation.severity.error": "error",
  "deepValidation.severity.warning": "warning",
  "deepValidation.severity.info": "info",
  "deepValidation.noun.error": "errors",
  "deepValidation.noun.warning": "warnings",
  "deepValidation.noun.info": "notes",
  "deepValidation.fix.removeSpikes": "Remove spikes…",
  "deepValidation.fix.dedupe": "Dedupe…",
  "deepValidation.fix.sortByTime": "Sort by time…",
  "deepValidation.fix.smoothElevations": "Smooth elevations…",
  "deepValidation.fix.removeDrift": "Collapse drift…",
  "deepValidation.fix.thin": "Thin recording…",
  "deepValidation.reason.spike": "spike removal",
  "deepValidation.reason.duplicate": "dedupe",
  "deepValidation.reason.drift": "drift collapse",
  "deepValidation.reason.sort": "time sort",
  "deepValidation.reason.elevation": "elevation smoothing",
  "deepValidation.reason.thin": "thinning",
  "deepValidation.reason.split": "segment split",
  "deepValidation.reason.range": "range deletion",
  "deepValidation.reason.reorder": "manual reorder",
  "deepValidation.reason.copy": "segment copy",
  "deepValidation.presetsAria": "Presets",
  "deepValidation.presets": "Presets",
  "deepValidation.presetAria": "Preset {name}. {description}",
  "deepValidation.presetTitle": "Preset — {name}",
  "deepValidation.changes": "Changes ({count})",
  "deepValidation.appliedAria": "Applied fixes",
  "deepValidation.undoLast": "Undo last",
  "deepValidation.newest": "(newest)",
  "deepValidation.recomputeNote":
    "Statistics, the map route, and the export recompute from this working copy; the original file stays untouched.",
  "deepValidation.jumpToMap": "Jump to map",
  "deepValidation.jumpAria": "Jump the map to the {kind} location",
  "deepValidation.fixAria":
    "{label} Preview what would change, then confirm.",
  "deepValidation.hidePoints": "Hide points",
  "deepValidation.listPoints": "List {count} points",
  "deepValidation.unknownPosition": " · unknown position",
  "deepValidation.andMore": "…and {count} more",

  /** fix-preview-dialog.tsx — the what-would-change gate (Phase 13). */
  "fixPreview.description":
    "Preview what would change. Nothing is applied until you confirm — the original file is never rewritten.",
  "fixPreview.affectedAria": "Affected points",
  "fixPreview.affectedPoints": "Affected points",
  "fixPreview.unknownPosition": " · unknown position",
  "fixPreview.andMore": "…and {count} more",
  "fixPreview.textEquivalent":
    "The list above is the text equivalent of the map view — every affected point is identifiable without the map.",
  "fixPreview.cancel": "Cancel",
  "fixPreview.applyFix": "Apply fix",
  "fixPreview.applyFixes": "Apply {count} fixes",

  /** surgery-card.tsx — manual geometry control over the working copy (Phase 16). */
  "surgery.title": "Track surgery",
  "surgery.description":
    "Cut, trim, copy, and rearrange segments. Every operation previews first and lands in the changes log — one undo step each.",
  "surgery.operationAria": "Surgery operation",
  "surgery.section.split": "Split",
  "surgery.section.range": "Delete range",
  "surgery.section.duplicate": "Duplicate",
  "surgery.section.reorder": "Reorder",
  "surgery.pickBanner": "Click a point on the map to fill {slot}. Press Esc or",
  "surgery.pickSlotSplit": "the split point",
  "surgery.pickSlotRangeFrom": "the range start",
  "surgery.pickSlotRangeTo": "the range end",
  "surgery.pickCancel": "cancel",
  "surgery.pickRangeMismatch":
    "The range's two ends must sit in the same segment — that pick landed in {landed}. Pick the second end inside {current}, or start the range over.",
  "surgery.segmentLabel": "Segment",
  "surgery.rowPoints": "{count} pts",
  "surgery.cutAfterLabel": "Cut after point #",
  "surgery.pickOnMap": "Pick on map",
  "surgery.jump": "Jump",
  "surgery.splitApply": "Split segment…",
  "surgery.splitInvalidNumber": "Enter the point number as a whole number.",
  "surgery.splitTooShort":
    "This segment has fewer than two points — nothing to split off.",
  "surgery.splitAtLast":
    "Point #{number} is the segment's last — a cut after it would be empty. Use 1–{max}.",
  "surgery.fromPointLabel": "From point #",
  "surgery.toPointLabel": "To point #",
  "surgery.pickStart": "Pick start",
  "surgery.pickEnd": "Pick end",
  "surgery.rangeInvalidStart": "Enter the start point as a whole number.",
  "surgery.rangeInvalidEnd": "Enter the end point as a whole number.",
  "surgery.rangeStartTooHighOne":
    "This segment has {count} point — the start can be at most #{max}.",
  "surgery.rangeStartTooHighMany":
    "This segment has {count} points — the start can be at most #{max}.",
  "surgery.rangeEndTooHighOne":
    "This segment has {count} point — the end can be at most #{max}.",
  "surgery.rangeEndTooHighMany":
    "This segment has {count} points — the end can be at most #{max}.",
  "surgery.rangeNote":
    "The stretch runs from the start point to the end point, inclusive — either order. The points around it stay exactly as recorded.",
  "surgery.rangeApply": "Delete range…",
  "surgery.duplicateNote":
    "A copy is inserted directly after its source, inside the same track — fresh ids, identical points.",
  "surgery.duplicateApply": "Duplicate…",
  "surgery.reorderNote":
    "Rearrange segments within their tracks — up/down buttons, no dragging needed. Tracks themselves are never crossed.",
  "surgery.reorderStart": "Reorder segments…",
  "surgery.moveUpAria": "Move {segment} up",
  "surgery.moveDownAria": "Move {segment} down",
  "surgery.cancel": "Cancel",
  "surgery.applyOrder": "Apply order…",

  /** export-card.tsx — the tools-panel entry point of the export workflow. */
  "export.card.title": "Export",
  "export.card.descriptionRepairs":
    "Your committed repairs, ready to download with their provenance markers.",
  "export.card.descriptionPlain":
    "Download the file as-is, or after adding repairs.",
  "export.card.reviewButton": "Review & export",
  "export.card.repairsToInclude": "Repairs to include",
  "export.card.distanceAdded": "Distance added",
  "export.card.skippedGaps": "Skipped gaps",
  "export.card.openInEditor": "Open in editor (excluded)",

  /** export-dialog.tsx — the pre-export summary (the honesty surface). */
  "export.dialog.title": "Export your repaired track",
  "export.dialog.descriptionRepairs":
    "The download includes your committed repairs, marked so re-uploading keeps them distinguishable from the recording.",
  "export.dialog.descriptionPlain":
    "No committed repairs yet — the export will be a structure-preserved copy of the original file.",
  "export.dialog.whatGoesIn": "What goes into the file",
  "export.dialog.repairsOne": "{count} repair",
  "export.dialog.repairsMany": "{count} repairs",
  "export.dialog.inserted":
    "inserted — {points}, {distance} added (per-repair resampling exactly as previewed).",
  "export.dialog.pointsOne": "{count} reconstructed point",
  "export.dialog.pointsMany": "{count} reconstructed points",
  "export.dialog.everyRecordedPoint":
    "Every recorded point, byte-identical to the upload — nothing inserted, nothing rewritten.",
  "export.dialog.originalPointsPrefix": "Original points are",
  "export.dialog.originalPointsStrong": "never modified",
  "export.dialog.originalPointsRest":
    "— values are re-emitted verbatim; repairs only insert.",
  "export.dialog.reconstructedCarry": "Reconstructed points carry",
  "export.dialog.reconstructedRest":
    "provenance markers; a repair note is added to the file metadata.",
  "export.dialog.reimportedNote":
    "{count} points already marked from a previous repair keep their markers.",
  "export.dialog.workingPrefix": "Working-copy edits ride along:",
  "export.dialog.workingSuffix":
    " — the repair note and gpxr:modified markers disclose every change.",
  "export.dialog.workingPointsRemovedOne": "{count} point removed",
  "export.dialog.workingPointsRemovedMany": "{count} points removed",
  "export.dialog.workingSegmentsSplitOne": "{count} segment split",
  "export.dialog.workingSegmentsSplitMany": "{count} segments split",
  "export.dialog.workingCopiesInsertedOne": "{count} copy inserted",
  "export.dialog.workingCopiesInsertedMany": "{count} copies inserted",
  "export.dialog.workingManualReordersOne": "{count} manual reorder",
  "export.dialog.workingManualReordersMany": "{count} manual reorders",
  "export.dialog.workingSegmentsSortedOne": "{count} segment sorted by time",
  "export.dialog.workingSegmentsSortedMany": "{count} segments sorted by time",
  "export.dialog.workingElevationsSmoothedOne": "{count} elevation smoothed",
  "export.dialog.workingElevationsSmoothedMany":
    "{count} elevations smoothed",
  "export.dialog.finalNumbers": "Final numbers",
  "export.dialog.repairsIncluded": "Repairs included",
  "export.dialog.distanceAdded": "Distance added",
  "export.dialog.repairsWithoutDuration": "Repairs without a duration",
  "export.dialog.repairsWithElevation": "Repairs with estimated elevation",
  "export.dialog.caveatOpenOne":
    "{count} repair is still open in the editor — close the editor to include it.",
  "export.dialog.caveatOpenMany":
    "{count} repairs are still open in the editor — close the editor to include them.",
  "export.dialog.caveatNoDurationOne":
    "{count} repair exports without timestamps — no duration was entered and none is invented.",
  "export.dialog.caveatNoDurationMany":
    "{count} repairs export without timestamps — no duration was entered and none is invented.",
  "export.dialog.caveatDiscrepancyOne":
    "{count} manual duration disagrees with the recorded gap span — interior timestamps follow the manual value; recorded timestamps stay untouched.",
  "export.dialog.caveatDiscrepancyMany":
    "{count} manual durations disagree with the recorded gap span — interior timestamps follow the manual value; recorded timestamps stay untouched.",
  "export.dialog.caveatStaleOne":
    "{count} repair's elevation is from an older route version — those values are excluded (never exported against a moved route). Re-estimate in the editor to include it.",
  "export.dialog.caveatStaleMany":
    "{count} repairs' elevations are from an older route version — those values are excluded (never exported against a moved route). Re-estimate in the editor to include them.",
  "export.dialog.caveatUpgrade":
    "This GPX 1.0 file will be written as GPX 1.1 — the provenance markers require the 1.1 extension mechanism. All recorded values are preserved verbatim.",
  "export.dialog.caveatNoTiming":
    "This file has no timing data and no start time was entered — reconstructed points export without timestamps (valid GPX). Enter a start time in the timing card to spread them.",
  "export.dialog.fileFormat": "File format",
  "export.dialog.gpxLayout": "GPX layout",
  "export.dialog.modeStructure": "Structure-preserving",
  "export.dialog.modeStructureHint":
    "Keep the original segments; each repair becomes its own segment at the gap. Recommended for Strava and Garmin Connect.",
  "export.dialog.modeMerged": "Merged single segment",
  "export.dialog.modeMergedHint":
    "One continuous segment per track with the repairs interleaved — for tools that dislike multi-segment tracks.",
  "export.dialog.prettyPrint": "Human-readable formatting",
  "export.dialog.prettyPrintAria": "Pretty-print the exported file",
  "export.dialog.cancel": "Cancel",
  "export.dialog.download": "Download {format}",

  /*
   * Fix plan labels + preview summaries (features/validation/fixes.ts).
   * Plural pairs keep the counts honest; params: {count}, {spacing}.
   */
  "fix.removeSpikes.label.one": "Remove {count} speed spike",
  "fix.removeSpikes.label.many": "Remove {count} speed spikes",
  "fix.removeSpikes.s1.one": "1 recorded point leaves the working copy — the later point of each teleport leg.",
  "fix.removeSpikes.s1.many": "{count} recorded points leave the working copy — the later point of each teleport leg.",
  "fix.removeSpikes.s2": "The surrounding recorded points stay byte-original; nothing is rewritten.",
  "fix.removeDrift.label.one": "Collapse {count} drift point",
  "fix.removeDrift.label.many": "Collapse {count} drift points",
  "fix.removeDrift.s1.one": "1 stop-and-wander point leaves the working copy; each run's first point stays as the honest \"we were here\" marker.",
  "fix.removeDrift.s1.many": "{count} stop-and-wander points leave the working copy; each run's first point stays as the honest \"we were here\" marker.",
  "fix.removeDrift.s2": "Distances and durations recompute from the working copy afterwards.",
  "fix.dedupe.label.one": "Dedupe {count} point",
  "fix.dedupe.label.many": "Dedupe {count} points",
  "fix.dedupe.s1.one": "1 near-duplicate point leaves the working copy — each cluster keeps its first point.",
  "fix.dedupe.s1.many": "{count} near-duplicate points leave the working copy — each cluster keeps its first point.",
  "fix.dedupe.s2": "Only points the duplicate check flagged are removed; healthy density is untouched.",
  "fix.sortByTime.label.one": "Sort {count} segment by time",
  "fix.sortByTime.label.many": "Sort {count} segments by time",
  "fix.sortByTime.s1.one": "{count} segment is stably reordered by timestamp — equal times keep their current order.",
  "fix.sortByTime.s1.many": "{count} segments are stably reordered by timestamp — equal times keep their current order.",
  "fix.sortByTime.s2.one": "{count} point without a usable timestamp moves to the segment end.",
  "fix.sortByTime.s2.many": "{count} points without a usable timestamp move to the segment end.",
  "fix.sortByTime.s3": "The file's point order becomes estimated — the export notes it.",
  "fix.smoothEle.label.one": "Smooth {count} elevation",
  "fix.smoothEle.label.many": "Smooth {count} elevations",
  "fix.smoothEle.s1.one": "{count} outlying elevation is replaced by linear interpolation between the nearest healthy neighbors.",
  "fix.smoothEle.s1.many": "{count} outlying elevations are replaced by linear interpolation between the nearest healthy neighbors.",
  "fix.smoothEle.s2": "Each replacement is labeled in the export (gpxr marker) — the recorded values stay in the original.",
  "fix.thin.label": "Thin the recording to {spacing} m+",
  "fix.thin.s1.one": "{count} point closer than {spacing} m to their kept predecessor leave the working copy.",
  "fix.thin.s1.many": "{count} points closer than {spacing} m to their kept predecessor leave the working copy.",
  "fix.thin.s2": "Every kept point stays byte-original — nothing is interpolated or invented (decimation, not resampling). Each segment keeps its first and last point.",

  /** Fix presets (fixes.ts PRESETS — the names mirror the canonical
   *  `name` fields; a gate test pins them equal). */
  "preset.drift-cleanup.name": "Drift cleanup",
  "preset.drift-cleanup.description": "Collapse stop-and-wander drift, then dedupe the leftovers it created.",
  "preset.dedupe-sort.name": "Dedupe & sort",
  "preset.dedupe-sort.description": "Remove near-duplicates, then reorder segments by their timestamps.",
  "preset.resample-thin.name": "Resample (thin)",
  "preset.resample-thin.description": "Thin an over-dense recording to a minimum spacing between kept points.",
  "preset.spike-sweep.name": "Spike & outlier sweep",
  "preset.spike-sweep.description": "Remove GPS teleports, then smooth the elevation outliers beside them.",

  /*
   * Surgery labels + summaries (features/validation/surgery.ts).
   * The reorder plural is FIXED here (the pre-21 string rendered
   * "1 moves / 2 move" — inverted; recorded in §OO).
   */
  "surgery.split.label": "Split {segment} after point #{at}",
  "surgery.split.s1": "{segment} is cut in two after point #{at} — the {count} points after it move to a new segment in the same track.",
  "surgery.split.s2": "Every point keeps its position and its recorded data; only the grouping changes. The route and its distances do not move by the cut itself — the numbers recompute from the same points.",
  "surgery.deleteRange.label.one": "Delete {count} point from {segment}",
  "surgery.deleteRange.label.many": "Delete {count} points from {segment}",
  "surgery.deleteRange.s1.one": "{count} point leaves the working copy — the stretch from point #{lo} to #{hi} of {segment}.",
  "surgery.deleteRange.s1.many": "{count} points leave the working copy — the stretch from point #{lo} to #{hi} of {segment}.",
  "surgery.deleteRange.s2.whole": "The stretch covers the whole segment — it stays in the file as an empty segment rather than vanishing silently.",
  "surgery.deleteRange.s2.partial": "The points before and after the stretch stay exactly as recorded.",
  "surgery.deleteRange.s3": "The original file keeps every point; the working copy and the export note the removal.",
  "surgery.duplicate.label": "Duplicate {segment} ({count} points)",
  "surgery.duplicate.s1.one": "A copy of {segment} ({count} point) is inserted directly after it, inside the same track.",
  "surgery.duplicate.s1.many": "A copy of {segment} ({count} points) is inserted directly after it, inside the same track.",
  "surgery.duplicate.s2": "The copy's points are identical and get fresh ids — later fixes can address them individually. Its distance and time count like any other segment's (that is what a duplicate is for).",
  "surgery.duplicate.s3": "Segment extras — rare vendor children — are not copied; they belong to the original recording.",
  "surgery.reorder.label.one": "Reorder segments ({count} move)",
  "surgery.reorder.label.many": "Reorder segments ({count} moves)",
  "surgery.reorder.s1.one": "Segments are rearranged within their tracks — {count} segment changes position.",
  "surgery.reorder.s1.many": "Segments are rearranged within their tracks — {count} segments change positions.",
  "surgery.reorder.s2": "Tracks themselves are never crossed and the point order inside every segment is untouched; only the sequence of segments changes.",
  "surgery.reorder.s3": "The working copy's order is your choice — the export discloses the manual reorder.",

  /*
   * Repair summary rows (features/compare/repairSummary.ts) — the
   * print sheet + the summary card render them; keys resolve at
   * render so both surfaces stay in the active locale.
   */
  "summary.row.filtered": "Points removed by fixes",
  "summary.row.sorted": "Segments sorted by time",
  "summary.row.smoothed": "Elevations smoothed",
  "summary.row.split": "Segments split",
  "summary.row.duplicated": "Segment copies inserted",
  "summary.row.reordered": "Manual reorders",
  "summary.row.gaps": "Gaps reconstructed",
  "summary.row.snapped": "Road-following legs",
  "summary.row.gapsLeft": "Gaps left as recorded",
  "summary.row.reimported": "Re-imported repair markers",
  "summary.detail.filtered": "deleted from the working copy — the original keeps them",
  "summary.detail.sorted": "the new order is estimated (stated in the export note)",
  "summary.detail.smoothed": "interpolated replacements — gpxr:modified markers in the export",
  "summary.detail.split": "cut after a chosen point; both pieces keep their points",
  "summary.detail.duplicated": "copied with fresh point ids, right after the source",
  "summary.detail.reordered": "segments moved within their track",
  "summary.detail.gaps": "drawn in the editor — solid signal lines on the map",
  "summary.detail.snapped": "reconstruction legs snapped to real roads (opt-in)",
  "summary.detail.gapsLeft": "excluded from the export's repair population by choice",
  "summary.detail.reimported": "this file already carried gpxr repairs from a prior session",

  "export.format.gpx": "The full-fidelity export: every recorded value plus gpxr provenance markers — re-upload keeps repairs distinguishable.",
  "export.format.kml": "For Google Earth and mapping tools: the track line per segment plus stats and provenance as ExtendedData.",
  "export.format.geojson": "For developers and GIS tools: one Feature per track, coordinates plus per-track stats and provenance properties.",
  "export.format.csv": "For spreadsheets: one row per trackpoint with a provenance column (recorded / estimated / modified).",

  "sample.repairRide.summary": "A synthetic ride with two GPS gaps — one suspect, one severe — and full timestamps.",
  "sample.cleanRun.summary": "A synthetic steady run with no gaps and no anomalies — a clean continuous route.",
  "sample.mergeA.summary": "The first half of a synthetic two-part commute.",
  "sample.mergeB.summary": "The second half of the same commute, recorded 20 minutes later where part 1 ended.",
} as const;

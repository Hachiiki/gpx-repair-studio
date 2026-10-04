/**
 * English dictionary — merge tool surfaces (Phase 21).
 *
 * Extracted from the merge domain's components. Keys are namespaced
 * `merge.*` with per-component sub-namespaces (`merge.intake.*` for
 * the multi-file intake, `merge.arrangement.*` for the studio's file
 * list, `merge.details.*` / `merge.export.*` for the studio's cards,
 * `merge.studio.*` for the composition root, `merge.shareDialog.*` /
 * `merge.shareView.*` for the share flow). English values are the
 * app's existing copy, moved VERBATIM — the dictionary is the
 * contract every locale checks against.
 */

export const merge = {
  /** MergeIntake (merge-intake.tsx) — the tool page's multi-file intake. */
  "merge.intake.dropTitle": "Drop your GPX, TCX, or FIT files here",
  "merge.intake.twoOrMore": "two or more — or",
  "merge.intake.browse": "click to browse",
  "merge.intake.privacyLine":
    "Files are read locally in this tab — nothing is uploaded anywhere.",
  "merge.intake.noFilesHandy": "No files handy?",
  "merge.intake.trySamplePair": "Try a sample pair",
  "merge.intake.collectedFiles": "Collected files",
  "merge.intake.reading": "Reading…",
  "merge.intake.filePoints": "{count} points",
  "merge.intake.fileSegment": "{count} segment",
  "merge.intake.fileSegments": "{count} segments",
  "merge.intake.fileWaypoint": "{count} waypoint",
  "merge.intake.fileWaypoints": "{count} waypoints",
  "merge.intake.removeFile": "Remove {fileName}",
  "merge.intake.combine": "Combine into one route",
  "merge.intake.needTwo": "Add at least two track files to combine them.",
  "merge.intake.oneMore": "One more file — a merge needs at least two.",
  "merge.intake.joinOrder":
    "They join in the order above — you can rearrange everything on the next page.",

  /** MergeFilesCard (merge-files-card.tsx) — the arrangement list. */
  "merge.arrangement.title": "Files in this merge",
  "merge.arrangement.intro":
    "They join in this order — top to bottom, one route. Rearrange, remove, or add more; the map and the export follow along.",
  "merge.arrangement.orderLabel": "Merge order",
  "merge.arrangement.position": "Position {index}",
  "merge.arrangement.reading": "Reading…",
  "merge.arrangement.filePoints": "{count} points",
  "merge.arrangement.noTimestamps": "no timestamps",
  "merge.arrangement.moveUp": "Move {fileName} up",
  "merge.arrangement.moveDown": "Move {fileName} down",
  "merge.arrangement.showOnMap": "Show {fileName} on the map",
  "merge.arrangement.removeFile": "Remove {fileName} from the merge",
  "merge.arrangement.addFiles": "Add files",
  "merge.arrangement.sortByTime": "Sort by start time",

  /** MergeDetailsCard (merge-details-card.tsx) — the merged identity. */
  "merge.details.title": "The combined activity",
  "merge.details.intro":
    "One track, one name — this is what Strava and other platforms display for the merged file.",
  "merge.details.nameLabel": "Activity name",
  "merge.details.namePlaceholder": "e.g. Weekend double",
  "merge.details.nameHint":
    "Written to the file's metadata and its single track. Leave empty for an unnamed file, like a raw watch export.",
  "merge.details.factFiles": "Files merged",
  "merge.details.factPoints": "Recorded points",
  "merge.details.factDistance": "Distance",
  "merge.details.factWaypoints": "Waypoints",

  /** MergeExportCard (merge-export-card.tsx) — the download + honesty. */
  "merge.export.title": "Download the merged file",
  "merge.export.introOne":
    "One track: all {points} points from {count} file, in the order above, under the name you chose.",
  "merge.export.introMany":
    "One track: all {points} points from {count} files, in the order above, under the name you chose.",
  "merge.export.download": "Download .gpx",
  "merge.export.needTwo":
    "A merge needs at least two files — add one more above.",
  "merge.export.honesty":
    "Every recorded point, elevation, timestamp, and waypoint is carried over verbatim. Single-file metadata (author, copyright, per-track descriptions) is not — several files' worth cannot be combined honestly.",

  /** MergeStudio (merge-studio.tsx) — the composition root's labels. */
  "merge.studio.sectionLabel": "Merge map and arrangement",
  "merge.studio.toolsLabel": "Merge tools",
  "merge.studio.detailsTitle": "The merged recording",
  "merge.studio.detailsIntro":
    "Everything the app knows about the combined file — every point carried over verbatim from its source, in the order you set.",
  "merge.studio.scrollCueLabel": "Statistics & file details",
  "merge.studio.srNote": "This is the merged route of {count} recordings.",
  "merge.studio.defaultFileName": "Merged recording",
  "merge.studio.emptyDetails":
    "Nothing to merge yet — add at least two files and the combined route, its statistics, and its export appear here.",

  /** ShareMergeDialog (share-merge-dialog.tsx) — the Share gate. */
  "merge.shareDialog.title": "Share your merged recording",
  "merge.shareDialog.intro":
    "Here is exactly what happens next — nothing leaves this browser either way.",
  "merge.shareDialog.step1Lead": "Your merged GPX downloads now",
  "merge.shareDialog.step1Mid": "—",
  "merge.shareDialog.step1Tail":
    ", the same file the Download button produces. Import it into Strava or any GPX platform.",
  "merge.shareDialog.step2Lead": "The share card opens",
  "merge.shareDialog.step2Mid":
    "— your combined route as a Strava-style graphic with",
  "merge.shareDialog.step2Fallback":
    "the merged file's distance, pace, and time",
  "merge.shareDialog.step2Tail": ". Download it as a PNG from there.",
  "merge.shareDialog.honesty":
    "Every recorded point stays exactly as its source recorded it — merging re-orders files, never values. You can come straight back to the arrangement from the share view.",
  "merge.shareDialog.confirm": "Download GPX & open share card",
  "merge.shareDialog.cancel": "Not now",

  /** MergeShareView (merge-share-view.tsx) — the share card view. */
  "merge.shareView.title": "Share card",
  "merge.shareView.intro":
    "A Strava-style graphic of your merged recording — transparent background, rendered from the combined route and the time it carries.",
  "merge.shareView.transparentNote": "Transparent background — shown on dark",
  "merge.shareView.toolsLabel": "Share card tools",
  "merge.shareView.summaryTitle": "On the card",
  "merge.shareView.summaryIntro":
    "The same numbers the statistics panel shows — what the merged file carries.",
  "merge.shareView.statDistance": "Distance",
  "merge.shareView.statPace": "Pace",
  "merge.shareView.statTime": "Time",
  "merge.shareView.pngResolution": "PNG resolution",
  "merge.shareView.scale1": "1×",
  "merge.shareView.scale1Detail": "1080 × 1920",
  "merge.shareView.scale2": "2×",
  "merge.shareView.scale2Detail": "2160 × 3840",
  "merge.shareView.downloadPng": "Download PNG",
  "merge.shareView.backToArrangement": "Back to arrangement",
  "merge.shareView.numbersTitle": "What the numbers mean",
  "merge.shareView.numbersIntro": "A merged recording, honestly labeled.",

  "merge.shareDialog.andGlue": ", and ",
} as const;

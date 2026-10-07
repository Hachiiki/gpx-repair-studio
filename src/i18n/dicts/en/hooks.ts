/**
 * English dictionary — hook-fired copy (Phase 21, Task 66-i).
 *
 * Everything the hooks and state stores fire at user-action time or
 * hand to components as display strings: toasts, announcements,
 * parse/read failure titles + details, elevation failure copy, share
 * notes, and the saved-sessions manager's sentences. Keys are
 * namespaced `hook.<hookDomain>.*`; English values are the app's
 * existing copy, moved VERBATIM — byte-identical (tests assert many
 * of these strings).
 *
 * Non-React module functions in hook files (describeParseError,
 * addMergeFiles, loadGpxFile, loadRecoveryFile,
 * restoreSessionFromRecord, the elevation failure mappers) resolve
 * through translateNow(); React hook bodies use their own useI18n().
 */

export const hooks = {
  /**
   * Parse/read failures (use-gpx-session's describeParseError + the
   * empty/read guards of loadGpxFile, addMergeFiles, loadRecoveryFile
   * and the batch pump). Rendered by the session error alerts.
   */
  "hook.parse.malformedXml.title": "Not well-formed XML",
  "hook.parse.malformedXml.detail":
    '"{fileName}" could not be parsed as XML. The file may be truncated or not a GPX export at all. {message}',
  "hook.parse.notGpx.title": "Not a GPX file",
  "hook.parse.notGpx.detail":
    "Expected a <gpx> root element but found {found}. Re-export the activity as a GPX file and try again.",
  "hook.parse.invalidVersion.title": "Unsupported GPX version",
  "hook.parse.invalidVersion.detail":
    'GPX files must declare version "1.0" or "1.1"; this file declares {found}. Re-export from your device or platform with a standard GPX version.',
  "hook.parse.unsupportedFormat.title": "Unsupported file format",
  "hook.parse.unsupportedFormat.detail":
    '"{fileName}" is not a GPX, TCX, or FIT track file ({reason}). Re-export the activity in one of those formats and try again.',
  "hook.parse.notTcx.title": "Not a TCX file",
  "hook.parse.notTcx.detail":
    "Expected a <TrainingCenterDatabase> root element but found {found}. Re-export the activity as a TCX file and try again.",
  "hook.parse.malformedFit.title": "Unreadable FIT file",
  "hook.parse.malformedFit.detail":
    '"{fileName}" could not be decoded as a FIT file ({message}). The file may be corrupted or not a FIT export at all.',
  /** The inline fallbacks inside the parse error details. */
  "hook.parse.noRootElement": "no root element",
  "hook.parse.noVersion": "no version",
  /** The empty-file and read-failure guards of the intake pipelines. */
  "hook.parse.emptyTitle": "Empty file",
  "hook.parse.emptyDetailFormats":
    '"{fileName}" contains no data. Choose a non-empty GPX, TCX, or FIT export.',
  "hook.parse.emptyDetailTrack":
    '"{fileName}" contains no data. Choose a non-empty track export.',
  "hook.parse.readTitle": "Could not read file",
  "hook.parse.readDetail": '"{fileName}" could not be read: {reason}',

  /** Elevation (use-elevation + its recovery/create/plan mirrors). */
  "hook.elevation.errorNetwork":
    "The elevation service could not be reached — check your connection and try again.",
  "hook.elevation.errorThrottled":
    "The elevation service is rate-limiting requests — wait a few seconds and try again.",
  "hook.elevation.errorServer":
    "The elevation service is having trouble right now — try again in a moment.",
  "hook.elevation.errorBadResponse":
    "The elevation service returned an unexpected response — try again in a moment.",
  "hook.elevation.errorNoData":
    "The elevation service returned no usable data — try again in a moment.",
  "hook.elevation.blockedDrawRoute":
    "Draw the missing route first — elevation is estimated for the points you draw.",
  "hook.elevation.blockedTwoPoints":
    "Draw at least two points on the map to estimate elevation.",

  /** Export downloads (the aria-live outcome of every blob download). */
  "hook.export.ready": "Export ready — {fileName} downloaded.",
  "hook.export.libraryReady": "Export ready — {count} sessions in {fileName}.",
  "hook.export.statsReady": "Stats sheet ready — {fileName} downloaded.",
  "hook.export.batchZipReady":
    "Export ready — {fileName} downloaded ({files} + the manifest).",

  /** Batch (use-batch-session: preset apply, undo, and the ZIP). */
  "hook.batch.nothingToApply":
    "Nothing to apply — every file was already clean for this preset.",
  "hook.batch.presetApplied": "{preset} applied to {files} — {fixes} in total.",
  "hook.batch.fileCountOne": "{count} file",
  "hook.batch.fileCountMany": "{count} files",
  "hook.batch.fixCountOne": "{count} fix",
  "hook.batch.fixCountMany": "{count} fixes",
  "hook.batch.repairedFilesOne": "{count} repaired file",
  "hook.batch.repairedFilesMany": "{count} repaired files",
  "hook.batch.undone": "Undone — the file's most recent fix is reverted.",
  "hook.batch.nothingToWorkOn":
    "Nothing to work on yet — add at least one file that parses.",

  /** Surgery (use-surgery). */
  "hook.surgery.pointPicked": "Point picked.",
  "hook.surgery.applied":
    "Surgery applied — {label}. Stats recompute from the working copy.",

  /** Deep validation (use-deep-validation). */
  "hook.deepValidation.applied":
    "Fix applied — {label}. The report re-checks the working copy.",
  "hook.deepValidation.fixesSummary": "{count} fixes ({labels})",
  "hook.deepValidation.undone": "Undone — {label}.",

  /** Road snapping (use-road-snap). */
  "hook.roadSnap.finding": "Finding the {profile} for your line…",
  "hook.roadSnap.unavailable":
    "Road snapping is unavailable right now — your line stays as you drew it.",
  "hook.roadSnap.noMatch":
    "The routing service could not match your line — it stays as you drew it.",
  "hook.roadSnap.previewReady": "Road preview ready — {meters} m on the road.",
  "hook.roadSnap.cancelled":
    "Road preview cancelled — your line is back as you drew it.",
  "hook.roadSnap.snapped":
    "Line snapped to the {profile} — undo to get your drawing back.",

  /** The draw editor's typed-coordinate confirmations. */
  "hook.drawEditor.pointAddedByCoords":
    "Point added by coordinates — the line now holds {count} points.",
  "hook.drawEditor.pointInsertedByCoords": "Point inserted by coordinates.",

  /** The repair flow's two derived-state announcements. */
  "hook.repairAnnounce.gapsOne":
    "{count} gap detected in {file} — open one to draw its route.",
  "hook.repairAnnounce.gapsMany":
    "{count} gaps detected in {file} — open one to draw its route.",
  "hook.repairAnnounce.theFile": "the file",
  "hook.repairAnnounce.loadedNoGaps": "{file} loaded — no gaps detected.",
  "hook.repairAnnounce.fileFallback": "File",
  "hook.repairAnnounce.reconstructedOne":
    "Gap reconstructed — {repaired} of {total} gaps repaired.",
  "hook.repairAnnounce.reconstructedMany":
    "{count} gaps reconstructed — {repaired} of {total} gaps repaired.",

  /** The reload autosave restore (use-session-recovery). */
  "hook.sessionRecovery.repairRestored": "Previous repair session restored.",
  "hook.sessionRecovery.recoveryRestored":
    "Previous recovery session restored.",
  "hook.sessionRecovery.createRestored": "Previous create session restored.",
  "hook.sessionRecovery.planRestored": "Previous plan restored.",

  /** The one restore path (restore-session.ts). */
  "hook.restore.repairRestored": "Repair session restored.",
  "hook.restore.recoveryRestored": "Recovery session restored.",
  "hook.restore.createRestored": "Create session restored.",
  "hook.restore.planRestored": "Plan session restored.",

  /** The saved-sessions shelf (use-saved-sessions). */
  "hook.savedSessions.nothingToSave":
    "Nothing to save yet — draw or fix something first.",
  "hook.savedSessions.saveFailed":
    "Could not save the session — storage is unavailable or full.",
  "hook.savedSessions.saved":
    'Saved — "{name}" is on your sessions shelf.',
  "hook.savedSessions.nothingToExport":
    "Nothing to export yet — draw or fix something first.",
  "hook.savedSessions.renameFailed": "Could not rename the session.",
  "hook.savedSessions.deleteFailed": "Could not delete the session.",
  "hook.savedSessions.deleted": "Session deleted.",
  "hook.savedSessions.deletedRows": "{count} sessions deleted.",
  "hook.savedSessions.unreadableRecord":
    "This saved session can no longer be read — its record is unreadable.",
  "hook.savedSessions.offShelf": "That session is no longer on the shelf.",
  "hook.savedSessions.missingSource":
    "This session is missing its original file — it cannot be reopened.",
  "hook.savedSessions.parseFailed":
    "The original file no longer parses — the session cannot be reopened.",
  "hook.savedSessions.imported":
    'Imported — "{name}" is on your sessions shelf.',
  "hook.savedSessions.importedLibrary":
    "Imported {count} sessions onto your shelf.",
  "hook.savedSessions.importedName": "Imported session",
  "hook.savedSessions.importUnreadable": "The file could not be read.",
  "hook.savedSessions.importNotJson":
    "This file is not a session file — it is not valid JSON.",
  "hook.savedSessions.importNotSession":
    "This file is not a GPX Repair Studio session file.",
  "hook.savedSessions.importNewerVersion":
    "This session file was written by a newer version (v{version}) — update the app to open it.",
  "hook.savedSessions.importBadSession":
    "The session inside this file is unreadable.",
  "hook.savedSessions.importBadRecording":
    "The original recording inside this session file is unreadable.",
  "hook.savedSessions.importShelfFailed":
    "Could not add the session to the shelf — storage is unavailable or full.",
  "hook.savedSessions.importOpenFailed":
    "The session was imported but could not be opened — its file no longer parses.",

  /** The share views' honesty notes (use-create-share, use-merge-share). */
  "hook.share.createNoteReconstructed":
    "Route reconstructed by hand from the statistics your watch recorded.",
  "hook.share.createNoteScaled":
    "Distance is your watch's number — the drawn shape was scaled uniformly to it.",
  "hook.share.createNoteDrawn": "Distance is the route you drew.",
  "hook.share.createNoteTime":
    "Time is the total you entered; pace is time divided by that distance.",
  "hook.share.createNoteElevation":
    "The exported file carries estimated elevation from {provider} — the card shows distance, pace, and time only.",
  "hook.share.mergeNoteCombined":
    "Combined from {count} recordings — every point carried over verbatim, in the order you set.",

  /** use-heatmap — Phase 25: the toolbar toggle's announcements. */
  "hook.heatmap.enabled": "Heatmap on — your saved tracks as a density wash.",
  "hook.heatmap.disabled": "Heatmap off.",
  /** use-photos (Phase 26) — the photo geotagging notices. */
  "hook.photos.added": "{count} photos added — {matched} matched.",
  "hook.photos.cleared": "Photos cleared.",
  "hook.photos.saved": "{name} saved with GPS.",
  "hook.photos.zipped": "ZIP with {count} photos downloaded.",
  "hook.photos.written": "GPS written into {name}.",
  "hook.photos.writeFailed":
    "Writing into {name} failed — the original is untouched.",

  /** use-segments — Phase 25: the authoring + matching notices. */
  "hook.segments.saved": "Segment “{name}” saved — matching your library now.",
  "hook.segments.saveFailed":
    "Couldn't save the segment — storage is blocked or unavailable.",
  "hook.segments.deleted": "Segment deleted.",
  "hook.segments.pickFailed":
    "Couldn't resolve the picked stretch — the draft was discarded.",
} as const;

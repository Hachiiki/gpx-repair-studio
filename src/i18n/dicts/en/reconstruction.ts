/**
 * English dictionary — reconstruction editor panels (draw editor, vertex list, time strategy, manual repairs, gap list) (Phase 21).
 *
 * Copy for the route editor domain's components, namespaced per
 * component: drawEditor.* (draw-editor-panel), elevation.*
 * (elevation-controls), elevationDialog.* (elevation-disclosure-dialog),
 * fileTiming.* (file-timing-card), gapList.* (gap-list),
 * manualDuration.* (manual-duration-dialog), manualRepairs.*
 * (manual-repairs-card), timeStrategy.* (time-strategy-controls),
 * undoRedo.* (undo-redo-bar), vertexList.* (vertex-entry-list).
 *
 * English values are the app's existing copy, moved VERBATIM — the
 * dictionary is the contract every locale checks against (tests assert
 * the rendered text byte-identically).
 *
 * Editor vocabulary that must stay consistent across surfaces:
 * Draw mode / Move mode / Pan mode, Curve pen, Roads / Footpaths /
 * Straight lines, road snapping.
 */

export const reconstruction = {
  // --- draw-editor-panel.tsx -------------------------------------------
  "drawEditor.title": "Reconstruct route",
  "drawEditor.closeAria": "Close editor (keeps the drawn route)",
  "drawEditor.from": "From",
  "drawEditor.fromOpen": "route start (open)",
  "drawEditor.to": "To",
  "drawEditor.toOpen": "open — your clicks extend the route",
  "drawEditor.openEndInstructions":
    "Click anywhere on the map to add the missing route — each click extends the line from {coords}. What you see is exactly what the repair will be; nothing connects on its own.",
  "drawEditor.pen.groupAria": "Pen",
  "drawEditor.pen.label": "Pen",
  "drawEditor.pen.default": "Default pen",
  "drawEditor.pen.defaultHint":
    "The classic pencil: click to place points one by one — click before and after a bend and the line follows.",
  "drawEditor.pen.curve": "Curve pen",
  "drawEditor.pen.curveHint":
    "Press and drag to draw a curve freehand — the app smooths your stroke into the line. Works with every path style; a quick tap still places a single point.",
  "drawEditor.pen.curveActiveHint":
    "Drag on the map to draw your curve — release to place it. A quick tap still adds a single point. (C toggles pens, D/M/P switch modes.)",
  "drawEditor.pen.inactiveNote":
    "The pen works in Draw mode only — press D (or the pencil tool) to draw. Right now the pointer {action}.",
  "drawEditor.pen.actionDrag": "drags your points",
  "drawEditor.pen.actionNavigate": "navigates the map",
  "drawEditor.pathStyle.groupAria": "Path style",
  "drawEditor.pathStyle.label": "New points follow",
  "drawEditor.pathStyle.perSegmentNote":
    "Each segment keeps the style it was drawn with — switch any time, nothing you placed redraws.",
  "drawEditor.pathStyle.roads": "Roads",
  "drawEditor.pathStyle.roadsHint":
    "The line follows drivable roads between your points — click before and after a curve and the bend draws itself.",
  "drawEditor.pathStyle.footpaths": "Footpaths",
  "drawEditor.pathStyle.footpathsHint":
    "Same idea, but for pedestrian ways — trails, footpaths, stairs. Better for runs through parks or along rivers.",
  "drawEditor.pathStyle.straight": "Straight lines",
  "drawEditor.pathStyle.straightHint":
    "No road snapping — the next segment connects your points directly. Nothing leaves the browser. Segments drawn with the Curve pen stay smooth; switching styles never redraws them.",
  "drawEditor.pathStyle.privacyNote":
    "Click or drag before and after a curve — the line snaps to the road between your points. Roads/Footpaths send only the points you place to a public routing service (OSRM / Valhalla); your GPX file never leaves this browser. The Curve pen and Straight lines are fully local.",
  "drawEditor.roadStatus.finding": "Finding the road…",
  "drawEditor.roadStatus.unavailable":
    "Road follow unavailable right now — straight lines until it recovers.",
  "drawEditor.roadStatus.dragHint":
    "Drag any point to adjust it — the road re-finds itself.",
  "drawEditor.roadStatus.switchToMove":
    "Switch to Move (M) to drag a point — the road re-finds itself.",
  "drawEditor.consent.notice":
    "Road snapping sends the points you draw to a public routing service — never your file. It is off until you enable it.",
  "drawEditor.consent.enable": "Enable road snapping…",
  "drawEditor.consent.onForSession": "Road snapping is on for this session —",
  "drawEditor.consent.turnItOff": "turn it off",
  "drawEditor.consent.anyTime": "any time.",
  "drawEditor.snap.button": "Snap to road",
  "drawEditor.snap.offline":
    "Offline — road snapping needs the network; straight and curve lines keep working.",
  "drawEditor.snap.needPoints":
    "Draw at least one point, then snap the whole line onto roads.",
  "drawEditor.snap.failed":
    "Could not match this line to a road — it stays as drawn.",
  "drawEditor.snap.idle":
    "Match the whole line onto roads in one go — preview first, undo after.",
  "drawEditor.snap.previewTitle": "Road preview",
  "drawEditor.snap.yourLine": "Your line",
  "drawEditor.snap.onTheRoad": "On the road",
  "drawEditor.snap.apply": "Apply — keep the road line",
  "drawEditor.snap.keepDrawing": "Keep my drawing",
  "drawEditor.snap.previewNote":
    "The line you see is the line you get. Applying replaces your drawn points with road waypoints — one undo step brings your drawing back.",
  "drawEditor.vertexCount": "{count} / {max} points",
  "drawEditor.vertexCountLimit": "{count} / {max} points — limit reached",
  "drawEditor.straightWarning.title": "Nearly a straight line",
  "drawEditor.straightWarning.body":
    "Every point sits almost exactly between the two anchors. That is fine if you ran straight — otherwise trace the actual route on the map so the repair stays honest.",
  "drawEditor.spacing.title":
    "After you finish, the app densifies your drawing into evenly spaced points with this spacing — some platforms want regular points.",
  "drawEditor.spacing.label": "Resample spacing",
  "drawEditor.spacing.off": "Off (points only)",
  "drawEditor.spacing.every": "Every {meters} m",
  "drawEditor.snapToggle.title":
    "Clicks near a recorded point land exactly on it — handy when tying your repair into the original route.",
  "drawEditor.snapToggle.ariaLabel":
    "Snap drawn points to recorded route points",
  "drawEditor.snapToggle.label": "Snap to recorded points",
  "drawEditor.removeSpan": "Remove repair span",
  "drawEditor.markSkipped": "Mark as skipped",
  "drawEditor.done": "Done",

  // --- elevation-controls.tsx ------------------------------------------
  "elevation.groupAria": "Elevation",
  "elevation.label": "Elevation",
  "elevation.status.notFetched": "Not estimated",
  "elevation.status.fetching": "Estimating…",
  "elevation.status.complete": "Estimated",
  "elevation.status.partial": "Partial",
  "elevation.status.failed": "Failed",
  "elevation.status.stale": "Stale",
  "elevation.estimateHintTitle": "Estimated elevation",
  "elevation.estimateHintDescription":
    "Looks up terrain elevation for the points you drew ({provider}, a public terrain database). Opt-in: a disclosure shows exactly what leaves your browser before anything is sent.",
  "elevation.estimateButton": "Estimate elevation",
  "elevation.progress":
    "Fetching {provider} terrain — {answered}/{sent} points…",
  "elevation.progressSampled":
    "Fetching {provider} terrain — {answered}/{sent} points (sampled from {total})…",
  "elevation.staleNote":
    "The route changed since the estimate — the old values are excluded from statistics and export until you re-estimate.",
  "elevation.reEstimate": "Re-estimate",
  "elevation.tryAgain": "Try again",
  "elevation.partialNote":
    "{resolved} of {sent} terrain points resolved — the gaps are interpolated between the ones that were.",

  // --- elevation-disclosure-dialog.tsx ----------------------------------
  "elevationDialog.title": "Estimate elevation from {provider}?",
  "elevationDialog.description":
    "Elevation is looked up from a terrain database, so some data has to leave this browser. Here is exactly what leaves:",
  "elevationDialog.coordinateOne": "{count} coordinate",
  "elevationDialog.coordinateMany": "{count} coordinates",
  "elevationDialog.ofYourPoints": "of your reconstructed points",
  "elevationDialog.sampledSuffix":
    "(sampled from {total} — the rest is interpolated from these)",
  "elevationDialog.everyPointSuffix": " (every point you drew)",
  "elevationDialog.willSendOne": "will be sent in {count} request to",
  "elevationDialog.willSendMany": "will be sent in {count} requests to",
  "elevationDialog.sentenceEnd": ".",
  "elevationDialog.resultPrefix": "The result is labeled",
  "elevationDialog.estimatedWord": "estimated",
  "elevationDialog.resultSuffix":
    "everywhere it appears — statistics, the profile chart, and the exported file's provenance markers. Recorded elevation in your file is never modified.",
  "elevationDialog.cancel": "Cancel",
  "elevationDialog.sendOne": "Send {count} point",
  "elevationDialog.sendMany": "Send {count} points",

  // --- file-timing-card.tsx ---------------------------------------------
  "fileTiming.title": "No timing data",
  "fileTiming.description":
    "This file has no usable timestamps. Enter what you know — every value derived from it is labeled estimated.",
  "fileTiming.startLabel": "Activity start (optional)",
  "fileTiming.totalLabel": "Total duration (optional)",
  "fileTiming.totalFieldAria": "Total duration {unit}",
  "fileTiming.noneEntered": "No total duration entered.",
  "fileTiming.entered": "Entered: {minutes} min.",
  "fileTiming.note":
    "The start time anchors repairs that have no timestamps around them; the total drives the overall pace. Each repair's own duration is set in its editor. Exporting (a later release) will spread these times across the whole activity by distance.",

  // --- gap-list.tsx ------------------------------------------------------
  "gapList.title": "Detected gaps",
  "gapList.oneSite": "1 candidate repair site",
  "gapList.manySites": "{count} candidate repair sites",
  "gapList.empty": "No gaps detected with the current thresholds.",
  "gapList.beginPick": "Something still looks wrong? Draw a repair manually",
  "gapList.editorOpenTitle":
    "A repair editor is open — finish or close it first.",
  "gapList.from": "From",
  "gapList.to": "To",
  "gapList.noTime": "no time",
  "gapList.rowAria": "Gap {kind}, {severity}. {action}.",
  "gapList.deselect": "Deselect",
  "gapList.selectFocus": "Select and focus on map",
  "gapList.elapsed": "{duration} elapsed",
  "gapList.elapsedUnknown": "elapsed unknown",
  "gapList.straightLine": "Straight-line:",
  "gapList.impliedSpeed": "· implied speed {speed}",
  "gapList.editRoute": "Edit route",
  "gapList.drawRoute": "Draw route",

  // --- manual-duration-dialog.tsx ----------------------------------------
  "manualDuration.hours": "Hours",
  "manualDuration.minutes": "Minutes",
  "manualDuration.seconds": "Seconds",
  "manualDuration.gapTitle": "How long was the missing stretch?",
  "manualDuration.fileTitle": "Total activity duration",
  "manualDuration.gapDescription":
    "The repair's interior timestamps will span exactly this duration — recorded timestamps are never changed.",
  "manualDuration.fileDescription":
    "Used for overall pace, and later for spreading timestamps over the whole activity when exporting.",
  "manualDuration.error": "Enter numbers of 0 or more in each field.",
  "manualDuration.cancel": "Cancel",
  "manualDuration.save": "Save duration",

  // --- manual-repairs-card.tsx -------------------------------------------
  "manualRepairs.title": "Manual repairs",
  "manualRepairs.description":
    "Add or redraw route yourself — detection is only a helper.",
  "manualRepairs.anchorLabel": "Add missing route",
  "manualRepairs.anchorHint":
    "One click anywhere on the map — the repair attaches to the recorded route's nearest end and your clicks draw the missing route outward from there, following the roads between them. Use it for a missing head or tail the watch never recorded.",
  "manualRepairs.pairLabel": "Redraw a stretch",
  "manualRepairs.pairHint":
    "Click two points on the recorded route — what's between them gets replaced by your drawing. Use it when the watch drew a straight line over a detour you actually ran.",
  "manualRepairs.empty":
    "No manual repairs yet. Start one anywhere on the route — a detour the watch drew straight, a missing head or tail — even when no gap was detected.",
  "manualRepairs.anchorInstructions":
    "Click anywhere on the map near where the missing route goes — the repair anchors to the recorded route's nearest end and every click after that draws outward from it. Esc cancels.",
  "manualRepairs.pairInstructions":
    "Click two points on the recorded route — the stretch between them is what you replace. Pan and zoom stay available; Esc cancels.",
  "manualRepairs.cancelPicking": "Cancel picking",
  "manualRepairs.toolsLocked":
    "A repair editor is open — finish or close it before starting another repair.",
  "manualRepairs.from": "From",
  "manualRepairs.to": "To",
  "manualRepairs.noTime": "no time",
  "manualRepairs.spanMeters": "{distance} span",
  "manualRepairs.openEndNote":
    "Open end — the drawn route extends into the unrecorded part; it connects nowhere else.",
  "manualRepairs.editRoute": "Edit route",
  "manualRepairs.drawRoute": "Draw route",
  "manualRepairs.removeAria": "Remove manual repair span {id}",
  "manualRepairs.remove": "Remove",

  // --- time-strategy-controls.tsx ----------------------------------------
  "timeStrategy.groupAria": "Time estimation",
  "timeStrategy.label": "Timestamps for this repair",
  "timeStrategy.byDistance": "By distance",
  "timeStrategy.byDistanceHint":
    "Timestamps spread in proportion to how far each point sits along the drawn route — the natural choice for an even-effort run.",
  "timeStrategy.evenly": "Evenly",
  "timeStrategy.evenlyHint":
    "Timestamps spread by point count, ignoring distance — mostly useful with resampling switched off.",
  "timeStrategy.paceLabel": "From your pace",
  "timeStrategy.paceHint":
    "The app estimates how long this section took: your drawn distance divided by the pace you actually held in this file. No number to type — the estimate updates as you draw.",
  "timeStrategy.manual": "Manual",
  "timeStrategy.manualHint":
    "You state how long the missing stretch took. The repair's timestamps follow your value even when it disagrees with the recorded span — the disagreement is shown, never hidden.",
  "timeStrategy.paceIntro":
    "This section wasn't measured — the app estimates it took",
  "timeStrategy.atYourPace": " at your recorded pace (",
  "timeStrategy.paceOutro": "). Draw more and the estimate follows.",
  "timeStrategy.pausedFor": "The watch was paused for",
  "timeStrategy.pausedSuffix":
    "— your drawn route's points will span exactly that gap, estimated as even effort.",
  "timeStrategy.yourEstimatePrefix": "Your estimate (",
  "timeStrategy.yourEstimateSuffix":
    ") replaces the recorded span for this repair's interior — recorded timestamps are never changed.",
  "timeStrategy.beforeOnly":
    "Only the start of this gap has a timestamp. Enter how long the missing stretch took and the interior spreads forward from it.",
  "timeStrategy.afterOnly":
    "Only the end of this gap has a timestamp. Enter how long the missing stretch took and the interior counts back from it.",
  "timeStrategy.noBoundaries":
    "No timestamps around this gap. Enter a duration to estimate its interior",
  "timeStrategy.noBoundariesAnchored":
    " — it will start from your entered activity start time (its position within the activity is an assumption).",
  "timeStrategy.noBoundariesUnanchored":
    " (points export without times until an activity start is entered for the file).",
  "timeStrategy.editDuration": "Edit duration ({duration})",
  "timeStrategy.addDuration": "Add a duration",
  "timeStrategy.yourEstimate": "your estimate",
  "timeStrategy.paceEstimate": "pace estimate",
  "timeStrategy.gapDuration": "gap duration",
  "timeStrategy.estimatedPace": "estimated pace",
  "timeStrategy.discrepancyTitle": "Differs from the recorded span",
  "timeStrategy.discrepancyPace":
    "The pace estimate ({estimate}) disagrees with the time the file shows here ({recorded}) — this section wasn't in the recording. The drawn points follow the estimate; the original timestamps stay untouched and the difference is reported in the statistics.",
  "timeStrategy.discrepancyManual":
    "Your duration ({duration}) disagrees with the recorded gap ({recorded}). The repair's timestamps follow your value; the original timestamps stay untouched and the difference is reported in the statistics.",

  // --- undo-redo-bar.tsx --------------------------------------------------
  "undoRedo.groupAria": "Drawing history",
  "undoRedo.undo": "Undo",
  "undoRedo.undoOne": "Undo ({count} step)",
  "undoRedo.undoMany": "Undo ({count} steps)",
  "undoRedo.undoEmpty": "Undo (nothing to undo)",
  "undoRedo.redo": "Redo",
  "undoRedo.redoOne": "Redo ({count} step)",
  "undoRedo.redoMany": "Redo ({count} steps)",
  "undoRedo.redoEmpty": "Redo (nothing to redo)",
  "undoRedo.clear": "Clear",
  "undoRedo.clearAria": "Clear all drawn points",

  // --- vertex-entry-list.tsx ----------------------------------------------
  "vertexList.header":
    "Drawn points — drag them on the map, or type: every field here is the keyboard twin of the canvas.",
  "vertexList.nudgeStep": "Nudge step",
  "vertexList.nudgeStepTitle":
    "How far one arrow-key press moves a focused point",
  "vertexList.stepOption": "{step} m",
  "vertexList.capNote":
    "Point limit reached ({max}) — the line is as dense as this tool allows.",
  "vertexList.addByCoordinates": "Add a point by coordinates",
  "vertexList.addPoint": "Add point",
  "vertexList.insertAfter": "Insert after point {index}",
  "vertexList.insertPoint": "Insert point",
  "vertexList.latitude": "Latitude",
  "vertexList.longitude": "Longitude",
  "vertexList.latPlaceholder": "52.5206",
  "vertexList.lonPlaceholder": "13.4055",
  "vertexList.fieldAriaLat": "{label} — latitude",
  "vertexList.fieldAriaLon": "{label} — longitude",
  "vertexList.roundedNote":
    "More than 7 decimals — rounded to 7 (about a centimeter, the export precision).",
  "vertexList.nudgeAria":
    "Nudge point {index} — arrow keys move it by {step} m, Shift for ten times that",
  "vertexList.nudgeTitle":
    "Arrow keys nudge this point by {step} m (Shift = ×10). Up/down = latitude, left/right = longitude.",
  "vertexList.pointLatitude": "Point {index} latitude",
  "vertexList.pointLongitude": "Point {index} longitude",
  "vertexList.snapped": "snapped",
  "vertexList.snappedTitle":
    "Snapped to recorded point {pointId} — typing or nudging releases the snap",
  "vertexList.insertAfterAria": "Insert a point after point {index}",
  "vertexList.deleteAria": "Delete point {index}",

  "snap.profile.roads": "roads",
  "snap.profile.footpaths": "footpaths",
  "router.reason.scheme": "The URL must start with https:// (or http:// for a local test server).",
  "router.reason.parse": "That does not parse as a URL — check the host name.",

  "elevation.privacyNote.openMeteo": "The coordinates of your reconstructed points are sent to api.open-meteo.com (Open-Meteo Elevation API) in the request URL. Only reconstructed points are sent — never the full file, never the recorded route. The service logs requests like any web server.",
} as const;

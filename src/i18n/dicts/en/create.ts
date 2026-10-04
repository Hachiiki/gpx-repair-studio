/**
 * English dictionary — create-from-stats surfaces (Phase 21).
 *
 * Extracted from the create domain's components. Keys are namespaced
 * `create.*`. English values are the app's existing copy, moved
 * VERBATIM — the dictionary is the contract every locale checks
 * against.
 */

export const create = {
  /*
   * ActivityStatsForm (activity-stats-form.tsx) — Step 1: what the
   * watch DID record. Unit words ride alongside numbers via
   * i18n/units (UNIT_WORDS), never through this dictionary.
   */
  /** Form heading (and its aria-label). */
  "create.statsForm.title": "Activity statistics",
  /** Intro blurb. */
  "create.statsForm.blurb":
    "What your watch recorded — the distance, pace, and time of the workout whose map went missing.",
  /** The example-numbers link. */
  "create.statsForm.example": "Use example numbers",
  /** The unit preference row's label. */
  "create.statsForm.units": "Units",
  /** Distance field label. */
  "create.statsForm.distance": "Distance",
  /** Distance field aria-label. */
  "create.statsForm.distanceA11y": "Distance recorded by your watch",
  /** Average pace field label. */
  "create.statsForm.pace": "Average pace",
  /** Average pace unit hint ({unit} is a UNIT_WORDS word). */
  "create.statsForm.paceHint": "(minutes : seconds /{unit})",
  /** Pace minutes field aria-label. */
  "create.statsForm.paceMinutesA11y": "Pace minutes per unit",
  /** Pace seconds field aria-label. */
  "create.statsForm.paceSecondsA11y": "Pace seconds per unit",
  /** Total time field label. */
  "create.statsForm.time": "Total time",
  /** Total time fields hint. */
  "create.statsForm.timeHint": "(hours : minutes : seconds)",
  /** Hours field aria-label. */
  "create.statsForm.hoursA11y": "Total time hours",
  /** Minutes field aria-label. */
  "create.statsForm.minutesA11y": "Total time minutes",
  /** Seconds field aria-label. */
  "create.statsForm.secondsA11y": "Total time seconds",
  /** Start field label. */
  "create.statsForm.start": "Start",
  /** Start field hint. */
  "create.statsForm.startHint": "— platforms use it to place the activity",
  /** The submit button. */
  "create.statsForm.begin": "Draw the route",
  /** The no-file reassurance. */
  "create.statsForm.noFile":
    "No file needed — everything happens in your browser.",

  /*
   * ConsistencyNote (consistency-note.tsx) — the time ≈ distance ×
   * pace cross-check verdict, rendered in the studio's cards.
   */
  /** Rounding-level verdict. */
  "create.consistency.rounding":
    "Your entered statistics differ slightly due to rounding — the route will be generated using your recorded values.",
  /** Mismatch-level verdict ({implied}/{entered} are durations). */
  "create.consistency.mismatch":
    "Your time, distance, and pace don't quite agree — distance × pace works out to {implied}, you entered {entered}. Check for typos; the route will be generated using your recorded values.",

  /*
   * CreateGuideCard (create-guide-card.tsx) — the drawing phase's
   * orientation card.
   */
  /** Card heading. */
  "create.guide.title": "Draw your route",
  /** Card blurb. */
  "create.guide.blurb":
    "The whole activity — there is no recording to fall back on. What you draw is what the file becomes.",
  /** Stats recap heading. */
  "create.guide.recapTitle": "Your watch recorded",
  /** Stats recap inline label — distance. */
  "create.guide.recapDistance": "Distance",
  /** Stats recap inline label — time. */
  "create.guide.recapTime": "Time",
  /** Stats recap inline label — pace. */
  "create.guide.recapPace": "Pace",
  /** Draw instructions, before the first point (lead). */
  "create.guide.instructionsLead": "Find your starting point on the map (or use",
  /** The locate aid's button label (and its inline mention). */
  "create.guide.locate": "Find my position",
  /** Draw instructions, before the first point (tail). */
  "create.guide.instructionsTail":
    "), then click to place the route point by point — the line follows real roads between your clicks. Pan with the P key or the mode chip; draw with D.",
  /** Draw instructions, after the first point. */
  "create.guide.instructionsMore":
    "Keep clicking to extend the route. Switch to Move (M) to drag any point, double-click to remove it, and finish when the line matches where you went.",
  /** Locate in progress. */
  "create.guide.locating": "Finding your position…",
  /** Locate declined. */
  "create.guide.locateDenied":
    "Location was declined — pan and zoom to your starting point instead.",
  /** Locate unsupported. */
  "create.guide.locateUnavailable":
    "This browser has no location support — pan and zoom to your starting point instead.",
  /** The road-following privacy note. */
  "create.guide.privacyNote":
    "Road following sends only the points you click to a public routing service (OSRM / Valhalla); nothing else leaves this browser.",
  /** Back to the statistics form. */
  "create.guide.backToStats": "Back to statistics",

  /*
   * RouteDrawPanel (route-draw-panel.tsx) — Step 2's route editor
   * card.
   */
  /** Card heading. */
  "create.drawPanel.title": "Your route",
  /** Card blurb. */
  "create.drawPanel.blurb":
    "Click to add points — switch to Move (M) to drag any of them, everything undoes.",
  /** Pen group label (visible + a11y). */
  "create.drawPanel.penGroup": "Pen",
  /** Default pen chip. */
  "create.drawPanel.penDefault": "Default pen",
  /** Default pen hint. */
  "create.drawPanel.penDefaultHint":
    "The classic pencil: click to place points one by one — click before and after a bend and the line follows.",
  /** Curve pen chip. */
  "create.drawPanel.penCurve": "Curve pen",
  /** Curve pen hint. */
  "create.drawPanel.penCurveHint":
    "Press and drag to draw a curve freehand — the app smooths your stroke into the route. Works with every path style; a quick tap still places a single point.",
  /** Curve-pen live hint. */
  "create.drawPanel.curveHint":
    "Drag on the map to draw your curve — release to place it. A quick tap still adds a single point. (C toggles pens, D/M/P switch modes.)",
  /** Pen-inactive note (lead). */
  "create.drawPanel.penInactiveLead":
    "The pen works in Draw mode only — press D (or the pencil tool) to draw. Right now the pointer",
  /** Pen-inactive note — pointer in Move mode. */
  "create.drawPanel.pointerDrags": "drags your points",
  /** Pen-inactive note — pointer in Pan mode. */
  "create.drawPanel.pointerNavigates": "navigates the map",
  /** Path-style group a11y label. */
  "create.drawPanel.pathStyleGroup": "Path style",
  /** Path-style group heading. */
  "create.drawPanel.newPointsFollow": "New points follow",
  /** Path-style per-segment note. */
  "create.drawPanel.pathStyleNote":
    "Each segment keeps the style it was drawn with — switch any time, nothing you placed redraws.",
  /** Roads chip. */
  "create.drawPanel.roads": "Roads",
  /** Roads hint. */
  "create.drawPanel.roadsHint":
    "The line follows drivable roads between your points — click before and after a curve and the bend draws itself.",
  /** Footpaths chip. */
  "create.drawPanel.footpaths": "Footpaths",
  /** Footpaths hint. */
  "create.drawPanel.footpathsHint":
    "Same idea, but for pedestrian ways — trails, footpaths, stairs. Better for runs through parks or along rivers.",
  /** Straight lines chip. */
  "create.drawPanel.straight": "Straight lines",
  /** Straight lines hint. */
  "create.drawPanel.straightHint":
    "No road snapping — the next segment connects your points directly. Nothing leaves the browser. Segments drawn with the Curve pen stay smooth; switching styles never redraws them.",
  /** Road leg resolving. */
  "create.drawPanel.findingRoad": "Finding the road…",
  /** Road follow failed. */
  "create.drawPanel.roadUnavailable":
    "Road follow unavailable right now — straight lines until it recovers.",
  /** Road status — pointer in Move mode. */
  "create.drawPanel.dragAdjust":
    "Drag any point to adjust it — the road re-finds itself.",
  /** Road status — pointer in Draw/Pan mode. */
  "create.drawPanel.switchToDrag":
    "Switch to Move (M) to drag a point — the road re-finds itself.",
  /** The consent gate's notice. */
  "create.drawPanel.consentNotice":
    "Road snapping sends the points you draw to a public routing service — never your file. It is off until you enable it.",
  /** The consent gate's enable button. */
  "create.drawPanel.consentEnable": "Enable road snapping…",
  /** Consent granted note (lead, before the toggle link). */
  "create.drawPanel.consentOnLead": "Road snapping is on for this session —",
  /** Consent granted note — the inline toggle link. */
  "create.drawPanel.turnItOff": "turn it off",
  /** Consent granted note (tail). */
  "create.drawPanel.consentOnTail": "any time.",
  /** Comparison — no points yet. */
  "create.drawPanel.compareFirst":
    "Click on the map to place your first point.",
  /** Comparison — one point placed. */
  "create.drawPanel.compareFirstLeg":
    "Keep going — one more point makes the first leg.",
  /** Comparison — within the notice ratio. */
  "create.drawPanel.compareMatches": "Matches your recorded distance.",
  /** Comparison — beyond the ratio, longer. */
  "create.drawPanel.compareLonger":
    "Longer than your recorded {recorded} by {difference} — the file will carry what you draw.",
  /** Comparison — beyond the ratio, shorter. */
  "create.drawPanel.compareShorter":
    "Shorter than your recorded {recorded} by {difference} — the file will carry what you draw.",
  /** Vertex counter. */
  "create.drawPanel.vertexCount": "{count} / {max} points",
  /** Vertex counter — cap reached suffix. */
  "create.drawPanel.vertexLimit": " — limit reached",
  /** Spacing select label. */
  "create.drawPanel.spacingLabel": "Track point spacing",
  /** Spacing select tooltip. */
  "create.drawPanel.spacingHint":
    "The track is generated with evenly spaced points at this spacing — some platforms want regular points rather than only your clicks.",
  /** Spacing option — off. */
  "create.drawPanel.spacingOff": "Off (clicked points only)",
  /** Spacing option — every N meters ({unit} is a UNIT_WORDS word). */
  "create.drawPanel.spacingEvery": "Every {meters} {unit}",
  /** Vertex list note. */
  "create.drawPanel.drawnPointsNote":
    "Drawn points — switch to Move (M) and drag any of them on the map, double-click to remove. Drawing (D) adds points only — the pencil never drags.",
  /** Vertex row delete button aria-label. */
  "create.drawPanel.deletePoint": "Delete point {index}",
  /** Finish button. */
  "create.drawPanel.finish": "Finish route",
  /** Finish button tooltip — enabled. */
  "create.drawPanel.finishTitle": "End the drawing and review the result",
  /** Finish button tooltip — disabled. */
  "create.drawPanel.finishDisabledTitle":
    "Place at least two points to finish the route",

  /*
   * RouteReviewCard (route-review-card.tsx) — Step 3: reconcile,
   * summarize, export.
   */
  /** Card heading. */
  "create.review.title": "Review & export",
  /** Card blurb. */
  "create.review.blurb":
    "The route you drew decides the file's distance — your recorded time always stands.",
  /** Reconciliation row label — recorded. */
  "create.review.recordedDistance": "Recorded distance",
  /** Reconciliation row label — drawn. */
  "create.review.drawnRoute": "Drawn route",
  /** Reconciliation row label — difference. */
  "create.review.difference": "Difference",
  /** Match-distance checkbox aria-label. */
  "create.review.matchA11y":
    "Use my watch's distance instead of the drawn route's",
  /** Match-distance label (bold lead). */
  "create.review.matchTitle": "Use my watch's distance instead",
  /** Match-distance label body. */
  "create.review.matchBody":
    "— the drawn shape is scaled uniformly to your recorded {recorded} (×{scale}). Leave it off and the file carries the drawn route's {drawn} as is.",
  /** Extreme-difference warning title. */
  "create.review.extremeTitle": "That's a big difference",
  /** Extreme-difference warning body. */
  "create.review.extremeBody":
    "{percent}% apart — usually a km/miles mixup or a missed loop in the drawing. Consider going back and checking what you entered, or edit the route to match where you went.",
  /** No reconciliation needed. */
  "create.review.matches":
    "The drawn route matches your recorded distance — nothing to reconcile.",
  /** Final summary heading. */
  "create.review.summaryTitle": "The file will carry",
  /** Summary row label — distance. */
  "create.review.distance": "Distance",
  /** Summary row label — time. */
  "create.review.time": "Time",
  /** Summary row label — average pace. */
  "create.review.avgPace": "Average pace",
  /** Summary row label — start. */
  "create.review.start": "Start",
  /** Summary row label — route. */
  "create.review.route": "Route",
  /** Summary row value — route. */
  "create.review.routeValue": "Reconstructed manually — {count} points",
  /** Summary row label — elevation. */
  "create.review.elevation": "Elevation",
  /** Honest note — timestamps. */
  "create.review.timestampsNote":
    "Timestamps are estimated — your recorded total time, spread evenly by effort along the route.",
  /** Honest note — elevation estimated ({provider} is a DEM name). */
  "create.review.elevationNote":
    "Elevation is estimated from {provider} terrain and labeled as estimated in the file.",
  /** Honest note — no elevation. */
  "create.review.noElevationNote":
    "No elevation is included: the watch recorded none, and none is invented.",
  /** Export button. */
  "create.review.export": "Export GPX",
  /** Post-download status. */
  "create.review.downloaded":
    "Downloaded {file} — import it into Strava or any GPX platform.",
  /** Edit-route button. */
  "create.review.editRoute": "Edit route",

  /*
   * ReconcileDistanceDialog (reconcile-distance-dialog.tsx) — the
   * finish-time distance warning.
   */
  /** Dialog title. */
  "create.reconcile.title":
    "The drawn route's distance is different from the one you entered",
  /** Description lead. */
  "create.reconcile.watchRecorded": "Your watch recorded",
  /** Description middle (between the two distances). */
  "create.reconcile.butDrawn": ", but the route you drew measures",
  /** Direction word — shorter. */
  "create.reconcile.shorter": "shorter",
  /** Direction word — longer. */
  "create.reconcile.longer": "longer",
  /** Description tail — the percentage verdict. */
  "create.reconcile.difference": "— {percent}% {direction}.",
  /** Body lead. */
  "create.reconcile.bodyLead": "The file will use the",
  /** Body — the bold distance basis. */
  "create.reconcile.drawnDistance": "drawn route's distance",
  /** Body middle (between the basis and the total time). */
  "create.reconcile.bodyMid":
    "instead — GPS watches often misjudge distance, and the route you traced is usually closer to reality. Your total time of",
  /** Body tail — no implied pace available. */
  "create.reconcile.bodyTail":
    "is kept exactly as recorded, and the average pace is recalculated from the whole route",
  /** Body tail — with the implied pace ({unit} is a UNIT_WORDS suffix). */
  "create.reconcile.bodyTailWithPace":
    "is kept exactly as recorded, and the average pace is recalculated from the whole route ({pace} {unit}).",
  /** Extreme-difference hint. */
  "create.reconcile.extremeHint":
    "A difference this large usually means a km/miles mixup or a missed loop in the drawing — double-check what you entered, or close this and edit the route before exporting.",
  /** Primary action — keep the drawn distance. */
  "create.reconcile.useDrawn": "Use drawn distance ({distance})",
  /** Secondary action — scale to the recorded distance. */
  "create.reconcile.useRecorded": "Use my watch's distance ({distance})",

  /*
   * CreateShareView (create-share-view.tsx) — the share-card view.
   */
  /** Section heading (and its aria-label). */
  "create.shareView.title": "Share card",
  /** Section blurb. */
  "create.shareView.blurb":
    "A Strava-style graphic of your created activity — transparent background, rendered from the route you drew and the time you recorded.",
  /** Stage caption. */
  "create.shareView.stageNote": "Transparent background — shown on dark",
  /** Tools aside aria-label. */
  "create.shareView.toolsA11y": "Share card tools",
  /** Summary card heading. */
  "create.shareView.cardTitle": "On the card",
  /** Summary card blurb. */
  "create.shareView.cardBlurb":
    "The same numbers the review card shows — what the file will carry.",
  /** Summary stat label — distance. */
  "create.shareView.distance": "Distance",
  /** Summary stat label — pace. */
  "create.shareView.pace": "Pace",
  /** Summary stat label — time. */
  "create.shareView.time": "Time",
  /** PNG resolution row label (and group aria-label). */
  "create.shareView.pngResolution": "PNG resolution",
  /** PNG scale option — 1×. */
  "create.shareView.scale1": "1×",
  /** PNG scale option — 1× detail. */
  "create.shareView.scale1Detail": "1080 × 1920",
  /** PNG scale option — 2×. */
  "create.shareView.scale2": "2×",
  /** PNG scale option — 2× detail. */
  "create.shareView.scale2Detail": "2160 × 3840",
  /** Download button. */
  "create.shareView.download": "Download PNG",
  /** Back to the review. */
  "create.shareView.back": "Back to route review",
  /** Meaning card heading. */
  "create.shareView.meaningTitle": "What the numbers mean",
  /** Meaning card blurb. */
  "create.shareView.meaningBlurb": "A created activity, honestly labeled.",

  /*
   * CreateStudio (create-studio.tsx) — the map's screen-reader note
   * (this section has no recorded file).
   */
  /** Appended to the map's sr summary. */
  "create.studio.srNote":
    "No recorded route — this activity is drawn from scratch from your entered statistics.",

  /*
   * CreateWorkspace (create-workspace.tsx) — the section layout's
   * landmark labels.
   */
  /** Section landmark label. */
  "create.workspace.sectionA11y": "Create route map and tools",
  /** Tools column label. */
  "create.workspace.toolsLabel": "Create tools",

  /*
   * ShareCreateDialog (share-create-dialog.tsx) — the header Share
   * button's gate.
   */
  /** Dialog title. */
  "create.shareDialog.title": "Share your created activity",
  /** Dialog blurb. */
  "create.shareDialog.blurb":
    "Here is exactly what happens next — nothing leaves this browser either way.",
  /** Step 1 bold lead. */
  "create.shareDialog.step1Title": "Your GPX downloads now",
  /** Step 1 tail (after the bold file name; {elevation} is a suffix, often empty). */
  "create.shareDialog.step1Tail":
    ", the same file the Export button produces{elevation}. Import it into Strava or any GPX platform.",
  /** Step 1 elevation suffix. */
  "create.shareDialog.inclElevation": ", including the estimated elevation",
  /** Step 2 bold lead. */
  "create.shareDialog.step2Title": "The share card opens",
  /** Step 2 lead (before the trio). */
  "create.shareDialog.step2Lead":
    "— your drawn route as a Strava-style graphic with",
  /** Step 2 trio fallback (no content binding yet). */
  "create.shareDialog.trioFallback": "the file's distance, pace, and time",
  /** Step 2 tail. */
  "create.shareDialog.step2Tail": ". Download it as a PNG from there.",
  /** Footer honesty note. */
  "create.shareDialog.footer":
    "Every point in the file is marked as reconstructed — platforms will know the route was rebuilt, not recorded. You can come straight back to this review from the share view.",
  /** Confirm action. */
  "create.shareDialog.confirm": "Download GPX & open share card",
  /** Cancel action. */
  "create.shareDialog.cancel": "Not now",

  "create.shareDialog.andGlue": ", and ",
} as const;

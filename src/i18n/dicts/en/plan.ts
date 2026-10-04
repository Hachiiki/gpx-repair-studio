/**
 * English dictionary — planning tool surfaces (Phase 21).
 *
 * Extracted from the "plan a route" domain's components. Keys are
 * namespaced `plan.*` with per-component sub-namespaces
 * (`plan.start.*` for the tool page's intake card, `plan.guide.*` for
 * the guide card, `plan.draw.*` for the draw panel, `plan.estimates.*`
 * for the estimates card, `plan.studio.*` / `plan.workspace.*` for the
 * composition root and layout). English values are the app's existing
 * copy, moved VERBATIM — the dictionary is the contract every locale
 * checks against.
 */

export const plan = {
  /** PlanStartCard (plan-start-card.tsx) — the tool page's intake. */
  "plan.start.title": "Nothing to upload",
  "plan.start.intro":
    "The map is the input — sketch a route and read its numbers.",
  "plan.start.estimateBullet":
    "Estimate distance and elevation for roads and paths you draw — live, as the line takes shape.",
  "plan.start.paceBulletLead":
    "Enter a time and see the pace it implies — a scratchpad for planning, with",
  "plan.start.paceBulletBold": "no export and no share",
  "plan.start.paceBulletTail": ": nothing leaves this page.",
  "plan.start.begin": "Start planning",

  /** PlanGuideCard (plan-guide-card.tsx) — the tools column's guide. */
  "plan.guide.title": "Plan a route",
  "plan.guide.intro":
    "Sketch where you might go — the estimates update as you draw.",
  "plan.guide.contractLead":
    "Click to drop points (the Default pen) or press-drag a curve (the Curve pen); switch to Move (M) to drag any point. This is a scratchpad:",
  "plan.guide.contractBold": "no export, no share",
  "plan.guide.contractTail":
    " — the route and its numbers stay on this page.",
  "plan.guide.locating": "Locating…",
  "plan.guide.findPosition": "Find my position",
  "plan.guide.clearTitleEmpty": "Nothing drawn yet",
  "plan.guide.clearTitle": "Remove every point and start fresh",
  "plan.guide.clearRoute": "Clear route",
  "plan.guide.locateDenied":
    "Position unavailable — permission was declined. Pan the map yourself.",
  "plan.guide.locateUnavailable":
    "This device has no geolocation — pan the map to your start point.",

  /** PlanDrawPanel (plan-draw-panel.tsx) — the editor card. */
  "plan.draw.penDefault": "Default pen",
  "plan.draw.penDefaultHint":
    "The classic pencil: click to place points one by one — click before and after a bend and the line follows.",
  "plan.draw.penCurve": "Curve pen",
  "plan.draw.penCurveHint":
    "Press and drag to draw a curve freehand — the app smooths your stroke into the route. Works with every path style; a quick tap still places a single point.",
  "plan.draw.deletePoint": "Delete point {index}",
  "plan.draw.title": "Your route",
  "plan.draw.intro":
    "Click to add points — switch to Move (M) to drag any of them, everything undoes.",
  "plan.draw.penLabel": "Pen",
  "plan.draw.curveHint":
    "Drag on the map to draw your curve — release to place it. A quick tap still adds a single point. (C toggles pens, D/M/P switch modes.)",
  "plan.draw.penInactive":
    "The pen works in Draw mode only — press D (or the pencil tool) to draw. Right now the pointer {action}.",
  "plan.draw.pointerMoves": "drags your points",
  "plan.draw.pointerPans": "navigates the map",
  "plan.draw.styleGroupLabel": "Path style",
  "plan.draw.styleLabel": "New points follow",
  "plan.draw.styleNote":
    "Each segment keeps the style it was drawn with — switch any time, nothing you placed redraws.",
  "plan.draw.styleRoads": "Roads",
  "plan.draw.styleRoadsHint":
    "The line follows drivable roads between your points — click before and after a curve and the bend draws itself.",
  "plan.draw.styleFootpaths": "Footpaths",
  "plan.draw.styleFootpathsHint":
    "Same idea, but for pedestrian ways — trails, footpaths, stairs. Better for runs through parks or along rivers.",
  "plan.draw.styleStraight": "Straight lines",
  "plan.draw.styleStraightHint":
    "No road snapping — the next segment connects your points directly. Nothing leaves the browser. Segments drawn with the Curve pen stay smooth; switching styles never redraws them.",
  "plan.draw.routingPending": "Finding the road…",
  "plan.draw.routingFailed":
    "Road follow unavailable right now — straight lines until it recovers.",
  "plan.draw.routingMove":
    "Drag any point to adjust it — the road re-finds itself.",
  "plan.draw.routingDraw":
    "Switch to Move (M) to drag a point — the road re-finds itself.",
  "plan.draw.consentNotice":
    "Road snapping sends the points you draw to a public routing service — never your file. It is off until you enable it.",
  "plan.draw.consentEnable": "Enable road snapping…",
  "plan.draw.consentOnLead": "Road snapping is on for this session —",
  "plan.draw.turnItOff": "turn it off",
  "plan.draw.consentOnTail": "any time.",
  "plan.draw.vertexCount": "{count} / {max} points",
  "plan.draw.vertexCap": " — limit reached",
  "plan.draw.vertexListNote":
    "Drawn points — switch to Move (M) and drag any of them on the map, double-click to remove. Drawing (D) adds points only — the pencil never drags.",

  /** PlanEstimatesCard (plan-estimates-card.tsx) — what the map reads back. */
  "plan.estimates.title": "Estimates",
  "plan.estimates.intro":
    "What the route implies — read-only, nothing is exported.",
  "plan.estimates.factsLabel": "Route facts",
  "plan.estimates.crowFliesEmpty":
    "Place at least two points for the start-to-finish line.",
  "plan.estimates.crowFliesNoDetour":
    "Start to finish straight line: {straight} — the route runs {distance}.",
  "plan.estimates.crowFliesDetour":
    "Start to finish straight line: {straight} — the route winds to {factor}× that, at {distance}.",
  "plan.estimates.paceLabel": "Pace from a time you enter",
  "plan.estimates.goalTimeLabel": "Goal time",
  "plan.estimates.hours": "Hours",
  "plan.estimates.minutes": "Minutes",
  "plan.estimates.seconds": "Seconds",
  "plan.estimates.goalTimePart": "Goal time {part}",
  "plan.estimates.clearTitle": "Clear the entered time",
  "plan.estimates.clear": "Clear",
  "plan.estimates.plannedBadge": "Planned",
  "plan.estimates.paceNeedsRoute":
    "Draw a route on the map first — the pace needs a distance.",
  "plan.estimates.paceNeedsTime":
    "Enter a time above to see the pace it implies.",
  "plan.estimates.paceNeedsPositiveTime":
    "The time needs to be more than zero.",
  "plan.estimates.evenSplits": "Even splits — where each whole {unit} lands:",
  "plan.estimates.kilometer": "kilometer",
  "plan.estimates.mile": "mile",
  "plan.estimates.splitTail": "last {distance}",
  "plan.estimates.splitTailEnds": "ends at {time}",

  /** PlanStudio (plan-studio.tsx) — the composition root. */
  "plan.studio.srNote":
    " No file — this route is a plan you are sketching; nothing is exported or shared.",

  /** PlanWorkspace (plan-workspace.tsx) — the layout's labels. */
  "plan.workspace.sectionLabel": "Plan a route map and tools",
  "plan.workspace.toolsLabel": "Plan tools",
} as const;

/**
 * English dictionary — share view + share staging (Phase 21).
 *
 * Extracted from the share domain's components:
 *   - share-view.tsx        → the studio surface (stage, tools column,
 *                            the numbers card)
 *   - share-card-canvas.tsx → the reusable canvas's default a11y label
 *
 * The share CARD ARTIFACT itself (lib/share/*, features/share/*) is an
 * exported PNG that stays English by design — its copy is NOT here.
 * English values are the app's existing copy, moved VERBATIM.
 */

export const share = {
  /** ShareView (share-view.tsx). */
  "share.sectionA11y": "Share card",
  "share.toolsA11y": "Share card tools",
  "share.title": "Share card",
  "share.intro": "A Strava-style graphic of",
  "share.introFileFallback": "this file",
  "share.introTail": "— transparent background,",
  "share.introRenderedRepairs":
    "rendered from your repaired route — committed repairs are included automatically.",
  "share.introRenderedRecorded": "rendered from the values the file actually records.",
  "share.preparing": "Preparing the share card",
  "share.stageNote": "Transparent background — shown on dark",
  "share.onTheCard": "On the card",
  "share.cardDescRepairs":
    "Your committed repairs are included — the same totals the statistics panel shows.",
  "share.cardDescRecorded":
    "Recorded values only — the same numbers the statistics panel shows.",
  "share.colDistance": "Distance",
  "share.colPace": "Pace",
  "share.colTime": "Time",
  "share.routeEmpty":
    "This file has no drawable route points — the card will show the stats block only.",
  "share.pngResolution": "PNG resolution",
  "share.downloadPng": "Download PNG",
  "share.openRepair": "Repair this file instead",
  "share.numbersTitle": "What the numbers mean",
  "share.numbersDesc": "The card promises nothing the file does not contain.",
  "share.numbersRepairs":
    "Distance includes your committed repairs; pace is the overall pace over moving time plus repair time; time is the recorded elapsed span. Values the file cannot support show “—”.",
  "share.numbersRecorded":
    "Distance is the recorded route length; pace divides it by the recorded moving time; time is the recorded elapsed span. Values the file cannot support show “—”.",

  /** ShareCardCanvas (share-card-canvas.tsx) — the default a11y label. */
  "share.canvasA11y":
    "Share card: route plot with distance {distance}, pace {pace}, time {time}",
} as const;

export type ShareDict = typeof share;

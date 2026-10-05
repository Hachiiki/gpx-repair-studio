/**
 * English dictionary — help dialog, info dialog, cheat sheet copy (Phase 21).
 *
 * Extracted from the help domain's components (help-dialog.tsx,
 * help-content.tsx, info-dialog.tsx, info-content.tsx). Keys are
 * namespaced `help.*` (the shortcuts & help dialog) and `info.*`
 * (the About / Privacy & data dialog). English values are the app's
 * existing copy, moved VERBATIM — the dictionary is the contract
 * every locale checks against.
 *
 * Not here, by design: the cheat sheet's registry rows (group titles,
 * keycap chips, command descriptions flow from
 * features/commands/registry.ts — the coordinator's domain) and the
 * tool tours' titles/blurbs (components/layout/tool-tour.tsx — the
 * tours domain).
 */

export const help = {
  /** help-dialog.tsx — the "Shortcuts & help" overlay's header. */
  "help.dialog.title": "Shortcuts & help",
  "help.dialog.description":
    "Every keyboard shortcut in the app, and where to find each tool. Press",
  "help.dialog.descriptionSuffix": "anytime to reopen this.",

  /** help-content.tsx — the keyboard cheat sheet's own copy. */
  "help.keyboard.fieldNote":
    "The letter keys do nothing while you are typing in a field.",

  /** help-content.tsx — the map-gesture rows the registry does not own. */
  "help.map.title": "Map",
  "help.map.gestureScroll": "Scroll",
  "help.map.gesturePinch": "Pinch",
  "help.map.zoom": "Zoom in and out",
  "help.map.gestureDrag": "Drag",
  "help.map.pan": "Pan the map (Pan mode in the editors)",
  "help.map.gestureDoubleClick": "Double-click",
  "help.map.zoomStep": "Zoom in one step",

  /** help-content.tsx — the guided walkthroughs list. */
  "help.tours.title": "Guided walkthroughs",
  "help.tours.blurb":
    "A short, task-based tour for every tool — 3 to 4 steps, with teaching samples you can load along the way. Replay any of them as often as you like.",
  "help.tours.start": "Start",

  /** help-content.tsx — the "where everything lives" guide. */
  "help.where.title": "Where everything lives",
  "help.where.body":
    "The home page is seven tool cards — Repair, Share card, Gap recovery, Create from stats, Merge, Plan a route, and Batch cleanup. Opening a card shows how that tool works and its upload or start controls; “All tools” returns to the cards. New here? The “Take the tour” link on the home page replays the walkthrough anytime, and every tool has its own guided walkthrough in the section above. Your saved sessions live behind the header's “Sessions” button (also the “Continue a saved session” link on the home page) — that dialog saves, reopens, renames, exports, and imports session files (.gpxrepair.json).",

  /** info-dialog.tsx — the tablist, tabs, and pane titles. */
  "info.tablistAria": "About this app",
  "info.tab.about": "About",
  "info.tab.privacy": "Privacy & data",
  "info.tab.aboutTitle": "About GPX Repair Studio",
  "info.tab.privacyTitle": "Privacy & Data",

  /** info-content.tsx — PrivacyPane: the §M-1 promise. */
  "info.privacy.promise.title": "Everything else runs on this device",
  "info.privacy.promise.body":
    "Reading the file, parsing, gap detection, drawing, geodesy, timestamp reconstruction, statistics, merging, and export all execute in this browser tab. There is no account, no server copy, no analytics, and no cookies. Closing the tab destroys everything in memory.",

  /** info-content.tsx — PrivacyPane: the §M-2 egress table. */
  "info.privacy.egress.title": "What leaves this browser — the complete list",
  "info.privacy.egress.whenWhere": "When & where",
  "info.privacy.egress.whatSent": "What is sent",
  "info.privacy.egress.tiles.trigger": "The map is visible",
  "info.privacy.egress.tiles.destination":
    "Map tiles — OpenFreeMap (default) or OpenStreetMap raster",
  "info.privacy.egress.tiles.payload":
    "Tile coordinates (x/y/z) for the visible area, plus the standard metadata any web request carries (IP address, user agent). Tile-level only — roughly kilometers at low zoom. Never your GPX, never precise positions.",
  "info.privacy.egress.road.trigger":
    "You enable road snapping (Roads / Footpaths / Snap to road — off until you say yes, re-asked every session)",
  "info.privacy.egress.road.destination":
    "Public routing services — OSRM (roads) and Valhalla (footpaths), or your own OSRM-compatible server",
  "info.privacy.egress.road.payload":
    "The points of the lines you draw — per-segment endpoints for the path styles, the drawn line's points for Snap to road. Never the file, never recorded points. Nothing is sent until you enable it; the footer says so while it is on, and Straight lines and the Curve pen are fully local — no request at all.",
  "info.privacy.egress.elevation.trigger":
    "You opt in to an elevation lookup (per reconstruction, after a disclosure)",
  "info.privacy.egress.elevation.destination":
    "Open-Meteo Elevation API (Copernicus DEM GLO-90)",
  "info.privacy.egress.elevation.payload":
    "The coordinates of the reconstructed points only — the count is shown before you confirm. Never the full file, never the recorded route. Off by default; nothing fetches until you ask.",
  "info.privacy.egress.footnote":
    "That is the whole list. The core flow — upload, inspect, draw with Straight or Curve lines, time reconstruction, statistics, merge, export, share card — makes no requests at all, and an automated test runs that flow with a strict network allow-list and fails if anything else is ever contacted. Road snapping is the one row you switch on yourself: it stays off, sends nothing, until you enable it for a session.",

  /** info-content.tsx — PrivacyPane: offline behavior (Phase 22: the
   * service worker keeps the app itself + viewed tiles on the device). */
  "info.privacy.offline.title": "Working offline",
  "info.privacy.offline.body":
    "After your first visit, the app itself is kept on this device and opens with the network off — install it from your browser's menu (Install app / Add to Home Screen) and it runs standalone, mountains included. Basemap tiles you have viewed are kept too (capped), so the map you panned through stays sharp offline; without a tile the basemap falls back to a plain background — the route, the gaps, and every drawn line still render on it. Everything except the three rows above keeps working offline: upload, parse, inspect, draw (Straight and Curve), time reconstruction, statistics, merge, export, and the share card.",

  /** info-content.tsx — PrivacyPane: provider switching. */
  "info.privacy.providers.title": "Choosing the providers",
  "info.privacy.providers.basemapLabel": "Basemap:",
  "info.privacy.providers.basemapBody":
    "the map toolbar's basemap control (the layers icon) switches between OpenFreeMap and OpenStreetMap Standard raster — remembered with your settings.",
  "info.privacy.providers.roadLabel": "Road-following:",
  "info.privacy.providers.roadBody":
    "off until you enable it — the draw tools ask first, the footer says so while it is on, and every fresh page load asks again. OSRM serves the Roads path style and Valhalla serves Footpaths by default — public demo servers, best-effort by design. When one is unreachable the line falls back to straight segments until it recovers, and the editor says so. You can also point both styles — and the Snap-to-road command — at your own server:",
  "info.privacy.providers.elevationLabel": "Elevation:",
  "info.privacy.providers.elevationBody":
    "Open-Meteo (Copernicus DEM GLO-90) is the only provider today, and it is opt-in per reconstruction — the disclosure with the exact point count is shown before anything is sent.",

  /** info-content.tsx — PrivacyPane: on-device storage (Phase 10). */
  "info.privacy.storage.title": "What this device stores",
  "info.privacy.storage.settingsTitle": "Settings — localStorage",
  "info.privacy.storage.settingsBody":
    "Your gap thresholds, basemap choice, units, export preferences, and the last tool you opened. Settings only — never GPX data.",
  "info.privacy.storage.sessionsTitle": "Unfinished work — IndexedDB",
  "info.privacy.storage.sessionsBody":
    "While you draw, the original file's bytes and your edits (points, spans, settings) are autosaved — one record per tool, at most four, so a reload or closed tab offers your work back instead of losing it. Never uploaded. Clear it with Discard or \"Clear all saved sessions\" on the landing page, \"Start over\" in a workspace, or by clearing this site's data in the browser.",

  /** PrivacyPane: the Phase 22 on-device caches (elevation terrain +
   * the service worker's offline copies), each with its Clear button. */
  "info.privacy.storage.elevationTitle": "Elevation terrain — IndexedDB",
  "info.privacy.storage.elevationBody":
    "Every point the elevation tool resolves is kept on this device — coordinates rounded to about a meter, capped at 5,000 points — so the same hillside is never fetched (or sent) twice, even after a reload. Clearing it touches nothing else; new fetches simply start the cache over.",
  "info.privacy.storage.elevationCount": "{count} points stored",
  "info.privacy.storage.elevationClear": "Clear terrain cache",
  "info.privacy.storage.elevationCleared": "Cleared — {count} points removed.",
  "info.privacy.storage.offlineTitle": "Offline app & viewed tiles — Cache Storage",
  "info.privacy.storage.offlineBody":
    "The service worker keeps the app's own files (precache + runtime) and the basemap tiles you have viewed (capped at 800) so the studio opens and keeps working with the network off. Clearing also unregisters the worker — the next online visit re-installs and re-downloads exactly what it needs.",
  "info.privacy.storage.offlineClear": "Clear offline caches",
  "info.privacy.storage.offlineCleared": "Cleared — the app re-installs on the next online visit.",
  "info.privacy.storage.unavailable":
    "Persistence is unavailable in this browser (private mode or blocked storage) — the cache lives in memory for this session only.",
  "info.privacy.storage.footnote":
    "No cookies. No analytics. No accounts. If you clear site data and close the tab, nothing remains anywhere.",

  /** info-content.tsx — PrivacyPane: the routing provider setting (§EE 17.1). */
  "info.privacy.router.title": "Your own routing server (optional)",
  "info.privacy.router.label":
    "OSRM-compatible base URL — e.g. https://osrm.example.com",
  "info.privacy.router.saved":
    "Saved — routing now goes to your server (once road snapping is enabled).",
  "info.privacy.router.save": "Save URL",
  "info.privacy.router.reset": "Use public servers",
  "info.privacy.router.note":
    "An OSRM-compatible server answers the same route API the demo servers do — a self-hosted osrm-routed serves whichever profile it was built with, so both Roads and Footpaths follow it. The README's self-hosting section has the full instructions; with no URL here, the public demo servers above are used.",

  /** info-content.tsx — AboutPane. */
  "info.about.title": "A local-first workbench for GPX files",
  "info.about.p1":
    "GPX Repair Studio exists because GPS recordings break in predictable ways — signal loss in tunnels and downtown canyons, watches that keep the numbers but lose the map, platforms that split one activity into pieces. Six tools fix those files, and every one of them runs entirely in your browser: nothing you open here is ever uploaded.",
  "info.about.p2Prefix": "The whole app is built on one principle:",
  "info.about.p2Principle": "recorded data and reconstructed data never mix",
  "info.about.p2Rest":
    ". Statistics label what was measured and what was drawn, exports mark every reconstructed point so platforms like Strava can see the difference, and the original recording is never modified — repairs are added alongside it, and undo always gets you back.",
  "info.about.attributionsTitle": "Built on open data & software",
  "info.about.credit.mapLibre":
    "Open-source WebGL map rendering (BSD-2-Clause).",
  "info.about.credit.tiles":
    "Map tiles — the Positron style via OpenFreeMap, and the classic raster tiles. Map data © OpenStreetMap contributors.",
  "info.about.credit.routing":
    "Road-following for the Roads and Footpaths pens, served from their public demo servers (OpenStreetMap data).",
  "info.about.credit.elevation":
    "Opt-in elevation lookups. © Open-Meteo.com — contains modified Copernicus data.",
  "info.about.credit.fonts":
    "The type system — self-hosted with the app, which makes no font requests at runtime.",
  "info.about.version": "Version {version} · local-first · no tracking",
} as const;

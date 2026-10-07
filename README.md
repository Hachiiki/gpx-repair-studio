# GPX Repair Studio

A local-first workbench for repairing, recovering, creating, combining, and sharing GPX activity files — entirely in the browser. **No account, no server-side processing, no analytics, no cookies.** A GPX file you open here is parsed, edited, and exported on your device and never uploaded anywhere.

Six tools, one workbench — and a seventh for the folder-sized chores:

| Tool | What it does |
|------|--------------|
| **Repair a recording** | Inspect a GPX with gaps or damage, draw the missing route yourself — clicks follow real roads or footpaths, the Curve pen draws freehand — and download the repaired file with every reconstructed point marked. |
| **Create a share card** | Turn any activity into a Strava-style share graphic: the route on a transparent 1080×1920 canvas with the distance, pace, and time the file records. |
| **Recover a GPS gap** | For activities where the clock kept running through a GPS dropout: draw the section that went missing, export a corrected file with timestamps fitted into the interval. |
| **Create from stats** | A watch that recorded the numbers but no map: enter the statistics, draw the route, download a GPX scaled to your recorded distance. |
| **Combine recordings** | Merge two or more GPX files into one route — every point, elevation, and waypoint preserved, in your chosen order. |
| **Plan a route** | A draw-and-measure scratchpad: sketch a route, read distance and elevation, see the pace a goal time implies. Nothing is exported or shared. |
| **Clean up many files** | Queue up to 50 recordings, run one fix preset across them (previewed per file), export a ZIP with a manifest of every change. |

The design principle underneath all of them: **recorded data and reconstructed data never mix.** Statistics label what was measured and what was drawn, exports mark every reconstructed point (so Strava and other platforms can see the difference), and the original recording is never modified.

**No file handy?** Every file tool's intake carries a **“Try a sample”** link — a small synthetic recording bundled inside the app (the repair sample has two GPS gaps to fix; the merge sample is a two-part commute). The create form has **“Use example numbers.”** Everything runs the same pipeline as a real upload.

**Dark mode** ships built-in: the footer's toggle (System / Light / Dark) re-themes the whole bench — including the map, whose basemap is darkened at runtime and whose recorded-route ink flips to a light line. **Press `?`** anywhere (or footer → **Shortcuts & help**) for the keyboard map and a guide to where everything lives.

**Command palette:** press **Ctrl/Cmd+K** anywhere for a fuzzy-searchable palette over every action in the app — the seven tools, saved sessions (your four most recent, one click to restore), the editors' pointer modes, undo/redo, theme, help, and the tool walkthroughs — keyboard-first (arrows move, Enter runs, Esc closes) and screen-reader solid. **Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z** undo and redo whatever editor holds the stage (text fields keep their native undo), and the help sheet's keyboard map is generated from the same single source the palette runs on: every binding it documents, ships.

**Mixed-mode drawing:** the path-style chips (Roads / Footpaths / Straight lines) decide how the **next** segment draws — never what the placed ones look like. Draw a road leg, switch to footpaths, draw a trail, switch to straight, draw across the gap: every segment keeps the geometry it was drawn with, the distance/elevation/export numbers all measure the combined route, and switching modes never clears, recalculates, or resets anything you placed.

**Deep validation** (repair workspace) hunts the damage a fix can address: GPS teleports (implied speeds above 130 km/h), near-duplicate points, backwards clocks, elevation outliers, stop-and-wander drift, and missing-elevation runs. Every finding jumps to the map and lists its points as text; every fix — remove spikes, dedupe, sort by time, smooth elevations, thin an over-dense recording — shows *exactly* what would change before you confirm, lands in a per-fix change log with an undo, and never rewrites the original: fixes live on a **working copy** that statistics, the map route, and the export recompute from, with the changes disclosed in the exported file's metadata and marked per point (`gpxr:modified`). Presets chain the fixes — *Drift cleanup*, *Dedupe & sort*, *Resample (thin)*, *Spike & outlier sweep* — each previewed as a whole. Confirmed fixes survive a reload with the rest of your session.

**Formats in & out.** The intake reads **GPX, TCX, and FIT** — auto-detected from the file's bytes, not its name, so a Garmin `.FIT` or a Strava-style `.TCX` drops straight into the same repair pipeline (heart rate / cadence / power ride along as read-only passthrough; pause records without coordinates are skipped and disclosed). The export dialog offers **KML** (Google Earth), **GeoJSON** (GIS tools), and **CSV** (spreadsheets) alongside GPX: every format carries the provenance labels — KML as ExtendedData, GeoJSON as feature properties, CSV as a per-point provenance column — and the GPX export remains the full-fidelity one with `gpxr` markers.

**Stats dashboard** (repair workspace): every kilometer (or mile — the pace toggle decides) of the route becomes a split with its distance, time, average pace, and elevation gain, drawn as a pace-over-distance bar chart and listed in a table where splits crossing reconstructed stretches are flagged *estimated*. **Time in motion** separates moving time from stopped time (a stop is implied speed under 0.5 m/s, disclosed in place) with the stop events listed. The **elevation profile** shades recorded vs reconstructed stretches, reads out values under the pointer, and answers the keyboard alone (arrow keys walk a cursor; a table gives the textual equivalent). **Zones & metrics** turn the heart rate, cadence, and power that ride along in TCX/FIT files into analysis: time in each zone (the five-band heart-rate set from your max HR, seven FTP power zones, six pace zones from a race result — bucketed by grade-adjusted pace), cadence ranges, per-split zone breakdowns, and an opt-in calorie estimate, with every model named in place. The whole dashboard exports as a **long-format stats CSV** (meta, summary, zones, per-split, stop-event rows) or prints as a clean sheet — light palette, no chrome, stats only — via **Stats CSV** and **Print** in the statistics header.

**Track surgery** (repair workspace): the same working copy accepts manual geometry — **split** a segment after a picked point (pick it on the map or type the number), **delete an A–B range**, **duplicate** a segment, and **reorder** segments within their tracks with up/down buttons. Every operation previews exactly what would change, lands in the shared change log as one undo step, and is disclosed in the export — splits, copies, and manual reorders all appear in the metadata note of every format.

**Keyboard-only drawing:** the draw editor's point list is now the canvas's full keyboard twin — add points by typing lat/lng, edit any point's coordinates in place, insert between two points (prefilled with the geodesic midpoint), and **nudge a focused point with the arrow keys** at a 1/10/100 m step (Shift = ×10; a whole nudge run is one undo). A complete gap repair can be finished without touching the mouse — the v1 limitation ("drawing required a pointing device") is closed. Typed coordinates are validated honestly: bounds are named, over-precise values round to 7 decimals (~1 cm) with a note, and DMS or scientific notation is refused with the expectation.

**Road snapping, opt-in (consent-gated):** every routing request is now behind an explicit per-session opt-in — nothing is sent until you enable road snapping, the footer states the on state with the exact hosts, and every fresh page load asks again. The one-shot **Snap to road** command matches a whole drawn line onto the road network in a single request, previews it on the line itself with an honest distance delta, and applies as ONE undo step (geometry and path style together). Offline, the snap control disables with an explanation; straight and curve lines never stop working.

**Batch cleanup** (the seventh tool): drop one or many GPX/TCX/FIT files (up to 50) into the queue — each parses locally and reports its points, its deep-check findings, or its typed failure (one bad file never blocks the rest). Pick a fix preset and see, per file, exactly what it would change — the same plan words the single-file preview shows — before anything is applied; every fix undoes per file. The export is one **ZIP**: a repaired GPX per file plus `MANIFEST.txt` stating what changed in each (files the fixes cannot help export unchanged, byte-identical to the identity export). Batch operations use the shipped deep-check settings; tune an individual file in the repair studio.

**International (English + 简体中文):** the whole app speaks your language. The footer's language chip (EN / 中文) switches every surface in place — landing, tool pages, editors, toasts, the command palette, the help and privacy documents — and the choice persists. Units, number grouping, and dates follow the locale (公里 / m, 1,234, zh-CN date forms), while exported artifacts (GPX notes, the batch manifest, the share card) stay in canonical English so they behave identically everywhere. The command palette searches bilingually: 撤销 finds undo, and English keywords keep working under the Chinese UI. Session-recovery labels and fix descriptions are stored as keys, so a session saved in one language re-renders in another — old pre-translation sessions keep their exact original text. A `?lang=pseudo` expansion harness (deliberately ~33% longer strings in QA brackets) proves every layout survives a longer locale before one ships.

**Portable sessions & the sessions shelf:** your work is yours to keep. The header's **Sessions** door (and the landing's "Continue a saved session" link) opens the manager: save the current session under a name, reopen it later, rename or delete it, or export it as a **`.gpxrepair.json` session file** — a versioned document carrying the whole thing (the original recording's bytes, every confirmed fix, every drawn repair, the view) that opens straight back into the app on any device. No accounts, ever: the file *is* the session. Named saves live in this browser's IndexedDB alongside the crash-recovery autosave (the shelf is your explicit snapshot; the autosave is the net).

**The training library** (the same manager, four tabs): the shelf grown into the history view a training platform would give you — computed on-device. Each saved file-backed session becomes a **card** with its distance, moving time, pace, elevation gain, and average heart rate, sortable and filterable, with multi-select bulk delete and a **`.gpxrepair-library.json` bundle** export (the import door reads both formats). **Records** keeps farthest / longest / most gain over recorded data only and best efforts over Strava's fourteen-distance benchmark ladder in elapsed time (the clock does not stop; efforts over reconstructed stretches are excluded — a record set on a drawn-in gap is not a record; top three per distance), plus opt-in **Riegel race-time predictions** with the formula and its caveats stated in place. **Trends** charts weekly/monthly volume and — once enough history exists (21 days, 8 sessions, honestly counted) — the fitness-fatigue line (Banister's impulse-response model as Coggan applied it: 42-day fitness, 7-day fatigue, form the difference; a volume model, explicitly not training advice). **Segments** are your own stretches timed against yourself: pick one on the loaded track or draw it on the map, and every saved session that covers it becomes an effort — matched on Strava's documented semantics (crossings within a disclosed 40 m drift tolerance, elapsed time, directional), with the same honesty rule (efforts touching drawn-in repair are flagged, never records) and the repair dividend stated in place (a data gap breaks matching on Strava; repairing it here restores eligibility). The map toolbar's **heatmap** turns the whole shelf into a theme-aware density wash — where you have been, computed on this device. The derived indexes and strips live beside the sessions in the same IndexedDB, are disclosed in the privacy pane, and delete with their sessions; the whole library exports as a CSV.

**Install it. Use it in the mountains.** The app is a PWA: after your first visit, a service worker keeps the whole studio (every chunk, font, and asset) on the device, and **Install app / Add to Home Screen** (your browser's menu) runs it standalone, offline. The basemap tiles you have viewed are kept too (capped), so the map you panned through stays sharp with the network off — and the full repair journey is proven offline by an automated test that cuts the network and still uploads, repairs, and exports with zero requests leaving the browser. **Never wait twice:** elevation terrain you have fetched once is kept in a persistent on-device cache (rounded to ~1 m, capped at 5,000 points) and rehydrates on every visit — the same hillside is never fetched, or sent, again. Updates ask before they apply: a toast offers **Reload**, nothing swaps mid-edit, and both caches are disclosed in the privacy pane with their own Clear buttons.

---

## Privacy in one paragraph

Uploading, parsing, gap detection, drawing, geodesy, timestamp reconstruction, statistics, merging, export, and the share card all run client-side. The only network requests are: **map tiles** (OpenFreeMap by default, OSM raster optional, switchable in the map toolbar), **road-follow and snap-to-road lookups** — only after you enable road snapping for the session (the points of the lines you draw go to public OSRM/Valhalla demo servers, or to your own router when one is configured; never the file, never recorded points; the footer says so while it is on), and **opt-in elevation lookups** (Open-Meteo / Copernicus DEM, per reconstruction, with a disclosure first). Unfinished work is autosaved to IndexedDB on your device and offered back on your next visit; settings live in localStorage. Full disclosure in the app: footer → **Privacy & data**.

---

## Self-hosting the router (your roads, your server)

Road snapping can run entirely against a routing server you control.
The app speaks the standard **OSRM** route API, so any
`osrm-routed`-compatible service works:

1. **Prepare the data** — download an OSM extract (e.g. from
   [Geofabrik](https://download.geofabrik.de/)) for your region.
2. **Build the network** — with the OSRM toolchain:
   ```sh
   osrm-extract -p car your-region.osm.pbf
   osrm-partition your-region.osrm
   osrm-customize your-region.osrm
   ```
   A `foot` profile (the `osrm-foot.lua` / pedestrian profiles in the
   OSRM backend) gives you true footpaths for the Footpaths style.
3. **Serve it** — `osrm-routed --algorithm mld your-region.osrm` on
   the host and port you want; put HTTPS in front of it (any reverse
   proxy) — the app only accepts `https://` URLs (`http://` works for
   local testing).
4. **Point the app at it** — footer → **Privacy & data** → *Your own
   routing server*: paste the base URL (e.g.
   `https://osrm.example.com`) and Save. Both the Roads and Footpaths
   styles — and Snap to road — now route there; an OSRM server serves
   whichever profile it was built with, so build one per profile (or
   run two) if you want both to be exact. Nothing else changes: the
   opt-in still applies, the footer names your host, and the public
   demo servers are not contacted.

With no URL set, the public demo servers (`router.project-osrm.org`,
`valhalla1.openstreetmap.de`) serve best-effort routing — fine for
trying the feature, not a service-level guarantee.

---

## Development setup

Requirements: Node.js 20+ (or Bun) and npm.

```bash
npm install          # also syncs the vendored MapLibre worker (postinstall)
npm run dev          # http://localhost:3000
```

Other commands:

```bash
npm run build        # production build (standalone output + the PWA step:
                     #   precache manifest + the versioned service worker)
npm run start        # serve the production build
npm run lint         # ESLint (includes the architecture boundary rules)
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit + component suites
npm run test:e2e     # Playwright e2e (expects dev server on :3000)
```

The Playwright config deliberately runs **no webServer** — start `npm run dev` first, then run e2e. The existing suite already accounts for the first-run onboarding tour (the tour flag is pre-seeded in `playwright.config.ts`'s storageState); `e2e/onboarding-tour.spec.ts` opts out to test the tour itself. The two Phase 22 specs (`e2e/phase22-*.spec.ts`) are the exception: they boot the **production** build on their own ports (a service worker must never control the dev server), so they need `npm run build` first and skip with instructions when it is missing.

---

## Architecture

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Zustand + MapLibre GL JS. The app is a single client-side page; the server only serves the bundle (static-exportability is permanently guarded by `tests/architecture.test.ts`).

```
src/
├── app/                # layout.tsx (fonts/metadata) + page.tsx (composition only)
├── components/
│   ├── layout/         # AppShell (composition root), landing, header, footer,
│   │                   # onboarding tour, About/Privacy dialog, restore prompt
│   ├── gpx/            # upload, summary, validation, segment list, export
│   ├── map/            # MapCanvas, toolbar (all MapLibre use is isolated)
│   ├── reconstruction/ # draw editor panel, gap list, timing, manual spans
│   ├── statistics/     # stats panel, elevation profile
│   ├── recovery/       # Gap Recovery section (own session + editor)
│   ├── create/         # Create-from-stats section
│   ├── merge/          # Merge section
│   ├── plan/           # Plan-a-route section
│   ├── share/          # share card view
│   └── shared/         # RevealOnScroll etc.
├── features/           # PURE domain logic (no React, no DOM, no global fetch)
│   ├── gpx/            # parser, validator, gap detection, export, resample
│   ├── elevation/      # Open-Meteo provider (fetch injected)
│   └── reconstruction/ # draw model, road-follow (OSRM/Valhalla, fetch injected)
├── hooks/              # React bindings: sessions, editors, maps, export, recovery
├── lib/                # geodesy, mercator, share-card render, storage (IDB)
├── state/              # Zustand stores (one per section + ui + elevation)
├── workers/            # Web Worker parse pipeline (100k+ point files)
└── types/              # domain types
```

Boundary rules (enforced by ESLint, `eslint.config.mjs`):

- `maplibre-gl` may only be imported inside `src/lib/map/**`.
- `src/components/**` may not import `@/features/**` or `@/lib/map/**` — data arrives via props/hooks.
- `src/features/**` and `src/lib/geo/**` are pure TypeScript: no React, no DOM, no global `fetch` (implementations are injected).
- `src/app/page.tsx` composes layout components and hooks only.

Notable subsystems:

- **Parse pipeline** — a Web Worker streams chunks for large files (progress UI, no main-thread block over 200 ms inside the pipeline); rendering decimates by zoom level (a 100k-point track draws ~500 coords at fit zoom).
- **Session recovery** — debounced (800 ms) IndexedDB autosave of the four drawing sessions: the original file's bytes (written once) plus a small record of the drawn work; restore re-runs the real load path and re-seeds the road-follow cache so a restored line issues zero new routing requests. Everything degrades silently to pre-Phase-10 behavior when storage is unavailable.
- **Share card** — one canvas painter for preview AND export (WYSIWYG), self-hosted Montserrat, alpha-transparent PNG at 1×/2×.

`docs/MASTER_PLAN.md` is the living core spec — overview, requirements, architecture, strategies (sections A–O). Every phase, planned and delivered, has its own file in the **plan library**, [`docs/plans/`](docs/plans/README.md), hyperlinked from each version's overview ([v1](docs/plans/v1/overview.md) · [v2](docs/plans/v2/overview.md) · [v3 proposed](docs/plans/v3/overview.md)).

---

## Testing

- **Unit / component (Vitest + React Testing Library)** — the bulk of the suite: parser fixture corpus (GPX 1.0/1.1, malformed, Unicode, BOM, 100k synthetic…), geodesy golden vectors, gap detection boundaries, timestamp case matrix, export round-trip properties (including the original-data-untouched invariant), editor state machines, store contracts, and UI suites for every section.
- **E2E (Playwright, Chromium)** — happy paths per tool (drawing via synthetic pointer events, assertions on controller-exposed state, not pixels), a **privacy invariant** spec (network allow-list; any other host fails the run), offline core, keyboard-only, mobile touch at 375 px, axe accessibility scans, performance budgets, and session recovery across reloads.

```bash
npm run dev &         # e2e expects the dev server on :3000
npm run test:e2e
```

Run the full gate before committing:

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

---

## Deployment

Any static host or Node server works — there are no API routes and no server-side data. `next.config.ts` keeps `output: "standalone"` for the current deployment contract; static-exportability (`output: "export"`) is verified in an isolated build copy and guarded by tests.

## Attribution

MapLibre GL JS · OpenFreeMap & OpenStreetMap (map data © OpenStreetMap contributors) · OSRM & Valhalla (public demo routing) · Open-Meteo with Copernicus DEM GLO-90 (elevation) · Archivo, Big Shoulders, IBM Plex Mono, and Montserrat (self-hosted type). Full credits in the app: footer → **About**.

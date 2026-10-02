# GPX Repair Studio

A local-first workbench for repairing, recovering, creating, combining, and sharing GPX activity files — entirely in the browser. **No account, no server-side processing, no analytics, no cookies.** A GPX file you open here is parsed, edited, and exported on your device and never uploaded anywhere.

Six tools, one workbench:

| Tool | What it does |
|------|--------------|
| **Repair a recording** | Inspect a GPX with gaps or damage, draw the missing route yourself — clicks follow real roads or footpaths, the Curve pen draws freehand — and download the repaired file with every reconstructed point marked. |
| **Create a share card** | Turn any activity into a Strava-style share graphic: the route on a transparent 1080×1920 canvas with the distance, pace, and time the file records. |
| **Recover a GPS gap** | For activities where the clock kept running through a GPS dropout: draw the section that went missing, export a corrected file with timestamps fitted into the interval. |
| **Create from stats** | A watch that recorded the numbers but no map: enter the statistics, draw the route, download a GPX scaled to your recorded distance. |
| **Combine recordings** | Merge two or more GPX files into one route — every point, elevation, and waypoint preserved, in your chosen order. |
| **Plan a route** | A draw-and-measure scratchpad: sketch a route, read distance and elevation, see the pace a goal time implies. Nothing is exported or shared. |

The design principle underneath all six: **recorded data and reconstructed data never mix.** Statistics label what was measured and what was drawn, exports mark every reconstructed point (so Strava and other platforms can see the difference), and the original recording is never modified.

**No file handy?** Every file tool's intake carries a **“Try a sample”** link — a small synthetic recording bundled inside the app (the repair sample has two GPS gaps to fix; the merge sample is a two-part commute). The create form has **“Use example numbers.”** Everything runs the same pipeline as a real upload.

**Dark mode** ships built-in: the footer's toggle (System / Light / Dark) re-themes the whole bench — including the map, whose basemap is darkened at runtime and whose recorded-route ink flips to a light line. **Press `?`** anywhere (or footer → **Shortcuts & help**) for the keyboard map and a guide to where everything lives.

**Deep validation** (repair workspace) hunts the damage a fix can address: GPS teleports (implied speeds above 130 km/h), near-duplicate points, backwards clocks, elevation outliers, stop-and-wander drift, and missing-elevation runs. Every finding jumps to the map and lists its points as text; every fix — remove spikes, dedupe, sort by time, smooth elevations, thin an over-dense recording — shows *exactly* what would change before you confirm, lands in a per-fix change log with an undo, and never rewrites the original: fixes live on a **working copy** that statistics, the map route, and the export recompute from, with the changes disclosed in the exported file's metadata and marked per point (`gpxr:modified`). Presets chain the fixes — *Drift cleanup*, *Dedupe & sort*, *Resample (thin)*, *Spike & outlier sweep* — each previewed as a whole. Confirmed fixes survive a reload with the rest of your session.

**Formats in & out.** The intake reads **GPX, TCX, and FIT** — auto-detected from the file's bytes, not its name, so a Garmin `.FIT` or a Strava-style `.TCX` drops straight into the same repair pipeline (heart rate / cadence / power ride along as read-only passthrough; pause records without coordinates are skipped and disclosed). The export dialog offers **KML** (Google Earth), **GeoJSON** (GIS tools), and **CSV** (spreadsheets) alongside GPX: every format carries the provenance labels — KML as ExtendedData, GeoJSON as feature properties, CSV as a per-point provenance column — and the GPX export remains the full-fidelity one with `gpxr` markers.

---

## Privacy in one paragraph

Uploading, parsing, gap detection, drawing, geodesy, timestamp reconstruction, statistics, merging, export, and the share card all run client-side. The only network requests are: **map tiles** (OpenFreeMap by default, OSM raster optional, switchable in the map toolbar), **road-follow lookups** when you draw with the Roads or Footpaths pen (only the two endpoints of a segment go to public OSRM/Valhalla demo servers), and **opt-in elevation lookups** (Open-Meteo / Copernicus DEM, per reconstruction, with a disclosure first). Unfinished work is autosaved to IndexedDB on your device and offered back on your next visit; settings live in localStorage. Full disclosure in the app: footer → **Privacy & data**.

---

## Development setup

Requirements: Node.js 20+ (or Bun) and npm.

```bash
npm install          # also syncs the vendored MapLibre worker (postinstall)
npm run dev          # http://localhost:3000
```

Other commands:

```bash
npm run build        # production build (standalone output)
npm run start        # serve the production build
npm run lint         # ESLint (includes the architecture boundary rules)
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit + component suites
npm run test:e2e     # Playwright e2e (expects dev server on :3000)
```

The Playwright config deliberately runs **no webServer** — start `npm run dev` first, then run e2e. The existing suite already accounts for the first-run onboarding tour (the tour flag is pre-seeded in `playwright.config.ts`'s storageState); `e2e/onboarding-tour.spec.ts` opts out to test the tour itself.

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

`docs/MASTER_PLAN.md` is the full planning document — every phase's scope, contracts, and shipped-behavior addenda (sections A–BC).

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

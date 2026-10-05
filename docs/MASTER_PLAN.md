# GPX Repair Studio — Master Plan

**Working title:** GPX Repair Studio (placeholder — user may rename)
**Status:** PLANNING ONLY. No implementation has started. This document is the deliverable of the planning stage; execution begins only after explicit user instruction.

---

## 0. Repository Inspection Findings

Inspection performed before planning (as instructed):

- `/home/z/my-project` is a **greenfield git repository**: branch `main`, a single `Initial commit`, clean working tree. `.gitignore` covers `skills/` and `node_modules/`.
- **No application code exists yet.** No `package.json`, no framework config, no source files. Directories present: `download/` (deliverables), `upload/` (empty), `skills/` (tooling, git-ignored).
- Toolchain available: Node v24.21.0, npm 11.19.0, bun 1.3.14.
- The environment's standard fullstack scaffold (to be generated at Phase 0) produces: **Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS 4 + shadcn/ui (Radix) + Prisma + z-ai-web-dev-sdk**.

**Implications for this plan:**

1. "Existing technology" = the scaffold stack. It fits this product well: a single-page, client-heavy tool where every interactive surface is a client component and the server's only job is serving the static bundle.
2. Because the product is deliberately serverless (Section M), Phase 0 must **tailor the scaffold at generation time**: Prisma/DB layer, demo API routes, and any server-processing scaffolding are removed/disabled *before* the first feature commit. Doing this at t=0 is scaffold tailoring, not a refactor of working code (this is the advance explanation required by the project's Git-safety rule).
3. Planned new runtime dependencies (each justified in Section E): `maplibre-gl`, `zustand`. Everything else uses native browser APIs (File, DOMParser, XMLSerializer, IndexedDB, Web Worker) or existing scaffold dependencies.
4. Git baseline: one commit per phase (Phase 0 commit includes this plan). No unrelated refactors during phases.

---

## A. Product Overview

GPX Repair Studio is a **privacy-first, local-first web application for repairing running activities whose GPS recording is incomplete**.

A typical scenario: a runner's watch/phone recorded the first 15 minutes of a 60-minute run, lost GPS signal (canyon, tunnel, forest, battery save, crash), then resumed recording for the last 15 minutes. The exported GPX contains two clusters of points with a large hole between them — in space and in time. Fitness platforms then show a wildly wrong map, distance, and pace.

The application lets the user reconstruct the missing piece manually and honestly:

```
Upload GPX (browser File API — file never leaves the browser)
  → Parse & validate locally (DOMParser, typed model)
  → Visualize recorded route on an interactive map
  → Detect GPS/time gaps automatically (time gaps, impossible speeds, segment breaks)
  → User selects a gap and draws the route they actually ran
  → Geodesic distance of the drawn route is computed (WGS-84 ellipsoid math)
  → Missing duration is derived from timestamps before/after the gap (or entered manually)
  → Estimated pace is computed and clearly labeled as an estimate
  → Elevation for reconstructed points is optionally fetched (opt-in, coordinates only)
  → Reconstructed data is merged with the original GPX
  → A valid GPX 1.1 file is generated client-side and downloaded
```

Two inviolable product promises:

1. **Original recorded data is never mutated.** Parsed originals are immutable; every derived/estimated value lives in separate, explicitly-typed structures.
2. **Reconstructed information is always distinguishable** — in the data model (discriminated types), in the UI (distinct styles, badges, tooltips), and in the exported file (namespaced provenance extensions + segment separation).

The tool is for running activities first (pace semantics, plausible-speed heuristics), but nothing hard-blocks other activities; thresholds are configurable.

---

## B. Functional Requirements

### FR-1 — GPX input/output

- **FR-1.1** Upload via drag-and-drop, file picker, and (later) raw XML paste.
- **FR-1.2** Parse GPX 1.1; tolerate GPX 1.0 and namespace-quirky exports (Garmin, Strava, Wahoo, Suunto, Coros, Apple Watch exports are the compatibility target set).
- **FR-1.3** Read per-point latitude, longitude, elevation, timestamp; handle multiple `<trk>` and multiple `<trkseg>` per track.
- **FR-1.4** Preserve track metadata (name, description, type) and pass through `<wpt>`/`<rte>` untouched.
- **FR-1.5** Validate: XML well-formedness; structural conformance (required attributes); semantic sanity (coordinate ranges, plausible elevation, parseable ISO-8601 timestamps, time ordering, zero-coordinate clusters, impossible implied speeds, duplicate points, empty/single-point segments).
- **FR-1.6** Detect missing or abnormal data and surface a readable validation report.
- **FR-1.7** Generate valid GPX 1.1 output with provenance extensions; two export modes (structure-preserving default, merged continuous track).
- **FR-1.8** Download the repaired file (`blob:` + anchor download).

### FR-2 — Map

- **FR-2.1** Interactive map (pan/zoom), desktop and mobile.
- **FR-2.2** Original route visualization, styled per segment.
- **FR-2.3** Gap visualization: highlighted gap span, boundary markers, distinct casing.
- **FR-2.4** Route drawing on the map: click-to-add-vertex polyline; vertex drag/insert/delete; finish/cancel.
- **FR-2.5** Undo, redo, and clear/restart for the drawing editor.
- **FR-2.6** Snap the reconstruction to the gap boundary points (mandatory connection); optional snap-to-nearby-original-points.
- **FR-2.7** Clear visual distinction between original and reconstructed geometry (color + dash pattern + legend — never color alone).
- **FR-2.8** Fit-bounds to activity / gap; keyboard and textual alternatives for non-map interactions.

### FR-3 — Gap detection

- **FR-3.1** Time-gap detection: elapsed time between consecutive recorded points above a configurable threshold (default 120 s, range 10–3600 s).
- **FR-3.2** Implied-speed anomaly: geodesic distance / Δt above a configurable threshold (default 25 km/h for running, with guard Δt > 10 s to avoid flagging 1 Hz noise).
- **FR-3.3** Segment breaks (`trkseg` boundaries) treated as candidate gaps.
- **FR-3.4** Gap list UI: each gap with timestamps, elapsed time, boundary coordinates, severity; user confirms which gaps to repair (no auto-repair).

### FR-4 — Route reconstruction

- **FR-4.1** Manual drawing is the core reconstruction mechanism (no auto-routing in v1 — see deferred backlog).
- **FR-4.2** Optional resampling/densification of the drawn polyline (default 25 m spacing, configurable 5–100 m or off) so the reconstruction looks like a plausible trackpoint stream.
- **FR-4.3** Live distance feedback while drawing.
- **FR-4.4** Reconstruction stored as user-drawn vertices; derived points always recomputable (geometry revision counter).

### FR-5 — Time and pace

- **FR-5.1** If timestamps bracket the gap: `missingDuration = t_after − t_before`.
- **FR-5.2** Timestamp distribution strategies: distance-proportional (default), uniform, manual-duration fallback.
- **FR-5.3** Files with missing/unreliable timestamps: manual duration entry (per gap) or file-level start-time + total duration; all outputs labeled estimated.
- **FR-5.4** Estimated average pace = reconstructed distance / missing duration — always labeled "estimated"; the system never presents estimated values as measured.
- **FR-5.5** When data cannot support a statistic, the UI shows "—" with an explanation rather than inventing a number.

### FR-6 — Elevation

- **FR-6.1** Opt-in elevation estimation for reconstructed points via a swappable provider abstraction.
- **FR-6.2** Batch requests, client-side throttling, retry with backoff, in-memory caching.
- **FR-6.3** Noise-robust gain/loss computation (hysteresis threshold).
- **FR-6.4** Reconstructed elevation profile chart, visually distinct from original.
- **FR-6.5** Explicit privacy disclosure before the first fetch (what exactly leaves the browser).

### FR-7 — Statistics

- **FR-7.1** Original / reconstructed / total distance.
- **FR-7.2** Original / reconstructed / total elapsed time (with moving-time vs wall-time distinction).
- **FR-7.3** Original pace, reconstructed estimated pace, total average pace (labeled "mixed").
- **FR-7.4** Elevation gain and loss (original vs estimated, per provenance).
- **FR-7.5** Provenance column/badge on every stat cell (Recorded / Estimated / Mixed).

### FR-8 — Session recovery (optional, gated)

- **FR-8.1** If proven valuable: IndexedDB autosave of in-progress repairs (original blob + reconstruction vertices + settings — small payload), restore prompt on reload, explicit clear-data control. Local only; never uploaded.

---

## C. Non-Functional Requirements

### C-1 Privacy (highest priority)
- Core pipeline is 100% client-side: ingest, parse, validate, gap detection, drawing, geodesy, timestamps, statistics, merge, export, download. No backend, no database, no accounts, no server-side processing, no analytics, no cookies.
- Only two categories of network egress exist, both documented in-app (Section M): map tiles (always, when map is used) and elevation lookups (opt-in, reconstructed-point coordinates only).
- The app must remain fully functional offline for the core flow (tiles/elevation degrade gracefully).
- An automated E2E test enforces the network allow-list invariant (no unexpected hosts contacted during upload → parse → draw → export).

### C-2 Performance (budgets, enforced by tests in Phase 9)
- Parse + validate a 50,000-point GPX in < 2 s without blocking the main thread > 200 ms (Web Worker above a size threshold).
- Render a 100,000-point route with 60 fps pan/zoom (WebGL, zoom-dependent decimation).
- Drawing interactions (vertex add/move/delete, rubber-band preview) < 16 ms main-thread work per event.
- Export a 100,000-point activity in < 1 s.
- Memory: 250k-point file loads without tab crash (typed intermediates, no per-point objects in hot render paths beyond necessity).

### C-3 Maintainability
- Strict TypeScript; domain modules are pure functions with no React/DOM imports (enforced by ESLint import boundaries).
- App entry (`app/page.tsx`) composes panels and coordinates top-level state only — the "App.tsx rule" (Section D-6). No business logic in components; components receive data via selectors and dispatch intent via hooks.
- Unit tests mandatory for all domain logic; fixtures corpus in-repo; coverage thresholds on `features/` and `lib/` (target ≥ 90% lines on domain modules).
- One commit per phase; conventional commit messages (`phase(N): …`); no unrelated refactors inside a phase.

### C-4 Reliability
- No destructive operation without undo; original data structurally immutable (deep-frozen at parse boundary in dev builds).
- Error boundaries around map and panels; a failure in tiles/elevation never blocks parse/draw/export.
- Graceful degradation matrix: no network → core works; elevation failure → labeled "unavailable"; huge file → worker + progress UI.

### C-5 Accessibility
- WCAG 2.1 AA for all panels/controls: keyboard operable, visible focus, ARIA live announcements for key events (gap detected, reconstruction completed, export ready).
- Map canvas is inherently non-keyboard-navigable → every map capability has a textual equivalent (gap list with coordinates/time, stats, validation report). The repair flow is completable without the map for keyboard-only users *except* the geometry drawing itself, which requires pointing; a numeric coordinate-entry fallback is explicitly deferred (documented limitation, not silently ignored).
- Color-blind safety: provenance encoded with color + dash pattern + legend + badges, never color alone.

### C-6 Mobile usability
- Responsive from 360 px viewport to desktop; map full-bleed with bottom-sheet panels on small screens.
- Pointer Events unify mouse/touch/pen; explicit Draw/Pan mode toggle plus two-finger pan while in draw mode; hit targets ≥ 44 px.
- Full repair flow completable on a touch device (Phase 8 acceptance includes a real-device pass).

### C-7 Compatibility & environment
- Evergreen Chrome/Firefox/Safari/Edge, including iOS Safari 16+ and Android Chrome.
- Served from the environment's Next.js scaffold; no reliance on Node at runtime (client-only logic); static export (`output: 'export'`) verified in Phase 0 as a deployment bonus so the app can even be hosted as pure static files.

---

## D. Architecture

### D-1 Style
Layered, feature-oriented client architecture. Next.js App Router provides the shell; everything meaningful is a client component; the server serves the bundle. Layering rule: dependencies point downward only.

```
┌────────────────────────────────────────────────────────────────┐
│ Presentation        components/{layout,map,gpx,reconstruction, │
│                     statistics}  — props in, intents out        │
├────────────────────────────────────────────────────────────────┤
│ Application state   state/ (Zustand stores) + hooks/            │
│                     (useGpxSession, useDrawEditor, …)           │
├────────────────────────────────────────────────────────────────┤
│ Domain (pure TS)    features/gpx (parse·validate·gaps·export)   │
│                     features/reconstruction (draw·resample·     │
│                     timestamps·merge)                            │
│                     features/elevation (providers·smoothing)    │
│                     features/statistics                         │
│                     lib/geo (geodesy) — no React, no DOM        │
├────────────────────────────────────────────────────────────────┤
│ Infrastructure      lib/map (MapLibre controller), lib/utils    │
│ adapters            (xml, format), workers/ (parse worker)      │
└────────────────────────────────────────────────────────────────┘
```

### D-2 Data flow (runtime)
`File → TextDecoder → DOMParser → OriginalTrackData (frozen)` → gap detection → `DetectedGap[]` → user draws per gap → `Reconstruction { vertices, settings }` → derived `ReconstructedPoint[]` (resample + timestamp distribution + optional elevation) → `buildMergedView()` (pure) → statistics (pure) → export (pure) → download.

### D-3 Core architectural decisions
1. **Domain purity.** All business logic is pure TypeScript over typed data — trivially unit-testable, framework-independent, no mocking of React/DOM needed in domain tests.
2. **Original-data immutability.** The parsed original track is deep-frozen once; reconstruction edits live in separate structures keyed by gap ID. The merged view is *derived*, never stored as truth.
3. **Provenance in the type system.** Discriminated unions (`source: 'original' | 'reconstructed'`) and `Estimated<T>` wrappers make it impossible to accidentally feed estimated data into functions typed for recorded data (Section G).
4. **Map isolation.** MapLibre is wrapped in a controller class (`lib/map/mapController.ts`) exposing a small imperative API (setRoute, highlightGap, startDrawSession, …). A React binding hook (`useMapController`) subscribes store slices and drives the controller. No component ever touches `maplibre-gl` objects directly; no `maplibre-gl` import leaks outside `lib/map` (ESLint boundary).
5. **Undo/redo as commands.** Drawing operations are command objects (do/undo) on a bounded stack scoped to the active gap editor. Settings changes (strategy, spacing) are *not* commands — they are recomputed-on-read settings, so the history stays clean and small.
6. **The App.tsx rule.** `app/page.tsx` (and `components/layout/AppShell`) only compose panels and wire the top-level session store. Concretely forbidden there: GPX parsing/validation, map implementation, drawing logic, distance/pace/elevation/timestamp math, GPX serialization, service calls, large inline JSX blocks. Same rule for every component file: logic lives in features/hooks/state. Files are split by responsibility, never by arbitrary line count; "God components" fail code review.
7. **Static-exportable by construction.** No server routes, no server actions, no runtime server dependencies — guarded by `output: 'export'` verification in Phase 0 so accidental server coupling fails the build early.

### D-4 State management model (Zustand)
- `sessionStore`: lifecycle (idle/loading/parsed/error), `OriginalTrackData`, `DetectedGap[]`, per-gap `Reconstruction`, derived-view cache keys (recompute on revision counters).
- `editorStore`: active gap, draw-session state (mode, hovered vertex, pending rubber band), command stack.
- `uiStore`: layout (mobile panels), settings (thresholds, export mode, elevation provider choice), dialogs.
- Selectors keep re-renders local (the map layer subscribes only to geometry revisions; stats panels subscribe to stat revisions).

---

## E. Technology Decisions

### E-1 Map library — **MapLibre GL JS v5** ✅
| Criterion | MapLibre GL JS | Leaflet | Mapbox GL JS | OpenLayers |
|---|---|---|---|---|
| Rendering | WebGL, handles 100k-point GeoJSON sources smoothly | DOM/SVG — degrades with very large polylines | WebGL | WebGL/DOM mix |
| License | BSD-2-Clause, open governance | BSD-2-Clause, mature but slow-moving | Proprietary ToS, token required | BSD-2, heavy GIS orientation |
| Account/key | None | None | **Required** | None |
| Vector tiles | Yes | No (raster only) | Yes | Yes |
| Fit for drawing UX | Custom layers + hit-testing, modern input handling | Plugin-based (Leaflet.draw is dated) | Good but vendor-coupled | Powerful but heavyweight |
| Privacy | Any OSM-compatible tiles | Any tiles | Tile requests to Mapbox infra | Any tiles |

**Decision: MapLibre GL JS.** Rejected: Mapbox GL (token/account/vendor lock-in violates privacy-first), Leaflet (raster-only, DOM rendering strain on huge polylines, dated draw plugins), OpenLayers (overkill for one-page tool).

**Tiles:** default **OpenFreeMap** vector tiles (free, no API key, no tracking, no rate limit, CDN-served, several styles) — chosen to avoid `tile.openstreetmap.org` usage-policy pressure from app traffic. Optional fallback setting: OSM raster tiles (with in-app usage-policy note). Tests use MapLibre demo tiles or a blank local style to keep CI network-free.

**Drawing engine: custom, not mapbox-gl-draw.** Our needs are narrow (one editable polyline, anchors, snapping, undo/redo) and must integrate with the command stack and provenance model; `mapbox-gl-draw` is Mapbox-coupled with uncertain MapLibre fork maintenance. A ~small custom interaction layer over GeoJSON sources + point hit-testing is testable and dependency-free. Built on Pointer Events for mouse/touch/pen parity.

### E-2 Geodesy — **internal `lib/geo` module (Vincenty inverse, WGS-84) with haversine fallback** ✅
Requirement: no naive Euclidean lat/lon math. Options:
- **turf.js `distance`** — haversine on a spherical mean-Earth; up to ~0.5% error (≈5 m per km) versus the ellipsoid; also a large dependency for one function.
- **`geodesy` (Chris Veness)** — solid MIT library (Vincenty/Karney); a candidate.
- **Internal Vincenty inverse** — ~0.5 mm accuracy on the WGS-84 ellipsoid; the algorithm is ~60 well-known lines; zero supply-chain surface; degenerate near-antipodal cases (irrelevant at running scale) fall back to haversine.

**Decision: internal module** `lib/geo/geodesy.ts` (inverse Vincenty + haversine fallback + cumulative polyline length + Douglas-Peucker simplification + geodesic interpolation for resampling), golden-tested against published GeographicLib/Karney reference vectors. A single shared module, referenced everywhere — ad-hoc distance code anywhere else fails review.

### E-3 GPX parsing/serialization — **native `DOMParser` + `XMLSerializer` behind a typed facade** ✅
Browser-native, zero dependencies, full control over namespace handling (GPX 1.1 default namespace, quirky no-namespace exports, Garmin extension elements), verbatim passthrough of `<wpt>`/`<rte>`/unknown elements, and precise error collection with line numbers where the parser exposes them. Existing npm GPX libraries are stale and would still need heavy adaptation for provenance and validation needs. Attribute/escaping correctness comes free from the DOM APIs; output well-formedness is guaranteed by construction.

### E-4 State management — **Zustand** ✅
Single-page tool with high-frequency updates (drawing) + large arrays. Zustand gives: selector-level subscriptions (no context-wide re-render storms), plain-object stores testable outside React, tiny bundle, Immer optional. Rejected: Redux Toolkit (boilerplate outweighs scope), React Context (re-render storms on pointer events), Mutation-free derived data (stats recomputed via memoized pure functions keyed by revision counters).

### E-5 Elevation — **provider abstraction; primary Open-Meteo, secondary Terrarium tiles** ✅
Full analysis in Section K. (Provider swapped 2026-09-26: OpenTopoData's public API sends no CORS headers — see §K-1.)

### E-6 Charts — **existing scaffold chart primitives (Recharts via shadcn charts)** ✅
The elevation profile is a single area/line chart; scaffold chart components suffice. If render performance with dense profiles becomes an issue, decimation is applied before feeding the chart (bounded point count).

### E-7 Testing — **Vitest + React Testing Library + Playwright** ✅
- Vitest: fast, ESM-native, matches the Vite-style tooling era; unit tests for all domain modules.
- RTL: component/hook behavior.
- Playwright: E2E in Chromium + WebKit, desktop + mobile viewports, synthetic Pointer Events for drawing, network allow-list tests for the privacy invariant, perf-budget assertions via `performance.mark`.

### E-8 Explicitly rejected
- Any backend/database/accounts/cloud storage (violates local-first; no requirement needs it).
- `localStorage` for GPX data (synchronous, ~5 MB, serialization cost — wrong tool).
- `mapbox-gl-draw` (vendor coupling, fork maintenance risk).
- turf.js as the geodesy engine (spherical accuracy, bundle weight).
- Service workers/PWA offline packaging (deferred; not needed for v1 promise).
- Road-snapping/routing-assisted drawing (requires external router; privacy + scope; deferred backlog).

---

## F. Project Structure

Adapted to the environment scaffold (`src/` root, App Router). New directories beyond the scaffold are marked `(+)`.

```
src/
├── app/                              # Next.js App Router (scaffold)
│   ├── layout.tsx                    #   root layout: fonts, globals
│   ├── page.tsx                      #   COMPOSITION ONLY — panels + top-level wiring
│   └── globals.css                   #   Tailwind 4 entry + design tokens
├── components/
│   ├── layout/                (+)    # AppShell, Header, PanelGrid, MobileSheet
│   ├── map/                   (+)    # MapCanvas, MapToolbar, MapLegend, GapHighlightOverlay
│   ├── gpx/                   (+)    # UploadZone, GpxSummaryCard, SegmentList,
│   │                                  #   ValidationReport, TrackPicker
│   ├── reconstruction/        (+)    # GapList, DrawEditorPanel, UndoRedoBar,
│   │                                  #   TimeStrategyControls, ManualDurationDialog
│   ├── statistics/            (+)    # StatsPanel, ProvenanceBadge, ElevationProfileChart
│   └── ui/                           # shadcn/ui primitives (scaffold)
├── features/
│   ├── gpx/                   (+)
│   │   ├── parse.ts                  #   DOMParser → typed model
│   │   ├── validate.ts               #   structural + semantic checks
│   │   ├── detectGaps.ts             #   gap/anomaly detection
│   │   ├── exportGpx.ts              #   model → GPX 1.1 XML (modes, extensions)
│   │   └── fixtures/                 #   committed test corpus + generators
│   ├── reconstruction/        (+)
│   │   ├── drawModel.ts              #   pure polyline edit ops + commands
│   │   ├── resample.ts               #   densify / simplify / geodesic interpolation
│   │   ├── timestamps.ts             #   distribution strategies
│   │   └── merge.ts                  #   build merged view (pure)
│   ├── elevation/             (+)
│   │   ├── provider.ts               #   ElevationProvider interface + registry
│   │   ├── openmeteo.ts            #   primary provider (batch, throttle, retry)
│   │   ├── terrarium.ts              #   secondary (tile decode) — later phase
│   │   ├── smoothing.ts              #   moving average + hysteresis gain/loss
│   │   └── cache.ts                  #   in-memory LRU keyed by rounded coord
│   └── statistics/            (+)
│       ├── distance.ts  pace.ts  elevation.ts  time.ts
├── hooks/                     (+)    # useGpxSession, useDrawEditor, useMapController,
│                                      #   useMediaQuery, useAnnouncer
├── lib/
│   ├── geo/                   (+)    # geodesy.ts, bbox.ts (pure, golden-tested)
│   ├── map/                   (+)    # mapController.ts, layers.ts, styles.ts
│   │                                  #   (ONLY place importing maplibre-gl)
│   └── utils/                        # cn (scaffold), xml.ts, format.ts, download.ts
├── state/                     (+)    # sessionStore.ts, editorStore.ts, uiStore.ts
├── types/                     (+)    # domain.ts (Section G), ids.ts
└── workers/                   (+)    # parseWorker.ts (Phase 9)
docs/
├── MASTER_PLAN.md                    # this document
e2e/                                  # Playwright specs + fixture GPX files
```

**Boundary rules (enforced by ESLint import restrictions + review):**
- `components/**` may import `state/`, `hooks/`, `types/`, `lib/utils` — never `features/*` internals, never `maplibre-gl`.
- `features/**` and `lib/geo` are pure: no React, no DOM, no fetch (exception: `features/elevation/*` providers may use `fetch`, injected as a dependency for tests).
- `lib/map/**` is the sole importer of `maplibre-gl`.
- `app/page.tsx` imports only `components/layout` + `hooks`.

---

## G. Data Model

Located in `src/types/domain.ts`. Design goals: provenance is structural, originals are immutable, estimates are wrapped, and derived data is never authoritative.

```ts
// ---- Provenance primitives ------------------------------------------------
export type SourceKind = 'original' | 'reconstructed';

/** Any estimated value must carry its method, forcing UI/export to label it. */
export interface Estimated<T> {
  value: T;
  method:
    | 'distance-proportional'  // timestamps spread by cumulative distance
    | 'uniform'                // timestamps spread by index
    | 'manual'                 // user-entered duration/elevation
    | 'elevation-api'          // fetched from DEM provider
    | 'interpolated';          // resampled geometry / profile smoothing
}

// ---- Original (recorded) data — immutable after parse ---------------------
export interface OriginalTrackPoint {
  source: 'original';              // discriminant
  lat: number; lon: number;        // validated ranges at parse time
  ele?: number;                    // meters, exactly as recorded (never altered)
  time?: number;                   // epoch ms, exactly as recorded
  id: PointId;                     // stable: `${segmentId}:${index}`
  flags: PointAnomaly[];           // 'zero-coord' | 'time-reversed' | 'speed-spike' | 'dup'
}

export interface OriginalSegment {
  id: SegmentId;
  trackIndex: number;              // parent <trk> ordinal
  points: readonly OriginalTrackPoint[];
}

export interface OriginalTrackData {
  tracks: TrackMeta[];             // name/desc/type per <trk>, preserved
  segments: readonly OriginalSegment[];
  waypoints: readonly Waypoint[];  // <wpt> passthrough (raw node kept for verbatim export)
  routes: readonly Route[];        // <rte> passthrough
  fileMeta: { creator?: string; version: '1.0' | '1.1'; name?: string; time?: number };
  issues: ValidationIssue[];       // warnings collected at parse/validate
}
// → deep-frozen at parse boundary (dev assertion; production: readonly types)

// ---- Gaps ------------------------------------------------------------------
export type GapKind = 'time-gap' | 'speed-anomaly' | 'segment-break';
export interface DetectedGap {
  id: GapId;
  kind: GapKind;
  before: { segmentId: SegmentId; pointId: PointId };
  after:  { segmentId: SegmentId; pointId: PointId };
  elapsedMs?: number;              // t_after − t_before (undefined if either missing)
  impliedDistanceM?: number;       // geodesic straight-line, diagnostic only
  impliedSpeed?: number;           // m/s, diagnostic only
  severity: 'info' | 'suspect' | 'severe';
  status: 'new' | 'in-progress' | 'reconstructed' | 'skipped';
}

// ---- Reconstruction (user-authored, small) --------------------------------
export interface DrawVertex {
  id: VertexId;
  lat: number; lon: number;
  snappedTo?: PointId;             // if snapped to an original point
}

export type TimeStrategy =
  | { kind: 'distance-proportional' }
  | { kind: 'uniform' }
  | { kind: 'manual-duration'; durationMs: number }
  | { kind: 'none' };

export interface Reconstruction {
  gapId: GapId;
  vertices: DrawVertex[];          // authoritative user geometry
  resampleSpacingM: number | 'off';// densification setting (default 25 m)
  geometryRevision: number;        // bump on vertex change → derived recompute
  timeStrategy: TimeStrategy;      // settings, NOT undoable commands
  elevation?: {
    status: 'not-fetched' | 'fetching' | 'complete' | 'failed';
    provider?: string;
    fetchedAtRevision?: number;    // stale if ≠ geometryRevision
  };
}

// ---- Derived (recomputed, never stored as truth) --------------------------
export interface ReconstructedPoint {
  source: 'reconstructed';
  lat: number; lon: number;
  vertexId?: VertexId;             // original vertex, if spacing = 'off'
  ele?: Estimated<number>;
  time?: Estimated<number>;
  cumDistanceM: number;            // from gap start
}

export interface MergedPointView {
  point: OriginalTrackPoint | ReconstructedPoint;   // union keeps provenance
  order: number;                   // global sequence in merged view
  belongsToGap?: GapId;
}
```

**Enforcement mechanics:**
- Pace/statistics functions accept `points: readonly (OriginalTrackPoint & { time: number })[]` style constraints — TypeScript refuses arrays lacking real (non-estimated) timestamps.
- UI must unwrap `Estimated<T>` to read `.value`, and the shared `<ProvenanceBadge>` + formatter are the only sanctioned ways to render estimates — review-checked.
- `Reconstruction` stores only vertices + settings (a few KB); resampled points, timestamps, elevation, and stats are pure functions of `(OriginalTrackData, Reconstructions)` keyed by `geometryRevision`. This keeps undo/redo cheap and session persistence trivial.

---

## H. GPX Processing Architecture

All stages client-side; stages 1–4 ship in Phases 1–2, stage 5 in Phases 4–6, stages 6–8 in Phase 7.

1. **Ingest** — `File.arrayBuffer()` → decode honoring the XML declaration's charset (fallback UTF-8; BOM tolerated) → size guard (warn > 25 MB, hard-stop > 100 MB with explanation).
2. **Parse** (`features/gpx/parse.ts`) — `DOMParser.parseFromString(text, 'application/xml')`; a `parsererror` document is a hard failure (report with line/column where available). Namespace-tolerant element lookup (default ns, prefixed ns, no ns — real-world exports violate the schema regularly). Numeric fields NaN-guarded; timestamps parsed via strict ISO-8601-with-timezone validation → epoch ms; `<wpt>`, `<rte>`, unknown trees stored as raw nodes for verbatim re-export. Track metadata extracted; multi-track files list all tracks (v1: repair one track at a time via TrackPicker; others exported untouched).
3. **Validate & flag** (`validate.ts`) — structural (required lat/lon attrs, segment non-emptiness) + semantic (lat ∈ [−90, 90], lon ∈ [−180, 180], ele ∈ [−430, 9000] m, time monotonicity — equal allowed, backwards flagged, zero-coordinate runs, per-leg implied speed via geodesy, consecutive duplicates). Output: `ValidationIssue[]` with severity + point references. Nothing is auto-corrected silently — the user decides.
4. **Gap detection** (`detectGaps.ts`) — configurable thresholds (time-gap default 120 s; speed-anomaly default 25 km/h with Δt > 10 s guard; segment breaks always considered). Candidates deduplicated (a time-gap that is also a segment-break = one gap with merged evidence), severity-ranked, surfaced in the Gap List; user confirms what to repair.
5. **Reconstruct** — user-driven (Section I); produces `Reconstruction` per gap.
6. **Merge** (`merge.ts`, pure) — inserts derived `ReconstructedPoint[]` between the gap's `before`/`after` anchors, producing the ordered `MergedPointView`; also the basis for both export modes.
7. **Export** (`exportGpx.ts`) — `XMLSerializer` over a DOM built with `createElementNS`:
   - GPX 1.1, `creator="GPX Repair Studio"`, `<metadata>` preserving original name/desc + repair summary.
   - **Mode A (default): structure-preserving.** Original segments emitted with original attribute values verbatim; reconstructed points written as their own `<trkseg>` inserted at the gap's position within the same `<trk>`. Unknown consumers (Strava, Garmin Connect) render a continuous activity; our own re-import recognizes provenance exactly.
   - **Mode B: merged.** One continuous `<trkseg>` with reconstructed points interleaved at gap positions.
   - **Provenance extensions:** `xmlns:gpxr="https://gpx-repair.studio/schema/1"`; per reconstructed point `<extensions><gpxr:reconstructed timeMethod="distance-proportional" eleMethod="elevation-api"/></extensions>`; track-level `<gpxr:summary reconstructedDistanceM=… gapCount=…/>`. Standard tools ignore unknown extensions; our parser round-trips them (re-uploading a repaired file preserves the distinction).
   - Optional pretty-printing; declaration `<?xml version="1.0" encoding="UTF-8"?>`; LF line endings.
8. **Download** — `Blob` (type `application/gpx+xml`) + object URL + anchor click; filename `<original>.repaired.gpx`; URL revoked after.

**Non-negotiable invariant (tested):** every original point's lat/lon/ele/time values in the exported file are byte-identical to the parsed input. Repair only ever *inserts*.

---

## I. Route Reconstruction Algorithm

### I-1 Interaction model (per gap)
1. User activates a gap (from Gap List or map) → editor opens, map fits the gap bounds with padding; boundary markers rendered (start anchor = last recorded point before gap; end anchor = first recorded point after gap).
2. **Anchor connection is enforced:** the reconstruction is defined as `startAnchor → vertices… → endAnchor`; the drawn polyline therefore always connects to the recorded track. The first/last clicks snap to the anchors (large hit radius); intermediate clicks are free.
3. **Vertex drawing (v1 core, works with mouse and touch):** each click/tap appends a vertex; a live rubber-band segment follows the pointer; "Finish" (button / double-click / Enter) closes the session. Vertex count guard (soft warning > 500, hard cap 2000).
4. **Vertex editing:** drag handles to move; click a segment to insert a midpoint; select + Backspace/contextual action to delete; all operations dispatch **commands** (`AppendVertex`, `MoveVertex`, `InsertVertex`, `DeleteVertex`, `SimplifyPath`, `ClearAll`) onto the undo stack. `ClearAll` requires confirmation but is itself undoable.
5. **Optional snapping:** within a configurable pixel radius, snap to nearby *original* track points (helps out-and-back courses where the user retraces recorded roads). Purely magnetic; never mandatory.

### I-2 Geometry pipeline (pure, deterministic)
```
DrawVertex[] (user-authored)
  → geodesic interpolation / densification to resampleSpacingM (default 25 m, or 'off')
  → ReconstructedPoint[] with cumulative distances
  → distanceM = Σ geodesic legs (incl. anchor connectors)
```
- **Why resample:** a hand-drawn 3-vertex line across 2 km must become a plausible stream of trackpoints for export realism, timestamp distribution, and sensible elevation batching. Douglas-Peucker simplification (zoom-adaptive tolerance) is available for over-drawn paths.
- **Distance:** cumulative Vincenty length. Straight-line connector distance between anchors is shown as a diagnostic ("gap as-the-crow-flies: 1.8 km") so the user sees what the drawn length is measured against.

### I-3 Live feedback & visualization
- Live distance badge while drawing; per-gap reconstruction card (distance, point count, duration/pace when available).
- Rendering: original = solid line (blue); reconstructed = dashed amber line + vertex handles; gap span highlighted pre-repair (red dashed). Encodings are doubled (dash + legend + badges) for color-blind users.

### I-4 Constraints & edge cases
- Zero intermediate vertices allowed (straight gap closure) but produces a "straight-line reconstruction" warning — legal, just honest.
- Self-crossing paths allowed (runners legitimately retrace).
- Reconstructing the *same* gap replaces its previous reconstruction (with confirmation).
- All edits bump `geometryRevision`; derived data recomputes lazily; stale elevation is flagged (`fetchedAtRevision ≠ geometryRevision`).

---

## J. Timestamp Strategy

Internally all times are epoch ms (UTC). GPX timestamps are ISO-8601 with timezone; naive/unparseable timestamps are flagged "unreliable" at parse time. Display uses the browser's local timezone; all duration math is timezone-agnostic.

### J-1 Case matrix
| Case | Boundary times | Strategy | Behavior |
|---|---|---|---|
| 1 (normal) | both present & reliable | `distance-proportional` (default) | `t_i = t_before + (t_after − t_before) × cumDist_i / totalDist` — assumes constant pace across the drawn route; most realistic for running |
| 1b | both present | `uniform` | `t_i = t_before + Δt × i/n` — effectively identical when points are evenly resampled; kept for `spacing: off` |
| 2 | one present | `manual-duration` (required input) | interior times spread from the known anchor by user-entered duration |
| 3 | none / unreliable | file-level "no timing data" mode | user enters activity start time and/or total duration; per-point times spread distance-proportionally; if no start time, points are exported *without* `<time>` (valid GPX) |
| 4 | both present but user disputes them | `manual-duration` override | boundary timestamps remain untouched; interior times span `[t_before, t_before + manual]`; the mismatch to `t_after` is surfaced in stats as a flagged discrepancy |

### J-2 Rules
- Manual duration is **only** applied to the gap's interior distribution — original boundary timestamps are never rewritten in v1 (shifting subsequent original points is an explicit non-goal).
- Every distributed timestamp is wrapped as `Estimated<number>` and rendered/exported with its method; UI copy states "estimated — assumes even effort across the drawn route."
- Pace: `pace_est = missingDuration / reconstructedDistance` → min/km (+ min/mi toggle), always badged "estimated". If duration is unknown, pace shows "—" plus a prompt to supply duration. The system never presents estimated pace as measured pace.

---

## K. Elevation Strategy

### K-1 Options evaluated
| Option | Accuracy (typ.) | Coverage | Cost / key | Rate limits | What leaves the browser | Verdict |
|---|---|---|---|---|---|---|
| **Open-Meteo Elevation API** (Copernicus DEM GLO-90) | ~±10 m, 90 m grid | global land | free, no key (non-commercial, attribution) | 600 req/min, 10,000 req/day per IP, ≤100 pts/req; **CORS `*` (verified)** | lat/lon of reconstructed points in GET query (server-logged) | **Primary** |
| OpenTopoData public API (SRTM/ASTER 30 m) | ±5–10 m, 30 m grid | global land | free, no key | 1 req/s, 1000 req/day | lat/lon in GET query | **Dropped 2026-09-26**: its responses carry NO `Access-Control-Allow-Origin` header (verified on 200s with an Origin header present), so browser fetches are always CORS-blocked — the feature cannot work client-side. Revisit only behind a server-side relay. |
| **AWS Terrarium tiles** (open dataset, client-decoded) | ~10–100 m by zoom (max z15) | global incl. bathymetry | free, no key | effectively none (S3/CDN) | only tile x/y/z fetches — like map tiles; no precise coordinates | **Secondary** (added later if wanted) |
| Open-Elevation public API | SRTM 30 m | global | free | undocumented; instance often flaky | lat/lon batch POST | Backup only |
| Google / Mapbox elevation APIs | high | global | **API key + billing** | generous | lat/lon | Rejected (account/key/privacy) |
| Bundled local DEM | varies | global = GB-scale | — | none | nothing | Rejected (bundle size) |

### K-2 Recommendation
- **`ElevationProvider` interface** (`getElevations(coords): Promise<(number | undefined)[]>` + name/attribution/privacyNote) with a small registry; providers swappable at runtime from Settings.
- **Primary: Open-Meteo Elevation** (`api.open-meteo.com/v1/elevation`, Copernicus DEM GLO-90) — no key, genuinely CORS-open, generous per-IP limits, each user burns their own budget. Client-side: batch ≤ 100 points/request, ≥250 ms between requests, exponential backoff on 429/5xx/network errors, partial failure tolerated (missing points → undefined, flagged) with terminal batch failures reporting a reason (`network`/`throttled`/`server`/`bad-response`) for honest error copy.
- **Data minimization:** only *reconstructed, resampled* points are ever sent — never the full GPX, never original points. Per-gap cap (default 400; above it, sample every k-th point and geodesically interpolate the rest — disclosed in UI).
- **Caching:** in-memory LRU keyed by coordinate rounded to 5 decimals (~1.1 m) — re-edits and retries are free. Optional Cache Storage/IndexedDB persistence deferred (Phase 10 decision).
- **Terrarium as privacy-max fallback (later):** fetch z12–z14 PNG tiles covering the route, decode `(R·256 + G + B/256) − 32768`, bilinear-sample at points; zero precise-coordinate payload, tiles browser-cacheable. A Phase 6 spike verifies CORS headers before committing.
- **Smoothing & gain/loss:** raw 30 m DEM along a resampled line is already fairly smooth; a light moving average (window ≈ 5 points) is applied for *profile display only*. Gain/loss uses **hysteresis**: accumulate elevation change only after net excursion exceeds a threshold (default 2.0 m, configurable) — the standard noise-robust method. Both original and reconstructed elevation use the same gain/loss routine but are reported separately.
- **Provenance:** reconstructed elevation is `Estimated<number>` (`method: 'elevation-api'`); profile chart draws original as solid, reconstructed as dashed/amber with "estimated" legend; original `<ele>` values are never modified. Attribution (Open-Meteo / Copernicus DEM) shown in UI and embedded in export metadata comment.

---

## L. Statistics Strategy

All statistics are pure functions of `(OriginalTrackData, Reconstructions[], settings)` — no cached truth; recomputed on revision change.

### L-1 Definitions
- **Distances:** `originalDistance` = Σ geodesic legs over original points (recorded as-is, GPS noise included; noise filtering is a non-goal). `reconstructedDistance` = per-gap and total. `totalDistance = original + reconstructed`.
- **Time buckets:**
  - `recordedMovingTime` = Σ legs' Δt where Δt ≤ gap threshold (excludes gaps and pauses).
  - `wallTime` = t_last − t_first (the real elapsed activity time, gaps included).
  - `reconstructedTime` = Σ durations of reconstructed gaps (derived or manual).
  - `totalTime` presented as wall time, with a breakdown (recorded spans + gap spans), marking which gaps are reconstructed.
  - No timestamps anywhere → time/pace cells show "—" with explanation (unless manual duration supplied).
- **Pace:**
  - `pace_original = originalDistance / recordedMovingTime` — labeled "recorded (excl. gaps)".
  - `pace_reconstructed = reconstructedDistance / gapDuration` — labeled **"estimated"**.
  - `pace_total = totalDistance / (recordedMovingTime + reconstructedTime)` — labeled "mixed / partially estimated".
  - Formula tooltips show the exact computation for each cell.
- **Elevation:** gain/loss via hysteresis (Section K-2) computed separately over original `ele` (as recorded) and reconstructed `ele` (estimated), plus a combined figure labeled "mixed". If < 60% of points carry elevation → "insufficient elevation data" instead of misleading totals.
- **Formatting:** distances to 0.01 km (or m < 1 km), pace as m:ss /km, durations as h:mm:ss — centralized in `lib/utils/format.ts`.

### L-2 Honesty rules
- Any statistic that depends on estimated inputs is badged (Recorded / Estimated / Mixed) — the provenance column is mandatory in the stats table.
- Unsupported statistics render "—" with a one-line reason; the app never fabricates or silently substitutes values.

---

## M. Privacy Strategy

### M-1 Never leaves the browser (core pipeline)
The GPX file bytes, parsing, validation, gap detection, drawing edits, geodesy, timestamp distribution, statistics, merging, GPX generation, and download all execute in the browser. **No backend, no database, no accounts, no analytics, no cookies, no server-side processing.** The Next.js server exists only to serve the application bundle (and is verified static-exportable in Phase 0). Closing the tab destroys all in-memory data (unless the opt-in Phase 10 session recovery is enabled).

### M-2 Leaves the browser — complete list
| # | Trigger | Destination | Payload | Granularity / notes |
|---|---|---|---|---|
| 1 | Map visible | Tile CDN (default: OpenFreeMap; optional: OSM raster) | tile x/y/z requests (+ standard HTTP metadata: IP, User-Agent) | coarse — tile-level only (~ kilometers at low zoom); no GPX data, no precise positions |
| 2 | Elevation fetch (opt-in per gap, explicit disclosure shown first) | Open-Meteo (default) | lat/lon of reconstructed resampled points only (≤ cap), in GET query | precise but **minimal**: reconstructed points only — never the full GPX, never original track points; count shown before fetch |

That is the entire egress surface. An **automated E2E privacy test** runs the full core flow (upload → parse → draw → export) with a network allow-list and fails if any other host is contacted.

### M-3 User-facing disclosure
An in-app "Privacy & Data" panel states the above in plain language, including: what works offline (everything except tiles/elevation), how to switch tile/elevation providers, and (if Phase 10 ships) exactly what IndexedDB stores and how to clear it.

---

## N. Testing Strategy

### N-1 Unit tests (Vitest) — domain modules, the bulk of the suite
- **Geodesy:** golden vectors from published GeographicLib/Karney reference sets; symmetry; zero/identical points; sub-meter legs (running scale); fallback path.
- **Parser fixture corpus** (committed under `features/gpx/fixtures/`): valid 1.1; GPX 1.0; no-namespace export; multi-track; multi-segment; `<wpt>`/`<rte>` passthrough; malformed XML; truncated file; empty `<trkseg>`; single-point segment; NaN/out-of-range coords; zero-coordinate runs; naive (timezone-less) timestamps; backwards time; duplicate points; huge synthetic file (100k points, generator with fixed seed); Unicode names; BOM; CDATA; Garmin extension elements.
- **Gap detection:** threshold boundaries (exact-at-limit), speed anomalies, segment breaks, dedupe of overlapping candidates, severity ranking.
- **Resample:** spacing math, geodesic interpolation correctness, Douglas-Peucker tolerances, `off` mode.
- **Timestamps:** all four case-matrix rows; zero-duration gap; single-point gap; manual duration; unreliable-time flags.
- **Elevation:** provider against mocked `fetch` (success, 429 + backoff, partial failure, network error); hysteresis gain/loss on synthetic noisy ramps; smoothing window.
- **Statistics:** hand-computed scenarios incl. mixed provenance, missing timestamps, missing elevation, multi-gap.
- **Export:** round-trip property suite (export → re-parse → geometry/times/provenance identical); both export modes; XML well-formedness; **original-data-untouched invariant** (original point values byte-identical pre/post repair); extension markers present and re-importable.

### N-2 Component/integration tests (React Testing Library)
Upload flow (mocked `File`), validation report rendering, gap list selection behavior, draw-editor state machine (commands, undo/redo, stack bounds), time-strategy controls updating stats + labels, stats provenance badges, empty/error states, mobile bottom-sheet behavior (viewport mocks).

### N-3 E2E tests (Playwright — Chromium + WebKit; desktop + mobile viewports)
- **Happy path:** upload fixture → gap detected → synthetic pointer-event drawing on the map → stats update with estimated labels → export → intercept download → re-parse the downloaded file and assert provenance survived.
- **Privacy invariant:** run core flow with a strict network allow-list (tiles + elevation host only); any other request fails the test.
- **Offline core:** abort all network — upload/parse/draw/export still work (map degrades visibly and gracefully).
- **Perf budgets** (Phase 9): `performance.mark`-based assertions on parse/export/route-render timings with the 100k-point fixture.
- **Mobile touch:** drawing via touch pointer events on a 360 px viewport.
- Map assertions operate on controller-exposed state (GeoJSON source data via the controller API), not pixel comparisons — deterministic and CI-friendly.

### N-4 Manual QA matrix (per phase, executed before phase DoD)
Real-device pass (iOS Safari, Android Chrome), real-world GPX zoo (Garmin/Wahoo/Suunto/Coros/Strava/Apple Watch exports), color-blind simulation of provenance styles, keyboard-only walkthrough, screen-reader spot checks on announcements.

---

## O. Technical Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Touch drawing conflicts with map pan/zoom** (accidental draws while panning, vice versa) | High — core UX | Explicit Draw/Pan toggle; in draw mode: one-finger = draw, two-finger = pan/zoom; pointer-event capture; early real-device testing is a Phase 4/8 acceptance item |
| 2 | **Large-file performance** (parse/render 100k+ points) | Medium | Web Worker parse above size threshold (Phase 9); zoom-dependent render decimation; WebGL line layers; perf budget tests gate the phase |
| 3 | **Tile provider dependency** (availability, usage policy) | Medium | Provider abstraction + quick-switch setting; OpenFreeMap default (no key/limits); OSM raster fallback with policy note; CI uses blank local style (no network) |
| 4 | **Elevation API reliability/rate limits** | Medium | Throttle + backoff + partial results; Terrarium fallback path (no-coordinate-payload); failure UI never blocks core flow; elevation is opt-in from day one |
| 5 | **GPX dialect zoo** (namespaces, 1.0 quirks, vendor extensions, non-conforming exports) | Medium-high | Tolerant namespace-agnostic parser; verbatim passthrough of unknown nodes; growing fixture corpus; multi-vendor manual QA matrix |
| 6 | **Provenance leakage** (estimates accidentally treated as recorded) | High — product promise | Type-level separation + `Estimated<T>` wrappers; frozen originals; UI badge components as the only sanctioned render path; export invariant tests; review checklist |
| 7 | **Undo/redo complexity** (commands interleaved with strategy changes) | Medium | Command stack scoped strictly to geometry ops; settings are non-undoable by design (documented); dedicated command-stack test suite |
| 8 | **Geodesy correctness** | High (silent wrong numbers) | Single shared module; golden tests vs reference vectors; no ad-hoc distance code anywhere (lint/review rule) |
| 9 | **Timestamp edge cases** (DST, naive strings, equal/backwards stamps) | Medium | Epoch-ms internally; strict ISO-8601-with-tz parsing; unreliable-time flags; fixture coverage |
| 10 | **Scope creep toward backend** (routing-assist, accounts, history) | Product-level | Plan explicitly fences v1; any backend need = new requirement + plan revision (Section M) |
| 11 | **Scaffold residue** (Prisma/DB, demo API routes shipped by the environment scaffold) | Low | Removed at Phase 0 generation time (scaffold tailoring, explained in advance); static-export verification acts as a regression guard |
| 12 | **Accessibility of canvas-based map** | Medium | Textual equivalents for all map info; ARIA announcements; deferred numeric vertex-entry fallback documented as a known limitation |
| 13 | **Browser XML API differences** (parsererror reporting varies) | Low | Centralized parse facade; fixture-driven tests across target browsers via Playwright WebKit/Chromium |

---

## P. Development Phases

Conventions for every phase: each ends in a working, committed state (`phase(N): …`); `lint + typecheck + unit` green before commit; E2E additions included where noted; no unrelated refactors; future-phase features are explicitly non-goals.

---

### Phase 0 — Foundation & Tooling Baseline

- **Objective:** a clean, guarded scaffold with CI-quality tooling and zero product features.
- **Scope:** generate the environment scaffold (Next.js 16 + TS strict + Tailwind 4 + shadcn/ui); **tailor at generation time** (advance notice per Git-safety rule): remove/disable Prisma layer, demo API routes, and DB wiring — this app is deliberately serverless; add Vitest, Playwright, ESLint import-boundary rules (Section F); path aliases; `docs/MASTER_PLAN.md` committed; verify `output: 'export'` build works (or document blocker + fall back to standard build while keeping the no-server-routes invariant).
- **Tasks:** scaffold; prune; install `vitest`, `@playwright/test`; configure boundaries; sample unit test + sample E2E (opens page, asserts shell renders); commit.
- **Files/components:** scaffold tree + `vitest.config.ts`, `playwright.config.ts`, `.eslintrc` boundary rules, `e2e/smoke.spec.ts`, `docs/MASTER_PLAN.md`.
- **Dependencies:** none (first phase).
- **Tests:** smoke unit + smoke E2E pass in CI-equivalent local run.
- **Acceptance criteria:** `build`, `lint`, `test` all green; app shell renders; no `maplibre-gl`/`zustand` installed yet (added when first needed); static export verified or blocker documented.
- **Definition of done:** committed as `phase(0): foundation and tooling baseline`; plan doc in repo.
- **Non-goals:** any GPX/map/UI feature; CI service setup (local runs suffice); theming work beyond scaffold defaults.

---

### Phase 1 — GPX Domain Core (no UI)

- **Objective:** parse, validate, gap-detect, and re-emit GPX as pure, fully-tested TypeScript.
- **Scope:** `types/domain.ts`; `lib/geo/geodesy.ts` (+ bbox); `features/gpx/{parse,validate,detectGaps,exportGpx}.ts` — export limited to **identity round-trip** (re-emit originals verbatim; provenance-extension schema defined but unused); fixture corpus + generators.
- **Tasks:** implement geodesy + golden tests; parser + fixtures; validator; gap detector; identity exporter; round-trip test harness.
- **Files/components:** as listed under Scope (all under `src/types`, `src/lib/geo`, `src/features/gpx`).
- **Dependencies:** Phase 0.
- **Tests:** full unit suite per Section N-1 (geodesy goldens, parser corpus, gap detection, identity round-trip + original-untouched invariant).
- **Acceptance criteria:** every fixture produces the expected typed model or typed error; identity export re-parses to an identical model; ≥ 90% line coverage on these modules.
- **Definition of done:** committed as `phase(1): gpx domain core`; module docs (header comments) in place.
- **Non-goals:** any React/UI, map, drawing, timestamps distribution, elevation, merge logic, provenance-aware export.

---

### Phase 2 — Upload & Inspection UI

- **Objective:** a user can upload a GPX and see validation report, segments, detected gaps, and original-only statistics.
- **Scope:** `UploadZone` (drag/drop/picker), `useGpxSession` orchestration, `state/sessionStore` (Zustand installed here), app shell layout with panels (map area is a placeholder), `ValidationReport`, `SegmentList`, `GapList` (textual, with times/elapsed/coords), `GpxSummaryCard`, original-only `StatsPanel` (distance via geodesy, recorded time buckets), gap-threshold settings, error/empty states.
- **Tasks:** add `zustand`; build store + hook; build components; wire page composition (respecting the App.tsx rule); threshold settings persistence (in-memory + `localStorage` for *settings only* — small and non-sensitive).
- **Files/components:** `components/gpx/*`, `components/layout/*`, `hooks/useGpxSession.ts`, `state/sessionStore.ts`, `features/statistics/{distance,time}.ts`.
- **Dependencies:** Phase 1 (domain core).
- **Tests:** RTL (upload/report/gap list/empty/error); unit (stats); E2E: upload fixture → gaps listed; invalid file → actionable error; 100k-point fixture loads without freeze (loose timing).
- **Acceptance criteria:** valid file shows summary + gaps; invalid file shows precise errors; no-timestamp file shows "no timing data" mode; settings changes re-run detection.
- **Definition of done:** committed as `phase(2): upload and inspection UI`.
- **Non-goals:** map rendering, any editing, elevation, export UI.

---

### Phase 3 — Map Display

- **Objective:** the recorded route and its gaps are visualized on an interactive MapLibre map.
- **Scope:** `lib/map/mapController.ts` (+ layers/styles), `useMapController` binding, `MapCanvas` component, per-segment route styling, gap highlight + boundary markers, fit-bounds (activity + per-gap), tile provider config (OpenFreeMap default, OSM raster option, blank test style), attribution, legend, responsive layout, graceful offline degradation.
- **Tasks:** add `maplibre-gl`; controller wrapper; React binding; GapList ↔ map selection sync; offline overlay state.
- **Files/components:** `lib/map/*`, `components/map/*`, `hooks/useMapController.ts`.
- **Dependencies:** Phase 2 (session state with parsed data).
- **Tests:** E2E asserts route/gap layers via controller state (no pixel diff); mobile viewport layout; offline test (tiles blocked → overlay + app functional).
- **Acceptance criteria:** route visible with distinct gap styling and markers; selecting a gap focuses map; pan/zoom smooth on 50k-point fixture; attribution visible.
- **Definition of done:** committed as `phase(3): map display`.
- **Non-goals:** drawing, reconstruction rendering, elevation profile.

---

### Phase 4 — Reconstruction Editor: Drawing

- **Objective:** the user can draw and edit the missing route for a selected gap with full undo/redo — the heart of the product.
- **Scope:** `features/reconstruction/drawModel.ts` (pure ops + command stack), `resample.ts`; `state/editorStore.ts`; `useDrawEditor`; map draw-interaction layer (vertex mode, anchor snapping, optional snap-to-original-points, rubber band, handles for move/insert/delete); live distance badge; distinct reconstruction rendering; `DrawEditorPanel` + `UndoRedoBar`; gap status transitions; straight-line warning.
- **Tasks:** pure draw model + tests first; controller draw session; editor UI; live stats via `features/statistics/distance.ts`.
- **Files/components:** `features/reconstruction/{drawModel,resample}.ts`, `state/editorStore.ts`, `hooks/useDrawEditor.ts`, `components/reconstruction/*`, map layer additions in `lib/map/`.
- **Dependencies:** Phase 3.
- **Tests:** unit (command stack invariants, resample math); RTL (editor state machine); E2E synthetic-pointer drawing (desktop + mobile viewport) → dashed route connects anchors exactly; undo/redo/clear work; immutability test (original store unchanged).
- **Acceptance criteria:** draw → edit → undo → redo → clear all functional; distance updates live; reconstruction visibly distinct; anchors always connected; vertex hard-cap enforced.
- **Definition of done:** committed as `phase(4): reconstruction drawing editor`.
- **Non-goals:** timestamps/pace for reconstructions, elevation, export, freehand mode, gesture hardening (Phase 8).

---

### Phase 5 — Time & Pace Reconstruction

- **Objective:** estimated timestamps and pace for reconstructions; fallbacks for missing/unreliable time data.
- **Scope:** `features/reconstruction/timestamps.ts` (case matrix); `TimeStrategyControls`, `ManualDurationDialog`, file-level "no timing data" mode (start time + total duration entry); stats integration — full provenance-badged stats table (original / reconstructed-estimated / total-mixed); pace formatting; discrepancy flag (Case 4).
- **Tasks:** strategy functions + tests; UI controls; stats wiring; honesty-rule rendering ("—" + reason).
- **Files/components:** `features/reconstruction/timestamps.ts`, `features/statistics/pace.ts`, `components/reconstruction/TimeStrategyControls.tsx`, `components/statistics/*` extensions.
- **Dependencies:** Phase 4.
- **Tests:** unit (all case-matrix rows, edge durations); RTL (strategy switch updates stats + labels; no-time file prompts for duration); E2E: gap with timestamps → estimated pace shown and badged; file without timestamps → manual flow works.
- **Acceptance criteria:** every estimated value visibly labeled with method; unsupported stats show "—" + reason; manual duration only affects gap interior.
- **Definition of done:** committed as `phase(5): time and pace reconstruction`.
- **Non-goals:** elevation, export, shifting original timestamps.

---

### Phase 6 — Elevation

- **Objective:** opt-in elevation estimation for reconstructed points, with gain/loss and a provenance-clear profile chart.
- **Scope:** `features/elevation/{provider,openmeteo,cache,smoothing}.ts`; pre-fetch privacy disclosure (exact point count + destination); batch/throttle/retry; in-memory LRU; `ElevationProfileChart` (original solid vs reconstructed dashed, original elevation untouched); hysteresis-based gain/loss in stats; failure/retry/stale-revision states; attribution strings.
- **Tasks:** provider interface + Open-Meteo implementation (fetch injected for tests); cache; smoothing + hysteresis + tests; chart component; disclosure + status UI; stats wiring.
- **Files/components:** `features/elevation/*`, `components/statistics/ElevationProfileChart.tsx`, stats extensions, settings for provider.
- **Dependencies:** Phase 4 (reconstructed geometry); Phase 5 not strictly required but expected order.
- **Tests:** unit (mocked fetch: success/429-backoff/partial/offline; hysteresis math; LRU behavior); E2E (mocked elevation API → profile renders with estimated styling; privacy allow-list test extended to include the elevation host; failed fetch → clear message, export still possible).
- **Acceptance criteria:** fetch → reconstructed points carry `Estimated` elevation, gain/loss stats appear badged "estimated"; only reconstructed-point coordinates requested (asserted by test); stale elevation flagged after geometry edits; offline behavior graceful.
- **Definition of done:** committed as `phase(6): elevation estimation`.
- **Non-goals:** Terrarium provider, persistent elevation cache, elevation editing, elevation for original points.

---

### Phase 7 — Merge & Export

- **Objective:** produce and download the repaired GPX with full provenance and zero mutation of original data.
- **Scope:** `features/reconstruction/merge.ts`; full `features/gpx/exportGpx.ts` (Mode A structure-preserving default, Mode B merged; `gpxr` provenance extensions; metadata repair note); export settings (mode, resample spacing, pretty-print); pre-export summary dialog (what will change, final stats); download util; re-import recognition of `gpxr` markers.
- **Tasks:** merge + tests; exporter + round-trip suite; export dialog; download; re-import path in parser.
- **Files/components:** `features/reconstruction/merge.ts`, `features/gpx/exportGpx.ts` (extended), `lib/utils/download.ts`, `components/gpx/ExportDialog.tsx`.
- **Dependencies:** Phases 4–6.
- **Tests:** unit round-trip property suite (both modes; provenance survives; **original-values-untouched invariant**); E2E full happy path (upload → draw → time → elevation(mocked) → export → download intercepted → re-parse → assertions); manual check: exported file loads in Strava/Garmin Connect.
- **Acceptance criteria:** exported file is valid GPX 1.1 (re-parse + external validator); original points byte-identical in values; reconstructed points carry extensions; re-upload of a repaired file preserves the original/reconstructed distinction.
- **Definition of done:** committed as `phase(7): merge and export`.
- **Non-goals:** batch/multi-file export, exporting waypoints/routes modifications, TCX/FIT formats.

---

### Phase 8 — Mobile & Accessibility Hardening

- **Objective:** production-quality touch UX and WCAG 2.1 AA compliance.
- **Scope:** touch gesture refinement (draw/pan toggle, two-finger pan in draw mode, ≥44 px hit targets, long-press contextual actions); responsive bottom-sheet panel system; focus management; ARIA live announcements (gap detected, reconstruction finished, export ready); keyboard operability for all non-canvas controls; color-blind-safe palette verification (dash + badge + legend redundancy); reduced-motion support.
- **Tasks:** gesture layer hardening; sheet layout; announcement hook; a11y audit pass + fixes.
- **Files/components:** `components/layout/MobileSheet*`, gesture handling in `lib/map/`, `hooks/useAnnouncer.ts`, style tokens.
- **Dependencies:** Phase 7 (feature-complete surface to harden).
- **Tests:** Playwright mobile suites (touch draw on 360 px viewport); axe-core scans on all primary states (empty, loaded, editing, exporting) with zero critical violations; keyboard-only E2E for panel flows.
- **Acceptance criteria:** full repair flow completable on a real touch device; axe criticals = 0; all interactive controls reachable/operable by keyboard; provenance distinguishable in color-blind simulation.
- **Definition of done:** committed as `phase(8): mobile and accessibility hardening`.
- **Non-goals:** numeric coordinate-entry fallback (deferred backlog), i18n, PWA.

---

### Phase 9 — Performance & Large Files

- **Objective:** meet the C-2 performance budgets on large/edge-case files.
- **Scope:** parse Web Worker (threshold-triggered, progress UI); zoom-dependent render decimation; memory profiling on 250k-point synthetic files; loading/progress states; perf-budget E2E suite.
- **Tasks:** worker extraction of parse+validate (domain purity from Phase 1 makes this a low-risk move); decimation layer; budget tests; profiling fixes.
- **Files/components:** `workers/parseWorker.ts`, `lib/map/decimate.ts`, progress UI in `components/layout/`.
- **Dependencies:** Phase 7.
- **Tests:** perf-budget E2E (100k-point fixture: parse < 2 s, no > 200 ms main-thread block, export < 1 s); 250k stress smoke (loads, no crash).
- **Acceptance criteria:** budgets pass in test runs; no functional regressions (full suite green).
- **Definition of done:** committed as `phase(9): performance and large files`.
- **Non-goals:** virtualized lists, IndexedDB caching, WASM experiments.

---

### Phase 10 — Session Recovery (gated: build only if justified) — DONE (Task 53, section BB)

- **Objective:** crash/reload recovery for in-progress repairs, without violating local-first.
- **Scope (decision gate first):** confirm real user benefit (drawing a long route is minutes of work — likely yes, keep it small); IndexedDB autosave of `{ original file blob, reconstructions (vertices + settings), settings }`; restore prompt on load; "start over" + "clear stored data" controls; privacy panel documentation.
- **Tasks:** storage module + serialization round-trip tests; autosave scheduler (debounced on geometryRevision); restore/discard UX.
- **Files/components:** `lib/storage/sessionStore.ts` (IndexedDB wrapper), restore prompt component, privacy panel copy.
- **Dependencies:** Phase 7.
- **Tests:** unit (round-trip, schema versioning/migration, quota errors); E2E (reload mid-repair → restore prompt → state intact; discard works; clear-data empties storage).
- **Acceptance criteria:** reload recovers everything; explicit discard and clear work; storage payload is only the small session record (never uploaded); app functions identically with storage disabled/blocked.
- **Definition of done:** committed as `phase(10): session recovery`.
- **Non-goals:** cross-device sync, accounts, cloud backup, multi-session history.

---

### Phase 11 — Polish, Docs & Release Prep — DONE (Task 54, section CC)

- **Objective:** release-ready v1.
- **Scope:** empty/error/edge-state polish; help/onboarding tour (first-run: 4-step overlay); "Privacy & Data" page (exact egress table, offline behavior, provider switching, storage disclosure); About/attribution (Open-Meteo/Copernicus, OpenFreeMap/OSM, MapLibre); README (dev setup, architecture summary, test guide); final full-suite regression + manual QA matrix sign-off.
- **Tasks:** polish pass; docs pages; regression run; manual matrix.
- **Files/components:** help components, privacy/about pages, README, final test updates.
- **Dependencies:** all prior phases.
- **Tests:** full regression (unit + RTL + E2E all green); manual QA matrix signed off in the phase notes.
- **Acceptance criteria:** every prior phase's acceptance criteria still hold; docs complete; no known P1/P2 defects.
- **Definition of done:** committed as `phase(11): polish, docs, release prep`; v1 tagged.
- **Non-goals:** new features of any kind.

---

### Deferred backlog (explicit v1 non-goals — each requires a new requirement + plan revision)

- **Road-following / routing-assisted drawing** via an external routing engine (OSRM/Valhalla/GraphHopper) — powerful UX but sends waypoints to a third party; would need explicit opt-in, provider choice, and a privacy disclosure redesign.
- Freehand drawing mode (press-drag with on-the-fly simplification).
- Terrarium tile-based elevation provider (privacy-max fallback — schema already reserved).
- Numeric coordinate/vertex entry fallback for full keyboard-only geometry editing.
- GPS noise filtering / smoothing of *original* tracks; pause detection refinement.
- Multi-activity batch repair; TCX/FIT import/export; PWA offline packaging; i18n.

---

## Closing Note

Per instruction, implementation has **not** begun. No Phase 1 work has been performed; no application code exists in the repository. This plan is the complete planning-stage deliverable. Execution starts only on explicit user instruction.






---

## O. Share Card (Task 20 — user-requested addition)

A second destination for an uploaded file, added after Phase 7 at the
user's request: a Strava-style activity share graphic — the route on a
transparent 1080×1920 (9:16) canvas whose PNG carries alpha (black
per the reference card during Tasks 23–40, transparent again since
Task 41 — the user's call, matching what the share views' "shown on
dark" note always claimed), the STRAVA wordmark, a
Distance / Pace / Time stats row, and a running-shoe icon — previewed
in-app and exported as a PNG (1× per the spec, 2× optional).

### O-1 Scope & honesty rules

- **Entry points.** The landing page carries a mode switch ("Repair a
  recording" / "Create a share card", remembered per §D-4); the upload
  opens the matching workspace. Once loaded, the file switches freely
  between the repair workspace and the share view (header action +
  in-view link) with no re-parse.
- **The trio is recorded data, never invented.** Distance = the file's
  total geodesic length; Pace = total distance over recorded moving
  time (the §L-1 pace definition); Time = the recorded elapsed span
  (`t_last − t_first`, the Strava convention). A file without usable
  timestamps renders "—" for pace and time with the reason shown in
  the view — the §L-2 rules apply to share graphics exactly as they
  apply to statistics tables.
- **The route is the honest route.** The card reuses `buildRouteView`
  verbatim: recorded pieces split at gaps and damage, plus re-imported
  `gpxr` reconstruction runs — drawn as independent strokes, never
  connected with fabricated legs. Antimeridian-crossing routes are
  longitude-unwrapped so they draw as the line the athlete traveled.
- **Multi-line palette.** One route color (#FC4C02) for everything:
  the card shows the activity as the file records it, recorded and
  previously-repaired stretches alike (the app's
  recorded/reconstructed distinction lives in the repair workspace,
  not on a share graphic).

### O-2 Architecture

- `lib/geo/mercator.ts` — pure normalized Web-Mercator + fit/center
  (the map's projection, without the camera).
- `lib/share/{layout,artwork,render,fonts}.ts` — the spec's layout
  math (every rect/baseline one derivation), the cleaned source-SVG
  path data, one canvas painter for preview AND export (WYSIWYG, the
  §H export contract applied to pixels), and the idempotent
  self-hosted Montserrat loader (local-first typography).
- `lib/share/path-bounds.ts` — SVG path-data ink-bounds parser
  (node-side only; it verifies the artwork's measured ink constants
  and never ships to the browser).
- `features/share/cardContent.ts` — the pure trio join.
- `hooks/use-share-card.ts` — the app-layer binding (route view →
  polylines, stats → content, offscreen paint → PNG download).
- `components/share/{share-card-canvas,share-view}.tsx` — the
  reusable component (props: routePolyline + the three strings) and
  the session view; the km/mi toggle is the extracted shared
  `PaceUnitToggle`.
- Session plumbing: `session-store.view` (repair | share, set at
  upload from the remembered landing mode), `ui-store.landingMode`
  (persisted preference), and the map-controller lifecycle keyed to
  the view so the map re-creates when the repair workspace returns.

### O-3 Phase 7 fix carried by this task

Re-uploaded repairs were double-counted in the statistics panel:
`originalDistanceStats` already measures `gpxr`-marked legs, and the
panel join added them again ("Total with repairs" read file-total +
marked-legs). The join now subtracts the marked distance from
"Recorded" and only live editor repairs add to totals; "Moving time
incl. repairs" likewise adds only live repair durations (a re-imported
run's distributed timestamps are already inside the recorded moving
time). Pinned by `tests/stats-panel-reimport.test.tsx`.

### O-4 Layout revisions (Tasks 21–23)

The card's geometry was revised three times against the user's
reference card; **Task 23 is the operative spec** (Tasks 21–22 are
historical), with two later revisions: **Task 40 un-squashes the
STRAVA wordmark** (the user's call — the SVG keeps its own
proportions), and **Task 41 restores the transparent background**
(the download carries alpha again — what the share views'
"Transparent background — shown on dark" note had claimed all
along; Task 23's solid #000000 matched the reference image but
contradicted that note).

- **Anchor-based, not derived.** Every position is a measured
  constant from the reference, pinned exactly (the lesson of the
  earlier revisions: pin the reference's numbers, don't re-derive
  them): route visible box x 64–1012 / y 219–1190 (contain, geometry
  inset by the casing half-width so the stroked ink cannot cross it);
  wordmark box 330×55 at top 1280, centered; stats top 1422, column
  centers 220 / 540 / 857, label 29px SemiBold over value 40px
  ExtraBold with a 9px gap; shoe slot 104×104 at top 1605;
  transparent background — the PNG carries alpha (Task 41). The
  implied rhythm —
  90 / 87 / ~90 gaps, content ending at 1709 with ~211px empty — is
  asserted by tests rather than used as an input.
- **Ink-based artwork placement.** The layout consumes each artwork's
  viewBox AND its measured ink bounds (`path-bounds.ts` verifies the
  constants in artwork.ts against the path data). Every artwork is
  CONTAINED (uniform scale, aspect preserved) and centered in its
  box — the shoe in its 104px slot, and since Task 40 the wordmark
  in its 330×55 box (~245×55, height binding). Task 23 had stretched
  the wordmark non-uniformly onto the box (the trace is ~4.45:1
  while the reference's wordmark is ~6:1) to chase the real mark's
  flatness; the user rejected the squeeze — the SVG stands as it
  is, and the height binding keeps the measured vertical rhythm
  (90/87 gaps) exact.
- **Casing as outline (Task 41).** The 16px #000000 casing pass
  stays under the 10px #FC4C02 route (spec-mandated) and is now
  VISIBLE ink — the background is transparent, so the casing reads
  as the route's outline on any backdrop (and disappears only on
  genuinely black ones). Task 23's solid-black interim had made it
  black-on-black and unprobeable, which retired its pixel
  assertions; Task 41's transparency restores both the ink and the
  assertions (the e2e asserts the casing's dark-ink share, and the
  live verify script probes its bbox plus its absence outside the
  route band).

---

## R. Gap Recovery Section (Task 26 — user-requested addition)

A third destination of the landing page, added after Phase 7 at the
user's request: **Gap Recovery** — a self-contained workflow for
recovering a missing GPS section from an existing activity whose
elapsed time continued while coordinates were missing. Explicitly an
ADDITION, not a redesign: the repair studio's processing, route
drawing, calculation, and export are untouched, and the new section
reuses the same pure machinery wherever possible.

> **Task 26 revision (user feedback):** the section originally shipped
> behind a header section switcher; the user clarified it should be a
> **third tab of the landing mode toggle** ("Repair a recording" /
> "Create a share card" / "Recover a GPS gap") — the same segmented
> control, not a separate top-navigation section. The switcher was
> removed; the entry point and everything below is as follows.
>
> **Task 28 revision (user feedback):** "even though there is not
> detection the user can still draw" — recovery is no longer gated on
> detection at all. The user draws the route they *know* they lost
> ("that they think they lost and it's not measured"), and the app
> itself calculates the drawn section's time from the uploaded file:
> the gap window when one was detected, otherwise a **pace estimate**
> (drawn distance ÷ the file's recorded average speed). This is the
> dividing line against the repair studio, where the user adds a route
> AND states the lost time manually.

### R-1 Scope & contracts

The user-facing flow, exactly as specified:

- **Upload an activity with a GPS tracking gap** — the landing page's
  "Recover a GPS gap" tab routes the upload into the section's own
  session (the same UploadZone gesture, `loadRecoveryFile`); the
  repair studio keeps whatever file it holds.
- **Detect the missing GPS time interval** — the same `detectGaps`
  engine (time-gap / speed-anomaly / segment-break, shared thresholds
  setting) lists each missing section with its interval boundaries,
  elapsed span, and straight-line diagnostics.
- **Draw the missing route on the map** — the same draw editor
  experience (clicks, road-follow car/foot/straight, snap magnet,
  drag/midpoint-insert/delete, undo/redo, vertex cap) over the
  activity's own map instance.
- **Draw even without detection (Task 28)** — an "Unmeasured sections"
  card offers the repair studio's pick-then-draw interaction, voiced
  for recovery: one click on a recorded point (mid-route → an insert
  span after it; route start/end → an open extension) or two clicks
  bounding a stretch to redraw. Insert/extend spans default to the
  **pace-estimated** time strategy — duration = drawn distance ÷ the
  file's recorded average speed (moving-time basis, synced into
  `fileTiming.recordedSpeedMps`); replace spans keep the
  window-derived default. The strategy is surfaced as a fourth source
  chip ("From your pace") that only exists when a file pace exists, so
  the repair studio's controls render exactly as before. A pace
  estimate that disagrees with a recorded window is flagged with the
  same Case-4 honesty contract as a disputed manual duration.
- **Generate points + timestamps** — the drawn path is densified and
  its points receive `Estimated` timestamps distributed inside the
  missing interval (§J-1 case matrix; distance-proportional default),
  so they seamlessly fit between the existing GPS points.
- **Integrate** — the merge inserts the interior between the untouched
  boundary anchors; original points are re-emitted verbatim by the
  identity exporter (repair only inserts — §H).
- **Elapsed time preserved — provably.** Originals (including both
  anchors' timestamps) are never rewritten, so first→last time, wall
  time, and every recorded statistic are byte-identical after export.
  The preview card pins this with an "unchanged" lock badge.
- **Recalculated statistics** — distance/pace/speed over the completed
  route (recorded + reconstructed) via the §L-1 joins, with Estimated /
  Mixed provenance badges; the StatsPanel (recorded / repaired /
  overall) is reused below the fold.
- **Visually distinct** — the map's existing language: recorded solid,
  missing span dashed, committed reconstruction emerald, draft through
  the draw session.
- **Preview before export** — the Completed route card (missing time
  covered, distance before→after, elapsed unchanged, average speed,
  points generated) plus the reused pre-export dialog summary.
- **Export as a new corrected GPX** — the reused ExportCard/dialog and
  `exportGpxRepaired`; every generated point carries a
  `gpxr:reconstructed` provenance marker, and re-uploading the export
  is recognized (marked stretches render and count as repaired, seams
  are not re-flagged as gaps).

### R-2 Architecture (isolation by design)

- `state/recovery-store.ts` — the section's own Zustand store: session
  slice (status/file/frozen model/gaps/error) + a mirror of the
  editor essentials (reconstructions, history, transient aids, road
  legs, file timing, section-local gap selection) **plus the Task-28
  manual-span machinery** (pick modes, insert/replace/extend spans
  with per-shape strategy defaults, per-span remove). It reuses the
  SAME pure drawModel commands. Unit tests pin the isolation
  contract: no recovery action ever touches
  `useSessionStore`/`useEditorStore`, and vice versa.
- `hooks/use-recovery-session.ts` — parse → validate → detect → store,
  plus the view-model joins (gap rows, segment rows, stats, extent).
  Reuses `describeParseError`.
- `hooks/use-recovery-map.ts` — its own `MapController` instance and
  its own selection state (NOT the repair studio's shared
  uiStore.selectedGapId, so the sections' hygiene effects cannot clear
  each other); route views via the shared pure `buildRouteView`, with
  user-drawn pair/extend spans joined as render refs exactly like the
  repair map's (detected rendering wins on a shared boundary).
- `hooks/use-recovery-draw.ts` — a mirror of `useDrawEditor`'s
  controller driving + road-follow resolution, bound to the recovery
  store, returning the SAME `DrawEditorBinding` interface so
  `DrawEditorPanel`, the map chrome, and the undo/redo bar are reused
  unchanged. Shares the page-level `RoadFollowRouter` (and its cache).
  Task 28: the mirror now carries the full manual-span join (point
  index, manual rows, open-ended chains, pick-session driving) and
  syncs the file's recorded speed into `fileTiming.recordedSpeedMps`.
- `hooks/use-recovery-elevation.ts` (Task 28) — a mirror of
  `useElevation` over the recovery store: the same DEM provider
  (shared instance + LRU cache), disclosure-first controls, and
  honest staleness/partial labeling for drawn sections' elevations.
  Section isolation: all elevation-store records are written under
  `recovery::`-prefixed keys (the two sections can hold the SAME file,
  so their gap ids can collide); the mirror never calls the store's
  `prune` (it keeps only the given ids and would wipe the repair
  studio's records) — removal is per-key `clear` over its own
  namespaced keys.
- `hooks/use-recovery-export.ts` — committed recoveries →
  `MergeRepairSite[]` → `mergeRepairs` → `exportGpxRepaired`;
  returns the same `GpxExportBinding` so the export card + dialog are
  reused.
- `components/recovery/*` — the section root (composition; no landing
  branch — the landing page's tab is the front door), two-section
  layout (recovery-labeled sibling of WorkspaceLayout), guide card
  (wizard progress), and completed-route preview card. Everything else
  in the tree is an existing component.
- Shell wiring (additive, revised): `ui-store`'s `landingMode` widens
  to `LandingMode = SessionView | "recovery"` (still the one persisted
  remembered intent — a stored "recovery" survives reloads, and the
  repair path narrows it so the session store's `SessionView` stays
  honest by construction); **no switcher state exists** — `AppShell`
  DERIVES the active section (recovery while its session is loading
  or parsed, repair otherwise) and routes the landing's upload intent
  and retry error by the selected tab; `AppHeader` renders no
  section switcher (its `section` prop is conditional routing only);
  `AppShell` mounts `RecoveryStudio` while the section is active, and
  `RecoveryStudio` has no landing branch (a failed load returns to
  the landing with the section's error above the hero for retry).
- Elevation estimation joined the section in Task 28 (drawn
  "unmeasured sections" get their elevations from the same DEM
  provider the repair studio uses, via the namespaced mirror hook);
  the stats panel's elevation rows and the profile chart render from
  the same merge basis.

### R-3 Verification

24 new unit tests (store lifecycle + isolation; the pure pipeline:
detection → draw → merge → export → re-parse with timestamp-in-interval,
verbatim-originals, elapsed-unchanged, marker, and no-re-flag
assertions; RTL acceptance including section isolation) and 3 new e2e
tests (full happy path with download assertions, export re-upload
round-trip, mobile viewport). Live verification ran the real flow
against the real OSRM road-follow service on the multi-gap demo file:
2 sections detected, a 26:01 gap recovered with a 3.87 km road-followed
route, 140 generated points exported with provenance markers, elapsed
time unchanged, average-speed math corrected (ms→s conversion bug
caught and fixed during live verification).

The Task 26 revision re-pinned the entry flow: the RTL suite covers
the three-tab toggle (no switcher, hero swap, compact/full label
pair), the tab-routed upload into the section's own session, the
reset-then-repair-tab handoff, and the tab-routed error/retry; the
e2e suite re-entered everything through the landing tab and added the
mobile 375 px no-overflow contract for the three-tab toggle.

Task 28 re-pinned the always-draw contract: unit tests cover the
pace-estimated plan matrix (duration math, anchoring per boundary
shape, the no-pace/no-path honesty reasons, the Case-4-style
discrepancy, distance-based distribution carrying the method), the
store's span machinery (per-shape strategy defaults, idempotent
reopen, remove, prune survival), the merge pipeline (insert and extend
spans with pace-estimated timestamps; no fabricated times without a
usable pace), the strategy controls' "From your pace" chip and PE
copy, and the RTL acceptance (a clean 6-point file with nothing
detected: pick → draw → commit → preview → export). The e2e suite
adds the same flow with real map picks and download assertions
(`timeMethod="pace-estimated"` markers, verbatim originals).

## S. Landing Tool Cards (Task 42 — user-requested addition)

The landing page's four-tab segmented control ("Repair a recording" /
"Create a share card" / "Recover a GPS gap" / "Create from stats",
Tasks 20→26) was replaced by a two-page front door, per the user's
request: **a cards home, then a per-tool page.**

### S-1 Scope & contracts

- **The home page** ("What would you like to do?") shows one card per
  tool — an illustration of what the tool does (AI-generated, Field
  Plot art direction: paper, ink linework, one orange accent, faint
  contours, no text), an icon chip, a mono kicker, the title, a blurb,
  and an "Open" affordance. The card IS the button (one tap target,
  44px+ by construction, `aria-label` "«title» — open this tool").
- **The tool page** carries everything the old tab swap revealed —
  hero, intake (upload zone / statistics form), the "How it works"
  trio — plus a new **fact strip** (Input / Output / Best for: the
  concrete contract under the teaching copy) and the **"All tools"**
  back button at the top-left of the hero column.
- **One intent, one action.** Opening a card sets BOTH the remembered
  upload intent (`landingMode`, still persisted per §D-4) and the open
  page (`landingView: "tool"`, transient) — the same `openLandingTool`
  store action, so the intent and the page can never drift apart.
  `closeLandingTool` returns to the cards.
- **Reset keeps the tool page.** A section reset ("New file") returns
  to the landing on the remembered tool's page with its intake ready —
  the same remembered-intent contract the tab carried (batch uploads
  of many files through one tool stay one-click). A fresh load always
  opens on the cards (`landingView` is never persisted).
- **Focus management (the page-turn contract).** Entering a tool page
  focuses its `h2` (screen readers announce the new page; Tab restarts
  inside it — the card that opened it is unmounted). Returning to the
  cards focuses the card that was opened (tracked in SessionIdleView
  local state), so keyboard users never land on `document.body`.

### S-2 Architecture

- `state/ui-store.ts` — `LandingView = "home" | "tool"` (transient,
  excluded from `partialize`), `openLandingTool(mode)` /
  `closeLandingTool()`; `landingMode` unchanged (persisted intent).
- `components/layout/landing-cards.tsx` — `LandingCardsView` + the
  `LANDING_TOOLS` registry (kicker/title/blurb/alt/icon per tool) and
  the focus-return refs.
- `components/layout/session-views.tsx` — `SessionIdleView` is now the
  dispatcher (home → cards, tool → `ToolDetailView`); the tool page
  owns the back button, hero, intake, steps, and fact strip
  (`WORKFLOW_STEPS` / `HERO_COPY` carried over verbatim; new
  `TOOL_FACTS`).
- `public/cards/{repair,share,recovery,create}.webp` — 896×512
  optimized illustrations (raws + prompts under `scripts/qa/task42/`).
- e2e compatibility: the card grid keeps the `landing-mode-toggle`
  testid and each card keeps `landing-mode-{mode}`, so existing specs'
  clicks carried over; the shared `e2e/helpers/landing.ts`
  `enterRepairTool(page)` enters the repair tool from any landing
  state (no-op when a tool page is already open) and every
  repair-section spec's local `upload()` calls it first.

### S-3 Verification

Unit: the landing suite re-pinned (cards: four doors, illustrated,
alt text, open intent, focus round-trip; tool page: hero, intake,
steps, facts, back intent, mount focus) — 941 passing. E2E: smoke
teaches the new home → card → page flow; gap-recovery re-pinned its
reset handoffs (back-to-cards before the toggle; the remembered tool
page asserted by heading instead of the retired radio semantics);
share-card's regression test opens the repair card explicitly — 67
passing. Live QA (agent-browser, desktop 1440×900 + mobile 375×667):
all four illustrations load, no console/page errors, no horizontal
overflow, focus lands on the tool heading on entry and back on the
originating card on return. VLM critiques: illustrations 4/4 KEEP
(one regeneration — the create watch face initially carried digits,
forbidden), home page SHIP (desktop full-page + mobile), tool page
structure PASS (flagged items were pre-existing conventions: the
upload-zone/footer privacy lines are two phrasings of the §M-3
promise at two scopes).

## T. Merge Section (Task 43 — user-requested addition)

The fifth tool: **combine two or more GPX files into one route**, then
arrange and export it — per the user's request ("provide 2 or more gpx
files and then it will try to combine them into a one gpx route with
all the things and the user can like change everything in the gpx file
once it combined into one").

### T-1 Scope & contracts

- **The merge contract ("one route with all the things"):** every
  recorded point is carried VERBATIM — the same frozen point objects
  (same raw captures), only ids re-keyed to the merged document
  positions. Elevation, timestamps, waypoints, routes, and
  segment-anchored extras all come along; re-imported `gpxr` repair
  markers survive (re-keyed), so merging previous repairs keeps their
  provenance. The output is ONE `<trk>` (name = the user-chosen
  combined name) whose `<trkseg>`s are the source segments in the
  user's order.
- **Documented drops (honesty, not data loss):** per-file root extras
  and metadata extras (author, copyright, keywords — N of them cannot
  be combined without inventing an order that lies) and the sources'
  per-track extras/desc/type (the merge has exactly one track;
  re-anchoring several files' track-level extensions onto it would be
  fabrication). The creator attribute discloses the merge:
  `GPX Repair Studio (merged N files)`.
- **Version policy:** the merged document uses the FIRST source's GPX
  version/namespace; point children re-emit from raw captures
  regardless of source version, so mixed-version merges are safe.
- **The gate:** the tool requires ≥ 2 parsed files to open the studio
  (Combine) and to export (the download button states the rule while
  it blocks). One bad file never blocks the rest — failures are
  per-file rows with the typed error and a remove button.
- **"Change everything" (the arrangement edits):** reorder files
  (move up/down), sort by start time (stable; undated last), remove
  files, add more files, focus one file's extent on the map, and name
  the combined activity (metadata `<name>` AND the single track's
  `<name>`). Every edit re-derives the merged model — the map, the
  statistics, the validation report, and the export follow each
  change immediately (WYSIWYG).
- **The export is the identity exporter** over the merged model (§H-7
  invariant holds for merges: no recorded value is ever rewritten).
  Download name = the sanitized combined name (fallback
  `merged-route.gpx`).

### T-2 Architecture

- `features/gpx/mergeFiles.ts` (pure domain) — `mergeGpxFiles(sources,
  {name})` builds the merged `OriginalTrackData` (single track,
  re-keyed `t0s{k}:{i}` ids matching a fresh parse of the export,
  deep-frozen); `fileSummary(fileName, model)` computes the list rows'
  counts/timing bounds.
- `state/merge-store.ts` — the section's own store (like
  recovery/create): `phase: "intake" | "studio"`, `files` (the array
  IS the merge order), `combinedName`, id sequence never reused;
  `combine()` guards ≥ 2 parsed. The merged model is NEVER stored —
  always derived.
- `hooks/use-merge-session.ts` — `addMergeFiles(files)` (the parse
  pipeline: File#text → parseGpx → validateGpx → per-file
  setParsed/setFileError, sequential so entries land in selection
  order) and `useMergeSession()` (memoized merge + validate + stats +
  extent + reimport; `exportXml`/`download` serialize the CURRENT
  arrangement).
- `hooks/use-merge-map.ts` — own MapController (four sections, four
  isolated maps), route = `buildRouteView(mergedModel, [])` (splits at
  damage only; re-imported repairs render as reconstruction lines —
  the merged file renders exactly as its re-upload would), reframes
  on every new merge, `focusFile(id)` flies to one source's extent.
- `components/merge/` — `merge-intake.tsx` (the tool page's multi-file
  zone + collected list + the gate; self-wired like CreateStudio),
  `merge-studio.tsx` (composition root), `merge-files-card.tsx`,
  `merge-details-card.tsx`, `merge-export-card.tsx`.
- Reused unchanged: `MapCanvas`, `WorkspaceLayout` (gained optional
  copy props — repair keeps its defaults byte-identical),
  `GpxSummaryCard`, `ValidationReport`, `StatsPanel`, `RevealOnScroll`.
- Shell wiring: `AppSection`/`LandingMode` += `"merge"`; the section
  derives from `mergePhase === "studio"` (create/recovery chain
  unchanged); the header shows the combined name (or "N recordings
  merged"), a "Map & order / Statistics" nav, and "Start over"
  (reset clears to the intake). Landing: the fifth card (centered on
  its own row — the 2×N grid ends balanced), `HERO_COPY` /
  `WORKFLOW_STEPS` / `TOOL_FACTS` entries, and the tool page renders
  `MergeIntake` instead of the single-file `UploadZone`.
- `public/cards/merge.webp` — 896×512 illustration, Task 42's Field
  Plot art direction (raw + prompt under `scripts/qa/task43/`).

### T-3 Verification

Unit: 988 passing (+47 — merge-files domain 21: structure/order/ids/
verbatim reuse/waypoints+routes/extras/markers/drops/metadata/
downstream guarantees incl. byte-stable identity round-trip; store 11;
UI 14; landing +1). E2E: 71 passing (+4 — the fifth card + tool page
with a closed gate; one bad file fails alone and removable; the full
combine → arrange (move/sort) → download flow asserting the
downloaded .gpx's CONTENT: chosen name, single `<trk>`, "merged 3
files" creator, both files' coordinates, `<wpt>` carried; Start over
returns to the intake). Static export PASS (merge.webp shipped). Live
QA (Playwright-driven, desktop 1440×900 + mobile 375×667): 5 cards,
zero horizontal overflow on home and studio, zero console/page
errors. VLM critiques: illustration KEEP (first round), home / tool
page / studio / mobile studio all SHIP (the mobile flags — map
attribution tightness — are pre-existing map-widget patterns shared
by every section).

## U. Pointer Modes & Path Styles (Tasks 44–47 — user-requested additions)

### Scope

Four additions to the draw editors, all serving the same goal — the
points the user places should look good and be fully theirs:

1. **Merge Share (Task 44)** — the Combine Recordings studio carries the
   same header Share flow as the other tools: warn first (the file
   downloads, the card opens), export the merged GPX (the identical file
   the Download button produces), then the share card built from the
   MERGED model's own statistics. Cancel is a full no-op.
2. **Pointer modes (Task 45)** — a three-way explicit toggle:
   - `draw` — clicks place points (panning disabled, the anti-fat-finger
     contract);
   - `move` — clicks place nothing; every placed point grows into an
     oversized grab target and drags freely (one undo step per
     release); empty-space drags still pan the map;
   - `pan` — normal navigation (point drags still work — they are
     pointer-targeted, never a pan).
   Keyboard accelerators D / M / P; the on-map chip cycles
   Draw → Move → Pan.
3. **Curves (Task 46)** — the fourth path style: a Catmull-Rom spline
   through the clicked points (interpolating — the line passes exactly
   through every node). Fully local. The curve is BAKED into ordinary
   points on commit/export, so the shape survives any platform (GPX has
   no native curve); what the map previewed is what the file carries.
4. **Per-line path styles (Task 47)** — Roads / Footpaths / Curves /
   Straight, picked before or while drawing and REMEMBERED PER LINE:
   `setPathStyle` writes the active reconstruction's own style, and
   every editor opener re-adopts the line's remembered style. Footpath
   lines render dashed on the map (the classic pedestrian-way
   convention); road lines stay solid.

### Contracts

- **WYSIWYG, one implementation**: `curveLegInterior` is the single
  spline sampler — the map's draft join, the distance badge, and the
  exported points all call it, so preview === export by construction
  (pinned by a byte-for-byte unit test).
- **The closing leg stays straight**: the segment from the last chain
  node into the far anchor renders as the dashed "closes on finish"
  preview — the export never splines it (the same WYSIWYG rule).
- **Settings, never commands**: `pathStyle` and the pointer mode never
  touch the undo stack (§D-3.5); switching styles mid-edit does not
  invalidate elevation freshness.
- **Session-start mode re-assertion**: `endDrawSession` resets the
  controller to pan; every hook re-asserts the store's pointer mode
  after `startDrawSession` — a session restart (e.g. a style switch
  rebuilding the joins) can never inherit the stale pan.
- **Honesty**: routing (car/foot) keeps its external-service disclosure
  and straight-line fallback; curve and straight never touch the
  network; the merge share card's trio is the merged model's own
  arithmetic (§L-2 — "—" with reasons, never invented values).

### Architecture

- `types/domain.ts`: `PointerMode`, `PathStyle`,
  `Reconstruction.pathStyle?`.
- `lib/map/mapController.ts`: `#pointerMode` tri-state (legacy
  `drawMode` derives for the e2e bridge), `setPointerMode`,
  `#applyHandleEmphasis` (Move mode's bigger handles + hit radius),
  the `gpxr-recon-dashed` layer (complementary filter against the solid
  recon layer).
- `features/reconstruction/roadFollow.ts`: the spline module
  (`curveSplinePoints`, `curveLegInterior`, `joinCurveChain`,
  `CURVE_SAMPLE_M`).
- `features/reconstruction/resample.ts`: `resamplePath(…, pathStyle)`
  bakes curve legs (interpolated role; spacing never re-densifies
  them; the closing leg excluded).
- The three editor stores + hooks: `pathStyle` with per-line memory;
  `makeJoins` closes over the style; the routing effect resolves legs
  only for car/foot.
- `state/merge-store.ts` + `hooks/use-merge-share.ts` +
  `components/merge/{share-merge-dialog,merge-share-view}.tsx`: the
  merge Share flow (the create section's pattern transposed).

### Verification

- `tests/merge-share.test.tsx` (16), `tests/path-styles.test.ts` (13),
  the migrated store/map-component suites.
- E2E: merge Share flow (download content-checked), Move mode (adds
  nothing / drags any point / one undo restores), Curves (rendered line
  gains the spline interior, clicked nodes verbatim).
- Baseline: 1018 unit + 74 e2e, typecheck + eslint clean, static
  export passes.

## V. The Pen System — Curve Is a Pen (Task 48 — user pass 48)

### Scope

Two corrections from live use of Tasks 45–47, both about what the user
holds in their hand:

1. **Dragging is Move-mode-only** — in Draw mode the pencil ADDS, it
   never edits: a press-drag over a placed handle moves nothing and
   plants no surprise point (before Task 48 the drag was
   pointer-targeted and worked in every mode). The grab cursor and the
   hover-grow affordance now show in Move mode only.
2. **Curve is a PEN, not a path style** — the path-style chips are
   three again (Roads / Footpaths / Straight); a new Pen chip group
   (Default pen / Curve pen) decides HOW Draw captures points:
   - **Default pen** — the classic pencil: click to place points one by
     one (exactly the pre-Task-46 behavior);
   - **Curve pen** — freehand: press and DRAG across the map; the
     captured trace is simplified into the line's next nodes and — when
     the line is local (Straight) — smoothed by the Task-46 spline. A
     quick tap still places a single point.
   Any pen × any path style combines freely: default pen + Roads for
   the basics, Curve pen + Footpaths for a hand-drawn trail, back to
   default pen + Straight — the per-line style system is untouched.

### Contracts

- **One stroke = one undo step**: a committed stroke is a single
  `set-vertices` command appending its nodes; undo removes exactly the
  stroke, redo restores it. The stroke's exact first/last samples are
  user data — never simplified away.
- **The Curve pen's signature**: a stroke committed while the line is
  `"off"` (Straight) flips the line to `"curve"` so the spline smooths
  it; routed lines (car/foot) keep their routing — the stroke's nodes
  are waypoints. The Straight chip covers both `off` and `curve`
  (curve is local like straight); tapping it flattens a smooth line.
- **Budget honesty**: a stroke can never overflow the vertex hard cap —
  `simplifyStroke` iteratively raises its Douglas-Peucker tolerance
  (then decimates) until the node count fits the remaining budget.
  Routing strokes cap at 12 waypoints (each node pair is one routing
  request); local strokes cap at 40 (dense spline food).
- **Draw-mode semantics**: click adds; drag never adds (the released
  press of a stray drag is swallowed, default pen) or strokes (Curve
  pen); taps with the Curve pen add single points. Move drags; Pan
  navigates.
- **WYSIWYG unchanged**: the live stroke renders with the exact draft
  chain paint (what the pen drags is what the line will be); the
  spline/baking machinery of §U is reused verbatim for curve-pen lines.

### Architecture

- `types/domain.ts`: `PenMode = "default" | "curve"`.
- `features/reconstruction/stroke.ts` (new, pure): `simplifyStroke`
  (iterative Douglas-Peucker with per-use caps, endpoint pinning,
  dedupe) + `douglasPeucker` (iterative, stack-based).
- `lib/map/mapController.ts`: `#penMode` + `setPenMode`; the
  `gpxr-draft-stroke` source/layer (live freehand preview in the draft
  paint); `#onCanvasMouseDown/#onMouseMove/#onMouseUp` stroke capture
  (min step 2.5 px, tap threshold 8 px, trailing-click suppression);
  handle drags gated to Move mode; `onStrokeCommit` session callback;
  the test bridge reports `penMode` + `strokeActive`.
- The three stores: `pen` + `setPenMode` + `commitStroke` (one
  `set-vertices` append; off → curve flip via `setPathStyle`).
- The three hooks: `onStrokeCommit` wiring (budget from the active
  reconstruction, routing flag from the path style), pen → controller
  effect, the C keyboard accelerator (D/M/P unchanged).
- Panels ×2 (`draw-editor-panel`, `route-draw-panel`) + the map chrome:
  the Pen chip group (`pen-mode-*` testids), three path chips (no
  Curves), the mode chip says "Curve pen" while the curve pen draws.

### Verification

- `tests/stroke.test.ts` (8): DP shape/endpoint guarantees, per-use
  caps, budget compliance, degenerate taps.
- Store suites ×3: `commitStroke` appends as ONE undo step, off → curve
  flip, routed lines stay routed, cap refusal, unique ids.
- Panel suites: pen chips render + dispatch; no `road-follow-curve`
  chip; a curve line reads as Straight (pressed), tapping flattens.
- E2E draw-editor.spec.ts: the editing test now proves a Draw-mode drag
  moves NOTHING before Move mode moves it; the Curves test became the
  Curve pen test (freehand drag → spline interior → one undo → tap
  still adds → C toggles back). road-follow.spec.ts drags in Move mode.
- Baseline: 1037 unit + 74 e2e, typecheck + eslint clean; live QA
  (screenshots + console sweep) and VLM critiques all SHIP.

## W. The Editor Reveal (Task 49 — user pass 49)

### Scope

Live follow-up to Task 48: the user could not see the requested features
in the drawing surfaces — "I don't see any of the features I requested in
the other modes that have a drawing mechanism." An audit of every surface
proved the features present in all three (repair, recovery, create: pen
group, path chips, Draw/Move/Pan rail + mode chip all in the DOM), but
**invisible at the moment they mattered**:

- **Repair**: the `DrawEditorPanel` inserts at the TOP of the tools
  column — above the gap list the "Draw route" click lives in — so the
  ~990 px card opened off-screen ABOVE the user's scroll position; the
  Pen and path chips never entered view (Task 48's own VLM critique had
  flagged this once).
- **Recovery**: the panel sits BELOW the guide/manual/gap cards; on a
  900 px viewport the Pen group's top landed at 787 px — 13 px visible.
- Create was never affected (the panel is the column's first card).

### Contracts

- **The editor must be SEEN when it opens**: when a draw editor session
  opens — or switches to another gap — the tools column scrolls to the
  panel's top, the Pen group leading the view.
- **The column only, never the map**: the scroll targets the sticky
  aside (its own scroll container at lg+); the page and the map stay
  exactly where the user's pointer left them. On smaller viewports the
  column doesn't scroll (scrollHeight ≈ clientHeight) and nothing moves.
- **The editor wins the same-flush race**: opening an editor also
  SELECTS the gap, and the GapList row's selection effect scrolls
  itself "nearest" in the same effect flush. The reveal scroll is
  deferred one `requestAnimationFrame` — after the row's scroll, still
  before the next paint (no visible flicker) — so the destination the
  user asked for (the editor) is the one that lands.
- **No mid-drawing re-scrolls**: the effect is keyed on the gap identity
  alone; vertex churn never moves the column (the GapList row
  discipline).

### Architecture

- `draw-editor-panel.tsx`: `cardRef` on the Card root (React 19
  ref-as-prop) + a `[gapId]`-keyed effect; rAF-deferred
  `column.scrollTo({ behavior: "smooth" })` computed from the panel's
  rect vs the `[data-testid$="tools-panel"]` column's rect; guarded for
  jsdom (no rAF/scrollTo crashes, no column → no-op).
- No store, hook, or controller changes — one presentation component
  covers both repair and recovery (they share the panel).

### Verification

- `tests/draw-editor-panel.test.tsx` (+5, file at 27): above-the-fold
  (repair) and below-the-fold (recovery) reveal math; no scroll when
  the column fits (mobile); no re-scroll on same-gap vertex churn;
  bare-mount no-op.
- E2E: `openEditor` (draw-editor.spec.ts) asserts the pen group
  `toBeInViewport({ ratio: 1 })` on every desktop (≥1024 px) editor
  open; both desktop recovery flows assert it too. 13/13 + 20/20
  (road-follow / create / manual-span) green.
- Live QA (`scripts/task49-live-qa.mjs`): repair reveal pen group top
  −587 px → +250 px; recovery +13 px visible → +249 px; Curve pen
  strokes after the reveal; zero console/page errors. VLM critiques
  (repair / recovery / curve) all SHIP.
- Baseline: 1042 unit + 77 e2e, typecheck + eslint clean, isolated
  static-export build PASS.

## X. The Plan-a-Route Section (Task 50 — user-requested addition)

The sixth tool: a route-planning scratchpad. The user draws a route on
the map, the app estimates the route's numbers — distance over the
rendered path, terrain elevation, the crow-flies comparison — and a
pace calculator computes what a user-entered time implies (pace,
speed, even splits). The section's defining contract, requested
explicitly: **no export and no share** — nothing leaves the page.

### Scope & contract

- **Input**: nothing — the map is the input. The landing's plan tool
  page carries a start card (the honest contract + "Start planning"),
  not an upload zone or a statistics form.
- **Drawing**: the FULL shared editor machinery — Default pen (click
  by click) and Curve pen (freehand strokes, simplified + smoothed,
  one undo per stroke), the three per-line path styles (Roads /
  Footpaths / Straight, routed through OSRM/Valhalla with the inline
  privacy warning and straight fallback), Move mode (the only mode
  that drags points), the vertex cap, undo/redo, and the D/M/P/C
  accelerators.
- **Estimates** (live, WYSIWYG over the rendered join):
  - distance (the same join the map draws — road legs included);
  - the crow-flies start→finish line and the detour factor;
  - opt-in elevation (the Phase-6 disclosure-gated DEM lookup over
    the join's points, hysteresis gain/loss, honest staleness);
  - pace + speed + even splits from a goal time the user enters
    (h/m/s fields; the km/mi unit follows the app-wide setting).
- **Output**: none. No export card, no share dialog, no share view,
  no download of any kind — asserted by unit tests, e2e, and the live
  QA probe. The header offers only "Start over".

### Architecture

- `features/plan/estimate.ts` (pure): `planJoin` (the rendered join
  with cumulative distances — reuses `joinDrawChain` /
  `joinCurveChain`), `crowFliesDistanceM`, `detourFactor`, the pace /
  speed / splits / tail arithmetic, `planElevationSignature` (road
  legs + path style + session token), `PLAN_ROUTE_ID`,
  `PLAN_ELEVATION_STORE_KEY`.
- `state/plan-store.ts`: the sixth independent session store —
  `phase: "idle" | "studio"`, the drawModel command slice (identical
  to the create store's), the road-follow side table, pen/pointer/
  path-style settings, and `plannedTimeMs` (the pace calculator's
  input — a transient setting, never undoable). Deliberately NO view,
  share, export, spacing, or distance-basis state.
- Hooks: `use-plan-map` (own MapController + locate + fit; the route
  view is permanently null — the draft IS the route),
  `use-plan-draw` (the create draw hook's mirror minus finish/
  spacing), `use-plan-elevation` (the create elevation mirror over
  the join; controls only — no attachment, nothing to feed),
  `use-plan-estimates` (the crow-flies join + the app-layer facade
  re-exporting the pure math — components never import features).
- Components: `plan-workspace` (the layout, `plan-tools-panel`),
  `plan-studio` (composition root), `plan-guide-card` (the scratchpad
  contract + locate + clear), `plan-draw-panel` (the shared chip
  language, live distance, vertex list — no finish button),
  `plan-estimates-card` (crow-flies line, shared ElevationControls,
  the pace calculator).
- Wiring: `AppSection`/`LandingMode` gained `"plan"`; the sixth
  landing card (PencilRuler icon, generated Field-Plot illustration);
  the shell derives `section === "plan"` while the store's phase is
  studio; the header shows "Route plan" + "Start over".

### The pace calculator

- The h/m/s fields are local component state; the parsed time is
  pushed to the store (`setPlannedTimeMs`) — the card is the only
  writer, so there is no prop-sync loop (and no effect).
- The results render live: pace (the §L-1 arithmetic the whole app
  shares), speed, and the even-pace split table (one row per whole
  km/mi + the partial tail). The badge says **Planned** — a plan the
  user typed, never an estimated measurement.
- The splits' reveal (the Task-49 pattern): the first keystroke that
  makes the pace computable scrolls the splits minimally into view
  ("nearest"). Deferred 250 ms — a smooth scroll started on the first
  keystroke is cancelled by the next keystroke's DOM mutation.

### Verification

- `tests/plan-estimate.test.ts` (14): the join's cumulative walk
  (straight/routed/spline), crow-flies + detour (loops refuse), the
  pace/speed/splits/tail arithmetic in km and mi, the honesty
  undefined/null contracts, the freshness signature's axes.
- `tests/plan-store.test.ts` (13): the lifecycle (idle ⇄ studio,
  reset bumps the session token), the planned time never touching
  history, the shared command contract (undo/redo/clear, one undo per
  stroke, off→curve flip, cap refusal), settings never undoable, and
  a structural guard that no share/export/view key can ever appear in
  the store.
- `tests/plan-ui.test.tsx` (14): the start card's contract + intent,
  the guide card's no-export copy and degraded locate states, the
  draw panel's chips (no Curves chip, no finish control), the
  estimates card's crow-flies line, pace flow (32:35 → 6:13 /km, 9.6
  km/h, 5 splits + tail, field → store push), clear, and the
  no-export/share/download assertions.
- E2E `e2e/plan-route.spec.ts` (6): the tool page intake; draw →
  live distance + crow-flies + vertex list; the pace calculator end
  to end (45:00 → ~9:59 /km, 9.0 km/h, 4 splits + tail, clear); the
  no-export/no-share contract across the tools AND the header;
  elevation opt-in + disclosure gate (zero requests before confirm) +
  the stale transition after an edit; "Start over" back to the tool
  page. Two landing-count assertions elsewhere (smoke, merge-tool)
  moved from five cards to six.
- Live QA (`scripts/task50-live-qa.mjs`): the full user flow with
  zero console/page errors — 4.51 km drawn, crow-flies 3.57 km /
  1.3×, 45:00 → 9:59 /km + 6.0 km/h + 5 split rows, a freehand Curve
  pen stroke committing through the shared machinery, all
  export/share probes at 0. VLM critiques (cards, studio, pace ×2):
  SHIP after the splits-reveal fix (the first pace critique caught
  the splits below the tools-column fold — fixed with the deferred
  reveal). The curve-stroke critique's "ghost line" was verified by
  pixel inspection to be the by-design on-curve midpoint insertion
  handles (shared with every editor since Task 46), and the
  "Straight lines" chip highlight is the curve-style home-chip
  convention (user pass 48) — both known design, not defects.
- Baseline: 1083 unit + 80 e2e, typecheck + eslint clean, isolated
  static-export build PASS.

## Y. Mobile & Accessibility Hardening (Phase 8)

*Phase 8 of §P — the production-quality touch and screen-reader pass.
Committed as `ba997c6`; its closeout record was backfilled during the
Task 51 verification (the Phase 9 session found the commit already on
the branch with no worklog/plan entry — the work below is that
commit's, read back from the diff.*

### The announcement bus (`lib/announcements.ts`, `Announcer`)

- The workflow moments that have NO visual focus change — gaps
  detected after a parse, a reconstruction finishing, an export ready,
  a long-press deleting a drawn point — are exactly the moments a
  screen reader would otherwise sit silent through. `announce(msg)` is
  a module-level pub/sub any layer can call (hooks, stores, the
  MapLibre controller) with no prop-drilling, context, or import
  cycle; `Announcer` (mounted once in the shell) renders the single
  polite `aria-live` region. Announcements are the mirror of badges
  and banners the sighted UI already shows — never a second UI.

### One tools column, two layouts (`WorkspaceToolsColumn`)

- Desktop (lg+) keeps the classic sticky aside, class-for-class. Touch
  widths get the §P Phase 8 bottom sheet: a 9.5 rem scrollable peek
  (swipe inside it browses without opening), a 35 dvh expanded state
  (the map keeps its working canvas above), a 44 px grab-bar toggle
  (tap, Enter/Space, or a ≥28 px drag, with honest `aria-expanded`),
  and an IntersectionObserver that hides the sheet once the user
  scrolls into the statistics section. The draw editor's Task-49
  reveal effect dispatches `gpxr:tools-reveal`, the mobile twin of the
  column scroll — opening an editor brings the Pen chips to the
  thumb. The sheet's scroll container carries the same
  `tools-panel` testid the aside uses, so every reveal/reveal-test
  works unchanged on both layouts.

### The touch layer (`mapController`)

- Two-finger pan/zoom owns navigation while a draw mode is active (a
  one-finger draw never fights the map); coarse pointers get ≥44 px
  hit targets on handles (visually honest — an invisible 44 px halo
  around a 5 px dot is a trap, so the target IS the drawn handle
  size); a stationary ≥N ms press on a vertex handle in draw mode is
  long-press delete, cancelled by ≥8 px of travel (it became a drag).

### Keyboard operability

- The skip link is the first tab stop; the whole repair flow
  (upload → gap list → editor → export) is drivable by keyboard; the
  export dialog takes focus, closes on Esc, and returns focus to its
  opener; the sheet's grab bar is a real button (Enter/Space toggle).

### Verification

- `e2e/accessibility.spec.ts`: axe-core scans (serious + critical
  bar, zero disable-rules/exclusions) over the plan's primary states —
  landing, tool page, parsed workspace, draw editor open, export
  dialog, and the mobile sheet-expanded editing state.
- `e2e/keyboard.spec.ts`: the four flows above, tab-stop order
  included. `e2e/mobile-touch.spec.ts`: the touch gestures through
  `e2e/helpers/touch.ts` (tap, drag, two-finger pan, long-press) at
  375 px, drawing included.
- Also in the commit: `use-media-query` (SSR-safe, `lg` breakpoint
  single source), the URI-wrap fix that kept GloryFit's long
  `<link>` text from overflowing the mobile viewport, dialog/table
  a11y fixes, and reduced-motion support in `globals.css`.
- Baseline after Phase 8: 1176 unit + the suite's a11y/keyboard/
  mobile-touch specs green (full-suite green re-proven at Task 51).

## Z. Performance & Large Files (Phase 9 — Task 51)

*Phase 9 of §P / §C-2. The parse pipeline left the main thread; the
map renders decimated by zoom; the budgets are now measured, not
aspirational.*

### The worker parse (`workers/parseWorker.ts`, `lib/gpx/worker-xml.ts`, `lib/gpx/parse-client.ts`)

- **The XmlIo seam paid out.** Workers have no DOMParser; instead of
  vendoring a DOM, `worker-xml.ts` is a compact namespace-aware
  tokenizer + minimal tree implementing exactly the DOM surface
  `parseGpx` touches (documentElement, getElementsByTagNameNS,
  localName, getAttribute, children, textContent, serialize).
  Malformed input throws — `parseGpx` already maps a throwing io to
  the typed malformed-xml error, the undeclared-prefix recovery
  included.
- **Correctness gate:** the corpus-equivalence suite — every committed
  fixture parsed through BOTH ios must produce structurally equal
  outcomes AND byte-equal identity exports (`tests/worker-xml.test.ts`,
  398 tests; `tests/parse-client.test.ts`, 234).
- **Streaming:** the validated model returns in ≤8,192-point chunks
  (`PARSE_CHUNK_POINTS`) — each structured clone lands in the tens of
  ms, never near the 200 ms budget; progress messages drive the
  loading bench's determinate bar (phase label + %, `role="status"`
  polite-live). Threshold: 1 MB of text (`PARSE_WORKER_THRESHOLD_BYTES`)
  routes to the worker; below it the inline path is byte-identical to
  the pre-Phase-9 behavior every existing spec pins. Infrastructure
  failure (worker blocked, crash, 120 s timeout) degrades gracefully
  to the inline pipeline with one console warning — correct output,
  blocking parse, never a dead app.

### Zoom decimation (`lib/map/decimate.ts`)

- Render-only: statistics, badges, export, and gap detection keep the
  full-resolution model; only the GeoJSON handed to the route source
  is sampled. The stride keeps consecutive kept points ≥2 px apart at
  the current zoom (maplibre 512 px tiles), quantized DOWN to powers
  of two so a gesture only re-decimates on band crossings. Endpoints
  are pinned; below 30,000 total coordinates (or stride 1) the input
  references pass through untouched — normal files never pay a copy.
  A floor keeps ≥512 rendered points so an overview stays a
  recognizable track. Wired in `mapController#applyRoute` + a
  `zoomend` re-apply; reconstructions, drafts, and gap geometry are
  never decimated.

### Measuring honestly (`e2e/performance.spec.ts`)

- Four measurement rules, each earned by a false failure in this
  sandbox: (1) `trace: "off"` for this file — Playwright's
  retain-on-failure tracing added ~1.4 s to a timed window that
  streams 100k points; (2) an untimed warm-up test compiles the dev
  route + worker chunk before anything is timed; (3) the
  parse-pipeline window is [upload mark, last worker progress
  message arrival) — captured race-free by a Worker spy installed
  before navigation — because the result handler (assembly + first
  render + setData) is a separate 400–800 ms task that §C-2's
  "parse + validate" rule does not govern; (4) the label observer
  attaches to `document`, never `documentElement` — init scripts run
  before `<html>` exists, and observing null throws silently-empty
  logs.
- Budgets, production (§C-2 verbatim) → dev ceiling (measured, warm):
  50k workspace 2 s → 3.5 s (measured 2.36 s); 100k workspace ~4 s →
  5 s (measured 3.3 s); 100k export 1 s → 2 s (measured 1.25 s);
  parse-pipeline worst block ≤200 ms — measured 55–78 ms (the chunk
  clones), asserted unchanged. The 100k suite also pins the phases
  (parse → validate → gaps → transfer, ending transfer @ 100%) and
  the user-facing label ("Preparing view" last).
- 250k profile (`scripts/task51-mem-profile.mjs`): heap flat at
  257 MB across parse → render → export; DOM 371 → 465 nodes (no
  per-point DOM); upload → workspace 6.9 s; export 2.06 s / 24 MB
  round-trip; the e2e gate (loads, no crash, heap < 2 GB, DOM <
  5k) green.
- Fixes earned by the verification pass: the spec's fixtures were
  missing the injected time gap the decimation test reads (two
  features); one draw-editor assertion (Task 44-era) was an unawaited
  locator `expect` that slower sandboxes cut off at finalization.
- Baseline after Phase 9: 1176 unit + 104 e2e, typecheck + eslint
  clean, isolated static-export build PASS (worker chunks shipped).

## AA. The Mode-Honest Editor (Task 52 — user pass 52)

**The report.** "In draw mode I can still drag points — dragging should
only work in the dragging-points mode. This may apply to the other
editors as well."

**The investigation.** The drag gate itself was probed end to end
(`e2e/_probe.spec.ts`, since deleted) across all four editors — Plan,
Create, Repair, and Recovery (which renders Repair's panel) — with
mouse drags, touch drags, chip switching, keyboard cycling (D→M→D), and
path-style switches that rebuild the session. In every case a Draw-mode
drag moved nothing; the single handle-drag entry point
(`mapController`'s `draftHandleHit` mousedown, gated
`pointerMode === "move"` since user pass 48) held. What the report
exposed instead was **mode-blind affordances**: the editor told the user
dragging was live regardless of the mode —

- the Pen chips (Default / Curve) rendered as fully live buttons in
  Move and Pan, so the panel read "drawing is on" while the pointer
  was actually in Move — where dragging a point legitimately works;
- the road-follow status said "Drag any point to adjust it — the road
  re-finds itself" in **every** mode, inviting the exact gesture the
  Draw mode refuses;
- the map legend said "Drawn point (drag to move)" unconditionally;
- the Create guide card said "Drag any point to adjust it" mid-draw;
- the `c` accelerator toggled the pen from Move/Pan in three of the
  four hooks, "un-drawing" a mode that was never drawn.

**The fix — every affordance tells the truth about the mode:**

- Pen chips render **inert** outside Draw (disabled, dimmed, wrapped in
  a `cursor-not-allowed` span; `aria-pressed` retained so the pen is
  remembered), with a `role="status"` note: "The pen works in Draw mode
  only — press D (or the pencil tool) to draw. Right now the pointer
  drags your points / navigates the map." All three panels; Recovery
  inherits Repair's panel.
- The road-follow status is mode-aware: Move keeps "Drag any point to
  adjust it — the road re-finds itself."; Draw/Pan get "Switch to Move
  (M) to drag a point — the road re-finds itself."
- Legend: "Drawn point (drag in Move mode)".
- Create guide card: "…Switch to Move (M) to drag any point…".
- `c` is gated to Draw in all four hooks (Plan already had it).

**The regression pins.** `e2e/pointer-mode-gating.spec.ts` (3 specs —
Plan, Create, Repair): draw a line, drag a handle in Draw → chain
byte-identical; switch to Move → chips disabled + note visible + the
same drag moves the point (>1e-5°); back to Draw → no-op again, chips
live. A `settledChain` helper waits out road-leg and snap round-trips
so the comparisons are race-free (the first probe's false "movement"
was a snap-at-add-time landing after the snapshot). Unit tests pin the
inert chips (disabled + `aria-pressed` kept + note copy per mode) and
the mode-aware status in all three panels.

- Live QA (`scripts/task52-live-qa.mjs`): three screenshots, zero
  console/page errors; VLM critiques (scripts/qa/task52/): move-mode
  inert pen SHIP, draw-mode live pen SHIP, legend SHIP.
- Baseline after Task 52: 1184 unit + 107 e2e, typecheck + eslint
  clean, isolated static-export build PASS.

## BB. Session Recovery (Phase 10 — Task 53)

**The objective.** A stray reload or closed tab no longer destroys
in-progress work: every drawing-bearing session autosaves to IndexedDB
and the landing page offers to restore it.

**The decision gate.** Passed, scoped deliberately: the four drawing
sessions (repair, recovery, create, plan) hold minutes of hand-drawn
work; **merge is excluded** — it carries no user-authored geometry
(re-picking files is seconds, not minutes) and a multi-blob record
would triple the storage surface for the weakest benefit. "Keep it
small" is honored by the payload, not by skipping surfaces.

**Storage** (`lib/storage/sessionStore.ts`): one database
(`gpx-repair-studio.sessions` v1) with TWO object stores — `state`
(one small record per section) and `files` (the original bytes, written
ONCE per session — geometry autosaves stay tens of KB even for a 24 MB
250k-point file). Single record per section, no history. Every
operation is guarded: no `indexedDB` (SSR), blocked private mode
(throwing getters included), quota errors, or corrupt rows degrade to
a silent no-op latch — the app functions identically with storage dead
(pinned by an e2e that neuters `indexedDB`). A 64 MB file guard keeps
unreasonable activities out. Deletes are issued only through a
"known record" tracker, so a visitor who never draws never gets an
empty database created at all.

**Records** (`lib/storage/session-record.ts`, pure): schema-v1
discriminated union — file sessions carry the repair work
(reconstructions with vertices + spacing + path style + time strategy,
skip marks, manual spans, file timing, gap thresholds, resolved road
legs), create adds the confirmed statistics + settings, plan adds the
goal time. Deliberately NOT recorded: undo/redo history (spans one
editor session by design), elevation fetch status (opt-in network
data, re-fetchable — a restored line restarts honestly at
"not-fetched"), transient aids (pointer mode, pen, snap), and views (a
view is not work). The path style is normalized (`undefined → "car"`)
because the stores never write the default — and a reloaded editor
adopts exactly that value anyway.

**Road-follow WYSIWYG.** Road legs ARE persisted (committed routed
lines render and distance from the side table — without them a
restored Roads line would draw straight until reopened), and the
restore seeds the shared router's cache from them
(`RoadFollowRouter.seedCache`), so an editor reopen finds cache hits
and issues ZERO new OSRM/Valhalla requests — the restored line is
byte-identical to the one the user saw (pinned by an e2e with a
request-counting mock).

**Autosave** (`hooks/use-session-recovery.ts`): per-section zustand
subscriptions (no React renders), an 800 ms debounce keyed on a cheap
signature (vertex counts + geometry revisions + settings + spans +
skips + timing + legs + thresholds + phase/stats), a `pagehide` /
visibility-hidden flush that runs the pending action exactly as the
timer would have. The work predicate keeps the prompt honest — a
repair record exists only once a vertex, manual span, skip mark, or
file-timing entry exists (a bare upload restores nothing worth a
prompt), and **undoing back to nothing deletes the record** so a
restore can never resurrect undone work. Records die at session
replacement (new upload → loading) and at reset ("Start over" lands
here through the store resets — one source of truth).

**Restore** reuses the real pipelines: file sections rebuild a `File`
from the stored blob and go through `loadGpxFile` / `loadRecoveryFile`
(worker parse, progress UI, announcements, the error surface), then
the stores' new `hydrate` actions adopt the work. Gap ids and point
ids are deterministic per document position, so re-detected gaps
re-adopt their reconstructions and manual spans survive; the
vertex-id allocator re-arms to the highest stored sequence so editing
continues without id collisions. A restored session re-persists
immediately (the beginLoad deleted the old record), so a SECOND reload
still finds it.

**The prompt** (`components/layout/restore-prompt.tsx`): renders on
the tool-cards page above the hero, exactly when storage holds
restorable work. One row per session (section kicker, file name or
route shape, drawn-work detail, "saved X ago") with Restore (the
session re-opens) and Discard (the record is deleted); the footer is
the §M-3 disclosure in plain words — what is stored, that it never
leaves the device, and the "Clear all saved sessions" control. Since
Phase 11 the footer also carries the door into the full
"Privacy & Data" page (section CC).

---

## CC. Polish, Docs & Release Prep (Phase 11 — Task 54)

The v1 closeout: the onboarding tour, the full §M-3 disclosure
("Privacy & Data"), the About/attribution page, the README, and the
release pass over every surface. No new features — the phase's
non-goal, honored.

**The onboarding tour** (`components/layout/onboarding-tour.tsx` +
`hooks/use-onboarding-tour.ts` + `lib/storage/tour-flag.ts`): a
4-step first-run overlay on the tool cards (the local-first promise,
the six tools, the pen system, the honest-numbers + autosave
guarantees). One guarded localStorage key (`tour.v1`, plain "seen")
remembers it; a browser whose storage cannot remember never sees the
auto-open at all (the nag-guard). Auto-open rules: the cards page
showing, the Phase 10 storage scan settled, NO restore offers (a
returning user is not new — the prompt wins), flag unseen — armed at
most once per page load. Every exit (Finish, Skip, Esc, implicit
dismissal on leaving the cards page) writes the flag; a MANUALLY
replayed tour ("New here? Take the tour" link under the hero)
survives a page switch and closes only by its own controls. Built on
the Dialog primitive (focus trap, Esc, focus return) with per-step
heading focus for screen readers.

**Privacy & Data + About** (`components/layout/info-content.tsx` +
`info-dialog.tsx`): one dialog, two panes, a real tablist (arrow keys
walk it, aria-controls wired). The privacy pane is §M-3 in full: the
**egress table updated for the shipped pens** — three rows (tiles:
OpenFreeMap/OSM; road-follow: OSRM/Valhalla, endpoints only;
elevation: Open-Meteo, opt-in) where §M-2's original two-row table
predated Tasks 44–50 — plus what works offline, how to switch every
provider, and the storage disclosure (both localStorage keys named,
the IndexedDB sessions, every clear path). The About pane carries the
attribution (MapLibre, OpenFreeMap/OSM, OSRM/Valhalla,
Open-Meteo/Copernicus, the self-hosted type) and the version line.
**Copy is pinned to the code by tests**: the hosts named in the table
are asserted against the real constants (`lib/map/styles.ts`,
`features/elevation/openmeteo.ts`, the routing URLs), the row count
is pinned at three, and the version matches package.json — a
provider change that forgets the page fails the suite.

**Doors**: the footer (every app state — `site-footer.tsx`, the
local-first line + About + Privacy & data links), the restore
prompt's "More about privacy and data", and the tour's first step.
The old footer's one-line promise was kept verbatim.

**README**: dev setup (install/dev/build/test), the architecture
summary (layer map + the ESLint boundary rules), the testing guide
(unit/e2e/privacy-invariant + the full gate), deployment, and the
attribution summary.

**E2E seeding**: `playwright.config.ts` seeds the tour flag as seen
for every existing spec (the ~113 specs never meet the first-run
overlay); `e2e/onboarding-tour.spec.ts` opts out with an empty
storageState to test the tour as the fresh-browser behavior it is.

**The release pass**: full regression (typecheck, eslint,
1269 unit — +42 over Task 53's 1227, 122 e2e — +9 over 113, static
export PASS), live QA (`scripts/phase11-live-qa.mjs`, zero
console/page errors), axe scans of the new surfaces (tour steps +
both info panes — zero criticals, `e2e/phase11-a11y.spec.ts`), VLM
critiques on all four new surfaces (tour, privacy pane,
about pane, restore-prompt door — all SHIP after the egress table
was restructured from three cramped columns to two and the
attribution list gained per-entry rules; a measured no-clipping
check `scripts/phase11-measure-table.mjs` settled the reviewer's
hallucinated clipping claim at 628 px and 312 px widths), and the
manual QA matrix sign-off recorded in the worklog. `package.json`
and the About pane agree on 1.0.0 (test-pinned); **v1 tagged**.

## DD. Home Redesign — Compact Tiles (Tasks 55–56 — user-requested)

**Task 55 (proposal only)**: the user found the Task 42 landing too
large — a 2×3 grid of cards with 16:9 illustration plates ran the page
~1400 px tall — and asked for a denser, non-card layout to review
before any code changed. Three variants shipped as a self-contained
mockup (`download/design-mockups/home-redesign.html`, A/B/C switcher):
A · index list (no illustrations), B · index + sticky preview rail,
C · compact 3-across icon tiles.

**Task 56 (this section)**: the user picked **C** and asked that the
illustrations stay. `landing-cards.tsx` was rebuilt as a tile grid:

- **Grid**: `md:grid-cols-3` (2 rows of six where the cards needed
  3), 2 columns on small screens, 1 on phones; the page column widened
  to `max-w-5xl`. Measured: 1070 px tall at 1440 (was ~1400), 1006 px
  at the 900 px band (was ~1515 there), 2599 px on mobile (was ~3300).
- **Tile**: the illustration kept on a shorter **2:1 plate** (~165 px
  at desktop, was 253), then a compact body — icon chip + mono kicker,
  15 px title, a **one-line blurb clamped to three lines** (the full
  two-sentence copy retired from the home; the tool detail page already
  carries it in HERO_COPY/TOOL_FACTS/workflow trio), and the signal
  "Open →" row pinned to the floor. Field Plot language unchanged.
- **Contract preserved**: same testids (`landing-mode-toggle`,
  `landing-mode-{mode}`, `landing-start-tour`), same button+img DOM
  (6 buttons, 6 `/cards/*.webp` with alt text — unit-pinned), same
  focus-return behavior, same aria-labels. The odd-count centering
  rule was dropped (six tiles fill the grid evenly).
- **Verification**: typecheck + eslint clean; 1269/1269 unit; full
  Playwright **122/122** (re-ran the landing-critical chunks after the
  `lg:`→`md:` breakpoint change); live QA geometry checks pass at
  1440/900/390 (3/3/1 columns, zero horizontal overflow, plates at
  2:1, touch targets ≥ 44 px, zero console/page errors —
  `scripts/task56-live-qa.mjs`); VLM critiques: desktop 9/10, mobile
  9/10 (all six plates populated), and the band-900 "overlapping N
  button" claim **disproven by DOM measurement**
  (`scripts/task56-probe-overlap.mjs`: zero foreign elements intersect
  the create tile; the "N" is the compass badge inside the plate
  artwork).
- **QA-script lessons recorded**: seed the tour flag for landing
  screenshots (a fresh browser opens the onboarding overlay over the
  grid) and scroll the page before `fullPage` captures (below-fold
  `decoding="async"` images are loaded but not yet painted, and read
  as empty plates — `scripts/task56-live-qa.mjs` now does both).

## EE. V2 Roadmap — Phases 12–22 (user-requested expansion)

After v1 shipped (tag `v1`, Task 56), the user asked for **all** of
the proposed expansion — 18 capabilities across four goals: more
freedom to use, more power, more usefulness, and a better experience
for every kind of user. They are organized below into eleven
dependency-ordered phases, Tasks 57–67. Task numbering continues
from 56; phase numbering continues from 11.

**Ordering rationale:**

- Dark mode rides the existing CSS token system and lands **early**
  (Phase 12) so every later surface is built and QA'd against both
  themes instead of retrofitted at the end.
- Validation (13) precedes presets (presets are bundles of detectors
  + fixes) and precedes surgery (16) — both reuse the
  provenance-labeled working-copy layer that 13 introduces.
- Formats (14) precede batch (18): batch multiplies per-file
  capability, so per-file capability must exist first.
- Stats (15) precede the PDF summary (19): the report consumes the
  stats engine.
- Road snapping (17) is deliberately isolated — the only phase that
  ever sends geometry off-device — and is fenced behind explicit
  per-session consent.
- i18n (21) lands late so final strings are extracted once; PWA
  (22) lands last so the offline precache ships a stabilized asset
  set.

**Goal → phase map:**

| Goal | Phases |
|---|---|
| Freedom / free to use | 14 (formats), 18 (batch + portable sessions), 22 (offline PWA) |
| Power | 13 (validation), 15 (stats), 16 (surgery), 17 (snapping), 22 (elevation cache) |
| Usefulness | 12 (sample files), 13 (report + presets), 19 (compare + PDF summary) |
| Experience for all | 12 (dark mode), 16 (numeric entry / a11y), 19 (guided flows), 20 (palette), 21 (i18n) |

**Conventions (unchanged from v1):** every phase ends in a working,
committed state `phase(N): …`; typecheck + eslint + vitest +
Playwright green before commit; VLM QA on new/changed surfaces;
worklog + this plan updated per phase; original data immutable; all
modifications provenance-labeled; static export — no server, no
accounts, no telemetry (Phase 17's consented router call is the sole
exception, re-consented every session).

### Phase 12 — Quick wins & theming (Task 57)

**Objective:** immediate low-risk value, plus the cross-cutting theme
system every later phase inherits.

- **12.1 Sample files:** one curated synthetic fixture per tool
  (repair: a multi-gap ride; merge: two overlapping recordings;
  create-from-stats: nothing — it already starts from numbers;
  plan: starts empty; share/export: reuses repair's), bundled as
  inlined static assets (no network fetch — offline-safe from day
  one), "Try a sample" action on each tool surface + landing tiles;
  loaded sessions behave identically to real ones (same provenance
  rules).
- **12.2 Dark mode:** audit that `ink/paper/shade/signal` are pure
  CSS variables; define `[data-theme="dark"]` overrides; toggle in
  the footer/header persisted to
  `gpx-repair-studio.theme.v1` (`light|dark|system`, default
  `system` via `matchMedia`); map tiles switch to a dark OpenFreeMap
  style if one exists, else a token-aware dimmed canvas overlay
  (decision recorded in-phase); every SVG/chart color tokenized.
- **12.3 Help dialog + shortcut cheat sheet:** `?` opens a dialog
  listing current keyboard shortcuts and where to find each tool —
  the foundation the Phase 20 command registry will feed.

**Non-goals:** i18n, command palette, new tools.
**Verification:** unit (theme hook persistence + sample loader),
e2e (theme persists across reload; sample opens the right tool with
a loaded session; help dialog opens/closes with focus return), VLM
on both themes at 1440/900/390.

### Phase 13 — Deep validation & repair presets (Task 58) — DONE

**Objective:** the app finds problems, not just fixes known gaps.

- **13.1 Detector suite** (pure TS, `src/domain/validation/`):
  speed spikes (default threshold 130 km/h, configurable), duplicate
  points (< 1 m within a window), non-monotonic timestamps,
  elevation outliers (step/z-score), stop-and-wander drift heuristic
  (sustained sub-0.5 m/s scatter flagged as likely GPS drift),
  missing-elevation runs.
- **13.2 Provenance extension — the working-copy layer:** original
  data stays immutable; every fix (deletion, reordering, smoothing)
  is an override entry with a reason and timestamp. Exports and
  stats recompute from the working copy and label affected
  distances as modified. This layer is the foundation Phases 16 and
  19 build on.
- **13.3 Report UI:** issues grouped by severity with counts,
  jump-to-map, and a full textual list (a11y rule: every map
  capability has a text equivalent).
- **13.4 One-click fixes:** remove spikes, dedupe, sort-by-time
  (marks the file estimated), smooth flagged elevations — each
  previewed, confirmed, undoable, and logged.
- **13.5 Presets:** named bundles ("Drift cleanup", "Dedupe & sort",
  "Resample") that run detector→fix chains with a what-would-change
  preview before applying. Phase 18 reuses these for batch.

**Non-goals:** auto-applying fixes without preview, batch, snapping.
**Verification:** detector goldens on synthetic defective files,
fix round-trip unit tests, preset integration tests, e2e full
find→preview→fix→export flow, VLM on the report UI.

### Phase 14 — Formats: in & out (Task 59) — DONE

**Objective:** meet users where their devices are.

- **14.1 Ingest auto-detect:** GPX / TCX / FIT by magic bytes +
  extension, routed through the Phase 9 worker parse pipeline.
- **14.2 TCX import:** extend the DOMParser facade
  (Activities→Courses→TrackPoints; hr/cad read as optional
  passthrough, not editable).
- **14.3 FIT import:** binary decoder. In-phase decision: a vetted
  dependency (`fit-file-parser` or equivalent — license, bundle
  size, worker compatibility checked) vs a minimal hand-rolled
  Record/Lap decoder; decision and rationale recorded in §HH.
- **14.4 Export:** KML (LineString + stats as ExtendedData), GeoJSON
  (FeatureCollection with per-track stat properties), CSV
  (trackpoints). The existing export menu gains a format picker;
  every format carries the provenance labels.

**Non-goals:** FIT/TCX writing, editing hr/cad fields.
**Verification:** fixture round-trips per format (binary FIT
fixtures hash-checked), golden export files, e2e import→repair→
export in each format, VLM on the export picker. Shipped — see §HH.

### Phase 15 — Stats dashboard (Task 60) — DONE

**Objective:** from fixer to workbench — users get more out of
every file.

- **15.1 Splits engine:** km/mi configurable; per-split distance,
  time, avg pace, elevation gain; splits crossing reconstructed
  segments flagged estimated (honesty rule).
- **15.2 Elevation profile:** hand-rolled SVG (no new dependency,
  static-export safe), original vs reconstructed shading, hover
  readout, and a keyboard-navigable table as the textual
  equivalent.
- **15.3 Pace & time-in-motion:** pace-over-distance chart,
  stopped-time detection summary.
- **15.4 Stats CSV export** + a print-friendly stats view (Phase 19
  builds the full repair summary on this).

**Non-goals:** hr/power analytics (data exists post-14 but analysis
is deferred), third-party sharing integrations.
**Verification:** split-math goldens against hand-computed tracks,
chart a11y (axe + keyboard), e2e open-stats→export-CSV, VLM.

### Phase 16 — Track surgery & input freedom (Task 61) — DONE (§JJ)

**Objective:** full control of geometry beyond drawing — and the
keyboard-only repair milestone.

- **16.1 Surgery ops** (on the Phase 13 working-copy layer): split
  track at a selected point, delete an A–B range, reorder segments,
  duplicate a segment. All provenance-labeled; stats recompute.
- **16.2 Numeric coordinate entry:** per-vertex forms
  (lat/lng/elevation/time) to add, insert, and move vertices by
  typing, plus arrow-key nudge with a configurable step — **closes
  the v1-documented a11y limitation** (drawing required a pointing
  device). A complete reconstruction becomes possible keyboard-only.
- **16.3 Validation:** coordinate sanity checks (bounds, precision)
  on entry, with the same honest-error style as the rest of the app.

**Non-goals:** freehand mode, snapping (17), batch.
**Verification:** surgery unit tests (geometry + provenance),
**e2e: a full gap repair completed with zero pointer events**
(keyboard-only milestone), VLM on the vertex forms.

### Phase 17 — Road snapping, opt-in (Task 62) — DONE (§KK)

**Objective:** the biggest realism upgrade for reconstructions,
without breaking the privacy promise.

- **17.1 Router provider abstraction:** OSRM-compatible endpoint,
  configurable URL; default points at a public OSRM instance with
  plain-language privacy implications stated; self-hosting
  instructions added to the README and privacy page.
- **17.2 Consent gate:** explicit per-session opt-in (never
  persisted as default-on, re-asked each session, never silent);
  plain notice: "snapping sends the drawn line to a third-party
  router". Toggle lives in the draw tools; consent state shown in
  the footer while active.
- **17.3 Snap engine:** match the drawn polyline to the routed
  path, preview with distance delta (routed vs straight-line),
  apply/unapply (undo), in-memory cache keyed by rounded-polyline
  hash (persistent cache joins Phase 22).
- **17.4 Offline/declined fallback:** unchanged freehand drawing;
  the snap control disables with an explanation when offline.

**Non-goals:** turn-by-turn instructions, routing waypoints,
ever snapping original recorded data (only user-drawn
reconstructions), any other external service.
**Verification:** provider adapter with mocked fetch, consent-flow
e2e (no network call before consent — asserted), privacy page copy
update, VLM on the snap preview.

### Phase 18 — Batch & portable sessions (Task 63) — DONE (§LL)

**Objective:** bulk power, and users keep full ownership of their
work.

- **18.1 Multi-file queue:** drop N files → a queue list with
  per-file status (parsed / issues found / fixed / exported) and
  aggregate stats.
- **18.2 Batch operations:** run a Phase 13 preset across the queue
  with per-file previews before confirming; batch export as a ZIP
  (vetted client-side zipper — `fflate` or equivalent, static-export
  compatible) plus a manifest summary of what changed per file.
- **18.3 Portable session file:** serialize the full working state
  (originals + working-copy overrides + reconstruction + view) to a
  versioned `.gpxrepair.json`; open-from-file on the landing;
  export from the session. No accounts, ever — the file *is* the
  session.
- **18.4 Session manager:** named sessions in IndexedDB (extends
  Phase 10 recovery) — rename, delete, export, import.

**Non-goals:** cloud sync, accounts, cross-tab collaboration.
**Verification:** ZIP integrity tests, session round-trip fidelity
goldens, queue state-machine tests, e2e multi-file drop→preset→
export flow, VLM on the queue UI.

### Phase 19 — Compare, summaries & guided flows (Task 64) — DONE (§MM)

**Objective:** trust in what changed, and deeper onboarding.

- **19.1 Before/after compare:** overlay mode (original as ghost
  track + working copy solid, changed segments highlighted in
  signal) and side-by-side mode; a stats delta table (distance,
  time, gain — original vs after, with estimated/modified flags).
- **19.2 Repair summary / print-PDF:** print stylesheet (no new
  dependency, static-export friendly): provenance table (estimated,
  filtered, snapped, sorted — every modification with counts),
  stats, and a static SVG snapshot of the track. Per-file and
  per-batch manifest variants.
- **19.3 Per-tool guided walkthroughs:** 3–5 step task-based tours
  per tool (extending the Phase 11 tour infra), using the Phase 12
  sample files as teaching payloads; dismissible, replayable from
  the help dialog.

**Non-goals:** video tutorials, account-based progress tracking.
**Verification:** compare-math unit tests, print-emulation e2e
(`media: print`), tour replay e2e, VLM on compare + summary.

### Phase 20 — Command palette & shortcuts (Task 65) — DONE (§NN)

**Objective:** power users fly; everyone else discovers.

- **20.1 Command registry:** every action (navigate, switch tool,
  run fix/preset, export, theme, tours) registered with id, label,
  shortcut, and availability context — a single source that also
  feeds the Phase 12 help dialog.
- **20.2 Palette:** Ctrl/Cmd+K opens a fuzzy-searchable,
  keyboard-first palette over the registry, including recent
  sessions. Focus-trapped, listbox-semantics a11y.
- **20.3 Shortcut audit:** bind the remaining major actions without
  conflicts; all bindings visible in the cheat sheet.

**Non-goals:** user-defined macros, scripting console.
**Verification:** registry unit tests, palette a11y (axe + keyboard
nav), e2e open→search→run, VLM.

### Phase 21 — Internationalization (Task 66) — DONE (§OO)

**Objective:** open the tool to non-English users.

- **21.1 String extraction:** all UI copy moves to typed
  dictionaries; a lint rule forbids new hard-coded strings.
- **21.2 Runtime:** lightweight typed lookup + parameter
  interpolation (no heavy i18n framework — dependency discipline);
  locale persisted, `?lang=` override for testing.
- **21.3 Locales:** English (source) + the initial set the user
  picks (decision point at phase start); number, unit, and date
  localization.
- **21.4 Pseudo-locale harness:** a long-string expansion locale
  for overflow QA (VLM pass under expansion).

**Non-goals:** RTL locales (revisit after the locale set is real),
machine translation of user data.
**Verification:** missing-key CI gate (unit), pseudo-locale VLM
sweep, e2e locale switch persistence.

### Phase 22 — Offline PWA & persistent caches (Task 67) — DONE (§PP)

**Objective:** install it, use it in the mountains, never wait
twice.

- **22.1 Manifest + icons:** installable, standalone display,
  theme colors for both themes.
- **22.2 Service worker:** precache the static-export asset
  manifest; stale-while-revalidate runtime strategy; an
  update-available toast that asks before reloading — never a
  silent swap mid-edit.
- **22.3 Elevation cache persistence:** Cache Storage/IndexedDB
  backend for the Phase 7 LRU design (rounded-coord keys, size cap,
  and a clear button in the privacy settings).
- **22.4 Offline proof:** e2e that blocks network, loads the app
  from cache, and completes a repair + export with zero requests.

**Non-goals:** background sync, push notifications.
**Verification:** offline e2e (the phase's centerpiece), Lighthouse
installability, cache-cap eviction tests, VLM on install/update
toasts.

### v2 release

After Phase 22: full regression (typecheck, eslint, unit, Playwright,
static export), a VLM sweep across both themes and all locales,
README refresh, worklog closeout — **tag `v2`**, push.

## FF. Phase 12 — Quick Wins & Theming (Task 57)

The first v2 phase: three low-risk features, one of them (theming)
cross-cutting so every later phase inherits both benches.

**12.1 Sample files.** Four synthetic recordings generated by
`scripts/generate-samples.ts` (seeded mulberry32, byte-deterministic)
and shipped INSIDE the bundle as `src/samples/*.gpx.ts` — no network
fetch, offline from day one: a 400-point ride with two time-gaps
(240 s SUSPECT + 1560 s SEVERE — repair + recovery), a 220-point
clean run (share), and a two-part commute 20 minutes apart
(merge). `makeSampleFile()` hands the tool's session the SAME `File`
an upload produces — identical pipeline, identical provenance rules,
file names that say "sample". The doors: "Try a sample ride/run"
under the upload zone (repair/share/recovery tool pages — passed
through SessionIdleView from the shell), "Try a sample pair" in the
merge intake, "Use example numbers" in the create form (5 unit at
6:00/unit = 30:00 — consistent in km AND mi, so the pace cross-check
always passes). Plan starts empty by design; the landing tiles stay
quiet (samples live at the point of intake — deviation from §EE's
"and landing tiles", recorded here).

**12.2 Dark mode.** The five Field Plot anchors became plain CSS
variables (`:root` + `.dark` swap) referenced through `@theme inline`,
so every Tailwind utility and alpha blend flips at runtime; the
graph-paper grid, keycap shadows, and MapLibre controls ride the same
vars. Dark palette: paper→#2E2E2E-equivalent surfaces, ink→light
warm gray, signal holds, signal-ink→#FF6A2B (the brand orange passes
4.5:1 on the dark background but only ≈4.0 on the dark card, so the
text tone stays just ahead of it). The `.dark` class is set PRE-PAINT
by an inline script in `layout.tsx` reading the raw key
`gpx-repair-studio.theme.v1` (light|dark|system) — no flash; the
store (`state/theme-store.ts`) and hook (`hooks/use-theme.ts`) keep
it in sync live, system mode following `matchMedia`. Toggle: the
footer's System/Light/Dark segmented chip.

The **map** in dark: OpenFreeMap has no dark style, so the basemap
is darkened at runtime (`lib/map/darken-style.ts`): after each style
load, plain string color paints are re-mapped per layer type —
fills/backgrounds compress to dark (L′=0.03+L×0.15, saturation
muted), lines sit lighter than fills (roads stay raised), symbols
flip to light text with dark halos; raster providers dim via
brightness/saturation paints; expressions pass through untouched.
Overlay layers re-theme through `lib/map/palette.ts` (light route
ink, light severity ramp, signal holds, white marker paper) —
`setDarkTheme()` re-applies the provider style, riding the same
style-swap machinery as a provider switch (mid-edit toggles safe;
one tile-reload flash is the accepted cost). The legend mirrors the
palette via the hooks facade.

**Decisions recorded:** the share stages (`bg-[#222222]`) and the
share card stay dark BY DESIGN in both themes — the stage is the
white-on-transparent artifact's backdrop, not app chrome (its
"shown on dark" pill is fixed `text-white`, not themed paper — the
VLM caught the first draft's `text-paper` breaking in dark).
The landing illustrations stay as-is: framed plates on the dark
bench read as mounted artwork (VLM: "intentional physical prints").

**12.3 Shortcuts & help.** `?` anywhere (guarded: text fields and
open dialogs never trigger) or footer → "Shortcuts & help" opens the
dialog: the keyboard map (`?`, Esc, Tab, D/M/P/C, map gestures) as a
CONTRACT — only bindings that ship — plus the where-everything-lives
guide. `help-content.tsx` notes that Phase 20's command registry
should become the single source.

**Verification:** 1311/1311 unit (+42: theme store/hook incl. the
pre-paint key contract, samples through the real parser + gap
detector, darken-style color math + layer walk, palette, help dialog,
toggle, footer; updated: upload-zone, session-views, info-content).
Playwright **131/131** (9 new in `e2e/phase12-quickwins.spec.ts`:
theme flip/persist/no-flash, `?`/footer/Esc + field-guard, repair +
share + merge + create samples; full-suite regression in 4 chunks,
one session-recovery flake re-verified 3× standalone). Live QA
(`scripts/phase12-live-qa.mjs`): theme class + color-scheme + pressed
state in both themes, mid-session map toggle both directions,
persistence across reload, zero console/page errors. VLM: dark
landing 9.5/10, dark workspace 9/10, help 9/10, share 9/9.5 — one
REAL defect caught and fixed (the share pill's themed text), one
hallucinated "critical overlap" in the help dialog DISPROVEN by DOM
probe (opaque `bg-background` panel; the artifact was a mid-fade
capture — the Task 56 animation lesson now encoded in the QA script
as a settle wait).


## GG. Phase 13 — Deep Validation & Repair Presets (Task 58)

Delivered per §EE 13.1–13.5. The app now *finds* problems, not just
fixes known gaps — and every fix rides a provenance-carrying working
copy that Phases 16 and 19 build on.

**13.1 Detectors** — `src/features/validation/deepValidate.ts` (the
plan's `src/domain/validation/` became `src/features/validation/` — the
codebase's established features/-for-logic convention; recorded here as
a documented deviation). Six checks, every threshold configurable and
session-scoped: speed spikes (130 km/h default — the teleport line the
25 km/h Phase-1 validator will not cross), near-duplicates (<1 m within
a window), non-monotonic timestamps, elevation outliers (both-sided
step + robust MAD z-score), stop-and-wander drift (sub-0.5 m/s runs
that stay within 10 m for 30 s+, untimed legs assume the 1 s cadence),
and missing-elevation runs (report-only). Findings aggregate per kind
with their point refs — the report lists them, the map jumps to them.

**13.2 The working-copy layer** — `features/validation/workingCopy.ts`.
The original stays immutable (§G); `applyWorkingEdits(original, log)`
derives an `OriginalTrackData`-shaped view every consumer can read.
Identity rule: an empty log returns the original *object* (effect keys
stay quiet for pristine files). Entries: point-deletion (ids stay
original-parse-stable — never renumbered, so gap anchors and repairs
keep joining; deleted anchors the merge already skips honestly),
segment-sort (stable by time, untimed sink to the end — disclosed),
elevation-override (point's `ele` replaced, `workingEle` provenance,
raw capture untouched). Segment extras re-anchor O(n). The working view
feeds the map route, the share card, the statistics, the segment list,
and the export; gap detection and the parse report stay on the original
(the details-row ValidationReport remains the immutable file's report —
the tools-column card is the living working-copy check; the split is
copy-explained).

**13.3 Report UI** — `components/gpx/deep-validation-card.tsx` leads
the tools column: severity-grouped issues with counts, jump-to-map
(`MapBinding.focusPoint` — camera focus, no persistent selection), the
expandable textual point list (§C-5 a11y equivalent, capped at 12 with
"+N more"), per-issue fix actions, the preset chips, and the change log
(label, reason tag, timestamp, "newest" marker, Undo-last). The stats
panel gains the "Modified:" disclosure; the export dialog and summary
disclose the working-copy counts.

**13.4 One-click fixes** — `features/validation/fixes.ts` plans every
fix PURELY (`FixPlan`: entries + touched points + what-would-change
lines) before anything exists. `components/gpx/fix-preview-dialog.tsx`
renders the plan's own words + the affected-points list; Apply writes
one `WorkingEdit` per plan (one undo step); Cancel changes nothing.

**13.5 Presets** — chains computed against the cumulative-log state
(detector → fix → re-detect): Drift cleanup (drift → dedupe), Dedupe &
sort, Resample (thin) — the plan's "Resample" ships as minimum-spacing
decimation: kept points stay byte-original, nothing interpolated; true
geometry-replacing resample belongs to Phase 16's surgery layer — plus
Spike & outlier sweep. Satisfied steps skip honestly.

**Persistence** — session-record schema v2: file records gain
`workingEdits` (tolerant read; v1 defaults to the empty log; the id
allocator re-arms on hydrate). The autosave gathers the log; the
restore prompt's detail line counts fixes ("1 fix (2 points)").

**Export honesty** — any working edit upgrades GPX 1.0 → 1.1 with
creator + note; the metadata note itemizes every change ("2 damaged
points were removed; 1 segment was reordered by timestamp (order is
estimated); 1 elevation was smoothed"); smoothed elevations carry
`<gpxr:modified reason="elevation" eleMethod="interpolated"/>` (new
schema vocabulary, re-import round-trips it verbatim).

**Verification (all green)** — detector goldens on the committed
synthetic `deep-defects.gpx` (one instance of every damage type; gap
detection stays quiet on it by construction) + hand-built edges;
working-copy round-trips (identity, immutability, extras re-anchoring,
undo); fix round-trips (each finding clears after its fix); preset
integration; store lifecycle; export round-trips (bytes, note, markers,
1.0→1.1, re-parse keeps fixes); card component tests. 1392 unit
(+81). E2E `phase13-validation.spec.ts` (9): report
grouping/counts/textual-list, camera-jump (bridge-asserted), the full
find→preview→fix→log→undo flow, the preset chain, stats labeling, the
export's downloaded bytes, and the schema-v2 reload restore. Full
regression 131/131 re-run in 5 chunks. Static export PASS. Live QA in
both themes at 1440 + 390: zero console/page errors. VLM: complete-card
9/10 SHIP (dark), preview 9/10 (light), stats 9/10 (light), mobile 9/10
— two early "critical clipping / missing section" claims were DISPROVEN
by measurement (scroll probe: the issue list scrolls 1194 px in a
352 px viewport, every row interactable; the "missing" CHANGES section
was a sticky-column capture artifact — at a tall viewport the VLM
itself scored the complete card 9/10 and called the list boundary
"expected behavior for a scrollable list"; the mobile "N button" is the
illustration's compass badge, the Task 56 artifact again).

**Decisions & deviations** (this section): features/validation path;
Resample-as-decimation with true resampling deferred to Phase 16;
details-report vs working-report split; jump-to-map as camera focus
without selection state; thresholds session-scoped (not persisted
preferences); one undo step per confirmed plan (preset steps come off
individually).

## HH. Phase 14 — Formats In & Out (Task 59)

**Story.** Every intake now speaks three languages: GPX (byte-faithful
as always), TCX, and binary FIT — auto-detected from magic bytes — and
every export offers four: GPX (full fidelity with `gpxr` markers), KML,
GeoJSON, and CSV, all carrying the provenance labels. hr/cad/watts
recorded by the device ride along as read-only passthrough, and the
whole thing stays 100 % client-side.

**What shipped.**

- **Sniffer** (`features/formats/sniff.ts`): one decision point for
  every intake. FIT magic (bytes 8..11, header 12/14) wins; XML roots
  are read past BOM/whitespace/comments/DOCTYPE (UTF-8 + UTF-16); the
  extension only steers, never overrides. Track-named XML with an
  unexpected root is routed to its parser so the error names the actual
  root ("Expected a `<gpx>` root element but found `<html>`").
- **TCX import** (`parse-tcx.ts`, via the shared `xml-walk.ts` helpers
  extracted from the GPX parser): Activity → track (Id/Notes/Sport),
  every `<Track>` → one segment, Course → track + CoursePoints →
  waypoints. Laps never cut geometry (they are time splits; the note
  says so). Position-less trackpoints (indoor/pause) are skipped and
  disclosed. hr/cad/watts → read-only `metrics` + a synthesized
  `gpxtpx:TrackPointExtension` raw child so GPX re-export emits them
  the standard way.
- **FIT reader** (`fit/reader.ts`, pure DataView): header + both CRCs,
  definition/data messages both endiannesses, compressed-timestamp
  headers (incl. the 32 s wrap), developer fields skipped, all base
  types with their invalid markers. Repair-tool semantics: a CRC
  mismatch decodes anyway with a warning; a truncated tail stops at the
  last good message; no positioned record at all → typed
  `malformed-fitness-file`.
- **FIT mapping** (`parse-fit.ts`): session → track (sport label,
  multisport partitioned by start times), records → ONE segment per
  session, courses → track + course-point waypoints, pause records
  skipped + disclosed, reader warnings surfaced as issues.
- **The pipeline** (protocol v2 + worker + client): the request carries
  the sniffed format + decoded text (XML) or bytes (FIT); the worker
  routes to the right parser, then the SAME validate → gaps → stream
  code runs. The three intake hooks switched `file.text()` →
  `file.arrayBuffer()`; the Phase 10 session restore upgrades for free
  (it replays the stored bytes).
- **Exporters** (`export-kml.ts` / `export-geojson.ts` / `export-csv.ts`
  over the SAME working copy + merge the GPX export writes): KML one
  placemark per track, one LineString per run, stats + provenance as
  ExtendedData; GeoJSON RFC 7946 FeatureCollection with per-track
  properties; CSV one row per trackpoint with the provenance column
  (recorded / estimated / modified) and optional hr/cad/watts columns.
  The pre-export dialog gained the format picker (GPX layout modes and
  pretty-print appear only where they apply; the download button names
  the format); the choice persists like every other export setting.

**The FIT decoder decision (the plan's in-phase gate).** Hand-rolled,
no dependency. `fit-file-parser@6.1.2` was vetted: MIT, maintained, but
~567 KB of ESM (a 439 KB profile table), ships an encoder we can never
use (FIT writing is a non-goal), and depends on the Browserify
`buffer` polyfill. A reading decoder is small because FIT is
definition-driven; only a ~40-entry field-number table is profile
knowledge (numbers verified against the package's generated profile,
then discarded). This matches the project's internal-module philosophy
(internal Vincenty, internal tokenizer XmlIo, custom draw layer) and
keeps the worker chunk lean.

**Honesty rules.** Converted points get *synthesized* raw captures:
`String(number)` coordinates (shortest round-trip representation —
FIT semicircles resolve to ~0.9 cm and no digits are invented), schema-
ordered ele/time children, and the `gpxtpx` extension for metrics. A
GPX re-parse of a converted export keeps the metrics as verbatim raw
extras (`parseGpx` deliberately does not populate `metrics` — that is
import-time passthrough, and the GPX parser stays byte-faithful). CSV
timestamps normalize to UTC (same instant, canonical spelling). KML/GeoJSON/CSV
disclose provenance the way each format can (ExtendedData / properties /
a column) with a note sentence that says exactly that.

**Verification.** 1477 unit tests (+85: sniff matrix, TCX goldens incl.
worker-tokenizer parity for every fixture, FIT hash-pinned fixtures ×
decoded goldens incl. the compressed wrap + truncation recovery, the
three exporters' goldens incl. the modified/estimated/recorded
provenance mix and the TCX metrics columns, protocol-v2 client
routing, the picker UI). 145 e2e (140 regression re-run in 9 chunks +
5 new: TCX import → deep-validation fix → export in every format, FIT
import → GPX + CSV with metrics, truncated-FIT recovery disclosure,
unknown-format typed error, intake accept contract). Typecheck +
eslint clean; static export PASS. Live QA: both themes + mobile, TCX +
FIT intake, all four downloads, 30/30 checks, zero console/page
errors. VLM SHIP on the picker (light 9/10, dark 9/10) and the TCX
workspace; two claims ("download button unreachable on mobile",
"missing stats dashboard") DISPROVEN by measurement (scripts/phase14-vlm-probe.mjs:
the dialog scrolls and the button enters the viewport after one
scroll; the summary card, stats panel, and map are all present and
visible — the known viewport-crop artifact from Tasks 56/Phase 13).

**Decisions & deviations.** GpxParseError kept its name (renaming the
parse-error vocabulary of every store/UI for cosmetics buys nothing)
and gained the intake kinds: `unsupported-format`,
`not-a-tcx-document`, `malformed-fitness-file`. The `conversion-note`
ValidationIssueKind carries the import disclosures. The picker landed
in the shared pre-export dialog (repair + recovery); the merge/create/
plan tools keep their GPX-only surfaces this phase — they have no
working-copy/merge narrative to disclose in other formats, and Phase
18's batch surface will revisit. Distance is never imported from
TCX/FIT recorded totals — always recomputed from geometry.

## II. Phase 15 — Stats Dashboard (Task 60)

**Story.** The repair studio stopped being only a fixer: every loaded
file now reads back its own numbers. Every kilometer (or mile) of the
route arrives as a split — distance, time, average pace, elevation
gain — the moving/stopped split of the timeline answers "was I
actually moving?", the elevation profile gained shading, a pointer
readout, and a keyboard cursor, and the whole dashboard ships out as a
long-format CSV or a printed sheet. All of it computed on the working
copy plus committed repairs — the same merge the export writes — and
all of it provenance-labeled.

**What shipped.**

- **Splits engine** (`features/statistics/splits.ts`, pure): one
  continuous walk over the merge's tracks with cumulative distance
  crossing track boundaries (the buildElevationProfile precedent).
  Each leg attributes distance AND time to the splits it overlaps,
  proportionally — linear time-over-distance interpolation inside a
  leg, the documented honesty rule. The leg vocabulary mirrors
  time.ts: reversed / gap / untimed legs contribute distance but no
  time and are counted per split (a split's time is partial → flags).
  Provenance per split: recorded (pure) / estimated (only
  reconstructed or reimport-marked points) / mixed (both). Elevation
  gain per split runs the SAME hysteresis deadband CONTINUOUSLY across
  the route, attributed where the climb realizes — Σ splits = file
  total; estimated elevation contributions flag the split.
- **Stopped time** (`features/statistics/motion.ts`, pure): a stop leg
  is 0 < Δt ≤ timeGapMs AND implied speed < 0.5 m/s (the constant is
  disclosed in the card; gaps are NOT stops — the device stopped
  writing, not necessarily moving). Consecutive stop legs merge into
  events (start, distance marker, duration, estimated flag when
  reconstructed legs are involved). Wall / moving / stopped / in-
  motion bookkeeping returned with the gap/untimed/reversed
  reconciliation.
- **The cards** (`splits-card.tsx`, `time-in-motion-card.tsx`): the
  pace-over-distance bar chart (one bar per split, height ∝ average
  pace, recorded ink vs signal orange for estimated/mixed, dashed
  baseline ticks for no-time splits) + the splits table with flags;
  the In-motion / Stopped summary blocks, the breakdown table, and the
  collapsible stop list. The split unit follows the persisted pace
  toggle — no new setting.
- **Elevation profile upgrades** (`elevation-profile-chart.tsx`): area
  shading under the curve (recorded neutral tint, reconstructed signal
  tint), a pointer crosshair with a live readout, a keyboard cursor
  (Arrow/Home/End on the focusable SVG + polite live region), and the
  collapsible profile table — the display series bucketed into ≤24
  distance intervals, disclosed as smoothed.
- **The sheet** (`statsCsv.ts` + `use-stats-export.ts`): a long-format
  CSV — section,label,value,unit,provenance,note — with meta (source,
  generated-at, app, split length), summary (totals incl. the working
  + repair disclosures), per-split, and stop-event rows; the RFC 4180
  escaper is the export-csv.ts one, reused. Print adds
  `printing-stats` to body: everything outside the stats region hides,
  a print-only masthead appears (file, date, "all processing local"),
  the palette re-pins to the light anchors (a dark-mode user still
  prints ink on white), and cards never split across pages.
- **Bounded DOM on huge files** (the §C-2 regression the 250k stress
  test caught): the splits table pages in steps of 60 rows with a
  disclosed "Showing X of Y — the stats CSV carries every one" (the
  Total row always reconciles over ALL splits); the pace chart draws
  every split but drops per-bar hover titles above 120 bars (sub-pixel
  targets) with a caption saying so.

**Verification.** 1534 unit tests (+57: split-math goldens — the
hand-computed constant-speed track, boundary-crossing attribution, the
partial last split, provenance via a synthetic merge, the no-timing
file; motion goldens; CSV structure; the component suites incl. the
DOM-cap and dense-chart contracts; the ≤24-interval profile-table
contract at both ends). 151 e2e (regression re-run in chunks + 6 new:
splits reconcile with the total + holes disclosed + unit toggle, time
in motion reconciles, profile readout/table/shading, CSV bytes, print
emulation with a stubbed window.print + afterprint cleanup, AxeBuilder
zero-critical). Typecheck + eslint clean; static export PASS. Live QA
(scripts/phase15-live-qa.mjs): both themes + print + mobile, 33/33
checks, zero console/page errors. VLM (scripts/qa/phase15/ + the
measurement probe scripts/phase15-vlm-probe.mjs): light 7/10, dark
7/10, mobile 4/10, print 7/10 — TWO claims CONFIRMED and fixed (the
profile table's bucket formula produced 161 near-identical rows on a
6.5 km route — now ≤24 intervals, locked by tests; the hover hint
leaked into the print sheet — now screen-only), the rest disproven by
measurement (chart/table counts match; dark muted text measures
5.03:1; no document-level mobile overflow — the wide table scrolls
inside its card by design; the SVG prints).

**Decisions & deviations.** Splits and stopped-time run over
exporter.merge (working copy + committed repairs) — the single-merge
rule the elevation rows and profile already use, so stats, export,
profile, and splits can never disagree about populations; card copy
discloses "computed on the route as it would export". The stats-sheet
actions are optional props on the shared StatsPanel (the merge and
recovery studios see no buttons — no working-copy narrative to
disclose there). The stop threshold is a named constant, not a
setting: 0.5 m/s, the same sub-walking pace the drift detector uses,
disclosed in the card. Phase 19's full repair summary builds on the
print path landed here.

## JJ. Phase 16 — Track Surgery & Input Freedom (Task 61)

**Story.** The working copy gained a surgery layer: split a segment at
a picked point, delete an A–B range, duplicate a segment, and
rearrange segments within their tracks — every operation previewed
with its own words, logged with a reason, and undone as one step. And
the keyboard-only milestone landed: points can be added, inserted,
moved, and nudged entirely by typing — a complete gap repair now runs
with zero pointer events, closing the v1-documented a11y limitation
("the canvas is the one mouse surface").

**What shipped.**

- **The surgery layer** (`features/validation/workingCopy.ts`, the
  Phase 13 interpreter extended): three new entry kinds.
  `segment-split` cuts a segment after a point — the tail moves to a
  derived segment (`{id}~s{n}`) in the same track, points keep their
  original-parse-stable ids, extras partition with their points and
  re-anchor piece-locally. `segment-duplicate` inserts a copy right
  after its source with point ids REWRITTEN to `{derivedId}:{i}`, so a
  later fix can address a copied point without aliasing the source.
  `segment-order` permutes the list (within-track moves only — the
  track structure is never crossed). Derived ids come from ONE shared
  per-run counter in log order (`~s1`, `~d2`, `~s3`…): replaying the
  same log — apply, hydrate, undo — always derives the same ids.
  Range deletion reuses the whole existing vocabulary: N plain
  point-deletion entries with reason "range". A post-sweep applies
  intents whose ids only exist after structural entries (a fix planned
  on a split piece or a duplicated segment's copied point).
- **The planners** (`features/validation/surgery.ts`): pure
  `FixPlan`s over the working view — entries, guards (split at the
  last point refused, ranges normalize order, orders must be true
  permutations, duplicates need points), and the what-would-change
  lines. `FixPlan.kind` widened to include the four `SurgeryKind`s so
  the FixPreviewDialog serves surgery unchanged — the same
  preview → confirm → logged → undoable ritual as every fix.
- **The surgery card** (`components/gpx/surgery-card.tsx`, the tools
  column between the deep-validation card and the draw editor): four
  operation chips; split and range select their points BOTH ways — a
  map pick (a new controller pick mode "point": one click on any
  recorded point, the classic 16 px rule, sequential picks for the
  range's A–B with same-segment enforcement) or typed point numbers
  with a live resolution line and a Jump button. Duplicate lists the
  working segments with per-row intents. Reorder drafts with
  within-track Up/Down buttons (no dragging — keyboard-native), then
  applies as ONE order edit. Picks and edits live in
  `use-surgery.ts`: entering a pick closes the draw editor (the
  startPickMode pattern), the editor's span picks cancel an armed
  surgery pick (one pick mode at a time).
- **Numeric entry** (`components/reconstruction/vertex-entry-list.tsx`
  in the draw panel, shared by the repair AND recovery studios): an
  add-by-coordinates form (always offered under the cap), per-vertex
  editable lat/lng inputs committing on Enter/blur, insert-after with
  a geodesic-midpoint prefill, and a focusable nudge handle per row —
  Arrow keys move the point by a configurable step (1/10/100 m,
  persisted in the ui-store; meters→degrees via the local
  approximation, longitude scaled by cos φ), Shift = ×10. A whole
  nudge run is ONE undo step (`drawModel.commitCommand` gained
  `{coalesce}` — a move onto a same-vertex move at the undo-stack top
  merges, keeping the run's start as `from`); typed commits never
  coalesce. The row inputs use the render-derived override pattern
  (external moves refresh the fields; no syncing effect).
- **16.3 validation** (`features/reconstruction/coordEntry.ts`):
  decimal-degrees grammar (DMS and scientific notation refused with
  the expectation named), bounds (|lat| ≤ 90, |lon| ≤ 180 — the error
  names the bound), >7 decimals rounded with a disclosed note (~1 cm,
  the export precision), and the nudge bounds predicate so a long
  arrow-key run can never walk a point off the world.
- **Honesty surfaces**: WorkingMeta gains split/copy/reorder counts —
  the stats "Modified:" note, the export dialog, the GPX metadata
  note, and every non-GPX exporter's provenance summary (KML,
  GeoJSON, CSV) itemize the surgery; the deleted-points sentence
  rewords to "(by fixes or manual range deletions)". Persistence
  stays schema v2: `isWorkingEdit` learns the new entry kinds and
  reasons; an older build rejects a record carrying them (the
  documented "discard, never guess" downgrade rule). AppShell's point
  resolver falls back to the working view so derived ids (a copy's
  rewritten `{derived}:{i}`) resolve for jump lists and previews.

**Verification (all green).** Surgery unit goldens: geometry + ids +
provenance (split pieces, split-of-split chains, duplicate id rewrites,
copied-point deletions/overrides/sorts through the post-sweep, order
permutations with unmentioned-ids tolerance, determinism — the same
log twice is JSON-identical, undo-by-log-slice, `workingMetaOf` mirror).
Planner guards and summaries; coordEntry grammar/bounds/rounding/
nudge math; coalescing invariants (runs merge, chains break on a
different vertex or a non-move, typed commits never merge); store
nudge (bounds refusal, one-undo runs); session-record round-trips for
every new entry kind + malformed rejections; component suites for the
card (chips, validation gating, pick fills incl. the cross-segment
refusal, reorder boundaries, preview-only-on-Confirm) and the vertex
forms (add/insert/move/Escape/nudge/step/cap). 1603 unit (+69). E2E
`phase16-surgery.spec.ts` (7): the card, split preview→confirm→undo,
range deletion→stats label→undo, duplicate in the export bytes
(coordinates twice + the note), reorder in list AND export bytes, the
map pick, and **the keyboard-only milestone — a full gap repair with
zero pointer events** (upload → editor → two points typed → nudge →
typed edit → commit → export, bytes verified). Full regression: the
151-test baseline re-run in chunks, all green (the keyboard spec's
Tab budget raised 60→120 — the surgery card and vertex forms added
legitimate keyboard stops; 2 session-recovery load flakes re-verified
standalone, the documented pattern). Typecheck + eslint clean; static
export PASS. Live QA `scripts/phase16-live-qa.mjs`: 22/22 in both
themes + mobile, zero console/page errors. VLM on the vertex forms and
the surgery card/preview: two claims CONFIRMED by measurement and
FIXED (the "Step" label gained its "Nudge" context; the insert form
is now indented + signal-accented, 12 px delta measured — it read as
identical to the append form); the rest DISPROVEN by the probe
(`scripts/phase16-vlm-probe.mjs`): the "truncated longitude" claim
measured 0 of 4 inputs clipping at full 7-decimal values, the chips
share one class expression (the active state is the pressed section —
the wrap was misread as demotion), and the preview footer is
right-aligned in code (the Phase 13 dialog, unchanged).

**Decisions & deviations.** (1) The plan's "(lat/lng/elevation/time)"
per-vertex forms narrowed to lat/lng: `DrawVertex` carries no
per-vertex ele/time (elevation = per-gap DEM samples, time = per-gap
strategy — both already have their own keyboard-driven forms), and
nothing downstream would consume a per-vertex value; recorded as the
honest narrowing rather than inventing dead model structure. (2) Range
deletion = N point-deletion entries rather than a new kind — the
entire existing vocabulary (apply, persistence, export, undo) serves
it, and the log's reason keeps the trail. (3) The reorder draft is
invalidated by a rows-signature mismatch (any working edit underneath)
but never by the user's own draft moves — the signature is captured
at draft start. (4) Derived-id deletions/overrides/sorts apply in a
post-sweep rather than inline replay: log order guarantees structural
creators precede their derived intents, and the sweep is
order-independent and O(∑|entries|). (5) True geometry-replacing
resample stays deferred (§GG) — the surgery layer it needs now exists.
(6) No new runtime dependencies.


## KK. Phase 17 — Road Snapping, Opt-In (Task 62)

**Story.** The realism upgrade gained a privacy architecture. Every
routing request is now consent-gated: nothing leaves the browser
until the user enables road snapping for the session — the draw tools
ask in plain language, the footer states the on state with the exact
hosts, and every fresh page load asks again. The one-shot **Snap to
road** command arrived: a straight-drawn line matches onto the road
network in a single whole-polyline request, previews on the very line
the map renders (with an honest distance delta), and applies as ONE
undo step that moves the geometry and the path style together. And
the router became configurable: point both path styles and the snap
at your own OSRM-compatible server, set in the privacy pane, with
self-hosting instructions in the README.

**What shipped.**

- **The provider abstraction** (`features/reconstruction/routerConfig.ts`):
  one user-settable OSRM-compatible base URL (a persisted preference,
  validated with plain-language errors, normalized defensively — path
  prefixes kept, query stripped); resolved endpoints — no custom URL:
  car → the public OSRM demo, foot → the public Valhalla demo (v1
  behavior); custom URL: BOTH profiles → `{base}/route/v1/{driving|
  foot}`. The configuration signature joins every router cache key,
  so one server's answers can never be served for another's. The
  hosts label (`routerHostsLabel`) is the single source the footer
  chip and the consent dialog quote.
- **The consent gate** (§EE 17.2, defense in depth): the HARD gate —
  `hooks/road-router.ts`'s shared router injects a fetch that refuses
  unless the session's consent is "granted" (whichever of the four
  draw hooks calls, no request can physically leave; the e2e asserts
  the provider's call count is zero before consent). The HONEST gate —
  all four leg-resolution effects (repair / recovery / create / plan)
  check consent BEFORE requesting: cached legs still render (a
  session restore keeps its road geometry, zero network), the status
  stays quiet, and the panels show the enable notice. Consent lives in
  the ui-store as TRANSIENT state (never persisted, never
  default-on — every page load starts "unknown"); the
  RouterConsentDialog (grant + manage modes) mounts once in AppShell;
  the SiteFooter carries the chip while granted — hosts named, one
  click from off.
- **The snap engine** (`features/reconstruction/snapEngine.ts` +
  `RoadFollowRouter.routePolyline`): the drawn chain's nodes
  (anchor → vertices → far anchor) reduce to a waypoint budget
  (Douglas-Peucker, endpoints pinned, ≤ 48) and route in ONE request;
  the returned geometry matches back to the nodes MONOTONELY (each
  waypoint resolves to the nearest geometry vertex at-or-after the
  previous match — providers snap waypoints, so matches are near, not
  exact) and slices into per-pair `RoadLeg`s — the same side-table
  vocabulary per-leg follow uses, so the PREVIEW rides the existing
  renderer: the map, the distance badge, and the closing preview all
  show the road path through the WYSIWYG join (no new map surface).
  The in-memory snap cache is keyed by the rounded-polyline hash
  (§EE 17.3 verbatim; persistence joins Phase 22). The preview box
  carries three honest numbers: your line as rendered (legs included),
  on the road, and the signed delta — each measured the way the user
  can verify it.
- **The apply** (`drawModel.setLineCommand` — the new `set-line`
  command): ONE undoable step replacing the vertices (the routed
  geometry reduced to ≤ 128 waypoints) AND the line's path style; the
  inverse swaps both snapshots (an absent style CLEARS the field — an
  undo of a snap on a never-styled line returns to straight, not to
  "car"). Both reconstruction stores sync the ACTIVE chip style on
  set-line commit/undo/redo (`styleSyncPatch`), and the recovery store
  gained the `submitCommand` twin. The applied line renders its exact
  road shape with ZERO re-requests: the apply seeds the side table
  with the waypoint slices PLUS the two anchor stubs (the honest
  few-meter stitches where the provider snapped the endpoints), and
  the router cache with all of it — every pair the leg effect will
  look up is a hit.
- **The shared machine** (`hooks/use-road-snap.ts`): one state machine
  for both reconstruction editors (repair + recovery; plan/create keep
  per-leg follow only — the §EE non-goal "only user-drawn
  reconstructions" scopes the snap to the reconstruction editors).
  The preview is keyed to the chain (a referentially stable token);
  staleness DERIVES at render (the context lives in state, the chain
  is a pure closure read) and the side-table restore is a store write
  in an effect — the react-hooks set-state-in-effect/refs discipline
  throughout. Apply re-checks staleness at event time.
- **Offline** (`hooks/use-online-status.ts`, `useSyncExternalStore`):
  the snap control disables WITH an explanation; freehand drawing
  never stops; routable chips keep v1's honest request-failure
  fallback.
- **Privacy/docs**: the egress table's routing row reworded (off
  until you say yes, re-asked every session; the custom-router
  option); "Choosing the providers" gains the Routing control — URL
  input + Save/Use-public-servers + honest validation errors; the
  README gains the consent + self-hosting sections.

**Verification.** +69 unit → 1672/1672: router-config (17),
snap-engine (16), set-line + both stores (9), road-follow extensions
(routePolyline request shape, rounded-polyline cache, Valhalla
multi-waypoint, custom-URL both-profiles, server-switch cache
isolation — 12), router-consent-dialog (7), panel consent/snap UI
(8); e2e phase17-road-snap 8/8 — the consent gate with the call
count ASSERTED zero before consent, decline, footer manage/revoke,
the snap flow (preview → apply → chip flip → ONE undo → straight
back, no re-requests), cancel, offline, custom router (the demo
server untouched), invalid-URL error. Full regression: the 158-test
baseline re-run green with `grantRoadConsent` added where specs
assert routing (road-follow, session-recovery). Typecheck + eslint
clean (two set-state-in-effect findings restructured into derivation
+ store writes, one ref-read finding into state); static export PASS.
Live QA 35/35 both themes + mobile, zero console/page errors. VLM on
the snap preview + consent dialog + mobile: 5 claims measured — the
dl misalignment, the "Privacy&Bdata" link, and the footer alignment
DISPROVEN (left edges identical, textContent correct, justify
flex-end); the mobile below-the-fold Apply CONFIRMED and fixed (the
preview box now reveals the sheet + scrolls into view; measured
applyBottom 870 → 728 within the 844 viewport); "Cancel is vague"
adopted as "Keep my drawing". Post-fix re-critique 8/10; the
remaining claims are the app-wide dialog hierarchy (ghost secondary)
and the deliberate honesty copy — settled by consistency.

**Decisions & deviations.** (1) The consent gate applies to ALL
router traffic, not just the new snap engine — v1 road-follow fired
network on the first leg with no gate; §EE 17.2's "no network call
before consent" closed that retroactively. (2) The plan's preview
"with distance delta (routed vs straight-line)" generalizes to the
RENDERED chain length (legs included) — a road-followed line re-snapped
shows Δ≈0 instead of a fabricated straight-line difference; the
straight-drawn case (the snap's target) is exactly the plan's
wording. (3) The snap engine lives in the repair + recovery editors
only. (4) The applied line keeps anchor stubs — the provider's
snapped endpoints stitch to the exact anchors (the WYSIWYG contract
every road leg follows). (5) The custom URL replaces BOTH profiles;
foot keeps Valhalla only on the default (public) configuration.

## LL. Phase 18 — Batch & Portable Sessions (Task 63)

**The story.** One file at a time is a tool; a folder of them is a
chore. And work trapped in one browser tab is work the user does not
fully own. Phase 18 closes both: a seventh tool — Batch cleanup —
queues up to fifty recordings, reports per file what the deep checks
find, runs one Phase 13 preset across the whole queue (previewed per
file before anything moves), and exports one ZIP whose manifest states
exactly what changed in each file; and the sessions layer turns work
into a possession — named shelves in this browser, and a versioned
`.gpxrepair.json` document that carries the whole session (the
original bytes, every fix, every drawn repair, the view) anywhere.

**What shipped.**

- *18.1 The queue* (`state/batch-store.ts`, `hooks/use-batch-session.ts`,
  `components/batch/`): a 50-file ceiling with an honest refusal (the
  split returns, nothing silently dropped), sequential parsing through
  the real pipeline (one at a time — the Phase 9 worker's contract),
  per-file statuses in the plan's own vocabulary (queued / reading /
  parsed / issues found / fixed / clean / failed), failed files keep
  their typed error and never block the rest, and the studio's
  aggregate line counts everything from derived views — never a second
  computation. No map by design: the batch is a table workflow; the
  repair studio stays the per-file surface.
- *18.2 Batch operations*: the Phase 13 preset chips run across every
  parsed file through the SAME `planPreset` (shipped deep-check
  defaults — the recorded scope decision), each previewed per file in
  the FixPreviewDialog's plural twin ("nothing to do" stated plainly
  for no-op files) before one Confirm applies each file's chain as its
  own edit list (one undo step per fix, the working-copy rule). The
  ZIP (`features/batch/batchZip.ts` + fflate's sync `zipSync` —
  vetted, pure JS, static-export safe) carries one repaired GPX per
  file, exported through the SAME pipeline a single-file export runs,
  plus `MANIFEST.txt` whose per-file sentences reuse the working-meta
  counts the GPX repair note carries. Duplicate stems get " - 2"
  suffixes; unedited files export byte-identical to the identity
  export and the manifest says so.
- *18.3 Portable sessions* (`lib/storage/portable-session.ts`): the
  versioned document embeds the same `StoredSessionRecord` Phase 10
  persists (one capture layer, two homes) plus the ORIGINAL bytes —
  XML as UTF-8 text, binary FIT as base64 through a pure codec (no
  btoa) — with a read-side version ceiling (discard, never guess).
  Export-from-the-session is one click in the sessions manager;
  open-from-file re-enters through the ONE restore path
  (`hooks/restore-session.ts` — the Phase 10 sequence extracted and
  shared, so an IndexedDB restore, a shelf open, and a file open are
  the same code).
- *18.4 The sessions manager* (`lib/storage/sessionStore.ts` DB v2's
  `saved` store, `hooks/use-saved-sessions.ts`,
  `components/shared/sessions-manager.tsx`): save the current work
  under a name (the SAME capture + WORK predicate the autosave uses —
  exported from use-session-recovery so the two can never disagree),
  list newest-first with rename / export / delete-confirm / open, and
  import a `.gpxrepair.json` onto the shelf. Named saves are explicit
  snapshots; the Phase 10 autosave stays the crash net — coexisting
  by design. The door is always in the header, plus the landing's
  "Continue a saved session" link.

**Verification.** Unit +34 (→ 1707): the queue state machine (cap
split, never-reused ids, status transitions, the edit log as undo
stack, the studio gate, reset), ZIP integrity (fflate round-trip
byte-identical, name suffixes, the manifest's counts agree with the
export's own note, the applied-preset line), portable goldens (record
verbatim + bytes byte-identical for text AND base64 sources, the
version ceiling, every typed error, RFC 4648 vectors), and the saved
store (CRUD, newest-first, drifted shapes skipped, the latched
failure contract). E2E phase18-batch.spec.ts 6/6: statuses → aggregate
→ preview → apply → undo → the downloaded ZIP unzipped and its
manifest asserted; the cap refusal; the portable round-trip (export →
reset → open → fix log + file name back); save/rename/delete; the
foreign-file refusal. Full regression re-run in chunks; the
landing-tile counts updated for the seventh door (smoke,
session-views, recovery-ui — three specs' six became seven). Live QA
(scripts/phase18-live-qa.mjs): both themes + mobile, 22/22 checks,
zero console/page errors. VLM (scripts/qa/phase18/ + two probes):
batch studio 7/10, manager 8/10, mobile 7/10 — every measurable claim
DISPROVEN by pixel/DOM measurement (chip offsets identical at 11px,
chip→name gaps identical at 8px, the error row keeps 13px padding
with scrollWidth == clientWidth, the dialog overlay covers the map at
z-50, no "compass button" exists in the mapless batch section — a
hallucination the pixel scan refuted); the header title's mobile
truncation is the app's existing design. Known observation recorded
for a future pass: the shared dialog close button's 16px hit target
(shadcn chrome, every dialog, not a Phase 18 surface).

**Decisions & deviations.** (1) Batch exports GPX only — the
full-fidelity format; KML/GeoJSON/CSV stay single-file features (the
manifest discloses per-file changes, and the settings honored are the
persisted mode/pretty chips exposed in the batch export card). (2) A
queue is not a session: batch has no named saves, no autosave record,
and no share view — the shelf is for repair / recovery / create /
plan (merge stays excluded by the Phase 10 gate). (3) The batch's
deep checks use the shipped defaults — tuning an individual file is
the repair studio's job (the preset card says so). (4) The portable
document embeds ORIGINAL BYTES, never a re-serialization — a reopened
session re-parses exactly what was uploaded. (5) Open-session-file
replaces the current session exactly like an upload does (the
manager's copy says so) — no merge-on-open, by design. (6) The
seventh landing tile centers on the desktop grid's third row (a
deliberate full stop under the six, `md:[&>li:last-child]:col-start-2`).

## MM. Phase 19 — Compare, Summaries & Guided Flows (Task 64)

**The story.** Trust needs two things the app did not yet give: a way
to SEE what changed, and a way to take the record with you. Phase 19
closes both — plus the deeper onboarding the seven tools earned. The
Before/after card overlays the immutable original as a dashed ghost
under the working copy (the stretches the edit log touched, in
signal), lays the two track pictures side by side at one shared
scale, and counts the differences in a delta table whose numbers ARE
the statistics panel's numbers. The repair summary turns that into
paper: every modification kind with its count and its honest
disclosure, the applied-fix history, and a static SVG snapshot of the
track — one sheet per file, one table per batch. And every tool now
owns a 3–4 step task-based walkthrough, replayable from the help
dialog, whose first step can load the Phase 12 teaching sample
through the same pipeline as an upload.

**What shipped.**

- *19.1 Before/after compare* (`features/compare/` +
  `hooks/use-compare.ts` + `components/compare/`): the pure
  `buildCompareStats` joins the original side (the SAME
  `originalDistanceStats` / `originalTimeStats` / identity-merge
  `buildElevationStats` the outcome side runs — never a second
  arithmetic) into four rows — points, distance, moving time, gain —
  each with a signed delta and a provenance word from the sanctioned
  vocabulary plus "Modified" (the plan's estimated/modified flags);
  unavailable inputs render "—" with their reason, never zero. The
  OVERLAY renders the original through the same `buildRouteView` the
  working copy uses (gap breaks agree) as `gpxr-ghost` (a dashed,
  theme-aware gray under the route) with the edit log's changed
  stretches as `gpxr-changed` (signal dashes) — pure
  `buildChangedSpans` resolves deletions/overrides to their
  neighborhoods (adjacent spans merge, kinds rank), sorts and
  structural entries to whole segments, and skips derived ids rather
  than guessing. The mode lives in `state/compare-store.ts` (a
  store, because the map binding needs the overlay before the draw /
  elevation bindings exist — AppShell builds it with the pure
  `buildCompareOverlay` at the top of the tree); a new file resets
  it. SIDE BY SIDE opens a dialog with two static SVG snapshots built
  against ONE shared bounds (identical viewBox — shapes truly
  comparable), re-constructions included, ghost under the after
  picture. The legend gains its two entries only while the overlay is
  on (the encoding contract stays honest about what is drawn).
- *19.2 Repair summary / print-PDF* (`features/compare/repairSummary.ts`
  + `trackSnapshot.ts` + `batchSummary.ts`): the provenance table
  counts every modification kind from the SAME working-meta
  vocabulary the GPX repair note and MANIFEST.txt use — filtered /
  estimated (smoothed) / sorted / structure (split, copy, reorder) /
  authored (reconstructions) / snapped (road-follow legs of committed
  repairs) / skipped gaps / re-imported markers — zero-count kinds
  omitted, each row carrying its disclosure, plus the applied-fix
  history in log order. The snapshot is a dependency-free SVG string
  builder (equirectangular with a cos(mid-lat) scale, simplify-capped,
  lines broken at damage AND gap boundaries exactly like the map's
  join — the unknown stretch is never drawn as recorded line, even in
  a thumbnail). Print is the Phase 15 flow's twin: `printing-summary`
  on body, a mutually-exclusive print-region rule in globals.css
  (each sheet hides the other regions — the stats sheet never bleeds
  into the summary sheet), the light-anchor palette re-pin, and a
  print-only masthead. The PER-BATCH variant
  (`components/compare/batch-summary-section.tsx` + the binding's
  pure `summary` join) prints one row per file — numbers, working-
  meta counts, preset, and a 168×84 thumbnail — with failed files
  listed honestly and the aggregate line up top.
- *19.3 Per-tool guided walkthroughs*
  (`components/layout/tool-tour.tsx` + `hooks/use-tool-tours.ts` +
  the tour-flag store's per-tool key): seven tours (repair, share
  card, recovery, create, merge, plan, batch), 3–4 steps each in the
  onboarding tour's voice, the copy a contract as everywhere else.
  A step may carry an ACTION that loads the tool's teaching sample —
  `makeSampleFile` through the SAME `loadFile` / `addMergeFiles` /
  `loadRecoveryFile` / batch-enqueue pipelines as an upload, shown
  only while the AppShell says it can run (a sample never replaces
  open work). The first visit to a tool offers the tour as a
  dismissible STRIP above the workspace — never a modal over
  someone's file; dismiss remembers exactly like finishing. Replay
  lives in the help dialog's new "Guided walkthroughs" section (one
  dialog at a time — help closes first). The e2e storageState seed
  marks every tool seen so the existing 174 specs never meet the
  banner; the tour specs opt out per-test like the onboarding spec.

**Verification.** Unit +71 (→ 1778): compare-math goldens (pristine
zero-deltas, deletion deltas with the modified flag, sorted-order
estimated flags, repair distance folding into the after side, the
null-honesty rules), changed-span derivation (neighborhood marking,
adjacency merging, kind ranking, whole-segment sorts, derived ids
skipped), the SVG builder (structure, determinism, layer order,
shared-bounds viewBox equality, gap-break honesty, damage skipping),
the provenance table (kinds, counts, disclosures, history order,
skipped-not-counted), the batch summary (rows, failed-file honesty,
aggregate reconciliation), the flag store (accumulate, corrupted-value
degradation, blocked-storage no-nag), the controller (offer follows
the tool, dismiss remembers, next/back/close, runAction advances),
and the components (delta table, mode control, dialog panels, summary
blocks, help list). E2E +10 (→ 184): phase19-compare 5/5 (the honest
pristine delta table; the overlay through the controller's test
bridge — layer ids, ghost/changed counts, the off toggle — plus the
legend entries and a real confirmed fix making the changed stretches
appear and the delta count them; side-by-side shared scale + Esc back
to off; print emulation with the stats region excluded while the
summary prints and afterprint cleanup; axe clean) and
phase19-tool-tours 5/5 (the help list starts tours one-dialog-at-a-
time, step navigation + flag writing + replay, the sample action
loading through the real pipeline, the offer's dismiss remembering, a
later visit staying quiet). The accessibility spec's workspace scans
gained `revealSettled` (the Task 53 rule) — the compare card made
the details column sit further below the fold, and a scrubbed
scroll-reveal reads as phantom low-contrast text under full-suite
memory pressure (verified against a HEAD worktree bisect: baseline
pass, flake only under load; the sanctioned fix applied to all four
workspace scans). Full regression re-run green. Live QA
(scripts/phase19-live-qa.mjs): both themes + mobile, 34/34 checks,
zero console/page errors — the ghost/changed counts through the live
map bridge (a `ghostPaint` observable added to it for the theme
assertion), the shared-scale viewBox equality, both print flows under
emulated media, and the mobile offer banner's fit. VLM
(scripts/qa/phase19/ + three probes): two critique passes over eight
screenshots; every measurable claim DISPROVEN by pixel/DOM
measurement (header/cell alignment identical to the pixel, panel
padding symmetric at 1px, sub-label contrast 7.57:1, the "orphaned
sentence" the manual-repairs card's complete intended copy); one
honest observation ACCEPTED — on a pristine file the ghost sits
exactly under the working copy, and the overlay note now says so
explicitly.

**Decisions & deviations.** (1) The compare overlay is OFF by default
and resets per file — the map shows the app's normal encoding until
the user asks for the ghost (the legend then says so). (2) Side-by-
side is static SVG, not two WebGL maps — one shared scale, printable,
cheap to open over the live workspace (a second map instance under
the sandbox's RAM ceiling was the rejected alternative). (3) The
delta table's after side reuses the outcome banner's arithmetic
(working-copy totals + the repair join) so the compare card, the
stats panel, and the export can never disagree. (4) The offer is a
strip, not a modal — a tour must never cover someone's open file.
(5) Tour actions only run when the tool has no data to lose; the
button hides otherwise (the copy stays truthful in both states).
(6) The repair summary prints the delta table, the provenance table,
and the snapshot in one region — the plan's "stats" wording is the
before/after numbers, not a second statistics sheet.


## NN. Phase 20 — Command Palette & Shortcuts (Task 65)

Delivered per §EE 20.1–20.3, plus the mode-switching fix the user
reported alongside (its own commit, `3029a12`).

**20.1 Command registry** — `src/features/commands/registry.ts`
(pure): every action the app ships as a `CommandDef` (id, label,
group, keywords, optional primary + equivalent shortcut, scope
`global` | `editor`, and a `when` availability predicate over a small
serializable context). The seven tools' front doors, the sessions
door, the editors' D/M/P/C accelerators (owned by the editor hooks;
recorded here), the undo/redo pair, the three theme preferences, the
help/about/privacy doors, and the seven tool-tour replays. Pure
helpers: `fuzzyScore` (subsequence with word-boundary + contiguity +
starts-with bonuses), `filterCommands` (availability + ranking),
`bindingId`/`formatShortcut`/`matchesBinding` (platform-agnostic
modifier: Ctrl OR Cmd), `findShortcutConflicts` (per scope — the
audit), and `cheatSheet` (the help dialog's keyboard map, generated).
Components reach the registry only through `useCommands` facades (the
ESLint feature boundary).

**20.2 Palette** — `components/layout/command-palette.tsx` on cmdk
(the shadcn Command primitive): Ctrl/Cmd+K opens it anywhere except
over another open dialog (the "?"-key discipline; the chord toggles
it closed), arrows/Enter/Esc drive it, Radix Dialog traps and returns
focus, cmdk provides the listbox semantics (axe-clean). Fuzzy
filtering is the registry's own `filterCommands` (one implementation,
unit-tested; cmdk's `shouldFilter` off) and — a real defect the live
QA caught — the GROUPED no-query view runs through the same filter,
so availability gates both views identically. Recent sessions join as
their own group (the four most recent shelf rows, restorable through
the manager's one restore path). `useCommands`
(`hooks/use-commands.ts`) binds ids to live actions: navigation via
the landing store, theme via the theme store, dialogs and tours via
shell callbacks, and the editing family ROUTED to the active editor
store (repair/recovery/create/plan).

**20.3 Shortcut audit** — the remaining major actions bound without
conflicts: Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z / Ctrl+Y (redo)
route to the active editor, never firing while focus sits in a text
field (native input undo always wins). The registry records every
binding (including the display-only Esc/Tab/Ctrl+K entries the
primitives own natively); `findShortcutConflicts` is unit-tested
against the shipped registry (clean) and against a seeded collision
(detected). The Phase 12 help sheet is now GENERATED from the registry
(`cheatSheet` through the `useCommands` facade) — the "only bindings
that ship" contract enforced by construction; the hand-maintained
table and its Phase 20 migration note are gone.

**The mode-switching fix (commit `3029a12`, the user's report).** The
drawing mode (Roads / Footpaths / Straight) was a whole-LINE setting:
switching it re-resolved every placed segment's road legs under the
new profile, cleared them on Straight, and tore down the draw session.
The mode is now a property of each SEGMENT: `DrawVertex.legStyle`
(stamped at draw time; mid-list inserts inherit the split leg's style;
drags keep it), `RoadLeg.mode` (profile-tagged lookups — car and foot
legs for one pair coexist), `joinStyledChain` (the single per-segment
join every consumer runs), per-pair leg resolution in all four editor
hooks (a chip switch rebuilds nothing and never invalidates in-flight
legs), the closing segment following the LAST drawn mode, the whole-
line snap preview overriding styles while on screen, and a legacy
fallback that renders pre-fix sessions unchanged. The panels say it
out loud: "New points follow … Each segment keeps the style it was
drawn with — switch any time, nothing you placed redraws."

**Verification:** +47 unit (23 registry — integrity, audit, binding
identity/matching, fuzzy ranking, availability, the generated sheet;
7 palette component — groups, filter, run/restore, listbox semantics,
fresh-open reset, availability in both views; 17 mixed-mode segments
— the fix's own matrix) → 1825 total. +7 e2e (5 phase20: open/search/
navigate, the no-stack rule, the audited undo/redo pair + native text
undo, axe, save→Recent sessions→restore; 2 mode-switch preservation:
the plan editor's Road→Foot→Straight→Road geometry preservation and
the repair editor's closing-follows-last-mode) → 191 total, full
regression re-run in six chunks, all green. Static export PASS.
Live QA `scripts/phase20-live-qa.mjs` 22/22 (both themes + mobile,
zero console/page errors — and the grouped-view availability defect
above was ITS catch). VLM: three critiques (light palette, dark search
view, generated cheat sheet); every measurable claim DISPROVEN by
`scripts/phase20-vlm-measure.mjs` (the Redo chips align at center
delta 0, "Double-click" does not wrap (25.5 px = single-line), the
Scroll/Pinch gap is 4 px, the Everywhere rows sit at a uniform 31.5 px
rhythm).

## OO. Phase 21 — Internationalization (Task 66)

**Objective:** open the tool to non-English users.

**The locale set (the §EE 21.3 decision point):** English (the
source language, the static export's prerender locale) + Simplified
Chinese (zh-CN) — the language of the requesting user and the audience
most likely to need a privacy-first, locally-running GPX tool in their
own language. A third "locale", `pseudo`, is not a language at all:
it is the §EE 21.4 expansion harness, reachable only through
`?lang=pseudo`, never offered in the picker, never persisted.
Adding a real locale later is one dictionary file + one registry
entry — the architecture forecloses nothing.

**21.1 Extraction.** All UI copy now lives in typed dictionaries:
`src/i18n/dicts/en/<domain>.ts` (sixteen domains — common, layout,
toolpages, repair, reconstruction, recovery, create, merge, plan,
statistics, compare, share, batch, map, shared, help, tours, shell,
hooks, commands), merged in one index whose `MessageKey` union types
every `t()` call at compile time. English values moved VERBATIM —
byte-identical rendered text was the contract that kept the whole
existing test corpus green through the migration (~140 component/hook
files rewritten by a nine-agent extraction wave against a written
pattern protocol, `docs/i18n-extraction-pattern.md`). The lint half:
`no-restricted-syntax` selectors in `eslint.config.mjs` forbid JSX
text and text-bearing prop literals across components/hooks/state/app
(the dormant shadcn boilerplate in `ui/` is excluded, documented);
the rule shipped clean after fixing fourteen genuine stragglers it
caught (the last of a long tail the wave missed).

**21.2 Runtime.** No i18n framework — the whole runtime is ~150
lines: pure `translate(locale, key, params)` with `{param}`
interpolation and English fallback, a module-observable locale store
(theme-store pattern: `?lang=` override > the persisted raw key
`gpx-repair-studio.locale.v1` > English — never OS sniffing, never a
persisted pseudo), and `useI18n()` through `useSyncExternalStore`
whose getServerSnapshot returns English so hydration matches the
prerender exactly (React's designed post-hydration snapshot swap
settles the locale in place — no mismatch errors, at most one English
frame for a Chinese user, the same trade the theme made with
classes). The pre-paint script in `layout.tsx` stamps `<html lang>`
before React exists, so assistive tech hears the right language from
the first accessible paint. The footer carries the picker: the theme
toggle's twin segmented chip (EN / 中文 endonyms), with a switch toast.

**21.3 Locale-aware formatting.** `lib/utils/format.ts` follows the
active locale AT CALL TIME (unit words 公里/米/英里/公里/时, Intl
number grouping, zh-CN date-time forms; English output byte-identical,
pinned by tests). Exported artifacts are the exception BY DESIGN:
the share card's canvas text, the GPX notes, MANIFEST.txt, and
CSV/KML stats render through `artifactFormatters` — an artifact's
words must not depend on the machine it was made on.

**The labelKey pattern (the domain half).** Domain code never calls
translate; it emits KEYS. `FixPlan.label`/`summary`, surgery labels,
repair-summary rows, compare stat rows, session-record descriptors,
elevation privacy notes, router-URL rejection reasons, snap-profile
words, export-format hints, and sample summaries are all
`LocalLabel`s — `{ key, params }` resolved at RENDER (a mid-session
locale switch re-renders every stored label), while PLAIN STRINGS
from pre-21 sessions render verbatim forever (the session-record
validator accepts both; old work stays readable). The command
registry carries `labelKey` + per-command zh search aliases
(`cmd.kw.*`) merged with the English keywords — Chinese queries and
English power-user queries both find every command (e2e-proven).

**21.4 The pseudo harness.** A deterministic transform
(`src/i18n/pseudo.ts`): every word grows by a third of its own
length (ø fillers), the whole message wraps in ⟦ ⟧, `{param}`
placeholders pass through untouched. It exists to prove the layout
survives a ~33% copy growth before a real long-string locale ships.

**Verification:** 1867/1867 unit (the +42 i18n tests: the runtime's
interpolation/fallback/param-parity, the locale store's resolution
order + persistence + hydration snapshot, the pseudo transform, the
format contract en/zh, the localized registry — and THE GATES: every
locale carries exactly the English key set with exactly the English
`{param}` vocabulary per key, no empty values, no cross-domain
duplicate keys; compile-time too — every locale file satisfies the
source dictionary's key type). +8 e2e `phase21-i18n.spec.ts`
(toggle + persistence + round trip, ?lang= direct loads for zh and
pseudo, unknown-lang degradation, pre-paint lang stamping, bilingual
palette search, Chinese tool-page teaching, axe-clean zh) → 199
total; full regression re-run in nine chunks — one load flake
(phase17 consent chip, green standalone) and ONE REAL BUG found and
fixed (the long-press announcement referenced a key that had never
been added; the fallback rendered the raw key — exactly what the
fallback is for, and exactly why the test existed). Static export
PASS. Live QA `scripts/phase21-live-qa.mjs` 28/28 (both locales ×
dark + mobile, zero console/page errors, the pseudo harness with
real expansion and zero horizontal overflow). VLM: six critiques
under the expansion harness and on the zh surfaces (light/dark/
mobile); all ten measurable claims DISPROVEN by
`scripts/phase21-vlm-measure.mjs` — pseudo rows perfectly even
(344×3 + 325×3, spreads 0), zero clipped blurbs, no overflow, the
"overlapping icon" lives inside the artwork itself, and the accused
dark-mode contrast measures 5.03:1 (AA passes; the model guessed
#888, reality is lighter).

**Decisions recorded here:**
- Brand names never localize: the wordmark stays "GPX Repair Studio"
  in zh (dict-held so the contract stays uniform); the locale picker
  shows endonyms ("English" / "简体中文") in every language.
- Exported artifacts stay English (GPX notes, MANIFEST.txt, CSV/KML,
  the share card — Montserrat has no CJK glyphs and the card's visual
  identity is not a Phase 21 concern; `artifactFormatters` pins them).
- `presetName` and file-name bases stay canonical English in storage
  and manifests; UI labels translate through keys — the two can never
  drift apart silently.
- The elevation provider's ATTRIBUTION stays canonical (a credit
  line is the provider's own statement); its PRIVACY NOTE localizes
  (the user deserves the disclosure in their language).
- Two latent copy bugs fixed during extraction, both test-pinned
  before: the landing subline said "Six tools" with seven tiles on
  screen (Phase 18's seventh door never updated the hero), and the
  reorder-surgery label had an inverted plural ("1 moves / 2 move");
  the en dictionary carries the corrected forms, the pinned tests
  updated with them.
- Non-goals held: no RTL locales, no machine translation of user
  data. Per-locale prerendered routes (killing the one-frame English
  settle for zh) are recorded as a Phase 22+ candidate.

## PP. Phase 22 — Offline PWA & persistent caches (Task 67)

**Objective:** install it, use it in the mountains, never wait
twice — the closing phase of v2.

**22.1 Manifest + icons.** `src/app/manifest.ts` (the metadata
route, `/manifest.webmanifest`): standalone display, `/` start and
scope, and the exact sRGB render of globals.css's light
`--background` (`#F1F1F2`) as both chrome colors — computed by the
same script that rasterizes the icons, so the window chrome and the
page can never disagree. The dual-theme half the plan asked for
lives in layout.tsx as the pair of `prefers-color-scheme`
`<meta name="theme-color">` tags (light `#F1F1F2`, dark `#151516`):
a manifest cannot switch on the OS theme; the metas can. Icons are
the route mark itself (public/logo.svg), rasterized
deterministically by `scripts/generate-pwa-icons.mjs` (the repo's
own Playwright Chromium against a file:// page): 192 + 512 "any"
plus a 512 maskable with the mark held inside the 80% safe zone on
a full-bleed signal field.

**22.2 The service worker.** Hand-rolled `public/sw.js` — no
framework, no dependency. PRECACHE: `scripts/build-pwa.mjs` (wired
into `npm run build`) walks the standalone output and writes the
served-only `/precache-manifest.json` — every content-hashed
chunk, every public asset, `/`, the manifest route, and the icon
route (71 URLs on the current build). Install fetches them all
with `cache: "reload"`; ONE failure fails the install, so an
update can never half-land — the old version keeps serving.
RUNTIME: stale-while-revalidate for same-origin unhashed assets
(fonts, the MapLibre worker, share-card art) — with two hardening
twists the plan's words didn't spell out: reads fall through to
the PRECACHE (an asset precached but never requested online must
still serve), and revalidation is skipped while
`navigator.onLine` is false (no doomed background fetches; offline
degrades to cache-first). TILES: cache-first on exactly the two
egress-table tile hosts, capped at 800 entries with a count-based
trim — the one deliberate deviation from SWR, because
revalidating immutable tiles would double the bandwidth of exactly
the mountain trips this phase exists for; routing and elevation
APIs are never touched by the worker (consent gates stay exact).
NAVIGATIONS: network-first with the precached app shell as the
offline fallback. The update contract: the build script appends
the real `self.BUILD_ID` (a digest of the asset list) to the
served sw.js — byte changes are the ONLY update signal a browser
has — and the new worker, once precached, WAITS. The registrar
(`sw-registrar.tsx`, production-only, `updateViaCache: "none"`)
sees the waiting worker and ASKS: the update toast with a Reload
action, `duration: Infinity` (a consent prompt never vanishes on a
timer), and the reload fires only on that click through
SKIP_WAITING → controllerchange. Nothing ever swaps mid-edit.

**22.3 Persistent elevation terrain.** The Phase 6 LRU gained a
durable twin: `PersistentElevationCache`
(features/elevation/persistent-cache.ts — pure, injectable backend,
§F-clean) extends the in-memory LRU with a debounced write-through
and a boot-time hydrate (newest-first, memory wins on conflict,
corrupt entries dropped). The browser backend
(lib/storage/elevationCacheStore.ts — `gpx-repair-studio.elevation`
v1, one `points` store) follows the sessionStore failure contract
exactly: no IndexedDB, blocked databases, quota errors — the first
failure latches persistence off with one warn, every later op is a
silent no-op, and the in-memory cache (therefore every feature)
behaves exactly as in Phase 6. Both layers cap at 5,000 points
(the Phase 6 constant); the persisted trim evicts oldest by write
time. Persistence recency is WRITE order, honestly documented —
reads refresh the memory LRU only. All four elevation surfaces
share the one provider, so the persistence landed in exactly one
place. The privacy pane's storage section gained the two Phase 22
rows — the terrain cache (with its live point count, read from the
real database) and the worker's three caches — each with a Clear
button and an inline confirmation; clearing the offline caches
also unregisters the worker, so the next online visit re-installs
and re-downloads exactly what it needs.

**22.4 The offline proof.** `e2e/phase22-offline.spec.ts` boots
the PRODUCTION standalone server on its own port (the dev server
must never be worker-controlled), warms the whole repair journey
online (upload, map fit, tiles settled), cuts the network
(`context.setOffline`), reloads — the app comes back from the
worker's precache — and then completes a full repair + export:
upload, gap detected, two vertices TYPED (the Phase 16
keyboard-only path — the map test bridge is production-gated by
design, and numeric entry needs no pointer and no router), commit,
GPX download with the typed geometry marked `gpxr:reconstructed`.
THE COUNT: from the moment the network is cut, zero page-attributed
requests fail at the network layer. Worker-internal probes are
excluded by attribution (`request.serviceWorker()`) — they ARE the
offline machinery. One console signature is excluded by design:
an unviewed tile answered with an honest 503 (MapLibre marks it
errored and RETRIES when the network returns; a 200-empty tile
would cache as permanently blank terrain — a lie). Its companion
`phase22-update.spec.ts` deploys a real build-id change to the
served sw.js and proves the whole contract: the toast asks, an
in-progress flag survives the wait (no silent reload), the Reload
click reloads exactly once into the new version, and no toast
fires again.

**Verification:** 1889/1889 unit (the +22: the persistent cache's
write-through/coalescing/hydrate-order/cap-eviction/latch
contract, the withCache decorator compatibility, and the manifest's
installability fields pinned statically — the Lighthouse
criteria at millisecond cost); +2 e2e → **201 total**, the full
regression re-run in five chunks against the dev server (the two
Phase 22 specs boot their own production servers; one real find:
the batch run exposed a tile-warm timing window, fixed with a
2-second settle and the documented 503 exclusion). ESLint clean,
tsc clean, static export PASS (`npm run build` now carries the
PWA step: 71 precache URLs, build id baked). Live QA
`scripts/phase22-live-qa.mjs` 25/25: the manifest fetched and
field-checked, all three icons served at their TRUE PNG-header
dimensions, the served worker's BUILD_ID matched to the generated
manifest, precache spot-checks 200, the document's manifest link +
dual theme-color metas, the elevation database opening on boot,
the offline reload, the privacy pane reading a REAL seeded count
(5) through the app and zeroing after the clear, both Clear
confirmations, and zero console/page errors across the run. VLM:
five critiques (the update toast EN light/dark/zh, the privacy
storage pane, the offline landing) — eleven measurable claims,
every one DISPROVEN by `scripts/phase22-vlm-measure.mjs` geometry:
zero overflow in both locales with the text tails inside the box,
the text-button gap exactly the 8px token, the button dead-center
on the text block (0px — the model's "misalignment" measured the
description against the button and forgot the title), line-height
1.33 (the design system's standard step every zh surface ships),
the egress table's paragraphs losing nothing, the disclosure
leading at 1.63.

**Decisions recorded here:**
- Tiles are cache-first, not SWR (immutable bytes; revalidation
  would double mountain bandwidth) — the documented deviation
  from §EE 22.2's wording, in the direction of the phase's own
  objective.
- An unviewed tile offline answers 503, never a fabricated 200 —
  MapLibre retries errored tiles on reconnect; a cached blank
  tile would lie forever.
- The update toast outlives any timer (`duration: Infinity`): a
  consent prompt disappears when the user decides, not before.
- The manifest carries the light chrome colors and the metas carry
  both themes — the manifest spec has no media queries, and the
  pre-paint script cannot reach the window chrome; an explicit
  in-app theme choice still follows the OS query there (the one
  place localStorage cannot reach), documented as the accepted
  edge.
- Registration is production-only and the map test bridge stays
  production-gated: the offline e2e uses the Phase 16 numeric
  entry instead of weakening either wall.
- `precache-manifest.json` and the versioned `sw.js` are
  build artifacts, never committed; the repo's `public/sw.js` is
  the readable source of truth.
- Non-goals held: no background sync, no push notifications.

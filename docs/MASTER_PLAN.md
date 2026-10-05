# GPX Repair Studio — Master Plan

**Working title:** GPX Repair Studio (placeholder — user may rename)
**Status:** the living core spec (Sections A–O below) plus the index into the plan library. v1 **shipped** — tag `v1`. v2 **shipped** — tag `v2`. v3 **proposed, not started**.

This file is the product's constitution: overview, functional and non-functional requirements, architecture, technology decisions, data model, and the processing, timestamp, elevation, statistics, privacy, and testing strategies. Every phase — its plan, its delivery record, its verification story — lives in the **[plan library](plans/README.md)** (`docs/plans/`), one markdown file per phase, hyperlinked throughout:

- [v1 — the repair workbench](plans/v1/overview.md): phases 0–11 plus ten user-requested additions — shipped, tag `v1`
- [v2 — the workbench expansion](plans/v2/overview.md): phases 12–22 — shipped, tag `v2`
- [v3 — the library that means something](plans/v3/overview.md): phases 23–33 — proposed, not started
- [Strava interop research](plans/v3/strava-interop-research.md): how Strava processes our files — grounds the v3 metrics

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
- Only two categories of network egress exist, both documented in-app ([Section M](#m-privacy-strategy)): map tiles (always, when map is used) and elevation lookups (opt-in, reconstructed-point coordinates only).
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
- App entry (`app/page.tsx`) composes panels and coordinates top-level state only — the "App.tsx rule" (Section [D-3.6](#d-3-core-architectural-decisions)). No business logic in components; components receive data via selectors and dispatch intent via hooks.
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
- Full repair flow completable on a touch device ([Phase 8](plans/v1/phase-08-mobile-accessibility.md) acceptance includes a real-device pass).

### C-7 Compatibility & environment
- Evergreen Chrome/Firefox/Safari/Edge, including iOS Safari 16+ and Android Chrome.
- Served from the environment's Next.js scaffold; no reliance on Node at runtime (client-only logic); static export (`output: 'export'`) verified in [Phase 0](plans/v1/phase-00-foundation-tooling.md) as a deployment bonus so the app can even be hosted as pure static files.

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
3. **Provenance in the type system.** Discriminated unions (`source: 'original' | 'reconstructed'`) and `Estimated<T>` wrappers make it impossible to accidentally feed estimated data into functions typed for recorded data ([Section G](#g-data-model)).
4. **Map isolation.** MapLibre is wrapped in a controller class (`lib/map/mapController.ts`) exposing a small imperative API (setRoute, highlightGap, startDrawSession, …). A React binding hook (`useMapController`) subscribes store slices and drives the controller. No component ever touches `maplibre-gl` objects directly; no `maplibre-gl` import leaks outside `lib/map` (ESLint boundary).
5. **Undo/redo as commands.** Drawing operations are command objects (do/undo) on a bounded stack scoped to the active gap editor. Settings changes (strategy, spacing) are *not* commands — they are recomputed-on-read settings, so the history stays clean and small.
6. **The App.tsx rule.** `app/page.tsx` (and `components/layout/AppShell`) only compose panels and wire the top-level session store. Concretely forbidden there: GPX parsing/validation, map implementation, drawing logic, distance/pace/elevation/timestamp math, GPX serialization, service calls, large inline JSX blocks. Same rule for every component file: logic lives in features/hooks/state. Files are split by responsibility, never by arbitrary line count; "God components" fail code review.
7. **Static-exportable by construction.** No server routes, no server actions, no runtime server dependencies — guarded by `output: 'export'` verification in [Phase 0](plans/v1/phase-00-foundation-tooling.md) so accidental server coupling fails the build early.

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
Full analysis in [Section K](#k-elevation-strategy). (Provider swapped 2026-09-26: OpenTopoData's public API sends no CORS headers — see [§K-1](#k-1-options-evaluated).)

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

All stages client-side; stages 1–4 ship in Phases [1](plans/v1/phase-01-gpx-domain-core.md)–[2](plans/v1/phase-02-upload-inspection.md), stage 5 in Phases [4](plans/v1/phase-04-reconstruction-drawing.md)–[6](plans/v1/phase-06-elevation.md), stages 6–8 in [Phase 7](plans/v1/phase-07-merge-export.md).

1. **Ingest** — `File.arrayBuffer()` → decode honoring the XML declaration's charset (fallback UTF-8; BOM tolerated) → size guard (warn > 25 MB, hard-stop > 100 MB with explanation).
2. **Parse** (`features/gpx/parse.ts`) — `DOMParser.parseFromString(text, 'application/xml')`; a `parsererror` document is a hard failure (report with line/column where available). Namespace-tolerant element lookup (default ns, prefixed ns, no ns — real-world exports violate the schema regularly). Numeric fields NaN-guarded; timestamps parsed via strict ISO-8601-with-timezone validation → epoch ms; `<wpt>`, `<rte>`, unknown trees stored as raw nodes for verbatim re-export. Track metadata extracted; multi-track files list all tracks (v1: repair one track at a time via TrackPicker; others exported untouched).
3. **Validate & flag** (`validate.ts`) — structural (required lat/lon attrs, segment non-emptiness) + semantic (lat ∈ [−90, 90], lon ∈ [−180, 180], ele ∈ [−430, 9000] m, time monotonicity — equal allowed, backwards flagged, zero-coordinate runs, per-leg implied speed via geodesy, consecutive duplicates). Output: `ValidationIssue[]` with severity + point references. Nothing is auto-corrected silently — the user decides.
4. **Gap detection** (`detectGaps.ts`) — configurable thresholds (time-gap default 120 s; speed-anomaly default 25 km/h with Δt > 10 s guard; segment breaks always considered). Candidates deduplicated (a time-gap that is also a segment-break = one gap with merged evidence), severity-ranked, surfaced in the Gap List; user confirms what to repair.
5. **Reconstruct** — user-driven ([Section I](#i-route-reconstruction-algorithm)); produces `Reconstruction` per gap.
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
- **Caching:** in-memory LRU keyed by coordinate rounded to 5 decimals (~1.1 m) — re-edits and retries are free. Optional Cache Storage/IndexedDB persistence deferred ([Phase 10](plans/v1/phase-10-session-recovery.md) decision).
- **Terrarium as privacy-max fallback (later):** fetch z12–z14 PNG tiles covering the route, decode `(R·256 + G + B/256) − 32768`, bilinear-sample at points; zero precise-coordinate payload, tiles browser-cacheable. A [Phase 6](plans/v1/phase-06-elevation.md) spike verifies CORS headers before committing.
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
- **Elevation:** gain/loss via hysteresis ([Section K-2](#k-2-recommendation)) computed separately over original `ele` (as recorded) and reconstructed `ele` (estimated), plus a combined figure labeled "mixed". If < 60% of points carry elevation → "insufficient elevation data" instead of misleading totals.
- **Formatting:** distances to 0.01 km (or m < 1 km), pace as m:ss /km, durations as h:mm:ss — centralized in `lib/utils/format.ts`.

### L-2 Honesty rules
- Any statistic that depends on estimated inputs is badged (Recorded / Estimated / Mixed) — the provenance column is mandatory in the stats table.
- Unsupported statistics render "—" with a one-line reason; the app never fabricates or silently substitutes values.

---

## M. Privacy Strategy

### M-1 Never leaves the browser (core pipeline)
The GPX file bytes, parsing, validation, gap detection, drawing edits, geodesy, timestamp distribution, statistics, merging, GPX generation, and download all execute in the browser. **No backend, no database, no accounts, no analytics, no cookies, no server-side processing.** The Next.js server exists only to serve the application bundle (and is verified static-exportable in [Phase 0](plans/v1/phase-00-foundation-tooling.md)). Closing the tab destroys all in-memory data (unless the opt-in [Phase 10](plans/v1/phase-10-session-recovery.md) session recovery is enabled).

### M-2 Leaves the browser — complete list
| # | Trigger | Destination | Payload | Granularity / notes |
|---|---|---|---|---|
| 1 | Map visible | Tile CDN (default: OpenFreeMap; optional: OSM raster) | tile x/y/z requests (+ standard HTTP metadata: IP, User-Agent) | coarse — tile-level only (~ kilometers at low zoom); no GPX data, no precise positions |
| 2 | Elevation fetch (opt-in per gap, explicit disclosure shown first) | Open-Meteo (default) | lat/lon of reconstructed resampled points only (≤ cap), in GET query | precise but **minimal**: reconstructed points only — never the full GPX, never original track points; count shown before fetch |

That is the entire egress surface. An **automated E2E privacy test** runs the full core flow (upload → parse → draw → export) with a network allow-list and fails if any other host is contacted.

### M-3 User-facing disclosure
An in-app "Privacy & Data" panel states the above in plain language, including: what works offline (everything except tiles/elevation), how to switch tile/elevation providers, and (if [Phase 10](plans/v1/phase-10-session-recovery.md) ships) exactly what IndexedDB stores and how to clear it.

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
- **Perf budgets** ([Phase 9](plans/v1/phase-09-performance-large-files.md)): `performance.mark`-based assertions on parse/export/route-render timings with the 100k-point fixture.
- **Mobile touch:** drawing via touch pointer events on a 360 px viewport.
- Map assertions operate on controller-exposed state (GeoJSON source data via the controller API), not pixel comparisons — deterministic and CI-friendly.

### N-4 Manual QA matrix (per phase, executed before phase DoD)
Real-device pass (iOS Safari, Android Chrome), real-world GPX zoo (Garmin/Wahoo/Suunto/Coros/Strava/Apple Watch exports), color-blind simulation of provenance styles, keyboard-only walkthrough, screen-reader spot checks on announcements.

---

## O. Technical Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Touch drawing conflicts with map pan/zoom** (accidental draws while panning, vice versa) | High — core UX | Explicit Draw/Pan toggle; in draw mode: one-finger = draw, two-finger = pan/zoom; pointer-event capture; early real-device testing is a Phase [4](plans/v1/phase-04-reconstruction-drawing.md)/[8](plans/v1/phase-08-mobile-accessibility.md) acceptance item |
| 2 | **Large-file performance** (parse/render 100k+ points) | Medium | Web Worker parse above size threshold ([Phase 9](plans/v1/phase-09-performance-large-files.md)); zoom-dependent render decimation; WebGL line layers; perf budget tests gate the phase |
| 3 | **Tile provider dependency** (availability, usage policy) | Medium | Provider abstraction + quick-switch setting; OpenFreeMap default (no key/limits); OSM raster fallback with policy note; CI uses blank local style (no network) |
| 4 | **Elevation API reliability/rate limits** | Medium | Throttle + backoff + partial results; Terrarium fallback path (no-coordinate-payload); failure UI never blocks core flow; elevation is opt-in from day one |
| 5 | **GPX dialect zoo** (namespaces, 1.0 quirks, vendor extensions, non-conforming exports) | Medium-high | Tolerant namespace-agnostic parser; verbatim passthrough of unknown nodes; growing fixture corpus; multi-vendor manual QA matrix |
| 6 | **Provenance leakage** (estimates accidentally treated as recorded) | High — product promise | Type-level separation + `Estimated<T>` wrappers; frozen originals; UI badge components as the only sanctioned render path; export invariant tests; review checklist |
| 7 | **Undo/redo complexity** (commands interleaved with strategy changes) | Medium | Command stack scoped strictly to geometry ops; settings are non-undoable by design (documented); dedicated command-stack test suite |
| 8 | **Geodesy correctness** | High (silent wrong numbers) | Single shared module; golden tests vs reference vectors; no ad-hoc distance code anywhere (lint/review rule) |
| 9 | **Timestamp edge cases** (DST, naive strings, equal/backwards stamps) | Medium | Epoch-ms internally; strict ISO-8601-with-tz parsing; unreliable-time flags; fixture coverage |
| 10 | **Scope creep toward backend** (routing-assist, accounts, history) | Product-level | Plan explicitly fences v1; any backend need = new requirement + plan revision ([Section M](#m-privacy-strategy)) |
| 11 | **Scaffold residue** (Prisma/DB, demo API routes shipped by the environment scaffold) | Low | Removed at [Phase 0](plans/v1/phase-00-foundation-tooling.md) generation time (scaffold tailoring, explained in advance); static-export verification acts as a regression guard |
| 12 | **Accessibility of canvas-based map** | Medium | Textual equivalents for all map info; ARIA announcements; deferred numeric vertex-entry fallback documented as a known limitation |
| 13 | **Browser XML API differences** (parsererror reporting varies) | Low | Centralized parse facade; fixture-driven tests across target browsers via Playwright WebKit/Chromium |

---

## Plan Library — Where the Phases Live

| Version | Phases | Status | Entry point |
|---|---|---|---|
| v1 — the repair workbench | 0–11, plus ten user-requested additions | **SHIPPED** — tag `v1` | [v1 overview](plans/v1/overview.md) |
| v2 — the workbench expansion | 12–22 | **SHIPPED** — tag `v2` | [v2 overview](plans/v2/overview.md) |
| v3 — the library that means something | 23–33 | **PROPOSED** — not started | [v3 overview](plans/v3/overview.md) |

The full index — every phase file, every addition, the research record — lives in the [plan library hub](plans/README.md). Each file carries breadcrumbs back to its overview and to this plan; phase files chain previous/next across version boundaries.

## Document Map — Old Section Letters → New Homes

The master plan grew by lettered sections through v1 and v2. Those sections now live in the plan library; this map keeps every historical citation resolvable (the worklog and many source-file comments cite these letters):

| Old section | New home |
|---|---|
| §0 Repository inspection findings | [v1 overview](plans/v1/overview.md) |
| §P Development phases (incl. conventions, deferred backlog, closing note) | [v1 overview](plans/v1/overview.md) + the twelve `plans/v1/phase-*.md` files |
| §O (the second §O — share card), §R, §S, §T, §U, §V, §W, §X | [`plans/v1/additions/`](plans/v1/overview.md#user-requested-additions-v1-era) |
| §Y, §Z, §BB, §CC — phase 8–11 delivery records | merged into [phase-08](plans/v1/phase-08-mobile-accessibility.md), [phase-09](plans/v1/phase-09-performance-large-files.md), [phase-10](plans/v1/phase-10-session-recovery.md), [phase-11](plans/v1/phase-11-polish-docs-release.md) |
| §AA Mode-honest editor, §DD Home redesign | [`plans/v1/additions/`](plans/v1/overview.md#user-requested-additions-v1-era) |
| §EE V2 roadmap (incl. per-phase blocks + v2 release) | [v2 overview](plans/v2/overview.md) + the eleven `plans/v2/phase-*.md` files |
| §FF–§PP — v2 phase delivery records | the `plans/v2/phase-12…22-*.md` files |
| §QQ V3 roadmap (incl. release, candidates, non-goals) | [v3 overview](plans/v3/overview.md) + the eleven `plans/v3/phase-*.md` files |
| §RR Strava interop research | [plans/v3/strava-interop-research.md](plans/v3/strava-interop-research.md) |

The first §O — Technical Risks — stays in this file as [Section O](#o-technical-risks). (`download/MASTER_PLAN.md` remains a frozen copy of the original v1-era planning snapshot, kept as a historical deliverable.)

## Closing Note

This file is the constitution and evolves with the product; the phases live and evolve in the [plan library](plans/README.md). The discipline is unchanged since day one: nothing is built except on explicit user instruction, phase by phase, each phase ending committed and green.

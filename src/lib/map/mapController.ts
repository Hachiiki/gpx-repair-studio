/**
 * MapController — the imperative MapLibre GL wrapper (docs/MASTER_PLAN.md
 * §E-1, §F-4 "map isolation").
 *
 * This module is the ONLY place in the codebase that imports `maplibre-gl`
 * at runtime (ESLint boundary; components go through
 * `hooks/use-map-controller.ts`). The import is *dynamic*:
 *   - the heavy library stays off the initial bundle (code splitting);
 *   - the module never evaluates during prerender/SSR or in node-side unit
 *     tests (the hook's route-view math stays testable without WebGL).
 *
 * Worker assets: MapLibre v6 resolves its web worker at runtime via a URL
 * relative to `import.meta.url` (a sibling file in `node_modules`), which a
 * bundler cannot preserve. The app therefore serves explicit copies from
 * `public/vendor/` (kept in sync by `scripts/sync-maplibre-worker.mjs`) and
 * pins them via `setWorkerUrl` before the first map is created.
 *
 * Graceful degradation (Phase 3 acceptance):
 *   - remote style fetch fails (offline/blocked) → switch to the local
 *     `BLANK_STYLE` and raise the offline notice; the GeoJSON route/gap
 *     layers keep rendering over the plain background;
 *   - tile errors after a successful style load → offline notice (sticky
 *     until the next successful style load: provider switch or retry);
 *   - WebGL unavailable → `unsupported` status, textual fallback in the UI.
 *
 * Camera bookkeeping: `lastCameraAction` records what moved the camera
 * ("fit-activity", "fit-gap:<id>", "user", …) — asserted by E2E instead of
 * pixel diffs.
 *
 * Phase 4 — draw session: `startDrawSession`/`updateDrawSession`/
 * `endDrawSession` + the explicit Draw/Pan `setDrawMode` toggle. The
 * controller owns pointer interaction and transient rendering only (rubber
 * band, drag override, midpoint/handle affordances); the authoritative
 * vertex state lives in the editor store — every commit is a callback into
 * the hook, which applies a pure command and pushes the result back via
 * `updateDrawSession`. Snap resolution is injected (`DrawSnapFn`) so no
 * domain code runs inside the map adapter.
 *
 * Phase 3 — Map Display. Browser-only (constructed by the React binding
 * hook, never by domain code).
 */

import type {
  GeoJSONSource,
  Map as MlMap,
  MapLayerMouseEvent,
  MapMouseEvent,
  StyleSpecification,
  Subscription,
} from "maplibre-gl";
import type { BBox } from "@/lib/geo/bbox";
import {
  haversineDistanceMeters,
  interpolateLatLon,
} from "@/lib/geo/geodesy";
import { announce } from "@/lib/announcements";
import type {
  LatLon,
  PenMode,
  PointId,
  PointerMode,
  VertexId,
} from "@/types/domain";
import {
  draftClosingCollection,
  draftLineCollection,
  drawHandleCollection,
  drawMidpointCollection,
  gapMarkerCollection,
  gapSpanCollection,
  pickAnchorCollection,
  reconstructionLineCollection,
  rubberBandCollection,
  routeLineCollection,
  type DrawHandleData,
  type DrawMidpointData,
  type RouteViewData,
} from "./geojson";
import { decimateForZoom, decimationStride } from "./decimate";
import {
  BLANK_STYLE,
  MAP_TILE_PROVIDERS,
  type TileProviderId,
} from "./styles";
import {
  collectDarkPaintUpdates,
  type StyleLayerRef,
} from "./darken-style";
import {
  mapOverlayPalette,
  type MapOverlayPalette,
} from "./palette";

/** `map.setFilter`'s filter type (not exported directly by maplibre-gl v6). */
type LayerFilter = Parameters<MlMap["setFilter"]>[1];
/** Filter values usable in `addLayer` (which rejects `null`). */
type LayerFilterValue = Exclude<LayerFilter, null | undefined>;

export type MapControllerStatus = "initializing" | "ready" | "unsupported";

export interface MapControllerCallbacks {
  /** Lifecycle transitions (initializing → ready | unsupported). */
  onStatusChange?: (status: MapControllerStatus) => void;
  /** Offline notice visibility (see module doc for stickiness rules). */
  onOfflineChange?: (offline: boolean) => void;
  /** The user activated a gap marker/span on the map. */
  onGapSelected?: (gapId: string) => void;
}

/** Serializable snapshot for E2E assertions (no pixel diffs). */
export interface MapTestState {
  status: MapControllerStatus;
  ready: boolean;
  offline: boolean;
  provider: TileProviderId;
  layerIds: string[];
  routeFeatureCount: number;
  /** Phase 9 — rendered coordinate count of the recorded lines (the decimation layer's observable). */
  routeRenderedCoords: number;
  /** Phase 9 — the stride currently applied to SOURCE.route (1 = full). */
  routeStride: number;
  gapSpanCount: number;
  boundaryMarkerCount: number;
  /** Committed reconstruction lines rendered via the route view. */
  reconstructionLineCount: number;
  selectedGapId: string | null;
  zoom: number;
  center: { lat: number; lon: number } | null;
  lastCameraAction: string | null;
  /** Screen-space midpoints of the gap spans (for synthetic clicks). */
  spanScreenPositions: { gapId: string; x: number; y: number }[];
  /** True while a camera animation or user gesture is in progress. */
  moving: boolean;
  /** The active draw session (null when no editor is open). */
  drawSession: DrawSessionTestState | null;
  /** The active span-pick session (null when not picking). */
  pickSession: { active: boolean; mode: "anchor" | "pair"; hasAnchor: boolean } | null;
  /** Phase 8 touch-gesture snapshot (null state on desktop/mouse). */
  touch: {
    /** Coarse-pointer device detected — hit targets are enlarged. */
    touchInput: boolean;
    /** The single-finger gesture the controller currently owns. */
    gesture: "stroke" | "handle" | "press" | null;
    /** A two-finger navigation gesture is in charge (pan/zoom). */
    navActive: boolean;
  };
}

/** Draw-session snapshot for E2E synthetic-pointer drawing assertions. */
export interface DrawSessionTestState {
  gapId: string;
  /** Legacy boolean view of `pointerMode` (true = "draw") — kept for the
   * e2e bridge's existing assertions. */
  drawMode: boolean;
  /** The full three-way pointer mode (Task 45). */
  pointerMode: PointerMode;
  /** The draw-mode pen (user pass 48): "default" clicks, "curve" strokes. */
  penMode: PenMode;
  /** A freehand stroke is being captured right now (Curve pen). */
  strokeActive: boolean;
  vertexCount: number;
  /** Solid chain coordinates — before-anchor → vertices (WYSIWYG clicks). */
  chainCoordinates: [number, number][];
  /** The RENDERED solid line (road-follow legs applied — what commit gets). */
  renderedChainCoordinates: [number, number][];
  /** The dashed open closing segment (empty when the far anchor is absent). */
  closingCoordinates: [number, number][];
  /** Full draft path `[lon, lat]` (chain + closing; override applied). */
  pathCoordinates: [number, number][];
  /** Screen positions of the vertex handles (for synthetic drags). */
  handleScreenPositions: { vertexId: string; x: number; y: number }[];
  /** Screen positions of the midpoint insertion handles. */
  midpointScreenPositions: { insertIndex: number; x: number; y: number }[];
  /** Rubber band currently visible (cursor over canvas, not dragging). */
  rubberBandVisible: boolean;
}

/** Layer ids — `gpxr` prefix mirrors the export provenance namespace. */
export const MAP_LAYER_IDS = [
  "gpxr-route",
  "gpxr-gap-span-selected",
  "gpxr-recon",
  "gpxr-recon-dashed",
  "gpxr-draft-line",
  "gpxr-draft-stroke-line",
  "gpxr-draft-closing",
  "gpxr-draft-rubber",
  "gpxr-gap-span",
  "gpxr-draft-midpoint",
  "gpxr-draft-handle",
  "gpxr-gap-boundary-halo",
  "gpxr-gap-boundary-before",
  "gpxr-gap-boundary-after",
  "gpxr-gap-span-hit",
  "gpxr-gap-boundary-hit",
  "gpxr-draft-midpoint-hit",
  "gpxr-draft-handle-hit",
  "gpxr-pick-anchor",
] as const;

const SOURCE = {
  route: "gpxr-route",
  spans: "gpxr-gap-spans",
  markers: "gpxr-gap-boundaries",
  recon: "gpxr-recon",
  draft: "gpxr-draft",
  stroke: "gpxr-draft-stroke",
  closing: "gpxr-draft-closing",
  rubber: "gpxr-draft-rubber",
  handles: "gpxr-draft-handles",
  midpoints: "gpxr-draft-midpoints",
  pickAnchor: "gpxr-pick-anchor",
} as const;

const LAYER = {
  route: "gpxr-route",
  spanSelected: "gpxr-gap-span-selected",
  span: "gpxr-gap-span",
  markerHalo: "gpxr-gap-boundary-halo",
  markerBefore: "gpxr-gap-boundary-before",
  markerAfter: "gpxr-gap-boundary-after",
  spanHit: "gpxr-gap-span-hit",
  markerHit: "gpxr-gap-boundary-hit",
  recon: "gpxr-recon",
  reconDashed: "gpxr-recon-dashed",
  draftLine: "gpxr-draft-line",
  strokeLine: "gpxr-draft-stroke-line",
  draftClosing: "gpxr-draft-closing",
  draftRubber: "gpxr-draft-rubber",
  draftHandle: "gpxr-draft-handle",
  draftMidpoint: "gpxr-draft-midpoint",
  draftHandleHit: "gpxr-draft-handle-hit",
  draftMidpointHit: "gpxr-draft-midpoint-hit",
  pickAnchor: "gpxr-pick-anchor",
} as const;

/*
 * Ink & Signal map palette (Task 29; Phase 12). The five UI anchors
 * rule the canvas too: the recorded route is INK (the watch's
 * truth, immutable), everything the app creates is SIGNAL
 * (#FC4C02 — committed reconstructions, drafts, selection). Gap
 * spans are a SHADE ramp: heavier ink = heavier problem (severity
 * also carried by dash pattern + markers + legend, never color
 * alone).
 *
 * Phase 12: "ink" and the severity ramp are THEME-DEPENDENT (light
 * line + light ramp over the darkened basemap) — the values live in
 * lib/map/palette.ts and are selected at layer-add time from
 * #darkTheme; signal holds in both themes.
 */

/** Snap magnet radius in screen pixels (converted to meters at commit). */
const SNAP_RADIUS_PX = 14;

/** Click tolerance when picking span anchors (screen pixels). */
const PICK_RADIUS_PX = 16;

/** Endpoint preference band: an endpoint within this many pixels of the
 * best interior target wins the pick (see #nearestPickTarget). */
const ENDPOINT_TIE_PX = 2;

/** Anchor picks resolving farther than this from the click refit the
 * camera to frame click + anchor — the tool's chosen attachment must be
 * visible, or a far click looks like nothing happened (user pass 36). */
const ANCHOR_REFIT_PX = 120;

/** Vertex handle paint — base sizes, hover-grown (feature-state driven).
 * Extracted so Move mode (Task 45) can swap in its emphasized variant
 * and restore the exact original expression afterwards. */
const HANDLE_RADIUS_PAINT = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  5.5,
  1,
  8,
];
const HANDLE_STROKE_PAINT = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  2.5,
  1,
  3.5,
];
/** Move mode: bigger base radius/stroke — the point visibly says "grab me". */
const HANDLE_RADIUS_PAINT_MOVE = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  8,
  1,
  10.5,
];
const HANDLE_STROKE_PAINT_MOVE = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  3.5,
  1,
  4.5,
];
/** Handle hit-target radius — normal vs Move mode (bigger = easier grab). */
const HANDLE_HIT_RADIUS = 12;
const HANDLE_HIT_RADIUS_MOVE = 20;

/*
 * Phase 8 — touch targets. MapLibre GL v6 routes touch through its
 * own touchstart/touchmove/touchend handlers and never fires the
 * mousedown/mousemove/mouseup the draw session listens to, so on a
 * real phone the Curve pen, Move-mode handle drags, and the
 * two-finger pan needed dedicated handling (see #bindTouchLayer).
 * Coarse pointers also get the plan's ≥44 px hit targets: handles,
 * midpoints, boundary markers, gap spans, picks, and the snap magnet
 * all grow (visual handles grow a touch too, so the grab area is
 * honest — an invisible 44 px target around a 5 px dot is a trap).
 */
const TOUCH_HANDLE_HIT_RADIUS = 22;
const TOUCH_HANDLE_HIT_RADIUS_MOVE = 24;
const TOUCH_MIDPOINT_HIT_RADIUS = 22;
const TOUCH_MARKER_HIT_RADIUS = 22;
const TOUCH_SPAN_HIT_WIDTH = 24;
const TOUCH_PICK_RADIUS_PX = 22;
const TOUCH_SNAP_RADIUS_PX = 20;

/** Touch handle paint — visibly bigger dots, hover-grown like the
 * mouse variant (same expression shape as HANDLE_RADIUS_PAINT). */
const TOUCH_HANDLE_RADIUS_PAINT = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  7,
  1,
  10,
];
const TOUCH_HANDLE_STROKE_PAINT = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  3,
  1,
  4,
];
/** Move mode on touch: the grab-me emphasis, scaled up. */
const TOUCH_HANDLE_RADIUS_PAINT_MOVE = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  10,
  1,
  13,
];
const TOUCH_HANDLE_STROKE_PAINT_MOVE = [
  "interpolate",
  ["linear"],
  ["feature-state", "hover"],
  0,
  4,
  1,
  5,
];

/** How long a stationary press holds before the long-press action
 * (touch's contextual delete — the dblclick twin) fires. */
const LONG_PRESS_MS = 480;
/** Pointer travel (px) that cancels a long-press (it became a drag). */
const LONG_PRESS_CANCEL_PX = 8;

/** Minimum pointer travel (px) before a handle press counts as a drag. */
const DRAG_THRESHOLD_PX = 3;

/** Pointer travel (px) between captured stroke samples — keeps the raw
 * trace small without visible gaps in the live preview. */
const STROKE_MIN_STEP_PX = 2.5;

/** Total pointer travel (px) below which a Curve-pen press is a TAP —
 * the trailing click places a single point, no stroke is committed. */
const STROKE_MIN_LENGTH_PX = 8;

/** Gap-span + marker colors by severity — a darkness ramp on the shade
 * anchor (dash pattern + markers + legend carry the meaning too);
 * Phase 12: the ramp rides the theme palette. */
const severityColor = (palette: MapOverlayPalette): unknown =>
  [
    "match",
    ["get", "severity"],
    "severe",
    palette.severity.severe,
    "suspect",
    palette.severity.suspect,
    palette.severity.info,
  ];

/** A filter that matches nothing (used to "clear" selection filters). */
const NONE_FILTER: LayerFilterValue = ["==", ["get", "gapId"], "__none__"];

interface FocusTarget {
  bbox: BBox;
  maxZoom: number;
  padding?: number;
  action: string;
}

// ---------------------------------------------------------------------------
// Draw session (Phase 4) — interaction contract between the controller and
// the React binding hook (hooks/use-draw-editor.ts)
// ---------------------------------------------------------------------------

/** A resolved (possibly snapped) vertex position to commit. */
export interface DrawCommitPosition {
  lat: number;
  lon: number;
  snappedTo?: PointId;
}

/** Snap resolver injected by the hook (pure domain fn underneath). */
export type DrawSnapFn = (
  target: LatLon,
  maxDistanceM: number,
) => DrawCommitPosition | null;

/**
 * Road-follow chain join, injected by the hook (same pattern as DrawSnapFn:
 * no domain code runs inside the map adapter). Maps the chain NODES to the
 * rendered line points — straight geodesics when road-follow is off, road
 * geometry substituted between the nodes when legs resolved. Must return
 * one insertion midpoint per node leg (ordered by leg index).
 */
export type DrawChainJoinFn = (nodes: readonly LatLon[]) => {
  points: readonly LatLon[];
  midpoints: readonly LatLon[];
};

/**
 * Road-follow closing join (injected): the geometry of the dashed closing
 * segment (last chain node → far anchor) — straight chord or road path.
 */
export type DrawClosingJoinFn = (from: LatLon, to: LatLon) => [number, number][];

export interface DrawSessionOptions {
  gapId: string;
  /**
   * The near anchor the chain starts from. Null for the "create from
   * activity stats" workflow: with no recorded route there is nothing to
   * attach to — the chain is purely the user-placed vertices (the first
   * click IS the route's start point).
   */
  anchors: { before: LatLon | null; after: LatLon | null };
  vertices: readonly { id: VertexId; lat: number; lon: number }[];
  /** Snap magnet (null/undefined = snapping disabled). */
  snap?: DrawSnapFn | null;
  /** Road-follow joins (null/undefined = straight legs). */
  chainJoin?: DrawChainJoinFn | null;
  closingJoin?: DrawClosingJoinFn | null;
  callbacks: {
    onVertexAdd: (position: DrawCommitPosition) => void;
    onVertexMove: (vertexId: VertexId, position: DrawCommitPosition) => void;
    onVertexInsert: (index: number, position: DrawCommitPosition) => void;
    onVertexDelete: (vertexId: VertexId) => void;
    /**
     * A finished freehand stroke (Curve pen, user pass 48): the raw
     * captured trace, oldest sample first. The hook simplifies it into
     * nodes and commits them as ONE undoable command. Optional so
     * sessions without curve support simply never fire it.
     */
    onStrokeCommit?: (points: readonly LatLon[]) => void;
  };
}

// ---------------------------------------------------------------------------
// Span-pick session (manual repair spans) — the controller side of "draw
// anywhere": collect two clicks on recorded points, report the pair.
// ---------------------------------------------------------------------------

/** A pickable recorded point (span-anchor candidate). */
export interface PickTarget {
  pointId: PointId;
  lat: number;
  lon: number;
  /** Track scoping — a span may not cross <trk> boundaries. */
  trackIndex: number;
  /** First/last usable point of its segment — preferred on near-ties
   * (clicking the visible end of a route means the endpoint, even when
   * the neighbor sits a sub-pixel away). */
  isSegmentEnd?: boolean;
  /** Which end of its segment an endpoint target is (user pass 36):
   * anchor-mode clicks resolve to the nearest segment endpoint, and the
   * role decides the extension side — "start" extends the missing
   * head, "end" extends the tail. */
  segmentRole?: "start" | "end";
}

export interface PickSessionOptions {
  /** "anchor": ONE click starts an open add-missing-route session.
   *  "pair": two clicks bound a stretch to redraw (classic mode). */
  mode: "anchor" | "pair";
  targets: readonly PickTarget[];
  callbacks: {
    /** Both anchors picked (pair mode). Document-order fixing is the hook's job. */
    onSpanPicked: (a: PointId, b: PointId) => void;
    /** The single anchor picked (anchor mode) — always a segment
     * endpoint; `role` says which end (start = missing head,
     * end = missing tail). */
    onAnchorPicked: (pointId: PointId, role: "start" | "end") => void;
    /** The user cancelled (Esc or mode left). */
    onCancel: () => void;
  };
}

interface PickSession {
  options: PickSessionOptions;
  /** Set after the first successful pick; rendered as a marker. */
  anchor: PickTarget | null;
  /** The window Esc listener (removed when the session ends). */
  escListener: (() => void) | null;
}

interface DrawSession extends DrawSessionOptions {
  vertices: { id: VertexId; lat: number; lon: number }[];
  chainJoin: DrawChainJoinFn | null;
  closingJoin: DrawClosingJoinFn | null;
}

interface HandleDrag {
  vertexId: VertexId;
  originXY: { x: number; y: number };
  override: LatLon | null;
  moved: boolean;
}

/**
 * A single-finger touch gesture the controller owns (Phase 8).
 *
 *   - "stroke"  — Curve pen freehand draw (the touch twin of the
 *                 mouse mousedown→mousemove→mouseup capture);
 *   - "handle"  — Move-mode vertex drag (the touch twin of the
 *                 draft-handle mouse drag);
 *   - "press"   — a Default-pen press we don't intercept (the
 *                 browser's synthesized click places the point),
 *                 tracked only for its long-press candidate.
 *
 * The gesture carries the long-press timer whenever the press
 * started on a vertex handle in draw mode — long-press is touch's
 * contextual delete, the twin of dblclick.
 */
interface TouchGesture {
  kind: "stroke" | "handle" | "press";
  identifier: number;
  startXY: { x: number; y: number };
  /** The finger's latest position (the tap commits here). */
  lastXY: { x: number; y: number };
  /** Total travel from startXY — cancels the long-press past 8 px. */
  movedPx: number;
  longPressTimer: number | null;
  longPressVertex: VertexId | null;
  /** The dragged vertex (kind "handle" only). */
  handleVertex: VertexId | null;
}

declare global {
  interface Window {
    /** Test bridge — attached outside production builds only. */
    __gpxMapController?: MapController;
  }
}

export class MapController {
  readonly #container: HTMLElement;
  readonly #callbacks: MapControllerCallbacks;
  #provider: TileProviderId;

  #map: MlMap | null = null;
  #subscriptions: Subscription[] = [];
  #resizeObserver: ResizeObserver | null = null;
  #destroyed = false;

  /** Phase 12 — the theme the overlay palette + basemap darkening use. */
  #darkTheme = false;

  #status: MapControllerStatus = "initializing";
  #ready = false;
  #offline = false;
  #pendingStyle = false;
  #appliedFallback = false;

  #route: RouteViewData | null = null;
  #selectedGapId: string | null = null;
  #pendingFocus: FocusTarget | null = null;
  #lastCameraAction: string | null = null;

  // Phase 9 — zoom-dependent render decimation. #routeStride is the
  // stride currently rendered into SOURCE.route; a zoom band change
  // re-decimates, everything else reuses the applied data.
  #routeStride = 1;
  #routeRenderedCoords = 0;

  // Draw session (Phase 4)
  #drawSession: DrawSession | null = null;
  /**
   * The three-way pointer mode (Task 45): "draw" adds points with the
   * pointer (panning disabled), "move" grows every placed point into
   * an oversized grab target (clicks add nothing), "pan" is normal
   * navigation. The classic boolean view (`drawMode`) derives from it.
   */
  #pointerMode: PointerMode = "pan";

  /** The draw-mode pen (user pass 48): default clicks, curve strokes. */
  #penMode: PenMode = "default";

  /** The freehand stroke being captured (Curve pen, draw mode only). */
  #stroke: {
    points: LatLon[];
    lastXY: { x: number; y: number };
    totalPx: number;
  } | null = null;

  /** Where a draw-mode canvas press started (drag-vs-click disambiguation
   * — a dragged release must never place a surprise point). */
  #drawDownXY: { x: number; y: number } | null = null;

  get #drawMode(): boolean {
    return this.#pointerMode === "draw";
  }

  #handleDrag: HandleDrag | null = null;
  #cursor: LatLon | null = null;
  /** Set when a committed handle drag must swallow its trailing click. */
  #suppressNextClick = false;
  /** Feature id of the hovered vertex handle (mouseleave carries no
   * features — the id is tracked on enter so hover state can clear). */
  #hoveredHandleId: string | number | null = null;

  // Span-pick session (manual repair spans)
  #pickSession: PickSession | null = null;

  /*
   * Phase 8 — the touch gesture layer. MapLibre GL v6 keeps touch
   * strictly separate from mouse (its handler manager routes
   * touchstart/touchmove/touchend through TouchPan/TwoFingersZoom
   * handlers and only ever fires the map's mousedown/mousemove/
   * mouseup for real MouseEvent instances), so the draw session's
   * mouse wiring is invisible to a finger. The layer below owns the
   * single-finger drawing gestures, hands two-finger gestures to
   * MapLibre's navigation handlers, and enlarges hit targets on
   * coarse-pointer devices.
   */
  #touchInput = false;
  #touchGesture: TouchGesture | null = null;
  /** True while a two-finger gesture navigates (pan/pinch owns the map). */
  #touchNavActive = false;
  /** Capture-phase DOM listeners (bound once per controller). */
  #touchDetachers: (() => void)[] = [];
  /**
   * Every touch identifier currently on the canvas, maintained from
   * changedTouches/touches across events — the multi-touch decision
   * cannot read `e.touches.length` alone: some pipelines (CDP's
   * dispatchTouchEvent among them) report only the CHANGED touch in
   * `touches` when a finger joins an ongoing gesture, while the DOM
   * contract promises all active ones. Counting identifiers is the
   * environment-proof view of "how many fingers are down".
   */
  #activeTouchIds = new Set<number>();

  constructor(options: {
    container: HTMLElement;
    provider: TileProviderId;
    /** Phase 12 — start in the dark theme (basemap darkened, light
     * overlay palette); toggling later goes through setDarkTheme. */
    darkTheme?: boolean;
    callbacks?: MapControllerCallbacks;
  }) {
    this.#container = options.container;
    this.#provider = options.provider;
    this.#darkTheme = options.darkTheme ?? false;
    this.#callbacks = options.callbacks ?? {};
  }

  // -- lifecycle ------------------------------------------------------------

  /**
   * Load maplibre-gl and initialize the map. Safe to call once per
   * controller; `destroy()` before completion cancels cleanly (StrictMode
   * double-mount safe).
   */
  async create(): Promise<void> {
    if (this.#destroyed) return;

    let maplibre: typeof import("maplibre-gl");
    try {
      maplibre = await import("maplibre-gl");
    } catch (err) {
      console.warn("[map] maplibre-gl failed to load:", err);
      this.#setStatus("unsupported");
      return;
    }
    if (this.#destroyed) return;

    // Serve the worker from our own static assets — the runtime
    // import.meta.url resolution cannot survive bundling (see module doc).
    maplibre.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

    let map: MlMap;
    try {
      map = new maplibre.Map({
        container: this.#container,
        style: MAP_TILE_PROVIDERS[this.#provider].style,
        attributionControl: {
          compact: true,
          customAttribution: "© OpenStreetMap contributors",
        },
        center: [0, 20],
        zoom: 1,
      });
    } catch (err) {
      // Most commonly "Failed to initialize WebGL" in headless/old contexts.
      console.warn("[map] initialization failed:", err);
      this.#setStatus("unsupported");
      return;
    }
    if (this.#destroyed) {
      map.remove();
      return;
    }

    this.#map = map;
    this.#pendingStyle = true;
    this.#observeResize();
    this.#attachTestBridge();
    this.#detectTouchInput();
    this.#bindTouchLayer();

    this.#subscriptions.push(
      map.on("style.load", () => this.#onStyleLoad()),
      map.on("error", (e) => this.#onError(e)),
      map.on("dragstart", () => this.#noteUserCamera()),
      map.on("wheel", () => this.#noteUserCamera()),
      map.on("boxzoomstart", () => this.#noteUserCamera()),
      // Phase 9 — re-decimate the recorded route when the zoom band
      // changes (powers-of-two strides make this rare by construction).
      map.on("zoomend", () => this.#onZoomBandChange()),
      map.on("click", [LAYER.spanHit, LAYER.markerHit], (e) => {
        // While drawing or picking span anchors, clicks are edit input —
        // never gap selection (a re-fit of the camera mid-interaction
        // would be hostile).
        if ((this.#drawSession && this.#drawMode) || this.#pickSession) {
          return;
        }
        const gapId = this.#gapIdFromEvent(e);
        if (gapId !== null) this.#callbacks.onGapSelected?.(gapId);
      }),
      map.on("mouseenter", [LAYER.spanHit, LAYER.markerHit], () => {
        if (this.#drawMode) return;
        map.getCanvas().style.cursor = "pointer";
      }),
      map.on("mouseleave", [LAYER.spanHit, LAYER.markerHit], () => {
        map.getCanvas().style.cursor = "";
      }),
    );

    // -- draw session wiring (Phase 4) ------------------------------------
    // Layer-scoped handlers for the interactive draft affordances, plus
    // map-level pointer tracking for add-clicks, the rubber band, curve
    // strokes, and handle drags. Add-clicks, midpoints, and double-click
    // delete are draw-mode-only; handle DRAGS are Move-mode-only (user
    // pass 48 — the pencil adds, Move is the explicit "adjust" gesture).
    this.#subscriptions.push(
      map.on("mousedown", LAYER.draftHandleHit, (e) => {
        // Dragging a placed point is the Move mode's job and ONLY its
        // job (user pass 48): in Draw the pencil adds points, in Pan the
        // map navigates — neither ever starts an edit drag.
        if (!this.#drawSession || this.#pointerMode !== "move") return;
        e.preventDefault();
        const vertexId = e.features?.[0]?.properties?.vertexId;
        if (typeof vertexId !== "string") return;
        this.#handleDrag = {
          vertexId: vertexId as VertexId,
          originXY: { x: e.point.x, y: e.point.y },
          override: null,
          moved: false,
        };
      }),
      map.on("mouseenter", LAYER.draftHandleHit, (e) => {
        // Cursor honesty (QoL): the grab cursor and the hover grow say
        // "this drags" — only true in Move mode, so only shown there.
        if (
          !this.#drawSession ||
          this.#handleDrag ||
          this.#pointerMode !== "move"
        ) {
          return;
        }
        map.getCanvas().style.cursor = "grab";
        const featureId = e.features?.[0]?.id;
        this.#hoveredHandleId =
          featureId !== undefined
            ? featureId
            : (e.features?.[0]?.properties?.vertexId as string | undefined) ??
              null;
        if (this.#hoveredHandleId !== null) {
          try {
            map.setFeatureState(
              { source: SOURCE.handles, id: this.#hoveredHandleId },
              { hover: true },
            );
          } catch {
            // feature state is best-effort styling only
          }
        }
      }),
      map.on("mouseleave", LAYER.draftHandleHit, () => {
        if (!this.#drawSession) return;
        if (!this.#handleDrag) {
          map.getCanvas().style.cursor = this.#drawMode ? "crosshair" : "";
        }
        // mouseleave events carry no features — clear the tracked id.
        const hoveredId = this.#hoveredHandleId;
        this.#hoveredHandleId = null;
        if (hoveredId !== null) {
          try {
            map.setFeatureState(
              { source: SOURCE.handles, id: hoveredId },
              { hover: false },
            );
          } catch {
            // feature state is best-effort styling only
          }
        }
      }),
      map.on("dblclick", LAYER.draftHandleHit, (e) => {
        if (!this.#drawSession || !this.#drawMode) return;
        e.preventDefault();
        const vertexId = e.features?.[0]?.properties?.vertexId;
        if (typeof vertexId !== "string") return;
        this.#drawSession.callbacks.onVertexDelete(vertexId as VertexId);
      }),
      map.on("click", LAYER.draftMidpointHit, (e) => {
        if (!this.#drawSession || !this.#drawMode) return;
        const insertIndex = e.features?.[0]?.properties?.insertIndex;
        if (typeof insertIndex !== "number") return;
        const position = this.#snapPosition(
          { lat: e.lngLat.lat, lon: e.lngLat.lng },
          e.point,
        );
        this.#drawSession.callbacks.onVertexInsert(insertIndex, position);
      }),
      map.on("mousemove", (e) => this.#onMouseMove(e)),
      map.on("mouseout", () => {
        this.#cursor = null;
        if (this.#ready) this.#applyRubberBand();
      }),
      map.on("mousedown", (e) => this.#onCanvasMouseDown(e)),
      map.on("click", (e) => this.#onCanvasClick(e)),
      map.on("mouseup", (e) => this.#onMouseUp(e)),
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#detachPickEscListener(this.#pickSession);
    this.#pickSession = null;
    this.#cancelTouchGesture();
    this.#touchNavActive = false;
    for (const detach of this.#touchDetachers) detach();
    this.#touchDetachers = [];
    for (const subscription of this.#subscriptions) {
      try {
        subscription.unsubscribe();
      } catch {
        // already detached
      }
    }
    this.#subscriptions = [];
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#detachTestBridge();
    if (this.#map) {
      try {
        this.#map.remove();
      } catch {
        // already torn down
      }
      this.#map = null;
    }
  }

  // -- imperative API (driven by the React binding hook) -------------------

  /** Replace the rendered route data (idempotent, deferred until ready). */
  setRoute(route: RouteViewData | null): void {
    this.#route = route;
    if (this.#ready) this.#applyRoute();
  }

  /** Highlight one gap (or none) with a white casing + boundary halo. */
  highlightGap(gapId: string | null): void {
    this.#selectedGapId = gapId;
    if (this.#ready) this.#applySelection();
  }

  /**
   * Frame a bounding box. Deferred until the map is ready (the hook may
   * call before the style finished loading) and only applied once per
   * request — style switches never re-frame.
   */
  fitBounds(
    bbox: BBox,
    options?: { maxZoom?: number; padding?: number; action?: string },
  ): void {
    const target: FocusTarget = {
      bbox,
      maxZoom: options?.maxZoom ?? 17,
      ...(options?.padding !== undefined
        ? { padding: options.padding }
        : {}),
      action: options?.action ?? "fit",
    };
    if (!this.#ready || !this.#map) {
      this.#pendingFocus = target;
      return;
    }
    this.#fit(target);
  }

  /** Switch the basemap provider (persists camera; re-adds overlays). */
  setTileProvider(id: TileProviderId): void {
    if (id === this.#provider) return;
    this.#provider = id;
    if (this.#map) this.#applyStyle(MAP_TILE_PROVIDERS[id].style);
  }

  /**
   * Phase 12 — switch the theme. The overlay layers re-theme by
   * re-applying the current provider's style (the existing style-swap
   * machinery re-adds every gpxr-* layer with the new palette and
   * restores route/selection/draw state — the same path a provider
   * switch takes, so mid-edit toggles are safe). The basemap itself
   * is darkened on the fresh style load (#darkenBasemap). The style
   * fetch is cached by the browser; the one-off tile reload on a
   * theme toggle is the accepted cost (recorded in MASTER_PLAN §FF).
   */
  setDarkTheme(dark: boolean): void {
    if (dark === this.#darkTheme) return;
    this.#darkTheme = dark;
    if (this.#map) this.#applyStyle(MAP_TILE_PROVIDERS[this.#provider].style);
  }

  /**
   * Phase 12 — darken the loaded basemap: walk the provider's own
   * layers and flip their plain color paints (raster layers are
   * dimmed via brightness/saturation). Skipped gpxr-* layers are
   * themed by the overlay palette instead. No-op when nothing
   * parseable is found (exotic styles degrade gracefully).
   */
  #darkenBasemap(): void {
    const map = this.#map;
    if (!map) return;
    const layers = (map.getStyle()?.layers ?? []) as StyleLayerRef[];
    const updates = collectDarkPaintUpdates(
      (layerId, property) =>
        map.getPaintProperty(
          layerId,
          property as Parameters<MlMap["getPaintProperty"]>[1],
        ),
      layers,
    );
    for (const update of updates) {
      // The property names come from our own COLOR_PROPERTIES table —
      // they are valid paint keys by construction (the generic maplibre
      // signature just cannot know that).
      map.setPaintProperty(
        update.layerId,
        update.property as Parameters<MlMap["setPaintProperty"]>[1],
        update.value,
      );
    }
  }

  /** Re-attempt the current provider's style after a degradation. */
  retryBasemap(): void {
    if (!this.#map) return;
    this.#setOffline(false); // optimistic; fetch errors re-assert
    this.#applyStyle(MAP_TILE_PROVIDERS[this.#provider].style);
  }

  resize(): void {
    this.#map?.resize();
  }

  // -- draw session (Phase 4) ------------------------------------------------

  /**
   * Open the interactive draw session for one gap. Idempotent per gap;
   * switching gaps replaces the session. Safe to call before the map is
   * ready — the latest session is applied on style load.
   */
  startDrawSession(options: DrawSessionOptions): void {
    this.#drawSession = {
      ...options,
      vertices: options.vertices.map((v) => ({ ...v })),
      chainJoin: options.chainJoin ?? null,
      closingJoin: options.closingJoin ?? null,
    };
    if (this.#ready) this.#applyDrawSession();
  }

  /**
   * Push the authoritative vertex list (the store is the source of truth;
   * the controller re-renders its draft from it after every command) and
   * the current road-follow joins (fresh closures whenever legs resolve).
   */
  updateDrawSession(
    vertices: readonly { id: VertexId; lat: number; lon: number }[],
    joins?: {
      chainJoin?: DrawChainJoinFn | null;
      closingJoin?: DrawClosingJoinFn | null;
    },
  ): void {
    if (!this.#drawSession) return;
    this.#drawSession.vertices = vertices.map((v) => ({ ...v }));
    if (joins) {
      this.#drawSession.chainJoin = joins.chainJoin ?? null;
      this.#drawSession.closingJoin = joins.closingJoin ?? null;
    }
    // A committed change invalidates any transient drag override.
    this.#handleDrag = null;
    if (this.#ready) this.#applyDrawSession();
  }

  /** Close the session: clear draft layers, restore interactions. */
  endDrawSession(): void {
    this.#drawSession = null;
    this.#handleDrag = null;
    this.#stroke = null;
    this.#drawDownXY = null;
    this.#cursor = null;
    this.#cancelTouchGesture();
    if (this.#pointerMode !== "pan") this.#setPointerModeInternal("pan");
    if (!this.#ready) return;
    const map = this.#map;
    if (!map) return;
    (map.getSource(SOURCE.draft) as GeoJSONSource | undefined)?.setData(
      draftLineCollection([]),
    );
    (map.getSource(SOURCE.stroke) as GeoJSONSource | undefined)?.setData(
      draftLineCollection([]),
    );
    (map.getSource(SOURCE.closing) as GeoJSONSource | undefined)?.setData(
      draftClosingCollection(null),
    );
    (map.getSource(SOURCE.rubber) as GeoJSONSource | undefined)?.setData(
      rubberBandCollection(null, null),
    );
    (map.getSource(SOURCE.handles) as GeoJSONSource | undefined)?.setData(
      drawHandleCollection([]),
    );
    (map.getSource(SOURCE.midpoints) as GeoJSONSource | undefined)?.setData(
      drawMidpointCollection([]),
    );
  }

  /**
   * The explicit pointer-mode toggle (plan risk #1: touch drawing must
   * never conflict with map navigation; Task 45 adds the third way).
   *
   *   - "draw": pointer = draw; drag-pan and box-zoom disabled (wheel
   *     zoom stays available).
   *   - "move": clicks place nothing; every placed point becomes an
   *     oversized grab target that drags freely (one undo step per
   *     release). Empty-space drags keep panning the map.
   *   - "pan": normal map navigation.
   */
  setPointerMode(mode: PointerMode): void {
    if (this.#pointerMode === mode) return;
    this.#setPointerModeInternal(mode);
  }

  /** Legacy boolean view (true = draw, false = pan). */
  setDrawMode(enabled: boolean): void {
    this.setPointerMode(enabled ? "draw" : "pan");
  }

  /**
   * The draw-mode pen (user pass 48): "default" places points click by
   * click; "curve" turns a press-drag into a freehand stroke (draw mode
   * only — Move and Pan are unaffected). A pen switch mid-stroke lets
   * the running stroke finish on release; nothing is lost.
   */
  setPenMode(pen: PenMode): void {
    if (this.#penMode === pen) return;
    this.#penMode = pen;
  }

  // -- span-pick session (manual repair spans) ----------------------------

  /**
   * Start a span-pick session on recorded points. `mode "anchor"`
   * collects ONE click (open add-missing-route); `mode "pair"` collects
   * two (redraw-a-stretch). Safe to call before the map is ready — the
   * session is applied on style load. Pan and wheel-zoom stay available
   * (the user may need to travel between anchors); double-click zoom is
   * disabled so a hurried click cannot zoom the map instead of picking.
   */
  startPickSession(options: PickSessionOptions): void {
    this.#detachPickEscListener(this.#pickSession);
    const escListener = () => {
      this.#pickSession?.options.callbacks.onCancel();
      // The hook ends the session when pickMode flips; ending here too
      // keeps the controller consistent even if the callback does not.
      this.endPickSession();
    };
    this.#pickSession = { options, anchor: null, escListener };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", escListener);
    }
    const map = this.#map;
    if (map) {
      map.doubleClickZoom?.disable();
      map.getCanvas().style.cursor = "crosshair";
      if (this.#ready) this.#applyPickAnchor();
    }
  }

  /** End the session: clear the anchor marker, restore interactions. */
  endPickSession(): void {
    const session = this.#pickSession;
    this.#pickSession = null;
    this.#detachPickEscListener(session);
    const map = this.#map;
    if (!map) return;
    if (!this.#drawMode) map.doubleClickZoom?.enable();
    if (!this.#drawSession) map.getCanvas().style.cursor = "";
    (map.getSource(SOURCE.pickAnchor) as GeoJSONSource | undefined)?.setData(
      pickAnchorCollection(null),
    );
  }

  /** Canvas click while picking → the mode's resolution rule. */
  #handlePickClick(e: MapMouseEvent): void {
    const session = this.#pickSession;
    const map = this.#map;
    if (!session || !map) return;
    if (session.options.mode === "anchor") {
      // "Add missing route" (user pass 36): the click resolves to the
      // segment ENDPOINT nearest to it — on the route's visible end or
      // anywhere else on the map. Clicking far from the route therefore
      // attaches at the route's nearest end (an honest "extend from
      // where the recording stopped") instead of silently becoming a
      // mid-route insert that behaves like redraw-a-stretch.
      const resolved = this.#nearestAnchorTarget(e.point);
      if (!resolved) return; // no recorded endpoints — keep waiting
      const distancePx = resolved.distancePx;
      session.options.callbacks.onAnchorPicked(
        resolved.target.pointId,
        resolved.target.segmentRole === "start" ? "start" : "end",
      );
      this.endPickSession();
      // Feedback for far clicks: the anchor the tool chose may sit well
      // away from the click — frame BOTH so the attachment point is
      // visible before the first drawn point lands.
      if (distancePx > ANCHOR_REFIT_PX && e.lngLat) {
        this.fitBounds(
          {
            minLat: Math.min(e.lngLat.lat, resolved.target.lat),
            minLon: Math.min(e.lngLat.lng, resolved.target.lon),
            maxLat: Math.max(e.lngLat.lat, resolved.target.lat),
            maxLon: Math.max(e.lngLat.lng, resolved.target.lon),
          },
          { padding: 128, maxZoom: 16.5, action: "fit-anchor-pick" },
        );
      }
      return;
    }
    const target = this.#nearestPickTarget(e.point);
    if (!target) return; // empty space — keep waiting
    if (!session.anchor) {
      session.anchor = target;
      this.#applyPickAnchor();
      return;
    }
    // A valid second anchor: a different point on the same track.
    if (target.pointId === session.anchor.pointId) return;
    if (target.trackIndex !== session.anchor.trackIndex) return;
    const a = session.anchor.pointId;
    const b = target.pointId;
    session.options.callbacks.onSpanPicked(a, b);
    // The hook flips pickMode off (which ends the session via its effect);
    // ending here as well makes the controller immediately consistent.
    this.endPickSession();
  }

  /**
   * Nearest SEGMENT ENDPOINT by screen distance — anchor mode's
   * resolution rule (no radius cap: any click attaches at the nearest
   * route ending). Pair mode's 16 px rule lives in #nearestPickTarget.
   */
  #nearestAnchorTarget(
    point: { x: number; y: number },
  ): { target: PickTarget; distancePx: number } | null {
    const map = this.#map;
    const session = this.#pickSession;
    if (!map || !session) return null;
    let best: PickTarget | null = null;
    let bestDistance = Infinity;
    for (const target of session.options.targets) {
      if (!target.isSegmentEnd) continue;
      const projected = map.project([target.lon, target.lat]);
      const distance = Math.hypot(
        projected.x - point.x,
        projected.y - point.y,
      );
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best ? { target: best, distancePx: bestDistance } : null;
  }

  /** Nearest pick target within the click tolerance, or null.
   *
   * Near-tie rule: when a segment ENDPOINT (first/last usable point) is
   * within the radius and within `ENDPOINT_TIE_PX` of the best distance,
   * it wins over an interior point. At a route's tail the last two
   * recorded points can sit a sub-pixel apart — a click at the visible
   * end must resolve to the endpoint (extend), never to its neighbor
   * (a spurious 3 m insert). */
  #nearestPickTarget(
    point: { x: number; y: number },
  ): PickTarget | null {
    const map = this.#map;
    const session = this.#pickSession;
    if (!map || !session) return null;
    let best: PickTarget | null = null;
    const pickRadius = this.#touchInput ? TOUCH_PICK_RADIUS_PX : PICK_RADIUS_PX;
    let bestDistance = pickRadius;
    let bestEnd: PickTarget | null = null;
    let bestEndDistance = pickRadius;
    for (const target of session.options.targets) {
      const projected = map.project([target.lon, target.lat]);
      const distance = Math.hypot(
        projected.x - point.x,
        projected.y - point.y,
      );
      if (distance > pickRadius) continue;
      if (target.isSegmentEnd) {
        if (distance < bestEndDistance) {
          bestEnd = target;
          bestEndDistance = distance;
        }
      } else if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    if (bestEnd && bestEndDistance <= bestDistance + ENDPOINT_TIE_PX) {
      return bestEnd;
    }
    return best ?? bestEnd;
  }

  /** Render (or clear) the first-anchor marker. */
  #applyPickAnchor(): void {
    const map = this.#map;
    if (!map || !this.#ready) return;
    const anchor = this.#pickSession?.anchor ?? null;
    (map.getSource(SOURCE.pickAnchor) as GeoJSONSource | undefined)?.setData(
      pickAnchorCollection(anchor ? { lat: anchor.lat, lon: anchor.lon } : null),
    );
  }

  #detachPickEscListener(session: PickSession | null): void {
    if (!session?.escListener) return;
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", session.escListener);
    }
  }

  #setPointerModeInternal(mode: PointerMode): void {
    this.#pointerMode = mode;
    const map = this.#map;
    if (!map) return;
    const handlers = [map.dragPan, map.doubleClickZoom, map.boxZoom];
    for (const handler of handlers) {
      if (!handler) continue;
      if (this.#drawMode) {
        handler.disable();
      } else {
        handler.enable();
      }
    }
    map.getCanvas().style.cursor = this.#drawMode ? "crosshair" : "";
    this.#applyHandleEmphasis();
    if (this.#ready) this.#applyRubberBand();
  }

  /**
   * Move mode's visible affordance (Task 45): the vertex handles grow
   * (bigger dot, thicker ring, larger hit target) so "drag any point"
   * is legible at a glance; every other mode restores the classic sizes.
   * Best-effort — a transient style swap simply skips the update.
   */
  #applyHandleEmphasis(): void {
    const map = this.#map;
    if (!map || !this.#ready) return;
    const emphasized = this.#pointerMode === "move";
    // Phase 8: coarse pointers draw bigger handles and carry the
    // ≥44 px hit targets (the grab area stays honest).
    const radius = (this.#touchInput
      ? emphasized
        ? TOUCH_HANDLE_RADIUS_PAINT_MOVE
        : TOUCH_HANDLE_RADIUS_PAINT
      : emphasized
        ? HANDLE_RADIUS_PAINT_MOVE
        : HANDLE_RADIUS_PAINT) as never;
    const stroke = (this.#touchInput
      ? emphasized
        ? TOUCH_HANDLE_STROKE_PAINT_MOVE
        : TOUCH_HANDLE_STROKE_PAINT
      : emphasized
        ? HANDLE_STROKE_PAINT_MOVE
        : HANDLE_STROKE_PAINT) as never;
    const hitRadius = this.#touchInput
      ? emphasized
        ? TOUCH_HANDLE_HIT_RADIUS_MOVE
        : TOUCH_HANDLE_HIT_RADIUS
      : emphasized
        ? HANDLE_HIT_RADIUS_MOVE
        : HANDLE_HIT_RADIUS;
    try {
      map.setPaintProperty(LAYER.draftHandle, "circle-radius", radius);
      map.setPaintProperty(LAYER.draftHandle, "circle-stroke-width", stroke);
      map.setPaintProperty(LAYER.draftHandleHit, "circle-radius", hitRadius);
    } catch {
      // The style can be mid-swap — the next mode change re-applies.
    }
  }

  // -- test bridge ----------------------------------------------------------

  /** Programmatic zoom for E2E pan/zoom responsiveness probes. */
  zoomIn(): void {
    this.#lastCameraAction = "zoom-in";
    this.#map?.zoomIn({ duration: 400 });
  }

  /** Project a geographic position to canvas pixels (E2E click targets). */
  projectLatLon(lat: number, lon: number): { x: number; y: number } {
    const map = this.#map;
    if (!map) return { x: 0, y: 0 };
    const point = map.project([lon, lat]);
    return { x: point.x, y: point.y };
  }

  /** Unproject canvas pixels to a geographic position (E2E assertions). */
  unprojectXY(x: number, y: number): { lat: number; lon: number } {
    const map = this.#map;
    if (!map) return { lat: NaN, lon: NaN };
    const lngLat = map.unproject([x, y]);
    return { lat: lngLat.lat, lon: lngLat.lng };
  }

  getTestState(): MapTestState {
    const map = this.#map;
    const route = this.#route;
    // The style object is transiently absent during style swaps — the
    // bridge must never throw, only report what is currently there.
    const style = map ? map.getStyle() : undefined;
    return {
      status: this.#status,
      ready: this.#ready,
      offline: this.#offline,
      provider: this.#provider,
      layerIds: style ? style.layers.map((l) => l.id) : [],
      routeFeatureCount: route?.lines.length ?? 0,
      routeRenderedCoords: this.#routeRenderedCoords,
      routeStride: this.#routeStride,
      gapSpanCount: route?.spans.length ?? 0,
      boundaryMarkerCount: route?.markers.length ?? 0,
      reconstructionLineCount: route?.reconstructions.length ?? 0,
      selectedGapId: this.#selectedGapId,
      zoom: map ? map.getZoom() : 0,
      center: map
        ? { lat: map.getCenter().lat, lon: map.getCenter().lng }
        : null,
      lastCameraAction: this.#lastCameraAction,
      spanScreenPositions: this.#spanScreenPositions(),
      moving: map ? map.isMoving() : false,
      drawSession: this.#drawSessionTestState(),
      pickSession: this.#pickSession
        ? {
            active: true,
            mode: this.#pickSession.options.mode,
            hasAnchor: this.#pickSession.anchor !== null,
          }
        : null,
      touch: {
        touchInput: this.#touchInput,
        gesture: this.#touchGesture?.kind ?? null,
        navActive: this.#touchNavActive,
      },
    };
  }

  // -- internals ------------------------------------------------------------

  #setStatus(status: MapControllerStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#callbacks.onStatusChange?.(status);
  }

  #setOffline(offline: boolean): void {
    if (this.#offline === offline) return;
    this.#offline = offline;
    this.#callbacks.onOfflineChange?.(offline);
  }

  #noteUserCamera(): void {
    this.#lastCameraAction = "user";
  }

  #gapIdFromEvent(e: MapLayerMouseEvent): string | null {
    const gapId = e.features?.[0]?.properties?.gapId;
    return typeof gapId === "string" ? gapId : null;
  }

  #observeResize(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.#resizeObserver = new ResizeObserver(() => this.#map?.resize());
    this.#resizeObserver.observe(this.#container);
  }

  #applyStyle(style: string | StyleSpecification): void {
    this.#pendingStyle = true;
    this.#map?.setStyle(style, { diff: false });
  }

  #onStyleLoad(): void {
    const map = this.#map;
    if (!map) return;
    this.#pendingStyle = false;
    if (this.#appliedFallback) {
      // The blank fallback just loaded after a failed remote fetch: the
      // offline notice must stay up.
      this.#appliedFallback = false;
    } else {
      // A style the user asked for loaded — clear the offline notice;
      // tile fetch errors will re-assert it if connectivity is still bad.
      this.#setOffline(false);
    }
    // Phase 12 — darken the basemap (if the theme asks for it) BEFORE
    // the overlay layers are added, so the walk only meets the
    // provider's own layers; our gpxr-* layers are themed by the
    // palette instead.
    if (this.#darkTheme) this.#darkenBasemap();
    this.#addLayers();
    this.#applyRoute();
    this.#applySelection();
    this.#applyDrawSession();
    if (this.#pickSession) {
      // Style swaps recreate sources — restore the pick affordances.
      this.#pickSession.anchor = null;
      map.doubleClickZoom?.disable();
      map.getCanvas().style.cursor = "crosshair";
      this.#applyPickAnchor();
    }
    if (this.#pointerMode !== "pan") {
      this.#setPointerModeInternal(this.#pointerMode);
    }
    if (!this.#ready) {
      this.#ready = true;
      this.#setStatus("ready");
      if (this.#pendingFocus) {
        const focus = this.#pendingFocus;
        this.#pendingFocus = null;
        this.#fit(focus);
      }
    }
  }

  #onError(e: { error?: unknown }): void {
    const message = String(e.error ?? "");
    if (/webgl/i.test(message)) {
      this.#setStatus("unsupported");
      return;
    }
    if (this.#pendingStyle) {
      // The style itself could not be fetched (offline / blocked):
      // degrade to the local blank style so the route still renders.
      this.#appliedFallback = true;
      this.#setOffline(true);
      this.#applyStyle(BLANK_STYLE);
      return;
    }
    // Style is loaded; remaining errors are tile/source fetch failures.
    // Sticky until the next successful style load (retry / switch).
    this.#setOffline(true);
  }

  #addLayers(): void {
    const map = this.#map;
    if (!map) return;

    // Phase 12 — the overlay palette for the current theme (see
    // lib/map/palette.ts): ink route + severity ramp flip with the
    // theme, signal holds.
    const palette = mapOverlayPalette(this.#darkTheme);

    if (!map.getSource(SOURCE.route)) {
      map.addSource(SOURCE.route, {
        type: "geojson",
        data: routeLineCollection([]),
      });
      map.addSource(SOURCE.spans, {
        type: "geojson",
        data: gapSpanCollection([]),
      });
      map.addSource(SOURCE.markers, {
        type: "geojson",
        data: gapMarkerCollection([]),
      });
      map.addSource(SOURCE.recon, {
        type: "geojson",
        data: reconstructionLineCollection([]),
      });
      map.addSource(SOURCE.draft, {
        type: "geojson",
        data: draftLineCollection([]),
      });
      map.addSource(SOURCE.stroke, {
        type: "geojson",
        data: draftLineCollection([]),
      });
      map.addSource(SOURCE.closing, {
        type: "geojson",
        data: draftClosingCollection(null),
      });
      map.addSource(SOURCE.rubber, {
        type: "geojson",
        data: rubberBandCollection(null, null),
      });
      map.addSource(SOURCE.handles, {
        type: "geojson",
        data: drawHandleCollection([]),
      });
      map.addSource(SOURCE.midpoints, {
        type: "geojson",
        data: drawMidpointCollection([]),
      });
    }

    if (!map.getSource(SOURCE.pickAnchor)) {
      map.addSource(SOURCE.pickAnchor, {
        type: "geojson",
        data: pickAnchorCollection(null),
      });
    }

    if (map.getLayer(LAYER.route)) return;

    // Recorded route — solid blue (§I-3).
    map.addLayer({
      id: LAYER.route,
      type: "line",
      source: SOURCE.route,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.route,
        "line-width": 3,
        "line-opacity": 0.9,
      },
    });

    // Selection glow under the dashed span: the signal color marks
    // the interactive target (the span about to be repaired).
    map.addLayer({
      id: LAYER.spanSelected,
      type: "line",
      source: SOURCE.spans,
      filter: NONE_FILTER,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": palette.recon, "line-width": 7, "line-opacity": 0.45 },
    });
    map.addLayer({
      id: LAYER.markerHalo,
      type: "circle",
      source: SOURCE.markers,
      filter: NONE_FILTER,
      paint: { "circle-radius": 13, "circle-color": palette.markerPaper, "circle-opacity": 0.85 },
    });

    // Gap span — dashed, severity-colored (never color alone: dash + legend).
    map.addLayer({
      id: LAYER.span,
      type: "line",
      source: SOURCE.spans,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": severityColor(palette) as never,
        "line-width": 3,
        "line-dasharray": [2, 2],
      },
    });

    // Boundary markers: before = hollow ring, after = filled dot —
    // distinguishable by shape, not just color (§C color-blind safety).
    map.addLayer({
      id: LAYER.markerBefore,
      type: "circle",
      source: SOURCE.markers,
      filter: ["==", ["get", "role"], "before"],
      paint: {
        "circle-radius": 7,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": severityColor(palette) as never,
        "circle-stroke-width": 3,
      },
    });
    map.addLayer({
      id: LAYER.markerAfter,
      type: "circle",
      source: SOURCE.markers,
      filter: ["==", ["get", "role"], "after"],
      paint: {
        "circle-radius": 5.5,
        "circle-color": severityColor(palette) as never,
        "circle-stroke-color": palette.markerPaper,
        "circle-stroke-width": 2,
      },
    });

    // Transparent hit targets (wider geometry for clicks and hover;
    // Phase 8: coarse pointers get ≥44 px targets).
    map.addLayer({
      id: LAYER.spanHit,
      type: "line",
      source: SOURCE.spans,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-opacity": 0,
        "line-width": this.#touchInput ? TOUCH_SPAN_HIT_WIDTH : 18,
      },
    });
    map.addLayer({
      id: LAYER.markerHit,
      type: "circle",
      source: SOURCE.markers,
      paint: {
        "circle-opacity": 0,
        "circle-radius": this.#touchInput
          ? TOUCH_MARKER_HIT_RADIUS
          : 16,
      },
    });

    // -- Phase 4: reconstruction + draw-session layers ---------------------
    // Committed reconstructions — SOLID signal orange: the authored route
    // reads as the app's work, distinct from the recorded ink by hue
    // (+ legend + UI provenance badges). WYSIWYG contract: solid while
    // drawing, solid after commit — the style never changes under the
    // user's feet.
    map.addLayer({
      id: LAYER.recon,
      type: "line",
      source: SOURCE.recon,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.recon,
        "line-width": 3.5,
        "line-opacity": 0.95,
      },
      // Task 47: footpath-styled lines render on the dashed twin below —
      // roads stay solid, footpaths read as trails at a glance.
      filter: ["!=", ["get", "pathStyle"], "foot"],
    });

    // Footpath-styled committed lines — the same signal color, dashed
    // (the classic map convention for pedestrian ways). Same source,
    // complementary filter: exactly one layer draws each line.
    map.addLayer({
      id: LAYER.reconDashed,
      type: "line",
      source: SOURCE.recon,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.recon,
        "line-width": 3,
        "line-opacity": 0.95,
        "line-dasharray": [2.5, 2],
      },
      filter: ["==", ["get", "pathStyle"], "foot"],
    });

    // Active draft chain — SOLID, brighter, wider, with a white casing:
    // exactly the segments the user placed (before-anchor → vertices).
    map.addLayer({
      id: LAYER.draftLine,
      type: "line",
      source: SOURCE.draft,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.reconDraft,
        "line-width": 4.5,
      },
    });

    // The LIVE freehand stroke (Curve pen, user pass 48): identical paint
    // to the draft chain — the trace under the pen IS the line-to-be
    // (WYSIWYG); on release it is simplified + smoothed into the chain.
    map.addLayer({
      id: LAYER.strokeLine,
      type: "line",
      source: SOURCE.stroke,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.reconDraft,
        "line-width": 4.5,
      },
    });

    // Open closing segment — dashed + subdued: the connection that closes
    // when the user finishes (last chain point → after-anchor). Deliberately
    // lighter than the chain so it is never mistaken for a clicked segment.
    map.addLayer({
      id: LAYER.draftClosing,
      type: "line",
      source: SOURCE.closing,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.reconDraft,
        "line-width": 2.5,
        "line-dasharray": [1.5, 2.5],
        "line-opacity": 0.6,
      },
    });

    // Rubber band — thin, subdued; trails from the user's LAST placed
    // point (the next-click preview), never from the far anchor.
    map.addLayer({
      id: LAYER.draftRubber,
      type: "line",
      source: SOURCE.rubber,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": palette.reconDraft,
        "line-width": 1.5,
        "line-dasharray": [1.5, 2],
        "line-opacity": 0.55,
      },
    });

    // Midpoint insertion handles ("+" affordances between path points).
    map.addLayer({
      id: LAYER.draftMidpoint,
      type: "circle",
      source: SOURCE.midpoints,
      paint: {
        "circle-radius": 4.5,
        "circle-color": palette.markerPaper,
        "circle-stroke-color": palette.reconDraft,
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.9,
      },
    });

    // Vertex handles — white fill, signal stroke. Radius/stroke grow on
    // hover (feature-state driven): the point visibly "picks itself up",
    // teaching draggability without a single word. (The extracted paint
    // expressions let Move mode swap in its emphasized variant — Task 45;
    // Phase 8 swaps in the touch variant on coarse pointers.)
    map.addLayer({
      id: LAYER.draftHandle,
      type: "circle",
      source: SOURCE.handles,
      paint: {
        "circle-radius": (this.#touchInput
          ? TOUCH_HANDLE_RADIUS_PAINT
          : HANDLE_RADIUS_PAINT) as never,
        "circle-color": palette.markerPaper,
        "circle-stroke-color": palette.recon,
        "circle-stroke-width": (this.#touchInput
          ? TOUCH_HANDLE_STROKE_PAINT
          : HANDLE_STROKE_PAINT) as never,
      },
    });

    // Draft hit targets (on top of everything else).
    map.addLayer({
      id: LAYER.draftMidpointHit,
      type: "circle",
      source: SOURCE.midpoints,
      paint: {
        "circle-opacity": 0,
        "circle-radius": this.#touchInput
          ? TOUCH_MIDPOINT_HIT_RADIUS
          : 12,
      },
    });
    map.addLayer({
      id: LAYER.draftHandleHit,
      type: "circle",
      source: SOURCE.handles,
      paint: {
        "circle-opacity": 0,
        "circle-radius": this.#touchInput
          ? TOUCH_HANDLE_HIT_RADIUS
          : HANDLE_HIT_RADIUS,
      },
    });

    // Span-pick first anchor — white fill, signal ring (draw-anywhere).
    map.addLayer({
      id: LAYER.pickAnchor,
      type: "circle",
      source: SOURCE.pickAnchor,
      paint: {
        "circle-radius": 6,
        "circle-color": palette.markerPaper,
        "circle-stroke-color": palette.reconDraft,
        "circle-stroke-width": 3,
      },
    });
  }

  #applyRoute(): void {
    const map = this.#map;
    if (!map) return;
    const route = this.#route;
    // Phase 9 — the recorded lines render decimated for the current zoom
    // (identity below the noise floor; spans/markers/reconstructions are
    // never sampled — they are tiny by construction).
    const { lines: rendered, stride } = decimateForZoom(
      route?.lines ?? [],
      map.getZoom(),
    );
    this.#routeStride = stride;
    this.#routeRenderedCoords = rendered.reduce(
      (sum, line) => sum + line.coordinates.length,
      0,
    );
    const routeSource = map.getSource(SOURCE.route) as GeoJSONSource | undefined;
    routeSource?.setData(routeLineCollection(rendered));
    const spanSource = map.getSource(SOURCE.spans) as GeoJSONSource | undefined;
    spanSource?.setData(gapSpanCollection(route?.spans ?? []));
    const markerSource = map.getSource(SOURCE.markers) as
      | GeoJSONSource
      | undefined;
    markerSource?.setData(gapMarkerCollection(route?.markers ?? []));
    const reconSource = map.getSource(SOURCE.recon) as
      | GeoJSONSource
      | undefined;
    reconSource?.setData(
      reconstructionLineCollection(route?.reconstructions ?? []),
    );
  }

  #applySelection(): void {
    const map = this.#map;
    if (!map) return;
    const filter: LayerFilterValue = this.#selectedGapId
      ? ["==", ["get", "gapId"], this.#selectedGapId]
      : NONE_FILTER;
    if (map.getLayer(LAYER.spanSelected)) {
      map.setFilter(LAYER.spanSelected, filter);
    }
    if (map.getLayer(LAYER.markerHalo)) {
      map.setFilter(LAYER.markerHalo, filter);
    }
  }

  /**
   * Phase 9 — a zoom gesture ended: re-decimate the recorded route only
   * when the stride band actually changed (powers of two ⇒ a handful of
   * rebuilds across the whole zoom range).
   */
  #onZoomBandChange(): void {
    const map = this.#map;
    if (!map || !this.#route) return;
    const stride = decimationStride(this.#route.lines, map.getZoom());
    if (stride !== this.#routeStride) this.#applyRoute();
  }

  #fit(target: FocusTarget): void {
    const map = this.#map;
    if (!map) return;
    const width = this.#container.clientWidth || 800;
    const padding =
      target.padding ?? Math.round(Math.max(24, Math.min(64, width * 0.05)));
    this.#lastCameraAction = target.action;
    map.fitBounds(
      [
        [target.bbox.minLon, target.bbox.minLat],
        [target.bbox.maxLon, target.bbox.maxLat],
      ],
      { padding, maxZoom: target.maxZoom, duration: 600 },
    );
  }

  #spanScreenPositions(): MapTestState["spanScreenPositions"] {
    const map = this.#map;
    if (!map || !this.#ready || !this.#route) return [];
    return this.#route.spans.map((span) => {
      const [[lon0, lat0], [lon1, lat1]] = span.coordinates;
      const point = map.project([(lon0 + lon1) / 2, (lat0 + lat1) / 2]);
      return { gapId: span.gapId as string, x: point.x, y: point.y };
    });
  }

  // -- draw internals (Phase 4) ----------------------------------------------

  /**
   * Screen-space resolution at `point`, in meters per pixel, measured by
   * unprojecting a 100 px horizontal offset (exact at the queried spot —
   * no tile-size math, no latitude assumptions).
   */
  #metersPerPixelAt(point: { x: number; y: number }): number {
    const map = this.#map;
    if (!map) return Infinity;
    const a = map.unproject([point.x, point.y]);
    const b = map.unproject([point.x + 100, point.y]);
    const meters = haversineDistanceMeters(
      { lat: a.lat, lon: a.lng },
      { lat: b.lat, lon: b.lng },
    );
    return Number.isFinite(meters) ? meters / 100 : Infinity;
  }

  /** Resolve a commit position: raw, or snapped when a magnet is close. */
  #snapPosition(
    target: LatLon,
    point: { x: number; y: number },
  ): DrawCommitPosition {
    const session = this.#drawSession;
    const snap = session?.snap;
    if (!session || !snap) return { ...target };
    const radiusPx = this.#touchInput ? TOUCH_SNAP_RADIUS_PX : SNAP_RADIUS_PX;
    const maxMeters = this.#metersPerPixelAt(point) * radiusPx;
    if (!Number.isFinite(maxMeters)) return { ...target };
    return snap(target, maxMeters) ?? { ...target };
  }

  /** Canvas click in draw mode → add a vertex (unless on an affordance). */
  #onCanvasClick(e: MapMouseEvent): void {
    // Span picking owns the click while active (mutually exclusive with
    // the draw session — pick mode closes any open editor first).
    if (this.#pickSession) {
      this.#handlePickClick(e);
      return;
    }
    const session = this.#drawSession;
    if (!session || !this.#drawMode) return;
    // The click that follows a committed handle drag or curve stroke is
    // not an add.
    if (this.#suppressNextClick) {
      this.#suppressNextClick = false;
      return;
    }
    const map = this.#map;
    if (!map) return;
    // Clicking a handle or midpoint is a different edit — never both.
    const hits = map.queryRenderedFeatures(e.point, {
      layers: [LAYER.draftHandleHit, LAYER.draftMidpointHit],
    });
    if (hits.length > 0) return;
    const position = this.#snapPosition(
      { lat: e.lngLat.lat, lon: e.lngLat.lng },
      e.point,
    );
    session.callbacks.onVertexAdd(position);
  }

  /** Canvas press in draw mode: remember where it started, and with the
   * Curve pen (user pass 48) begin capturing a freehand stroke. */
  #onCanvasMouseDown(e: MapMouseEvent): void {
    const session = this.#drawSession;
    if (!session || !this.#drawMode) return;
    this.#drawDownXY = { x: e.point.x, y: e.point.y };
    if (this.#penMode !== "curve") return;
    this.#stroke = {
      points: [{ lat: e.lngLat.lat, lon: e.lngLat.lng }],
      lastXY: { x: e.point.x, y: e.point.y },
      totalPx: 0,
    };
    // The rubber band would trail behind the stroke — hide it until the
    // pen lifts (the next mousemove re-establishes it).
    this.#cursor = null;
    if (this.#ready) this.#applyRubberBand();
  }

  /** Pointer tracking: rubber band while idle, override while dragging,
   * live capture while a curve stroke runs. */
  #onMouseMove(e: MapMouseEvent): void {
    const session = this.#drawSession;
    // A running freehand stroke owns the pointer (Curve pen).
    const stroke = this.#stroke;
    if (stroke) {
      const step = Math.hypot(
        e.point.x - stroke.lastXY.x,
        e.point.y - stroke.lastXY.y,
      );
      if (step >= STROKE_MIN_STEP_PX) {
        stroke.points.push({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        stroke.totalPx += step;
        stroke.lastXY = { x: e.point.x, y: e.point.y };
        this.#applyStroke();
      }
      return;
    }
    // Handle drags are Move-mode edits — they run while the mode holds.
    const drag = this.#handleDrag;
    if (session && drag) {
      const map = this.#map;
      if (map) {
        const dx = e.point.x - drag.originXY.x;
        const dy = e.point.y - drag.originXY.y;
        if (drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          if (!drag.moved && map.getCanvas().style.cursor !== "grabbing") {
            map.getCanvas().style.cursor = "grabbing";
          }
          drag.moved = true;
          drag.override = { lat: e.lngLat.lat, lon: e.lngLat.lng };
          this.#applyDrawSession();
        }
      }
      return;
    }
    if (!session || !this.#drawMode) return;
    this.#cursor = { lat: e.lngLat.lat, lon: e.lngLat.lng };

    if (this.#ready) this.#applyRubberBand();
  }

  /** End of press: commit a finished curve stroke, end a handle drag, and
   * swallow the trailing click of any dragged press (it is not a tap). */
  #onMouseUp(e: MapMouseEvent): void {
    const session = this.#drawSession;
    const map = this.#map;

    // A finished freehand stroke (Curve pen): hand the raw trace to the
    // hook. A press that barely moved is a TAP — no stroke is committed
    // and the trailing click places the single point, exactly like the
    // default pen.
    const stroke = this.#stroke;
    if (stroke) {
      this.#stroke = null;
      this.#clearStroke();
      if (map) {
        map.getCanvas().style.cursor =
          session && this.#drawMode ? "crosshair" : "";
      }
      if (
        session &&
        stroke.totalPx >= STROKE_MIN_LENGTH_PX &&
        session.callbacks.onStrokeCommit
      ) {
        this.#suppressNextClick = true;
        session.callbacks.onStrokeCommit(stroke.points);
      }
      this.#drawDownXY = null;
      return;
    }

    // A dragged press in draw mode (default pen) is not a click either —
    // without this, releasing a stray drag would plant a surprise point
    // at the release position.
    const down = this.#drawDownXY;
    this.#drawDownXY = null;
    if (
      down &&
      session &&
      this.#drawMode &&
      Math.hypot(e.point.x - down.x, e.point.y - down.y) > DRAG_THRESHOLD_PX
    ) {
      this.#suppressNextClick = true;
    }

    const drag = this.#handleDrag;
    this.#handleDrag = null;
    if (map && drag) {
      // Restore the resting cursor for the active mode (hover affordance
      // re-asserts itself on the next enter).
      map.getCanvas().style.cursor =
        session && this.#drawMode ? "crosshair" : "";
    }
    if (!drag || !session || !drag.moved || !drag.override) return;
    // The browser fires a trailing click after this mouseup — swallow it.
    this.#suppressNextClick = true;
    const position = this.#snapPosition(
      { lat: e.lngLat.lat, lon: e.lngLat.lng },
      e.point,
    );
    session.callbacks.onVertexMove(drag.vertexId, position);
    this.#applyDrawSession();
  }

  // -- touch gesture layer (Phase 8) ----------------------------------------
  //
  // MapLibre GL v6 never turns touch into mouse events (its handler
  // manager checks `instanceof MouseEvent`), so this layer speaks the
  // DOM touch events directly. The listeners live on the CONTROLLER's
  // container in the CAPTURE phase: capture on an ancestor runs
  // before MapLibre's canvas-container listeners, which is exactly
  // what the two-finger handoff needs — the second finger's
  // touchstart re-enables the navigation handlers BEFORE MapLibre
  // processes that same event, so pan/pinch take over seamlessly
  // mid-gesture (MapLibre's TouchPanHandler only activates on a
  // touchstart it sees while enabled; re-enabling later in the same
  // event leaves it inert until the next gesture).

  /** Coarse-pointer detection → the enlarged hit targets. */
  #detectTouchInput(): void {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    try {
      this.#touchInput = window.matchMedia("(pointer: coarse)").matches;
    } catch {
      // ancient engines — mouse-sized targets are the safe default
    }
  }

  #bindTouchLayer(): void {
    const container = this.#container;
    const options: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };
    const bind = (
      type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
      handler: (e: TouchEvent) => void,
    ) => {
      container.addEventListener(type, handler, options);
      return () =>
        container.removeEventListener(type, handler, options);
    };
    this.#touchDetachers = [
      bind("touchstart", (e) => this.#onTouchStart(e)),
      bind("touchmove", (e) => this.#onTouchMove(e)),
      bind("touchend", (e) => this.#onTouchEnd(e)),
      bind("touchcancel", (e) => this.#onTouchCancel(e)),
    ];
  }

  /** Canvas-relative point of a touch (MapLibre's own coordinate basis). */
  #touchPoint(touch: Touch): { x: number; y: number } | null {
    const map = this.#map;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  /** The vertex handle under a screen point (hit layer, touch-sized). */
  #handleAt(point: { x: number; y: number }): VertexId | null {
    const map = this.#map;
    if (!map) return null;
    const hits = map.queryRenderedFeatures([point.x, point.y], {
      layers: [LAYER.draftHandleHit],
    });
    const vertexId = hits[0]?.properties?.vertexId;
    return typeof vertexId === "string" ? (vertexId as VertexId) : null;
  }

  #onTouchStart(e: TouchEvent): void {
    const map = this.#map;
    if (!map) return;
    for (const touch of Array.from(e.changedTouches)) {
      this.#activeTouchIds.add(touch.identifier);
    }
    for (const touch of Array.from(e.touches)) {
      this.#activeTouchIds.add(touch.identifier);
    }

    // Two fingers = navigation, always (the plan's draw/pan contract:
    // one finger draws, two fingers travel). Cancel anything a single
    // finger was doing and hand the gesture to MapLibre's handlers.
    if (this.#activeTouchIds.size >= 2) {
      this.#cancelTouchGesture();
      this.#beginTouchNavigation();
      return;
    }
    if (this.#activeTouchIds.size !== 1 || this.#touchNavActive) return;
    // Span picking and non-draw contexts keep the classic behavior:
    // taps synthesize clicks, drags navigate. Nothing to own.
    const session = this.#drawSession;
    if (!session || this.#pickSession || this.#pointerMode === "pan") {
      return;
    }
    const touch = e.touches[0] ?? e.changedTouches[0];
    if (!touch) return;
    const point = this.#touchPoint(touch);
    if (!point) return;
    const handleHit =
      this.#pointerMode === "move" || this.#drawMode
        ? this.#handleAt(point)
        : null;

    // Long-press candidate: a draw-mode press on a handle (touch's
    // contextual delete — the dblclick twin).
    let longPressTimer: number | null = null;
    let longPressVertex: VertexId | null = null;
    if (this.#drawMode && handleHit) {
      longPressVertex = handleHit;
      const vertex = handleHit;
      longPressTimer = window.setTimeout(() => {
        this.#fireLongPress(vertex);
      }, LONG_PRESS_MS);
    }

    const gesture: TouchGesture = {
      kind: "press",
      identifier: touch.identifier,
      startXY: point,
      lastXY: point,
      movedPx: 0,
      longPressTimer,
      longPressVertex,
      handleVertex: null,
    };

    if (this.#pointerMode === "move" && handleHit) {
      // Move mode: the finger grabbed a point — drag it (panning is
      // suspended for the gesture; empty-space drags still pan).
      e.preventDefault();
      map.dragPan.disable();
      gesture.kind = "handle";
      gesture.handleVertex = handleHit;
      this.#handleDrag = {
        vertexId: handleHit,
        originXY: point,
        override: null,
        moved: false,
      };
      this.#touchGesture = gesture;
      return;
    }

    if (this.#drawMode && this.#penMode === "curve") {
      // Curve pen: the finger is the pen. preventDefault keeps the
      // browser from synthesizing click/mouseup after the gesture —
      // this layer commits (taps included, see #onTouchEnd).
      e.preventDefault();
      const lngLat = map.unproject([point.x, point.y]);
      gesture.kind = "stroke";
      this.#stroke = {
        points: [{ lat: lngLat.lat, lon: lngLat.lng }],
        lastXY: point,
        totalPx: 0,
      };
      // The rubber band would trail behind the stroke — hide it
      // until the pen lifts (the mouse path's same discipline).
      this.#cursor = null;
      if (this.#ready) this.#applyRubberBand();
      this.#touchGesture = gesture;
      return;
    }

    if (this.#drawMode) {
      // Default pen: the tap is OURS too — browser click synthesis
      // after touch is not a contract (it depends on preventDefault,
      // tap disambiguation, and double-tap zoom suppression), so the
      // layer commits taps itself (see #onTouchEnd). Drags add
      // nothing, exactly like the mouse path's stray-drag swallow.
      e.preventDefault();
      this.#touchGesture = gesture;
      return;
    }

    // Move mode on empty space: not ours — the map pans. No gesture.
  }

  #onTouchMove(e: TouchEvent): void {
    const gesture = this.#touchGesture;
    if (!gesture) return;
    if (this.#touchNavActive) return;
    const touch = this.#changedTouch(e, gesture.identifier);
    if (!touch) return;
    const point = this.#touchPoint(touch);
    if (!point) return;
    const map = this.#map;
    if (!map) return;

    gesture.lastXY = point;
    const travel = Math.hypot(
      point.x - gesture.startXY.x,
      point.y - gesture.startXY.y,
    );
    gesture.movedPx = Math.max(gesture.movedPx, travel);
    // Movement cancels the long-press — it became a drag.
    if (gesture.movedPx > LONG_PRESS_CANCEL_PX) {
      this.#clearLongPress(gesture);
    }

    if (gesture.kind === "stroke") {
      const stroke = this.#stroke;
      if (!stroke) return;
      const step = Math.hypot(
        point.x - stroke.lastXY.x,
        point.y - stroke.lastXY.y,
      );
      if (step >= STROKE_MIN_STEP_PX) {
        const lngLat = map.unproject([point.x, point.y]);
        stroke.points.push({ lat: lngLat.lat, lon: lngLat.lng });
        stroke.totalPx += step;
        stroke.lastXY = point;
        this.#applyStroke();
      }
      return;
    }

    if (gesture.kind === "handle") {
      const drag = this.#handleDrag;
      if (!drag) return;
      const dx = point.x - drag.originXY.x;
      const dy = point.y - drag.originXY.y;
      if (drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        const lngLat = map.unproject([point.x, point.y]);
        drag.moved = true;
        drag.override = { lat: lngLat.lat, lon: lngLat.lng };
        this.#applyDrawSession();
      }
    }
  }

  #onTouchEnd(e: TouchEvent): void {
    for (const touch of Array.from(e.changedTouches)) {
      this.#activeTouchIds.delete(touch.identifier);
    }
    const gesture = this.#touchGesture;
    if (gesture && this.#changedTouch(e, gesture.identifier)) {
      this.#touchGesture = null;
      this.#clearLongPress(gesture);
      const map = this.#map;
      const session = this.#drawSession;

      if (gesture.kind === "stroke") {
        const stroke = this.#stroke;
        this.#stroke = null;
        this.#clearStroke();
        if (map) {
          map.getCanvas().style.cursor =
            session && this.#drawMode ? "crosshair" : "";
        }
        if (stroke && session && this.#drawMode) {
          if (
            stroke.totalPx >= STROKE_MIN_LENGTH_PX &&
            session.callbacks.onStrokeCommit
          ) {
            session.callbacks.onStrokeCommit(stroke.points);
          } else {
            // A tap (preventDefault suppressed the synthesized
            // click): place the single point, exactly like the
            // default pen's tap — including the handle/midpoint
            // hit checks the click path performs.
            const end = stroke.points[stroke.points.length - 1];
            this.#handleTouchTap(end);
          }
        }
      } else if (gesture.kind === "handle") {
        const drag = this.#handleDrag;
        this.#handleDrag = null;
        if (map) {
          map.getCanvas().style.cursor =
            session && this.#drawMode ? "crosshair" : "";
        }
        // Restore Move mode's navigation contract (empty-space drags
        // pan again — re-asserting the mode's handler state).
        this.#setPointerModeInternal(this.#pointerMode);
        if (drag && session && drag.moved && drag.override) {
          const touch = this.#changedTouch(e, gesture.identifier);
          const point = touch ? this.#touchPoint(touch) : null;
          const position = point
            ? this.#snapPosition(
                { lat: drag.override.lat, lon: drag.override.lon },
                point,
              )
            : { ...drag.override };
          session.callbacks.onVertexMove(drag.vertexId, position);
          this.#applyDrawSession();
        }
      }
      // kind "press": a stationary release in draw mode is a TAP —
      // place the point through the same rules the click path
      // follows (affordance hits, snap). A dragged release is not
      // (the stray-drag swallow, the mouse path's discipline).
      if (
        gesture.kind === "press" &&
        session &&
        this.#drawMode &&
        gesture.movedPx <= LONG_PRESS_CANCEL_PX
      ) {
        const end = this.#changedTouch(e, gesture.identifier);
        const endPoint = end ? this.#touchPoint(end) : null;
        if (endPoint && map) {
          const lngLat = map.unproject([endPoint.x, endPoint.y]);
          this.#handleTouchTap({ lat: lngLat.lat, lon: lngLat.lng });
        }
      }
    }

    // All fingers lifted: end the navigation override (draw mode
    // re-disables pan; a fresh gesture starts clean).
    if (this.#activeTouchIds.size === 0) {
      this.#endTouchNavigation();
    }
  }

  #onTouchCancel(e: TouchEvent): void {
    for (const touch of Array.from(e.changedTouches)) {
      this.#activeTouchIds.delete(touch.identifier);
    }
    this.#cancelTouchGesture();
    if (this.#activeTouchIds.size === 0) {
      this.#endTouchNavigation();
    }
  }

  /** The gesture's touch within a change event, if it is in there. */
  #changedTouch(
    e: TouchEvent,
    identifier: number,
  ): Touch | null {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === identifier) return touch;
    }
    return null;
  }

  #clearLongPress(gesture: TouchGesture): void {
    if (gesture.longPressTimer !== null) {
      clearTimeout(gesture.longPressTimer);
      gesture.longPressTimer = null;
    }
    gesture.longPressVertex = null;
  }

  /** Long-press fired: the touch twin of dblclick-delete. */
  #fireLongPress(vertex: VertexId): void {
    const gesture = this.#touchGesture;
    if (!gesture || gesture.longPressVertex !== vertex) return;
    this.#touchGesture = null;
    this.#clearLongPress(gesture);
    // Whatever the press was becoming (a stroke), it ends here —
    // the delete is the gesture's outcome, nothing follows it.
    this.#stroke = null;
    this.#clearStroke();
    this.#drawDownXY = null;
    const session = this.#drawSession;
    if (!session || !this.#drawMode) return;
    session.callbacks.onVertexDelete(vertex);
    announce("Point deleted.");
  }

  /** Abort the owned gesture without committing anything. */
  #cancelTouchGesture(): void {
    const gesture = this.#touchGesture;
    this.#touchGesture = null;
    if (!gesture) return;
    this.#clearLongPress(gesture);
    if (gesture.kind === "stroke") {
      this.#stroke = null;
      this.#clearStroke();
      this.#drawDownXY = null;
    } else if (gesture.kind === "handle") {
      // Discard the drag override — the user chose to navigate
      // instead; the vertex stays where it was.
      this.#handleDrag = null;
      this.#applyDrawSession();
      this.#setPointerModeInternal(this.#pointerMode);
    }
  }

  /** Two fingers landed: navigation takes the map for this gesture. */
  #beginTouchNavigation(): void {
    this.#touchNavActive = true;
    const map = this.#map;
    if (!map) return;
    // Draw mode disabled these on entry; the capture phase lets us
    // re-enable them BEFORE MapLibre's handlers see this touchstart,
    // so the pan/pinch activates with the fingers already down.
    for (const handler of [map.dragPan, map.doubleClickZoom, map.boxZoom]) {
      if (!handler) continue;
      try {
        handler.enable();
      } catch {
        // transient style state — the mode re-asserts on gesture end
      }
    }
  }

  /** The last finger lifted: restore the mode's handler contract. */
  #endTouchNavigation(): void {
    if (!this.#touchNavActive) return;
    this.#touchNavActive = false;
    this.#setPointerModeInternal(this.#pointerMode);
  }

  /**
   * A Curve-pen tap (no stroke): place one point through the same
   * rules the synthesized click follows — affordance hit checks
   * (handle = no add, midpoint = insert) and the snap magnet.
   */
  #handleTouchTap(position: LatLon): void {
    const map = this.#map;
    const session = this.#drawSession;
    if (!map || !session || !this.#drawMode) return;
    // Rebuild the screen point from the position (the tap's own
    // coordinates were the stroke's last sample — the same spot).
    const projected = map.project([position.lon, position.lat]);
    const point = { x: projected.x, y: projected.y };
    const hits = map.queryRenderedFeatures([point.x, point.y], {
      layers: [LAYER.draftHandleHit, LAYER.draftMidpointHit],
    });
    if (hits.length > 0) {
      const hit = hits[0];
      if (hit.layer?.id === LAYER.draftMidpointHit) {
        const insertIndex = hit.properties?.insertIndex;
        if (typeof insertIndex === "number") {
          session.callbacks.onVertexInsert(insertIndex, {
            ...this.#snapPosition(position, point),
          });
        }
      }
      // A handle hit: nothing to add (the press was on an
      // affordance — long-press is its contextual action).
      return;
    }
    session.callbacks.onVertexAdd(this.#snapPosition(position, point));
  }


  /** The user-placed chain (drag override applied): before-anchor → vertices
   *  (the anchor is absent for anchor-less sessions — vertices only). */
  #draftChainPoints(): LatLon[] {
    const session = this.#drawSession;
    if (!session) return [];
    const override = this.#handleDrag?.override ?? null;
    const overrideId = this.#handleDrag?.vertexId ?? null;
    const points: LatLon[] = session.anchors.before
      ? [session.anchors.before]
      : [];
    for (const vertex of session.vertices) {
      points.push(
        override && vertex.id === overrideId
          ? { lat: override.lat, lon: override.lon }
          : { lat: vertex.lat, lon: vertex.lon },
      );
    }
    return points;
  }

  /**
   * The rendered chain geometry: nodes joined by the injected road-follow
   * fn (straight legs when off/absent). During a handle drag the overridden
   * node matches no leg, so the dragged legs preview straight — the road
   * path re-applies when the move commits and the hook re-routes.
   */
  #renderedChain(): { points: LatLon[]; midpoints: LatLon[] } {
    const session = this.#drawSession;
    const chain = this.#draftChainPoints();
    if (!session || chain.length === 0) return { points: [], midpoints: [] };
    if (session.chainJoin) {
      const joined = session.chainJoin(chain);
      return {
        points: [...joined.points],
        midpoints: [...joined.midpoints],
      };
    }
    // No join injected: straight legs, straight-leg midpoints.
    const midpoints: LatLon[] = [];
    for (let j = 0; j + 1 < chain.length; j += 1) {
      midpoints.push(interpolateLatLon(chain[j], chain[j + 1], 0.5));
    }
    return { points: chain, midpoints };
  }

  /** The live freehand stroke (Curve pen): rendered with the exact draft
   * chain paint — what the pen drags is what the line will be (WYSIWYG). */
  #applyStroke(): void {
    const map = this.#map;
    if (!map || !this.#ready) return;
    const stroke = this.#stroke;
    const coordinates: [number, number][] = stroke
      ? stroke.points.map((p) => [p.lon, p.lat] as [number, number])
      : [];
    (map.getSource(SOURCE.stroke) as GeoJSONSource | undefined)?.setData(
      draftLineCollection(coordinates),
    );
  }

  /** Clear the live stroke layer (after commit or cancellation). */
  #clearStroke(): void {
    const map = this.#map;
    if (!map || !this.#ready) return;
    (map.getSource(SOURCE.stroke) as GeoJSONSource | undefined)?.setData(
      draftLineCollection([]),
    );
  }

  /** The closing-segment coordinates: injected join over the far anchor. */
  #renderedClosing(): [number, number][] {
    const session = this.#drawSession;
    if (!session) return [];
    const after = session.anchors.after;
    const chain = this.#draftChainPoints();
    const last = chain[chain.length - 1] ?? null;
    if (!after || !last) return [];
    if (session.closingJoin) return session.closingJoin(last, after);
    return [
      [last.lon, last.lat],
      [after.lon, after.lat],
    ];
  }

  /** The authoritative full path (chain + closing) with any drag override. */
  #draftPathPoints(): LatLon[] {
    const chain = this.#draftChainPoints();
    if (chain.length === 0) return chain;
    const after = this.#drawSession?.anchors.after ?? null;
    return after ? [...chain, after] : chain;
  }

  /** Re-render every draft source from the current session state. */
  #applyDrawSession(): void {
    const map = this.#map;
    if (!map || !this.#ready) return;
    const session = this.#drawSession;
    if (!session) return;

    // WYSIWYG split: the solid line is the RENDERED chain — exactly what
    // the user placed with road-follow legs substituted between the nodes
    // (the same join the commit consumes); the connection to the
    // after-anchor is a distinct subdued dashed segment (road-followed too
    // when a leg resolved) that reads as "closes on finish".
    const rendered = this.#renderedChain();
    const renderedCoordinates: [number, number][] = rendered.points.map(
      (p) => [p.lon, p.lat] as [number, number],
    );
    const handles: DrawHandleData[] = session.vertices.map((vertex, index) => {
      const overridden =
        this.#handleDrag?.vertexId === vertex.id && this.#handleDrag?.override;
      return {
        gapId: session.gapId as never,
        vertexId: vertex.id,
        index,
        lat: overridden ? this.#handleDrag!.override!.lat : vertex.lat,
        lon: overridden ? this.#handleDrag!.override!.lon : vertex.lon,
      };
    });
    // Midpoints live on the CHAIN legs only — the closing segment is not
    // user data yet and offers no insertion handle.
    const midpoints: DrawMidpointData[] = rendered.midpoints.map(
      (mid, index) => ({
        gapId: session.gapId as never,
        insertIndex: index,
        lat: mid.lat,
        lon: mid.lon,
      }),
    );

    (map.getSource(SOURCE.draft) as GeoJSONSource | undefined)?.setData(
      draftLineCollection(renderedCoordinates),
    );
    (map.getSource(SOURCE.closing) as GeoJSONSource | undefined)?.setData(
      draftClosingCollection(this.#renderedClosing()),
    );
    (map.getSource(SOURCE.handles) as GeoJSONSource | undefined)?.setData(
      drawHandleCollection(handles),
    );
    (map.getSource(SOURCE.midpoints) as GeoJSONSource | undefined)?.setData(
      drawMidpointCollection(midpoints),
    );
    this.#applyRubberBand();
  }

  /**
   * Rubber band: the end of the user-placed CHAIN → cursor — the preview of
   * where the next click attaches (never from the far anchor: the chasing
   * line from the wrong end reads as a line the app drew on its own).
   * Visible only in draw mode with the pointer over the canvas and no drag.
   */
  #applyRubberBand(): void {
    const map = this.#map;
    if (!map || !this.#ready) return;
    const session = this.#drawSession;
    const visible =
      session !== null && this.#drawMode && this.#cursor !== null && !this.#handleDrag;
    if (!visible || !session) {
      (map.getSource(SOURCE.rubber) as GeoJSONSource | undefined)?.setData(
        rubberBandCollection(null, null),
      );
      return;
    }
    const chain = this.#draftChainPoints();
    const last = chain[chain.length - 1] ?? null;
    (map.getSource(SOURCE.rubber) as GeoJSONSource | undefined)?.setData(
      rubberBandCollection(last, this.#cursor),
    );
  }

  #drawSessionTestState(): DrawSessionTestState | null {
    const session = this.#drawSession;
    const map = this.#map;
    if (!session) return null;
    const chain = this.#draftChainPoints();
    const chainCoordinates: [number, number][] = chain.map((p) => [p.lon, p.lat]);
    const rendered = this.#renderedChain();
    const renderedChainCoordinates: [number, number][] = rendered.points.map(
      (p) => [p.lon, p.lat] as [number, number],
    );
    const closing = this.#renderedClosing();
    const path = this.#draftPathPoints();
    const coordinates: [number, number][] = path.map((p) => [p.lon, p.lat]);
    const handleScreenPositions = session.vertices.map((vertex) => {
      const overridden =
        this.#handleDrag?.vertexId === vertex.id && this.#handleDrag?.override;
      const lat = overridden ? this.#handleDrag!.override!.lat : vertex.lat;
      const lon = overridden ? this.#handleDrag!.override!.lon : vertex.lon;
      if (!map) return { vertexId: vertex.id as string, x: 0, y: 0 };
      const point = map.project([lon, lat]);
      return { vertexId: vertex.id as string, x: point.x, y: point.y };
    });
    // Midpoint hit targets mirror the rendered chain legs (see
    // #applyDrawSession).
    const midpointScreenPositions: { insertIndex: number; x: number; y: number }[] =
      [];
    for (const [index, mid] of rendered.midpoints.entries()) {
      if (!map) break;
      const point = map.project([mid.lon, mid.lat]);
      midpointScreenPositions.push({
        insertIndex: index,
        x: point.x,
        y: point.y,
      });
    }
    return {
      gapId: session.gapId,
      drawMode: this.#drawMode,
      pointerMode: this.#pointerMode,
      penMode: this.#penMode,
      strokeActive: this.#stroke !== null,
      vertexCount: session.vertices.length,
      chainCoordinates,
      renderedChainCoordinates,
      closingCoordinates: closing,
      pathCoordinates: coordinates,
      handleScreenPositions,
      midpointScreenPositions,
      rubberBandVisible:
        this.#drawMode && this.#cursor !== null && !this.#handleDrag,
    };
  }

  #attachTestBridge(): void {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;
    window.__gpxMapController = this;
  }

  #detachTestBridge(): void {
    if (typeof window === "undefined") return;
    if (window.__gpxMapController === this) {
      delete window.__gpxMapController;
    }
  }
}

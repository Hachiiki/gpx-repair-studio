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
import type { LatLon, PointId, VertexId } from "@/types/domain";
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
import {
  BLANK_STYLE,
  MAP_TILE_PROVIDERS,
  type TileProviderId,
} from "./styles";

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
}

/** Draw-session snapshot for E2E synthetic-pointer drawing assertions. */
export interface DrawSessionTestState {
  gapId: string;
  drawMode: boolean;
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
  "gpxr-draft-line",
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
  draftLine: "gpxr-draft-line",
  draftClosing: "gpxr-draft-closing",
  draftRubber: "gpxr-draft-rubber",
  draftHandle: "gpxr-draft-handle",
  draftMidpoint: "gpxr-draft-midpoint",
  draftHandleHit: "gpxr-draft-handle-hit",
  draftMidpointHit: "gpxr-draft-midpoint-hit",
  pickAnchor: "gpxr-pick-anchor",
} as const;

/**
 * Ink & Signal map palette (Task 29). The five UI anchors rule the
 * canvas too: the recorded route is INK (solid #222222 — the watch's
 * truth, immutable), everything the app creates is SIGNAL
 * (#FC4C02 — committed reconstructions, drafts, selection). Gap
 * spans are a SHADE ramp: heavier ink = heavier problem (severity
 * also carried by dash pattern + markers + legend, never color
 * alone).
 */
const ROUTE_COLOR = "#222222";

/** Reconstruction color: the brand signal — the app's own work. */
const RECON_COLOR = "#FC4C02";
/** Draft chain: the same signal at reduced alpha — placed, not yet
 *  committed (width + white handles carry the active state too). */
const RECON_COLOR_DRAFT = "rgba(252,76,2,0.85)";

/** Snap magnet radius in screen pixels (converted to meters at commit). */
const SNAP_RADIUS_PX = 14;

/** Click tolerance when picking span anchors (screen pixels). */
const PICK_RADIUS_PX = 16;

/** Endpoint preference band: an endpoint within this many pixels of the
 * best interior target wins the pick (see #nearestPickTarget). */
const ENDPOINT_TIE_PX = 2;

/** Minimum pointer travel (px) before a handle press counts as a drag. */
const DRAG_THRESHOLD_PX = 3;

/** Gap-span colors by severity — a darkness ramp on the shade anchor
 * (dash pattern + markers + legend carry the meaning too). */
const SEVERITY_COLORS: Record<string, string> = {
  severe: "#000000",
  suspect: "#5A5A5A",
  info: "rgba(90,90,90,0.55)",
};

const severityColor = (): unknown =>
  [
    "match",
    ["get", "severity"],
    "severe",
    SEVERITY_COLORS.severe,
    "suspect",
    SEVERITY_COLORS.suspect,
    SEVERITY_COLORS.info,
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
  /** The near anchor the chain starts from (always present). */
  anchors: { before: LatLon; after: LatLon | null };
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
}

export interface PickSessionOptions {
  /** "anchor": ONE click starts an open add-missing-route session.
   *  "pair": two clicks bound a stretch to redraw (classic mode). */
  mode: "anchor" | "pair";
  targets: readonly PickTarget[];
  callbacks: {
    /** Both anchors picked (pair mode). Document-order fixing is the hook's job. */
    onSpanPicked: (a: PointId, b: PointId) => void;
    /** The single anchor picked (anchor mode) — the hook derives the shape. */
    onAnchorPicked: (pointId: PointId) => void;
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

  #status: MapControllerStatus = "initializing";
  #ready = false;
  #offline = false;
  #pendingStyle = false;
  #appliedFallback = false;

  #route: RouteViewData | null = null;
  #selectedGapId: string | null = null;
  #pendingFocus: FocusTarget | null = null;
  #lastCameraAction: string | null = null;

  // Draw session (Phase 4)
  #drawSession: DrawSession | null = null;
  #drawMode = false;
  #handleDrag: HandleDrag | null = null;
  #cursor: LatLon | null = null;
  /** Set when a committed handle drag must swallow its trailing click. */
  #suppressNextClick = false;
  /** Feature id of the hovered vertex handle (mouseleave carries no
   * features — the id is tracked on enter so hover state can clear). */
  #hoveredHandleId: string | number | null = null;

  // Span-pick session (manual repair spans)
  #pickSession: PickSession | null = null;

  constructor(options: {
    container: HTMLElement;
    provider: TileProviderId;
    callbacks?: MapControllerCallbacks;
  }) {
    this.#container = options.container;
    this.#provider = options.provider;
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

    this.#subscriptions.push(
      map.on("style.load", () => this.#onStyleLoad()),
      map.on("error", (e) => this.#onError(e)),
      map.on("dragstart", () => this.#noteUserCamera()),
      map.on("wheel", () => this.#noteUserCamera()),
      map.on("boxzoomstart", () => this.#noteUserCamera()),
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
    // map-level pointer tracking for add-clicks, the rubber band, and
    // handle drags. Add-clicks, midpoints, and double-click delete are
    // draw-mode-only; handle DRAGS are pointer-targeted and work in both
    // modes (the explicit Draw/Pan toggle stays the anti-fat-finger
    // contract for adding points; gesture hardening arrives in Phase 8).
    this.#subscriptions.push(
      map.on("mousedown", LAYER.draftHandleHit, (e) => {
        // Dragging a placed point is pointer-TARGETED input — it works in
        // BOTH draw and pan mode ("I'm moving this point", not "I'm
        // drawing"), so the mode gate is intentionally absent here.
        if (!this.#drawSession) return;
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
        // Cursor honesty (QoL): a grab cursor over a point says "this
        // drags" in either mode; the hover feature-state grows the dot.
        if (!this.#drawSession || this.#handleDrag) return;
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
      map.on("click", (e) => this.#onCanvasClick(e)),
      map.on("mouseup", (e) => this.#onMouseUp(e)),
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#detachPickEscListener(this.#pickSession);
    this.#pickSession = null;
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
    this.#cursor = null;
    if (this.#drawMode) this.#setDrawModeInternal(false);
    if (!this.#ready) return;
    const map = this.#map;
    if (!map) return;
    (map.getSource(SOURCE.draft) as GeoJSONSource | undefined)?.setData(
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
   * The explicit Draw/Pan toggle (plan risk #1: touch drawing must never
   * conflict with map navigation). Draw mode: pointer = draw, drag-pan and
   * box-zoom disabled (wheel zoom stays available). Pan mode: normal map.
   */
  setDrawMode(enabled: boolean): void {
    if (this.#drawMode === enabled) return;
    this.#setDrawModeInternal(enabled);
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

  /** Canvas click while picking → nearest target within PICK_RADIUS_PX. */
  #handlePickClick(e: MapMouseEvent): void {
    const session = this.#pickSession;
    const map = this.#map;
    if (!session || !map) return;
    const target = this.#nearestPickTarget(e.point);
    if (!target) return; // empty space — keep waiting
    if (session.options.mode === "anchor") {
      // One click is all the "add missing route" flow needs: the hook
      // derives the span shape (insert vs open extension) from the point's
      // position in the recording.
      session.options.callbacks.onAnchorPicked(target.pointId);
      this.endPickSession();
      return;
    }
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
    let bestDistance = PICK_RADIUS_PX;
    let bestEnd: PickTarget | null = null;
    let bestEndDistance = PICK_RADIUS_PX;
    for (const target of session.options.targets) {
      const projected = map.project([target.lon, target.lat]);
      const distance = Math.hypot(
        projected.x - point.x,
        projected.y - point.y,
      );
      if (distance > PICK_RADIUS_PX) continue;
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

  #setDrawModeInternal(enabled: boolean): void {
    this.#drawMode = enabled;
    const map = this.#map;
    if (!map) return;
    const handlers = [map.dragPan, map.doubleClickZoom, map.boxZoom];
    for (const handler of handlers) {
      if (!handler) continue;
      if (enabled) {
        handler.disable();
      } else {
        handler.enable();
      }
    }
    map.getCanvas().style.cursor = enabled ? "crosshair" : "";
    if (this.#ready) this.#applyRubberBand();
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
    if (this.#drawMode) this.#setDrawModeInternal(true);
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
        "line-color": ROUTE_COLOR,
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
      paint: { "line-color": "#FC4C02", "line-width": 7, "line-opacity": 0.45 },
    });
    map.addLayer({
      id: LAYER.markerHalo,
      type: "circle",
      source: SOURCE.markers,
      filter: NONE_FILTER,
      paint: { "circle-radius": 13, "circle-color": "#ffffff", "circle-opacity": 0.85 },
    });

    // Gap span — dashed, severity-colored (never color alone: dash + legend).
    map.addLayer({
      id: LAYER.span,
      type: "line",
      source: SOURCE.spans,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": severityColor() as never,
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
        "circle-stroke-color": severityColor() as never,
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
        "circle-color": severityColor() as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    // Transparent hit targets (wider geometry for clicks and hover).
    map.addLayer({
      id: LAYER.spanHit,
      type: "line",
      source: SOURCE.spans,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-opacity": 0, "line-width": 18 },
    });
    map.addLayer({
      id: LAYER.markerHit,
      type: "circle",
      source: SOURCE.markers,
      paint: { "circle-opacity": 0, "circle-radius": 16 },
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
        "line-color": RECON_COLOR,
        "line-width": 3.5,
        "line-opacity": 0.95,
      },
    });

    // Active draft chain — SOLID, brighter, wider, with a white casing:
    // exactly the segments the user placed (before-anchor → vertices).
    map.addLayer({
      id: LAYER.draftLine,
      type: "line",
      source: SOURCE.draft,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": RECON_COLOR_DRAFT,
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
        "line-color": RECON_COLOR_DRAFT,
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
        "line-color": RECON_COLOR_DRAFT,
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
        "circle-color": "#ffffff",
        "circle-stroke-color": RECON_COLOR_DRAFT,
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.9,
      },
    });

    // Vertex handles — white fill, signal stroke. Radius/stroke grow on
    // hover (feature-state driven): the point visibly "picks itself up",
    // teaching draggability without a single word.
    map.addLayer({
      id: LAYER.draftHandle,
      type: "circle",
      source: SOURCE.handles,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["feature-state", "hover"],
          0,
          5.5,
          1,
          8,
        ],
        "circle-color": "#ffffff",
        "circle-stroke-color": RECON_COLOR,
        "circle-stroke-width": [
          "interpolate",
          ["linear"],
          ["feature-state", "hover"],
          0,
          2.5,
          1,
          3.5,
        ],
      },
    });

    // Draft hit targets (on top of everything else).
    map.addLayer({
      id: LAYER.draftMidpointHit,
      type: "circle",
      source: SOURCE.midpoints,
      paint: { "circle-opacity": 0, "circle-radius": 12 },
    });
    map.addLayer({
      id: LAYER.draftHandleHit,
      type: "circle",
      source: SOURCE.handles,
      paint: { "circle-opacity": 0, "circle-radius": 12 },
    });

    // Span-pick first anchor — white fill, signal ring (draw-anywhere).
    map.addLayer({
      id: LAYER.pickAnchor,
      type: "circle",
      source: SOURCE.pickAnchor,
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffffff",
        "circle-stroke-color": RECON_COLOR_DRAFT,
        "circle-stroke-width": 3,
      },
    });
  }

  #applyRoute(): void {
    const map = this.#map;
    if (!map) return;
    const route = this.#route;
    const routeSource = map.getSource(SOURCE.route) as GeoJSONSource | undefined;
    routeSource?.setData(routeLineCollection(route?.lines ?? []));
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
    const maxMeters = this.#metersPerPixelAt(point) * SNAP_RADIUS_PX;
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
    // The click that follows a committed handle drag is not an add.
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

  /** Pointer tracking: rubber band while idle, override while dragging. */
  #onMouseMove(e: MapMouseEvent): void {
    const session = this.#drawSession;
    // Handle drags are pointer-targeted edits — they run in BOTH modes,
    // so drag processing precedes the draw-mode gate.
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

  /** End of a handle drag → commit the (snapped) move as one command. */
  #onMouseUp(e: MapMouseEvent): void {
    const drag = this.#handleDrag;
    const session = this.#drawSession;
    this.#handleDrag = null;
    const map = this.#map;
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

  /** The user-placed chain (drag override applied): before-anchor → vertices. */
  #draftChainPoints(): LatLon[] {
    const session = this.#drawSession;
    if (!session) return [];
    const override = this.#handleDrag?.override ?? null;
    const overrideId = this.#handleDrag?.vertexId ?? null;
    const points: LatLon[] = [session.anchors.before];
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

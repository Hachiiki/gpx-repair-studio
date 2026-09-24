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
 * Phase 3 — Map Display. Browser-only (constructed by the React binding
 * hook, never by domain code).
 */

import type {
  GeoJSONSource,
  Map as MlMap,
  MapLayerMouseEvent,
  StyleSpecification,
  Subscription,
} from "maplibre-gl";
import type { BBox } from "@/lib/geo/bbox";
import {
  gapMarkerCollection,
  gapSpanCollection,
  routeLineCollection,
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
  selectedGapId: string | null;
  zoom: number;
  center: { lat: number; lon: number } | null;
  lastCameraAction: string | null;
  /** Screen-space midpoints of the gap spans (for synthetic clicks). */
  spanScreenPositions: { gapId: string; x: number; y: number }[];
  /** True while a camera animation or user gesture is in progress. */
  moving: boolean;
}

/** Layer ids — `gpxr` prefix mirrors the export provenance namespace. */
export const MAP_LAYER_IDS = [
  "gpxr-route",
  "gpxr-gap-span-selected",
  "gpxr-gap-span",
  "gpxr-gap-boundary-halo",
  "gpxr-gap-boundary-before",
  "gpxr-gap-boundary-after",
  "gpxr-gap-span-hit",
  "gpxr-gap-boundary-hit",
] as const;

const SOURCE = {
  route: "gpxr-route",
  spans: "gpxr-gap-spans",
  markers: "gpxr-gap-boundaries",
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
} as const;

/** Recorded-route color (master plan §I-3: original = solid blue). */
const ROUTE_COLOR = "#2563eb";

/** Gap-span colors by severity (dash pattern carries the meaning too). */
const SEVERITY_COLORS: Record<string, string> = {
  severe: "#dc2626",
  suspect: "#ea580c",
  info: "#64748b",
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
        const gapId = this.#gapIdFromEvent(e);
        if (gapId !== null) this.#callbacks.onGapSelected?.(gapId);
      }),
      map.on("mouseenter", [LAYER.spanHit, LAYER.markerHit], () => {
        map.getCanvas().style.cursor = "pointer";
      }),
      map.on("mouseleave", [LAYER.spanHit, LAYER.markerHit], () => {
        map.getCanvas().style.cursor = "";
      }),
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
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

  // -- test bridge ----------------------------------------------------------

  /** Programmatic zoom for E2E pan/zoom responsiveness probes. */
  zoomIn(): void {
    this.#lastCameraAction = "zoom-in";
    this.#map?.zoomIn({ duration: 400 });
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
      selectedGapId: this.#selectedGapId,
      zoom: map ? map.getZoom() : 0,
      center: map
        ? { lat: map.getCenter().lat, lon: map.getCenter().lng }
        : null,
      lastCameraAction: this.#lastCameraAction,
      spanScreenPositions: this.#spanScreenPositions(),
      moving: map ? map.isMoving() : false,
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

    // Selection casing under the dashed span + boundary halo.
    map.addLayer({
      id: LAYER.spanSelected,
      type: "line",
      source: SOURCE.spans,
      filter: NONE_FILTER,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
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

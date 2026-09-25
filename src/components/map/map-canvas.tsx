/**
 * MapCanvas — the map panel (Phase 3): container element for MapLibre plus
 * the state overlays (initializing / unsupported / offline / empty route)
 * and the chrome (toolbar, legend, selected-gap chip).
 *
 * Pure presentation: it renders the `MapBinding` produced by
 * `useMapController` and dispatches intents — no map objects, no stores,
 * no domain imports (ESLint boundaries). The controller instance itself
 * lives in the hook; this component only provides the DOM anchor
 * (`map.containerRef`) and the overlays around it.
 *
 * Textual alternative (§C-5): a visually-hidden summary of the rendered
 * route (segments / points / gaps / extent) keeps the map panel meaningful
 * for screen readers; interactive map usage stays pointer/keyboard via
 * MapLibre's native handlers.
 */

import "maplibre-gl/dist/maplibre-gl.css";

import { Button } from "@/components/ui/button";
import { Loader2, MapIcon, WifiOff, Crosshair } from "lucide-react";
import { DrawDistanceBadge } from "@/components/map/draw-distance-badge";
import { GapHighlightOverlay } from "@/components/map/gap-highlight-overlay";
import { MapLegend } from "@/components/map/map-legend";
import { MapToolbar } from "@/components/map/map-toolbar";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
import type { MapBinding } from "@/hooks/use-map-controller";
import type { BBox } from "@/lib/geo/bbox";

function extentText(extent: BBox | null): string {
  if (!extent) return "unknown";
  return (
    `lat ${extent.minLat.toFixed(5)} to ${extent.maxLat.toFixed(5)}, ` +
    `lon ${extent.minLon.toFixed(5)} to ${extent.maxLon.toFixed(5)}`
  );
}

export interface MapCanvasProps {
  /** The map binding (status, providers, selection, intents). */
  map: MapBinding;
  /**
   * Callback ref for the map container — passed as a separate top-level
   * prop (not read off `map` inside this component) so it stays a plain
   * function binding for `react-hooks/refs`: member expressions flowing
   * into a `ref` attribute taint their whole source object in that rule's
   * dataflow analysis. The hook guarantees a stable identity.
   */
  attachContainer: (element: HTMLDivElement | null) => void;
  /** Phase 4: the draw-editor binding (badge + Draw/Pan toggle chrome). */
  draw?: DrawEditorBinding | null;
}

export function MapCanvas({ map, attachContainer, draw = null }: MapCanvasProps) {
  const routeEmpty =
    map.status === "ready" && map.route !== null && map.route.lines.length === 0;
  const editorActive = draw?.active === true;

  return (
    <div className="overflow-hidden rounded-xl border" data-testid="map-canvas">
      <div
        ref={attachContainer}
        className="relative h-[380px] w-full bg-muted/40 sm:h-[460px] lg:h-[540px]"
        role="application"
        aria-label="Interactive map of the recorded route and its gaps"
      >
        {/* Initializing */}
        {map.status === "initializing" && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/60 text-sm text-muted-foreground"
            data-testid="map-initializing"
          >
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Loading map…
          </div>
        )}

        {/* WebGL unavailable — textual fallback (the panels stay usable). */}
        {map.status === "unsupported" && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted/60 px-6 text-center"
            data-testid="map-fallback"
          >
            <span className="rounded-full bg-muted p-3">
              <MapIcon className="size-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h3 className="font-semibold">Map unavailable</h3>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                This browser or device cannot render the interactive map
                (WebGL is unavailable or disabled). All inspection and
                repair features remain fully usable through the panels.
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Recorded extent: {extentText(map.extent)}
              </p>
            </div>
          </div>
        )}

        {/* Basemap offline / blocked — route and gaps still render. */}
        {map.status !== "unsupported" && map.offline && (
          <div
            className="absolute inset-x-2 top-2 z-20 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/95 px-2.5 py-1.5 text-xs text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/90 dark:text-amber-100"
            data-testid="map-offline-notice"
            role="status"
          >
            <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1 leading-snug">
              Basemap tiles unavailable — you may be offline. The recorded
              route and gaps are still shown.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 shrink-0 px-2 text-[11px]"
              onClick={map.retryBasemap}
            >
              Retry
            </Button>
          </div>
        )}

        {/* No renderable geometry (all coordinates damaged). */}
        {routeEmpty && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            data-testid="map-empty-route"
            role="status"
          >
            <p className="rounded-lg border bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm">
              No renderable route points — all recorded coordinates are
              damaged.
            </p>
          </div>
        )}

        {/* Chrome (hidden while initializing; irrelevant if unsupported). */}
        {map.status === "ready" && (
          <>
            {editorActive && draw && (
              <DrawDistanceBadge
                distanceM={draw.distanceM}
                vertexCount={draw.vertexCount}
                maxVertices={draw.maxVertices}
                drawMode={draw.drawMode}
              />
            )}
            {draw?.pickMode && (
              <div
                className="pointer-events-none absolute inset-x-2 top-2 z-20 mx-auto w-fit max-w-full rounded-lg border border-emerald-600/40 bg-emerald-50/95 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/90 dark:text-emerald-100"
                data-testid="pick-mode-chip"
                role="status"
              >
                <span className="flex items-center gap-1.5">
                  <Crosshair
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {draw.pickMode === "anchor"
                    ? "Click one point on the route — then draw anywhere · Esc cancels"
                    : "Pick two points on the recorded route — Esc cancels"}
                </span>
              </div>
            )}
            <MapToolbar
              provider={map.provider}
              providers={map.providers}
              onProviderChange={map.setProvider}
              onFitActivity={map.fitToActivity}
              drawMode={editorActive && draw ? draw.drawMode : null}
              onToggleDrawMode={editorActive && draw ? draw.setDrawMode : undefined}
            />
            <MapLegend />
            {map.selectedGap && !editorActive && (
              <GapHighlightOverlay
                gap={map.selectedGap}
                onClear={() => map.selectGap(null)}
              />
            )}
          </>
        )}
      </div>

      {/* Textual alternative (§C-5). */}
      <p className="sr-only" data-testid="map-sr-summary">
        Map panel: {map.segmentCount} segment
        {map.segmentCount === 1 ? "" : "s"},{" "}
        {map.route?.usablePointCount ?? 0} renderable recorded point
        {(map.route?.usablePointCount ?? 0) === 1 ? "" : "s"},{" "}
        {map.gapCount} detected gap{map.gapCount === 1 ? "" : "s"}. Recorded
        extent: {extentText(map.extent)}. Select gaps from the detected-gaps
        list to highlight and focus them on the map.
        {editorActive && draw && draw.vertexCount > 0
          ? ` Reconstruction in progress: ${draw.vertexCount} drawn point${draw.vertexCount === 1 ? "" : "s"}.`
          : ""}
      </p>
    </div>
  );
}

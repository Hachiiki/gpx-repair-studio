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
import {
  Crosshair,
  Hand,
  MapIcon,
  Move,
  PenLine,
  Spline,
  WifiOff,
} from "lucide-react";
import { DrawDistanceBadge } from "@/components/map/draw-distance-badge";
import { GapHighlightOverlay } from "@/components/map/gap-highlight-overlay";
import { MapLegend } from "@/components/map/map-legend";
import { MapToolbar } from "@/components/map/map-toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
import type {
  MapDrawChromeBinding,
} from "@/hooks/use-draw-editor";
import type { MapBinding } from "@/hooks/use-map-controller";
import type { BBox } from "@/lib/geo/bbox";

function extentText(t: TranslatorArg, extent: BBox | null): string {
  if (!extent) return t("map.canvas.extentUnknown");
  return t("map.canvas.extentRange", {
    minLat: extent.minLat.toFixed(5),
    maxLat: extent.maxLat.toFixed(5),
    minLon: extent.minLon.toFixed(5),
    maxLon: extent.maxLon.toFixed(5),
  });
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
  /**
   * The draw-editor chrome binding (badge + Draw/Pan toggle + pick
   * banner). Structural subset — the repair/recovery DrawEditorBindings
   * and the create section's lighter binding all satisfy it.
   */
  draw?: MapDrawChromeBinding | null;
  /**
   * A section-specific line appended to the screen-reader summary (the
   * shared wording assumes a parsed file; sections without one say so).
   */
  srNote?: string;
  /**
   * Phase 19 — force the legend's compare entries on (used by sections
   * that render a ghost through other means). Defaults to the binding's
   * own `compareGhost`.
   */
  compareGhost?: boolean;
}

export function MapCanvas({
  map,
  attachContainer,
  draw = null,
  srNote,
  compareGhost,
}: MapCanvasProps) {
  const { t } = useI18n();
  // "Nothing renderable at all" — recorded lines AND committed
  // reconstructions are empty. Reconstruction-only views (the create
  // workflow's review track, re-imported repairs on a fully damaged
  // recording) have geometry to draw and must NOT show the damaged note.
  const routeEmpty =
    map.status === "ready" &&
    map.route !== null &&
    map.route.lines.length === 0 &&
    map.route.reconstructions.length === 0;
  const editorActive = draw?.active === true;

  return (
    <div
      className="overflow-hidden rounded-[12px] border-2 border-ink"
      data-testid="map-canvas"
    >
      <div
        ref={attachContainer}
        /* Phase 8 — the mobile map and the collapsed tools sheet tile
         * the viewport at top scroll (header + map + sheet peek); the
         * sheet floats over whatever the scroll position brings. */
        className="relative h-[calc(100dvh-19.5rem)] min-h-[380px] w-full bg-muted/40 lg:h-[calc(100dvh-11.875rem)] lg:min-h-[540px]"
        role="application"
        aria-label={t("map.canvas.applicationAria")}
      >
        {/* Initializing — the plate taking shape (user pass 35): a
            ghost route in the field's ink plus a shimmer bar, the same
            skeleton language as the parsing view. */}
        {map.status === "initializing" && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted/60 text-sm text-muted-foreground"
            data-testid="map-initializing"
            role="status"
          >
            <svg
              className="absolute inset-0 size-full text-ink/[0.08]"
              viewBox="0 0 1000 600"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M-20 240 C 120 80, 260 300, 420 180 S 640 60, 820 200 S 1060 320, 1240 160"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </svg>
            <div className="relative z-10 flex flex-col items-center gap-2.5">
              <p>{t("map.canvas.loading")}</p>
              <Skeleton className="h-1.5 w-36 rounded-full" />
            </div>
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
              <h3 className="font-semibold">{t("map.canvas.unavailableTitle")}</h3>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                {t("map.canvas.unavailableBody")}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {t("map.canvas.recordedExtent", {
                  extent: extentText(t, map.extent),
                })}
              </p>
            </div>
          </div>
        )}

        {/* Basemap offline / blocked — route and gaps still render. */}
        {map.status !== "unsupported" && map.offline && (
          <div
            className="absolute inset-x-2 top-2 z-20 flex items-center gap-2 rounded-lg border-[1.25px] border-signal bg-signal/[0.08] px-2.5 py-1.5 text-xs text-ink shadow-float"
            data-testid="map-offline-notice"
            role="status"
          >
            <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1 leading-snug">
              {t("map.canvas.offlineNotice")}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 shrink-0 px-2 text-[11px]"
              onClick={map.retryBasemap}
            >
              {t("map.canvas.retry")}
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
            <p className="rounded-[10px] border-[1.5px] border-ink bg-card px-3 py-2 text-sm text-muted-foreground shadow-float">
              {t("map.canvas.emptyRoute")}
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
              />
            )}
            {/* Current-pointer-mode chip (QoL): always answers "what
                does the pointer do right now?" at a glance, and cycles
                Draw → Move → Pan on click (Task 45). Dragging a placed
                point is Move mode's job (user pass 48); the chip also
                says which pen Draw is holding. */}
            {editorActive && draw && (
              <button
                type="button"
                data-testid="map-mode-chip"
                data-mode={draw.pointerMode}
                aria-label={t("map.canvas.pointerModeAria", {
                  state: t(
                    draw.pointerMode === "draw"
                      ? "map.canvas.modeStateDraw"
                      : draw.pointerMode === "move"
                        ? "map.canvas.modeStateMove"
                        : "map.canvas.modeStatePan",
                  ),
                })}
                onClick={() =>
                  draw.setPointerMode(
                    draw.pointerMode === "draw"
                      ? "move"
                      : draw.pointerMode === "move"
                        ? "pan"
                        : "draw",
                  )
                }
                title={
                  draw.pointerMode === "draw"
                    ? draw.pen === "curve"
                      ? t("map.canvas.titleDrawCurve")
                      : t("map.canvas.titleDraw")
                    : draw.pointerMode === "move"
                      ? t("map.canvas.titleMove")
                      : t("map.canvas.titlePan")
                }
                className={`absolute left-2 top-2 z-10 flex items-center gap-2 rounded-lg border-[1.5px] border-ink px-2.5 py-1.5 text-xs font-semibold shadow-float transition-colors focus-visible:outline-2 ${
                  draw.pointerMode === "draw"
                    ? "bg-signal/[0.08] text-ink"
                    : "bg-card text-foreground hover:bg-ink/[0.06]"
                }`}
              >
                {draw.pointerMode === "draw" ? (
                  draw.pen === "curve" ? (
                    <Spline className="size-3.5 shrink-0 text-signal" aria-hidden="true" />
                  ) : (
                    <PenLine className="size-3.5 shrink-0 text-signal" aria-hidden="true" />
                  )
                ) : draw.pointerMode === "move" ? (
                  <Move className="size-3.5 shrink-0 text-signal" aria-hidden="true" />
                ) : (
                  <Hand className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                {draw.pointerMode === "draw"
                  ? draw.pen === "curve"
                    ? t("map.canvas.chipCurve")
                    : t("map.canvas.chipDraw")
                  : draw.pointerMode === "move"
                    ? t("map.canvas.chipMove")
                    : t("map.canvas.chipPan")}
                <span
                  className="grid h-4 min-w-4 place-items-center rounded-[3px] border border-ink/25 border-b-2 bg-card px-0.5 text-[10px] font-bold text-shade"
                  aria-hidden="true"
                >
                  {draw.pointerMode === "draw"
                    ? "D"
                    : draw.pointerMode === "move"
                      ? "M"
                      : "P"}
                </span>
              </button>
            )}
            {draw?.pickMode && (
              <div
                className="pointer-events-none absolute inset-x-2 top-2 z-20 mx-auto w-fit max-w-full rounded-lg border-[1.25px] border-signal bg-signal/[0.08] px-3 py-1.5 text-xs font-semibold text-ink shadow-float"
                data-testid="pick-mode-chip"
                role="status"
              >
                <span className="flex items-center gap-1.5">
                  <Crosshair
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {draw.pickMode === "anchor"
                    ? t("map.canvas.pickAnchor")
                    : t("map.canvas.pickPair")}
                </span>
              </div>
            )}
            <MapToolbar
              provider={map.provider}
              providers={map.providers}
              onProviderChange={map.setProvider}
              onFitActivity={map.fitToActivity}
              pointerMode={editorActive && draw ? draw.pointerMode : null}
              onSetPointerMode={
                editorActive && draw ? draw.setPointerMode : undefined
              }
            />
            <MapLegend compareGhost={compareGhost ?? map.compareGhost} />
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
        {t("map.canvas.srSummary", {
          segments: t(
            map.segmentCount === 1
              ? "map.canvas.srSegmentsOne"
              : "map.canvas.srSegmentsMany",
            { count: map.segmentCount },
          ),
          points: t(
            (map.route?.usablePointCount ?? 0) === 1
              ? "map.canvas.srPointsOne"
              : "map.canvas.srPointsMany",
            { count: map.route?.usablePointCount ?? 0 },
          ),
          gaps: t(
            map.gapCount === 1
              ? "map.canvas.srGapsOne"
              : "map.canvas.srGapsMany",
            { count: map.gapCount },
          ),
          extent: extentText(t, map.extent),
        })}
        {editorActive && draw && draw.vertexCount > 0
          ? t(
              draw.vertexCount === 1
                ? "map.canvas.srReconstructionOne"
                : "map.canvas.srReconstructionMany",
              { count: draw.vertexCount },
            )
          : ""}
        {srNote ?? ""}
      </p>
    </div>
  );
}

/**
 * MapToolbar — the map's tool rail (Phase 3: "tile provider config …
 * attribution, legend"; Phase 4: the Draw/Pan toggle; QoL pass: a
 * vertical icon rail with delayed use-case hints).
 *
 * The rail lives on the map's right edge, vertically centered — away
 * from the distance badge (top-center), the pick chip (top-center),
 * the legend (bottom-left), and the gap chip (top-left). Every tool is
 * an icon button whose use case is one deliberate hover away (HintTip,
 * ~450 ms dwell): the toolbar teaches itself without cluttering the
 * map. Keyboard accelerators (D / P) mirror the pointer toggle.
 *
 * - Draw/Pan toggle: the plan's anti-fat-finger contract — drawing and
 *   map navigation must never fight over the pointer. Dragging drawn
 *   points works in BOTH modes (the drag is pointer-targeted, never a
 *   pan).
 * - Basemap picker: OpenFreeMap (default) / OSM Standard raster, each
 *   with its usage-policy note (§E-1), built as a popover of plain
 *   buttons (RTL-friendly, matches the Phase-2 settings pattern).
 * - Fit-activity button: re-frame the whole recorded route.
 *
 * Props in, intents out — no map or store access here.
 */

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { HintTip } from "@/components/shared/hint-tip";
import {
  Check,
  Hand,
  Layers,
  Maximize,
  PenLine,
} from "lucide-react";
import type { TileProviderId, TileProviderOption } from "@/hooks/use-map-controller";

/** Shared rail button look: 36px square, quiet until hovered. */
const RAIL_BUTTON =
  "h-9 w-9 p-0 shadow-sm";

export interface MapToolbarProps {
  provider: TileProviderId;
  providers: readonly TileProviderOption[];
  onProviderChange: (provider: TileProviderId) => void;
  onFitActivity: () => void;
  /** Phase 4: null = no editor session (toggle hidden). */
  drawMode?: boolean | null;
  onToggleDrawMode?: (on: boolean) => void;
}

export function MapToolbar({
  provider,
  providers,
  onProviderChange,
  onFitActivity,
  drawMode = null,
  onToggleDrawMode,
}: MapToolbarProps) {
  const current =
    providers.find((option) => option.id === provider) ?? null;

  return (
    <div
      className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5"
      data-testid="map-toolbar"
      role="toolbar"
      aria-label="Map tools"
    >
      {drawMode !== null && onToggleDrawMode && (
        <div
          className="flex flex-col overflow-hidden rounded-lg border bg-background/85 shadow-sm backdrop-blur-sm"
          role="group"
          aria-label="Pointer mode"
          data-testid="draw-mode-toggle"
        >
          <HintTip
            side="left"
            title="Draw mode"
            description="Click anywhere on the map to add points; drag a point to move it; double-click to delete. The map stops panning while you draw."
            kbd="D"
          >
            <button
              type="button"
              aria-pressed={drawMode === true}
              data-testid="draw-mode-draw"
              className={`flex h-9 w-9 items-center justify-center transition-colors focus-visible:outline-2 ${
                drawMode
                  ? "bg-emerald-600 text-white"
                  : "text-foreground hover:bg-accent"
              }`}
              onClick={() => onToggleDrawMode(true)}
            >
              <PenLine className="size-4" aria-hidden="true" />
              <span className="sr-only">Draw mode</span>
            </button>
          </HintTip>
          <HintTip
            side="left"
            title="Pan mode"
            description="Normal map navigation — drag to pan, double-click to zoom. Dragging a drawn point still works; you just can't add new ones."
            kbd="P"
          >
            <button
              type="button"
              aria-pressed={drawMode === false}
              data-testid="draw-mode-pan"
              className={`flex h-9 w-9 items-center justify-center transition-colors focus-visible:outline-2 ${
                !drawMode
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              }`}
              onClick={() => onToggleDrawMode(false)}
            >
              <Hand className="size-4" aria-hidden="true" />
              <span className="sr-only">Pan mode</span>
            </button>
          </HintTip>
        </div>
      )}

      <Popover>
        <HintTip
          side="left"
          title="Basemap"
          description="Switch the background map — vector OpenFreeMap or classic OSM raster. Only tiles are fetched; never your GPX."
        >
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className={`${RAIL_BUTTON} bg-background/85 backdrop-blur-sm`}
              aria-label="Basemap provider"
            >
              <Layers className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </HintTip>
        <PopoverContent align="center" side="left" className="w-72 p-1.5" data-testid="map-provider-menu">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Basemap tiles
          </p>
          <ul className="grid gap-0.5">
            {providers.map((option) => {
              const active = option.id === provider;
              return (
                <li key={option.id}>
                  <PopoverClose asChild>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent"
                      aria-pressed={active}
                      data-provider-id={option.id}
                      onClick={() => onProviderChange(option.id)}
                    >
                      <Check
                        className={`mt-0.5 size-3.5 shrink-0 ${active ? "opacity-100" : "opacity-0"}`}
                        aria-hidden="true"
                      />
                      <span className="grid gap-0.5">
                        <span className="font-medium leading-none">
                          {option.label}
                        </span>
                        <span className="text-xs leading-snug text-muted-foreground">
                          {option.note}
                        </span>
                      </span>
                    </button>
                  </PopoverClose>
                </li>
              );
            })}
          </ul>
          <p className="px-2 pb-1 pt-2 text-[11px] leading-snug text-muted-foreground">
            Only map tiles are fetched from the network — never your GPX
            data.
          </p>
        </PopoverContent>
      </Popover>

      <HintTip
        side="left"
        title="Fit activity"
        description="Zoom back out to the whole recorded route — handy after zooming into a gap."
      >
        <Button
          variant="secondary"
          size="sm"
          className={`${RAIL_BUTTON} bg-background/85 backdrop-blur-sm`}
          aria-label="Fit activity in view"
          onClick={onFitActivity}
        >
          <Maximize className="size-4" aria-hidden="true" />
        </Button>
      </HintTip>
    </div>
  );
}

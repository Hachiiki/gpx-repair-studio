/**
 * MapToolbar — compact map controls (Phase 3 scope: "tile provider config
 * … attribution, legend").
 *
 * - Basemap picker: OpenFreeMap (default) / OSM Standard raster, each with
 *   its usage-policy note (§E-1). Built as a popover of plain buttons
 *   (matches the Phase 2 threshold-settings pattern and stays RTL-friendly).
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
import { Check, Layers, Maximize } from "lucide-react";
import type { TileProviderId, TileProviderOption } from "@/hooks/use-map-controller";

export interface MapToolbarProps {
  provider: TileProviderId;
  providers: readonly TileProviderOption[];
  onProviderChange: (provider: TileProviderId) => void;
  onFitActivity: () => void;
}

export function MapToolbar({
  provider,
  providers,
  onProviderChange,
  onFitActivity,
}: MapToolbarProps) {
  const current =
    providers.find((option) => option.id === provider) ?? null;

  return (
    <div
      className="absolute right-2 top-2 z-10 flex items-center gap-1.5"
      data-testid="map-toolbar"
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 bg-background/85 px-2.5 shadow-sm backdrop-blur-sm"
            aria-label="Basemap provider"
          >
            <Layers className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">
              {current ? current.label : "Basemap"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1.5" data-testid="map-provider-menu">
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

      <Button
        variant="secondary"
        size="sm"
        className="h-8 w-8 bg-background/85 p-0 shadow-sm backdrop-blur-sm"
        aria-label="Fit activity in view"
        onClick={onFitActivity}
      >
        <Maximize className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

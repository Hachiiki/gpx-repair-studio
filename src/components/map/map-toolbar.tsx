/**
 * MapToolbar — the map's tool rail (Phase 3: "tile provider config …
 * attribution, legend"; Phase 4: the Draw/Pan toggle; QoL pass: a
 * vertical icon rail with delayed use-case hints; Task 45: the toggle
 * grows into the three-way Draw / Move / Pan pointer-mode group).
 *
 * The rail lives on the map's right edge, vertically centered — away
 * from the distance badge (top-center), the pick chip (top-center),
 * the legend (bottom-left), and the gap chip (top-left). Every tool is
 * an icon button whose use case is one deliberate hover away (HintTip,
 * ~450 ms dwell): the toolbar teaches itself without cluttering the
 * map. Keyboard accelerators (D / M / P) mirror the pointer toggle.
 *
 * - Draw / Move / Pan: what the pointer does (the plan's anti-fat-finger
 *   contract, plus Task 45's dedicated point-dragging mode). User pass
 *   48: dragging a drawn point is Move mode's job and ONLY its job —
 *   the pencil adds, Move adjusts (oversized grab targets, no
 *   accidental adds), Pan navigates. The Draw hint also teaches the
 *   Curve pen (C) when it is the active pen.
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
  Move,
  PenLine,
} from "lucide-react";
import type { TileProviderId, TileProviderOption } from "@/hooks/use-map-controller";
import type { PointerMode } from "@/types/domain";
import { useI18n } from "@/hooks/use-i18n";

/** Shared rail button look: 36px square, quiet until hovered. */
const RAIL_BUTTON =
  "h-9 w-9 p-0 border-transparent bg-transparent text-ink hover:bg-ink/[0.06] hover:text-ink";

export interface MapToolbarProps {
  provider: TileProviderId;
  providers: readonly TileProviderOption[];
  onProviderChange: (provider: TileProviderId) => void;
  onFitActivity: () => void;
  /** Task 45: null = no editor session (pointer-mode group hidden). */
  pointerMode?: PointerMode | null;
  onSetPointerMode?: (mode: PointerMode) => void;
}

export function MapToolbar({
  provider,
  providers,
  onProviderChange,
  onFitActivity,
  pointerMode = null,
  onSetPointerMode,
}: MapToolbarProps) {
  const { t } = useI18n();
  const current =
    providers.find((option) => option.id === provider) ?? null;

  return (
    <div
      className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-[10px] border-[1.5px] border-ink bg-card p-1 shadow-float"
      data-testid="map-toolbar"
      role="toolbar"
      aria-label={t("map.toolbar.railAria")}
    >
      {pointerMode !== null && onSetPointerMode && (
        <div
          className="flex flex-col"
          role="group"
          aria-label={t("map.toolbar.pointerGroupAria")}
          data-testid="draw-mode-toggle"
        >
          <HintTip
            side="left"
            title={t("map.toolbar.drawTitle")}
            description={t("map.toolbar.drawDescription")}
            kbd="D"
          >
            <button
              type="button"
              aria-pressed={pointerMode === "draw"}
              data-testid="draw-mode-draw"
              className={`flex h-9 w-9 items-center justify-center rounded-[7px] transition-colors focus-visible:outline-2 ${
                pointerMode === "draw"
                  ? "bg-signal text-white shadow-[inset_0_0_0_1px_#222222]"
                  : "text-foreground hover:bg-ink/[0.06]"
              }`}
              onClick={() => onSetPointerMode("draw")}
            >
              <PenLine className="size-4" aria-hidden="true" />
              <span className="sr-only">{t("map.toolbar.drawTitle")}</span>
            </button>
          </HintTip>
          <HintTip
            side="left"
            title={t("map.toolbar.moveTitle")}
            description={t("map.toolbar.moveDescription")}
            kbd="M"
          >
            <button
              type="button"
              aria-pressed={pointerMode === "move"}
              data-testid="draw-mode-move"
              className={`flex h-9 w-9 items-center justify-center rounded-[7px] transition-colors focus-visible:outline-2 ${
                pointerMode === "move"
                  ? "bg-signal text-white shadow-[inset_0_0_0_1px_#222222]"
                  : "text-foreground hover:bg-ink/[0.06]"
              }`}
              onClick={() => onSetPointerMode("move")}
            >
              <Move className="size-4" aria-hidden="true" />
              <span className="sr-only">{t("map.toolbar.moveTitle")}</span>
            </button>
          </HintTip>
          <HintTip
            side="left"
            title={t("map.toolbar.panTitle")}
            description={t("map.toolbar.panDescription")}
            kbd="P"
          >
            <button
              type="button"
              aria-pressed={pointerMode === "pan"}
              data-testid="draw-mode-pan"
              className={`flex h-9 w-9 items-center justify-center rounded-[7px] transition-colors focus-visible:outline-2 ${
                pointerMode === "pan"
                  ? "bg-signal text-white shadow-[inset_0_0_0_1px_#222222]"
                  : "text-foreground hover:bg-ink/[0.06]"
              }`}
              onClick={() => onSetPointerMode("pan")}
            >
              <Hand className="size-4" aria-hidden="true" />
              <span className="sr-only">{t("map.toolbar.panTitle")}</span>
            </button>
          </HintTip>
        </div>
      )}

      {/* Equipment divider between the pointer-mode group and the
       * view tools (decorative). */}
      <div className="mx-1 h-px bg-ink/15" aria-hidden="true" />

      <Popover>
        <HintTip
          side="left"
          title={t("map.toolbar.basemapTitle")}
          description={t("map.toolbar.basemapDescription")}
        >
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className={RAIL_BUTTON}
              aria-label={t("map.toolbar.basemapAria")}
            >
              <Layers className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </HintTip>
        <PopoverContent align="center" side="left" className="w-72 p-1.5" data-testid="map-provider-menu">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("map.toolbar.basemapTiles")}
          </p>
          <ul className="grid gap-0.5">
            {providers.map((option) => {
              const active = option.id === provider;
              return (
                <li key={option.id}>
                  <PopoverClose asChild>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 rounded-[5px] px-2 py-1.5 text-left text-sm hover:bg-ink/[0.06] focus-visible:bg-ink/[0.06]"
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
            {t("map.toolbar.basemapFootnote")}
          </p>
        </PopoverContent>
      </Popover>

      <HintTip
        side="left"
        title={t("map.toolbar.fitTitle")}
        description={t("map.toolbar.fitDescription")}
      >
        <Button
          variant="secondary"
          size="sm"
          className={RAIL_BUTTON}
          aria-label={t("map.toolbar.fitAria")}
          onClick={onFitActivity}
        >
          <Maximize className="size-4" aria-hidden="true" />
        </Button>
      </HintTip>
    </div>
  );
}

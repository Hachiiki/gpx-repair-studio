/**
 * MapLegend — the overlay legend for the map's visual encoding
 * (docs/MASTER_PLAN.md §I-3, §C color-blind safety).
 *
 * Provenance/meaning is always encoded redundantly: line style (solid vs
 * dashed) + marker shape (hollow ring vs filled dot) + color. The legend
 * spells out the mapping; it never relies on color alone.
 *
 * User pass 35: the legend card is HIDDEN by default — a small "Legend"
 * chip sits in the corner and the panel unfolds on hover (desktop),
 * keyboard focus, or a click that pins it open (touch). The entries
 * themselves always stay in the DOM (collapsed to zero height, never
 * unmounted): they are the readable encoding contract the tests pin,
 * and the map keeps its canvas clear of static furniture.
 *
 * Phase 12: the sample swatches mirror the map layers' CURRENT theme
 * palette (mapOverlayPalette — the same values the controller paints
 * with, re-exported through the hooks facade), so the legend can never
 * show a light-ink swatch over a darkened map. Marker whites stay
 * white in both themes (see palette.markerPaper).
 */

"use client";

import { useState } from "react";
import { Route } from "lucide-react";
import { mapOverlayPalette, type MapOverlayPalette } from "@/hooks/use-map-controller";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

const SAMPLE_LINE_CLASS = "h-1 w-7 rounded-full";

/** The encoding entries — unchanged vocabulary, always mounted. */
function renderEntries(
  t: TranslatorArg,
  palette: MapOverlayPalette,
  compareGhost: boolean,
) {
  return (
    <ul className="grid gap-1.5">
      {compareGhost && (
        /* Phase 19 — the compare overlay's two entries (rendered only
         * while the ghost is on the canvas; the encoding contract
         * stays honest about what is currently drawn). */
        <li
          className="flex items-center gap-2"
          data-testid="map-legend-ghost"
        >
          <span
            className={SAMPLE_LINE_CLASS}
            style={{
              backgroundImage: `repeating-linear-gradient(90deg,${palette.ghost} 0 5px,transparent 5px 9px)`,
            }}
            aria-hidden="true"
          />
          {t("map.legend.ghost")}
        </li>
      )}
      {compareGhost && (
        <li
          className="flex items-center gap-2"
          data-testid="map-legend-changed"
        >
          <span
            className={SAMPLE_LINE_CLASS}
            style={{
              backgroundImage: `repeating-linear-gradient(90deg,${palette.recon} 0 6px,transparent 6px 10px)`,
              opacity: 0.9,
            }}
            aria-hidden="true"
          />
          {t("map.legend.changed")}
        </li>
      )}
      <li className="flex items-center gap-2">
        <span
          className={SAMPLE_LINE_CLASS}
          style={{ backgroundColor: palette.route }}
          aria-hidden="true"
        />
        {t("map.legend.recorded")}
      </li>
      <li className="flex items-center gap-2">
        <span
          className={SAMPLE_LINE_CLASS}
          style={{
            backgroundImage: `repeating-linear-gradient(90deg,${palette.severity.suspect} 0 6px,transparent 6px 11px)`,
          }}
          aria-hidden="true"
        />
        {t("map.legend.gapSpan")}
      </li>
      <li className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full border-[3px] bg-transparent"
          style={{ borderColor: palette.severity.severe }}
          aria-hidden="true"
        />
        <span
          className="size-2.5 rounded-full"
          style={{
            backgroundColor: palette.severity.severe,
            boxShadow: `0 0 0 2px ${palette.markerPaper}`,
          }}
          aria-hidden="true"
        />
        {t("map.legend.gapBoundaries")}
      </li>
      <li className="flex items-center gap-2">
        <span
          className={SAMPLE_LINE_CLASS}
          style={{ backgroundColor: palette.recon }}
          aria-hidden="true"
        />
        {t("map.legend.repaired")}
      </li>
      <li className="flex items-center gap-2">
        <span
          className={SAMPLE_LINE_CLASS}
          style={{
            backgroundImage: `repeating-linear-gradient(90deg,${palette.recon} 0 5px,transparent 5px 9px)`,
          }}
          aria-hidden="true"
        />
        {t("map.legend.footpath")}
      </li>
      <li className="flex items-center gap-2">
        <span
          className={SAMPLE_LINE_CLASS}
          style={{
            backgroundImage: `repeating-linear-gradient(90deg,${palette.recon} 0 5px,transparent 5px 9px)`,
            opacity: 0.6,
          }}
          aria-hidden="true"
        />
        {t("map.legend.openConnection")}
      </li>
      <li className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full border-2"
          style={{
            borderColor: palette.recon,
            backgroundColor: palette.markerPaper,
          }}
          aria-hidden="true"
        />
        {t("map.legend.drawnPoint")}
      </li>
    </ul>
  );
}

export function MapLegend({ compareGhost = false }: { compareGhost?: boolean }) {
  const { t } = useI18n();
  // Pinned = clicked open (stays until clicked again). Hover and keyboard
  // focus open it transiently through the same CSS group.
  const [pinned, setPinned] = useState(false);
  // Phase 12 — the swatches mirror whatever theme the map is painting.
  const { resolved } = useTheme();
  const palette = mapOverlayPalette(resolved === "dark");

  return (
    <div
      className="group absolute bottom-2 left-2 z-10 flex flex-col items-start gap-1.5"
      data-testid="map-legend"
    >
      {/*
       * The panel: max-height collapse keeps the entries in the DOM
       * (readable text, testable content) while showing nothing. The
       * group-hover / group-focus-within variants cover pointer and
       * keyboard; `pinned` holds it open for touch users.
       */}
      <div
        id="map-legend-panel"
        className={cn(
          "overflow-hidden transition-[max-height,opacity,visibility] duration-150",
          pinned
            ? "max-h-80 visible opacity-100"
            : "max-h-0 invisible opacity-0 group-hover:max-h-80 group-hover:visible group-hover:opacity-100 group-focus-within:max-h-80 group-focus-within:visible group-focus-within:opacity-100",
        )}
      >
        <div className="rounded-lg border border-ink/20 bg-paper/90 px-2.5 py-2.5 text-[11px] leading-tight text-ink/70 shadow-float backdrop-blur-[3px]">
          {renderEntries(t, palette, compareGhost)}
        </div>
      </div>
      <button
        type="button"
        data-testid="map-legend-toggle"
        aria-label={t("map.legend.toggleAria")}
        aria-expanded={pinned}
        aria-controls="map-legend-panel"
        title={t("map.legend.toggleTitle")}
        onClick={() => setPinned((value) => !value)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-ink/20 bg-paper/90 px-2 py-1 text-[11px] font-semibold text-ink/70 shadow-float backdrop-blur-[3px] transition-colors",
          pinned
            ? "border-ink text-ink"
            : "hover:border-ink hover:text-ink focus-visible:outline-2",
        )}
      >
        <Route className="size-3 shrink-0" aria-hidden="true" />
        {t("map.legend.toggle")}
      </button>
    </div>
  );
}

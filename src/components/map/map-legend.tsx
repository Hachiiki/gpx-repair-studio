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
 * Pure presentation (no props — the encoding is fixed by the map layers in
 * lib/map/mapController.ts; any style change there is mirrored here).
 */

"use client";

import { useState } from "react";
import { Route } from "lucide-react";
import { cn } from "@/lib/utils";

const SAMPLE_LINE_CLASS = "h-1 w-7 rounded-full";

/** The six encoding entries — unchanged vocabulary, always mounted. */
const ENTRIES = (
  <ul className="grid gap-1.5">
    <li className="flex items-center gap-2">
      <span className={`${SAMPLE_LINE_CLASS} bg-[#222222]`} aria-hidden="true" />
      Recorded route (solid ink)
    </li>
    <li className="flex items-center gap-2">
      <span
        className={`${SAMPLE_LINE_CLASS} border-0 bg-[repeating-linear-gradient(90deg,#5A5A5A_0_6px,transparent_6px_11px)]`}
        aria-hidden="true"
      />
      Gap span (dashed, severity shades)
    </li>
    <li className="flex items-center gap-2">
      <span
        className="size-2.5 rounded-full border-[3px] border-[#000000] bg-transparent"
        aria-hidden="true"
      />
      <span
        className="size-2.5 rounded-full bg-[#000000] ring-2 ring-white"
        aria-hidden="true"
      />
      Gap boundaries (ring = before, dot = after)
    </li>
    <li className="flex items-center gap-2">
      <span className={`${SAMPLE_LINE_CLASS} bg-[#FC4C02]`} aria-hidden="true" />
      Repaired route (solid orange)
    </li>
    <li className="flex items-center gap-2">
      <span
        className={`${SAMPLE_LINE_CLASS} bg-[repeating-linear-gradient(90deg,#FC4C02_0_5px,transparent_5px_9px)] opacity-60`}
        aria-hidden="true"
      />
      Open connection (closes on finish)
    </li>
    <li className="flex items-center gap-2">
      <span
        className="size-2.5 rounded-full border-2 border-[#FC4C02] bg-white"
        aria-hidden="true"
      />
      Drawn point (drag to move)
    </li>
  </ul>
);

export function MapLegend() {
  // Pinned = clicked open (stays until clicked again). Hover and keyboard
  // focus open it transiently through the same CSS group.
  const [pinned, setPinned] = useState(false);

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
          {ENTRIES}
        </div>
      </div>
      <button
        type="button"
        data-testid="map-legend-toggle"
        aria-label="Map legend"
        aria-expanded={pinned}
        aria-controls="map-legend-panel"
        title="What the map lines mean"
        onClick={() => setPinned((value) => !value)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-ink/20 bg-paper/90 px-2 py-1 text-[11px] font-semibold text-ink/70 shadow-float backdrop-blur-[3px] transition-colors",
          pinned
            ? "border-ink text-ink"
            : "hover:border-ink hover:text-ink focus-visible:outline-2",
        )}
      >
        <Route className="size-3 shrink-0" aria-hidden="true" />
        Legend
      </button>
    </div>
  );
}

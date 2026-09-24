/**
 * MapLegend — the overlay legend for the map's visual encoding
 * (docs/MASTER_PLAN.md §I-3, §C color-blind safety).
 *
 * Provenance/meaning is always encoded redundantly: line style (solid vs
 * dashed) + marker shape (hollow ring vs filled dot) + color. The legend
 * spells out the mapping; it never relies on color alone.
 *
 * Pure presentation (no props — the encoding is fixed by the map layers in
 * lib/map/mapController.ts; any style change there is mirrored here).
 */

const SAMPLE_LINE_CLASS = "h-1 w-7 rounded-full";

export function MapLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-lg border bg-background/85 px-2.5 py-2 text-[11px] leading-tight text-foreground shadow-sm backdrop-blur-sm"
      data-testid="map-legend"
      aria-hidden="true"
    >
      <ul className="grid gap-1.5">
        <li className="flex items-center gap-2">
          <span
            className={`${SAMPLE_LINE_CLASS} bg-[#2563eb]`}
            aria-hidden="true"
          />
          Recorded route (solid)
        </li>
        <li className="flex items-center gap-2">
          <span
            className={`${SAMPLE_LINE_CLASS} border-0 bg-[repeating-linear-gradient(90deg,#dc2626_0_6px,transparent_6px_11px)]`}
            aria-hidden="true"
          />
          Gap span (dashed)
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full border-[3px] border-[#dc2626] bg-transparent"
            aria-hidden="true"
          />
          <span
            className="size-2.5 rounded-full bg-[#dc2626] ring-2 ring-white"
            aria-hidden="true"
          />
          Gap boundaries (ring = before, dot = after)
        </li>
      </ul>
    </div>
  );
}

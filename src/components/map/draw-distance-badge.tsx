/**
 * DrawDistanceBadge — the live readout chip on the map during an editor
 * session (Phase 4 scope: "live distance badge").
 *
 * Shows the current path length (badged Estimated — it is user-authored
 * geometry, not a measurement) and the vertex cap. Pointer-mode
 * communication moved to the dedicated mode chip (QoL pass) — this badge
 * stays a pure measurement readout. `role="status"` + `aria-live="polite"`
 * announce distance updates to screen readers without stealing focus.
 *
 * Pure presentation: props in, no imports of stores/domain/map.
 */

import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { formatDistanceMeters } from "@/lib/utils/format";
import { useI18n } from "@/hooks/use-i18n";

export interface DrawDistanceBadgeProps {
  /** Live path length including both anchors; null while inactive. */
  distanceM: number | null;
  vertexCount: number;
  maxVertices: number;
}

export function DrawDistanceBadge({
  distanceM,
  vertexCount,
  maxVertices,
}: DrawDistanceBadgeProps) {
  const { t } = useI18n();
  return (
    <div
      className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-[10px] border-[1.5px] border-ink bg-card px-4 py-2 shadow-float"
      data-testid="draw-distance-badge"
      role="status"
      aria-live="polite"
    >
      <p className="flex items-baseline gap-2">
        <span
          className="font-display text-[26px] font-bold leading-none tabular-nums"
          data-testid="badge-distance"
        >
          {distanceM === null ? "—" : formatDistanceMeters(distanceM)}
        </span>
        <ProvenanceBadge kind="estimated" />
      </p>
      <p
        className="mt-1 text-center text-[11px] font-medium tabular-nums text-shade"
        data-testid="badge-vertex-count"
      >
        {t("map.drawBadge.vertexCount", { vertices: vertexCount, max: maxVertices })}
      </p>
      <p className="text-center text-[10px] leading-snug text-ink/70">
        {t("map.drawBadge.roadLengthNote")}
      </p>
    </div>
  );
}

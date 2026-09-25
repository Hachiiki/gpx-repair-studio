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
  return (
    <div
      className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur-sm"
      data-testid="draw-distance-badge"
      role="status"
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-sm">
        <span className="font-semibold tabular-nums" data-testid="badge-distance">
          {distanceM === null ? "—" : formatDistanceMeters(distanceM)}
        </span>
        <ProvenanceBadge kind="estimated" />
        <span
          className="text-xs tabular-nums text-muted-foreground"
          data-testid="badge-vertex-count"
        >
          {vertexCount}/{maxVertices} pts
        </span>
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        road length, not straight line
      </p>
    </div>
  );
}

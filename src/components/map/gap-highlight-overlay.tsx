/**
 * GapHighlightOverlay — the floating chip describing the gap currently
 * selected on the map / in the gap list (Phase 3 "GapList ↔ map selection
 * sync").
 *
 * Mirrors the gap list's vocabulary (shared gap-vocabulary module) and the
 * formatting utilities; includes a clear-selection action. Props in,
 * intents out.
 */

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  GAP_KIND_LABELS,
  GapSeverityBadge,
} from "@/components/shared/gap-vocabulary";
import type { GapRow } from "@/hooks/use-gpx-session";
import {
  formatDistanceMeters,
  formatDurationMs,
  formatSpeedKmh,
} from "@/lib/utils/format";

export interface GapHighlightOverlayProps {
  gap: GapRow;
  onClear: () => void;
}

export function GapHighlightOverlay({ gap, onClear }: GapHighlightOverlayProps) {
  return (
    <div
      className="absolute left-2 top-2 z-10 w-60 rounded-lg border bg-background/90 p-2.5 shadow-sm backdrop-blur-sm"
      data-testid="gap-highlight-overlay"
    >
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <GapSeverityBadge severity={gap.severity} />
            <span className="text-xs font-semibold">
              {GAP_KIND_LABELS[gap.kind]}
            </span>
          </div>
          <dl className="grid gap-0.5 text-[11px] text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>Elapsed</dt>
              <dd className="tabular-nums text-foreground">
                {gap.elapsedMs !== undefined
                  ? formatDurationMs(gap.elapsedMs)
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Straight-line</dt>
              <dd className="tabular-nums text-foreground">
                {gap.impliedDistanceM !== undefined
                  ? formatDistanceMeters(gap.impliedDistanceM)
                  : "—"}
              </dd>
            </div>
            {gap.impliedSpeed !== undefined && (
              <div className="flex justify-between gap-2">
                <dt>Implied speed</dt>
                <dd className="tabular-nums text-foreground">
                  {formatSpeedKmh(gap.impliedSpeed * 3.6)}
                </dd>
              </div>
            )}
          </dl>
          <p className="text-[10px] leading-snug text-muted-foreground">
            The path between the markers was not recorded — it will be drawn
            in a later step.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          aria-label="Clear gap selection"
          onClick={onClear}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

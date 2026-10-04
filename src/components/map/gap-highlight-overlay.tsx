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
  GAP_KIND_LABEL_KEYS,
  GapSeverityBadge,
} from "@/components/shared/gap-vocabulary";
import type { GapRow } from "@/hooks/use-gpx-session";
import { useI18n } from "@/hooks/use-i18n";
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
  const { t } = useI18n();
  return (
    <div
      className="absolute left-2 top-2 z-10 w-[264px] overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-card shadow-float"
      data-testid="gap-highlight-overlay"
    >
      <div className="flex items-start gap-2 p-2.5">
        <div className="grid flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <GapSeverityBadge severity={gap.severity} />
            <span className="text-xs font-semibold">
              {t(GAP_KIND_LABEL_KEYS[gap.kind])}
            </span>
          </div>
          <dl className="grid gap-0.5 text-[11px] text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>{t("map.gapChip.elapsed")}</dt>
              <dd className="tabular-nums text-foreground">
                {gap.elapsedMs !== undefined
                  ? formatDurationMs(gap.elapsedMs)
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("map.gapChip.straightLine")}</dt>
              <dd className="tabular-nums text-foreground">
                {gap.impliedDistanceM !== undefined
                  ? formatDistanceMeters(gap.impliedDistanceM)
                  : "—"}
              </dd>
            </div>
            {gap.impliedSpeed !== undefined && (
              <div className="flex justify-between gap-2">
                <dt>{t("map.gapChip.impliedSpeed")}</dt>
                <dd className="tabular-nums text-foreground">
                  {formatSpeedKmh(gap.impliedSpeed * 3.6)}
                </dd>
              </div>
            )}
          </dl>
          <p className="text-[10px] leading-snug text-muted-foreground">
            {t("map.gapChip.note")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="size-5.5 shrink-0 rounded-[5px] p-0"
          aria-label={t("map.gapChip.clearAria")}
          onClick={onClear}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

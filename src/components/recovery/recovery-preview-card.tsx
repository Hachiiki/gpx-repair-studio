/**
 * RecoveryPreviewCard — the completed-route preview of the Gap Recovery
 * section (Task 26).
 *
 * The "before you export" answer to one question: what does the
 * completed activity look like? It shows the recorded route's numbers
 * next to the completed route's — distance grows by the drawn sections,
 * the elapsed time provably stays the same (originals are never
 * rewritten; recovered durations come from the recorded boundary
 * timestamps), and every added value carries its estimated provenance.
 *
 * All numbers arrive as props from the pure joins the repair studio
 * already runs (distance/time statistics, the committed-repair time
 * join, the merge's inserted-point count) — this component formats and
 * labels, it computes nothing.
 *
 * Pure presentation.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Lock } from "lucide-react";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { useI18n } from "@/hooks/use-i18n";
import type { DistanceStats, TimeStats } from "@/hooks/use-recovery-session";
import type { RepairTimeStats } from "@/hooks/use-draw-editor";
import {
  formatDistanceMeters,
  formatDurationMs,
  formatSpeedKmh,
} from "@/lib/utils/format";

export interface RecoveryPreviewCardProps {
  distanceStats: DistanceStats | null;
  timeStats: TimeStats | null;
  /** Committed recoveries (drawn, editor closed, not skipped). */
  repair: RepairTimeStats;
  /** Points the merge will insert (null before the first commit). */
  insertedPoints: number | null;
  /** The name of the section's missing-interval join, for copy. */
  recoveredCount: number;
  detectedCount: number;
}

function Row({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground" title={hint}>
        {label}
      </dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

export function RecoveryPreviewCard({
  distanceStats,
  timeStats,
  repair,
  insertedPoints,
  recoveredCount,
  detectedCount,
}: RecoveryPreviewCardProps) {
  const { t } = useI18n();
  const hasCommits = repair.gapCount > 0;
  const recordedDistanceM = distanceStats?.totalDistanceM ?? 0;
  const completedDistanceM = recordedDistanceM + repair.reconstructedDistanceM;
  const wallMs = timeStats?.wallTimeMs;

  return (
    <Card data-testid="recovery-preview-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("recovery.preview.title")}
        </h3>
        <CardDescription>
          {hasCommits
            ? detectedCount > 0
              ? detectedCount === 1
                ? t("recovery.preview.desc.recoveredOne", {
                    count: recoveredCount,
                    total: detectedCount,
                  })
                : t("recovery.preview.desc.recoveredMany", {
                    count: recoveredCount,
                    total: detectedCount,
                  })
              : recoveredCount === 1
                ? t("recovery.preview.desc.drawnOne", { count: recoveredCount })
                : t("recovery.preview.desc.drawnMany", { count: recoveredCount })
            : t("recovery.preview.desc.empty")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasCommits ? (
          <dl className="grid gap-2 text-sm" data-testid="recovery-preview-stats">
            <Row
              label={t("recovery.preview.recoveredTime")}
              hint={t("recovery.preview.recoveredTimeHint")}
            >
              {repair.reconstructedTimeMs !== null ? (
                <span className="inline-flex items-baseline gap-1.5">
                  {formatDurationMs(repair.reconstructedTimeMs)}
                  <ProvenanceBadge kind="estimated" />
                </span>
              ) : (
                <span
                  className="font-normal text-muted-foreground"
                  title={
                    repair.gapsWithoutDuration > 0
                      ? t("recovery.preview.needsDurationHint")
                      : undefined
                  }
                >
                  —
                </span>
              )}
            </Row>
            <Row
              label={t("recovery.preview.distance")}
              hint={t("recovery.preview.distanceHint")}
            >
              <span className="inline-flex items-baseline gap-1.5">
                {formatDistanceMeters(recordedDistanceM)}
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                {formatDistanceMeters(completedDistanceM)}
                <ProvenanceBadge kind="mixed" />
              </span>
            </Row>
            <Row
              label={t("recovery.preview.elapsedTime")}
              hint={t("recovery.preview.elapsedTimeHint")}
            >
              <span className="inline-flex items-baseline gap-1.5">
                {wallMs !== undefined ? formatDurationMs(wallMs) : "—"}
                <span className="inline-flex items-center gap-0.5 rounded bg-signal/10 px-1 py-0.5 text-[10px] font-medium text-signal-ink">
                  <Lock className="size-2.5" aria-hidden="true" />
                  {t("recovery.preview.unchanged")}
                </span>
              </span>
            </Row>
            <Row
              label={t("recovery.preview.avgSpeed")}
              hint={t("recovery.preview.avgSpeedHint")}
            >
              {wallMs !== undefined && wallMs > 0 ? (
                <span className="inline-flex items-baseline gap-1.5">
                  {/* m / ms → km/h: × 3.6 converts m/s→km/h, so the
                      milliseconds must become seconds first (× 3600).
                      Task 28: an unmeasured section's estimated time was
                      never in the file's clock — without it the grown
                      distance over the untouched elapsed would read as
                      superhuman speed. */}
                  {formatSpeedKmh(
                    (completedDistanceM / (wallMs + repair.beyondWallMs)) *
                      3600,
                  )}
                  <ProvenanceBadge kind="mixed" />
                </span>
              ) : (
                <span className="font-normal text-muted-foreground">—</span>
              )}
            </Row>
            <Row
              label={t("recovery.preview.pointsGenerated")}
              hint={t("recovery.preview.pointsGeneratedHint")}
            >
              <span className="inline-flex items-baseline gap-1.5">
                {insertedPoints ?? 0}
                <ProvenanceBadge kind="estimated" />
              </span>
            </Row>
            <p className="mt-1 border-t pt-2 text-xs leading-snug text-muted-foreground">
              {t("recovery.preview.estimatedNote")}
            </p>
          </dl>
        ) : (
          <p className="text-sm leading-snug text-muted-foreground">
            {t("recovery.preview.emptyNote")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

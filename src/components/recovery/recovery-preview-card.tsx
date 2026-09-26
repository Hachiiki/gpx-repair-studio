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
  const hasCommits = repair.gapCount > 0;
  const recordedDistanceM = distanceStats?.totalDistanceM ?? 0;
  const completedDistanceM = recordedDistanceM + repair.reconstructedDistanceM;
  const wallMs = timeStats?.wallTimeMs;

  return (
    <Card data-testid="recovery-preview-card">
      <CardHeader>
        <h3 className="leading-none font-semibold">Completed route</h3>
        <CardDescription>
          {hasCommits
            ? `${recoveredCount} of ${detectedCount} missing section${
                detectedCount === 1 ? "" : "s"
              } recovered — preview before you export.`
            : "Draw a missing section to see the completed route here."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasCommits ? (
          <dl className="grid gap-2 text-sm" data-testid="recovery-preview-stats">
            <Row
              label="Missing time now covered"
              hint="The recorded interval between the section's boundary timestamps."
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
                      ? "A recovered section still needs a duration (or timestamps) before this is honest."
                      : undefined
                  }
                >
                  —
                </span>
              )}
            </Row>
            <Row
              label="Distance"
              hint="Recorded legs (gaps excluded) → recorded plus the drawn sections."
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
              label="Elapsed time"
              hint="First to last recorded timestamp — the original recording is never rewritten, so this cannot change."
            >
              <span className="inline-flex items-baseline gap-1.5">
                {wallMs !== undefined ? formatDurationMs(wallMs) : "—"}
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600/10 px-1 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  <Lock className="size-2.5" aria-hidden="true" />
                  unchanged
                </span>
              </span>
            </Row>
            <Row
              label="Average speed, completed"
              hint="Completed distance over the recorded elapsed time — the geometry is drawn, the clock is real."
            >
              {wallMs !== undefined && wallMs > 0 ? (
                <span className="inline-flex items-baseline gap-1.5">
                  {/* m / ms → km/h: × 3.6 converts m/s→km/h, so the
                      milliseconds must become seconds first (× 3600). */}
                  {formatSpeedKmh((completedDistanceM / wallMs) * 3600)}
                  <ProvenanceBadge kind="mixed" />
                </span>
              ) : (
                <span className="font-normal text-muted-foreground">—</span>
              )}
            </Row>
            <Row
              label="Points generated"
              hint="Inserted along your drawing inside the missing interval — exported with estimated timestamps and provenance markers."
            >
              <span className="inline-flex items-baseline gap-1.5">
                {insertedPoints ?? 0}
                <ProvenanceBadge kind="estimated" />
              </span>
            </Row>
            <p className="mt-1 border-t pt-2 text-xs leading-snug text-muted-foreground">
              Generated points are estimated data, not original GPS fixes —
              the export marks every one of them, and platforms that re-read
              the file will see the markers.
            </p>
          </dl>
        ) : (
          <p className="text-sm leading-snug text-muted-foreground">
            Nothing is applied to the file until you export — and even then
            the export is a new file: the original stays exactly as
            recorded, with your recovered sections inserted between its
            untouched points.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

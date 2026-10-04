/**
 * SegmentList — the recorded structure: tracks → segments
 * (Phase 2 scope: "see … segments").
 *
 * Renders the `SegmentRow[]` view model joined by the session hook
 * (point counts, per-segment geodesic distance, time ranges, flagged
 * point counts). Presentation only.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/shared/status-badge";
import { useI18n } from "@/hooks/use-i18n";
import { formatDateTime, formatDistanceMeters } from "@/lib/utils/format";
import type { SegmentRow } from "@/hooks/use-gpx-session";

export function SegmentList({ rows }: { rows: readonly SegmentRow[] }) {
  const { t } = useI18n();
  const trackCount = new Set(rows.map((row) => row.trackIndex)).size;

  // Pure grouping (segments of one track are contiguous in document order).
  const groups = [...new Set(rows.map((row) => row.trackIndex))].map(
    (trackIndex) => ({
      trackIndex,
      trackName:
        rows.find((row) => row.trackIndex === trackIndex)?.trackName ??
        t("segmentList.trackFallback", { number: trackIndex + 1 }),
      rows: rows.filter((row) => row.trackIndex === trackIndex),
    }),
  );

  return (
    <Card data-testid="segment-list">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("segmentList.title")}
        </h3>
        <CardDescription>
          {t("segmentList.header", {
            segments: t(
              rows.length === 1
                ? "segmentList.segmentOne"
                : "segmentList.segmentMany",
              { count: rows.length },
            ),
            tracks: t(
              trackCount === 1
                ? "segmentList.trackOne"
                : "segmentList.trackMany",
              { count: trackCount },
            ),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-80 -mx-2">
          <div className="grid gap-4 px-2">
            {groups.map((group) => (
              <div key={group.trackIndex} className="grid gap-2">
                <p className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                  {group.trackName}
                </p>
                {group.rows.map((row) => (
                  <div
                    key={row.segmentId}
                    data-seg-id={row.segmentId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink/15 px-3 py-2.5 text-[13px]"
                  >
                    <div className="grid gap-0.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {row.segmentId}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {t("segmentList.points", {
                          count: row.pointCount.toLocaleString(),
                        })}{" "}·{" "}
                        {formatDistanceMeters(row.distanceM)}
                        {row.excludedLegs > 0 && (
                          <span className="text-signal-ink">
                            {" "}
                            {t(
                              row.excludedLegs === 1
                                ? "segmentList.excludedLegsOne"
                                : "segmentList.excludedLegsMany",
                              { count: row.excludedLegs },
                            )}
                          </span>
                        )}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground">
                        {row.firstTimeMs !== undefined
                          ? `${formatDateTime(row.firstTimeMs)} → ${formatDateTime(row.lastTimeMs)}`
                          : t("segmentList.noTimestamps")}
                      </span>
                    </div>
                    {row.flaggedPoints > 0 && (
                      <StatusBadge tone="warning">
                        {t("segmentList.flagged", { count: row.flaggedPoints })}
                      </StatusBadge>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

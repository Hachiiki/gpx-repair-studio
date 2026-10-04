/**
 * GpxSummaryCard — file-level metadata of the loaded activity
 * (Phase 2 scope: "valid file shows summary").
 *
 * Renders identity and shape information from the frozen original model
 * plus the timing-availability indicator (the "no timing data" mode is a
 * Phase 2 acceptance criterion).
 */

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import type { TimeStats } from "@/hooks/use-gpx-session";
import type { OriginalTrackData } from "@/types/domain";

export interface GpxSummaryCardProps {
  fileName: string;
  data: OriginalTrackData;
  timeStats: TimeStats | null;
}

function CountRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-ink/[0.08] py-2 last:border-b-0">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      {/*
        Values are arbitrary device/platform strings (creator names can be
        long URLs or sentences). `overflow-wrap: anywhere` keeps the row's
        min-content small so it can never overflow the panel on mobile.
      */}
      <dd className="min-w-0 text-right text-[13.5px] font-semibold [overflow-wrap:anywhere] tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export function GpxSummaryCard({
  fileName,
  data,
  timeStats,
}: GpxSummaryCardProps) {
  const { t } = useI18n();
  const pointCount = data.segments.reduce(
    (sum, segment) => sum + segment.points.length,
    0,
  );

  return (
    <Card data-testid="gpx-summary">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("summary.title")}
        </h3>
        <CardDescription className="truncate" title={fileName}>
          {fileName}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid text-[13px]">
          <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-ink/[0.08] py-2 last:border-b-0">
            <dt className="shrink-0 text-[13px] text-muted-foreground">
              {t("summary.format")}
            </dt>
            <dd className="min-w-0">
              {/* The format name + version — data, not copy */}
              <Badge variant="secondary">{`GPX ${data.fileMeta.version}`}</Badge>
            </dd>
          </div>
          <CountRow
            label={t("summary.creator")}
            value={data.fileMeta.creator ?? t("summary.unknownCreator")}
          />
          <CountRow label={t("summary.tracks")} value={data.tracks.length} />
          <CountRow
            label={t("summary.segments")}
            value={data.segments.length}
          />
          <CountRow label={t("summary.trackPoints")} value={pointCount} />
          <CountRow
            label={t("summary.waypoints")}
            value={data.waypoints.length}
          />
          <CountRow label={t("summary.routes")} value={data.routes.length} />
          <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-ink/[0.08] py-2 last:border-b-0">
            <dt className="shrink-0 text-[13px] text-muted-foreground">
              {t("summary.timing")}
            </dt>
            <dd className="min-w-0">
              {timeStats === null ? null : timeStats.hasTimingData ? (
                <span className="text-[13.5px] font-semibold tabular-nums">
                  {t("summary.pointsTimed", {
                    timed: timeStats.pointsWithTime.toLocaleString(),
                    total: timeStats.pointsTotal.toLocaleString(),
                  })}
                </span>
              ) : (
                <Badge
                  variant="destructive"
                  data-testid="no-timing-data-badge"
                >
                  {t("summary.noTimingData")}
                </Badge>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

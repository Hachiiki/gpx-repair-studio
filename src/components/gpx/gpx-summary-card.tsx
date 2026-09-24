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
import type { TimeStats } from "@/hooks/use-gpx-session";
import type { OriginalTrackData } from "@/types/domain";

export interface GpxSummaryCardProps {
  fileName: string;
  data: OriginalTrackData;
  timeStats: TimeStats | null;
}

function CountRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      {/*
        Values are arbitrary device/platform strings (creator names can be
        long URLs or sentences). `overflow-wrap: anywhere` keeps the row's
        min-content small so it can never overflow the panel on mobile.
      */}
      <dd className="min-w-0 text-right [overflow-wrap:anywhere] font-medium tabular-nums">
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
  const pointCount = data.segments.reduce(
    (sum, segment) => sum + segment.points.length,
    0,
  );

  return (
    <Card data-testid="gpx-summary">
      <CardHeader>
        <h3 className="leading-none font-semibold">File summary</h3>
        <CardDescription className="truncate" title={fileName}>
          {fileName}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm">
          <div className="flex min-w-0 items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Format</dt>
            <dd className="min-w-0">
              <Badge variant="secondary">GPX {data.fileMeta.version}</Badge>
            </dd>
          </div>
          <CountRow
            label="Creator"
            value={data.fileMeta.creator ?? "Unknown"}
          />
          <CountRow label="Tracks" value={data.tracks.length} />
          <CountRow label="Segments" value={data.segments.length} />
          <CountRow label="Track points" value={pointCount} />
          <CountRow label="Waypoints" value={data.waypoints.length} />
          <CountRow label="Routes" value={data.routes.length} />
          <div className="flex min-w-0 items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Timing</dt>
            <dd className="min-w-0">
              {timeStats === null ? null : timeStats.hasTimingData ? (
                <span className="font-medium tabular-nums">
                  {timeStats.pointsWithTime.toLocaleString()} of{" "}
                  {timeStats.pointsTotal.toLocaleString()} points timed
                </span>
              ) : (
                <Badge
                  variant="destructive"
                  data-testid="no-timing-data-badge"
                >
                  No timing data
                </Badge>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

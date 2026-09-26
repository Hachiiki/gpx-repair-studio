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
import { formatDateTime, formatDistanceMeters } from "@/lib/utils/format";
import type { SegmentRow } from "@/hooks/use-gpx-session";

export function SegmentList({ rows }: { rows: readonly SegmentRow[] }) {
  const trackCount = new Set(rows.map((row) => row.trackIndex)).size;

  // Pure grouping (segments of one track are contiguous in document order).
  const groups = [...new Set(rows.map((row) => row.trackIndex))].map(
    (trackIndex) => ({
      trackIndex,
      trackName:
        rows.find((row) => row.trackIndex === trackIndex)?.trackName ??
        `Track ${trackIndex + 1}`,
      rows: rows.filter((row) => row.trackIndex === trackIndex),
    }),
  );

  return (
    <Card data-testid="segment-list">
      <CardHeader>
        <h3 className="leading-none font-semibold">Segments</h3>
        <CardDescription>
          {rows.length} segment{rows.length === 1 ? "" : "s"} across{" "}
          {trackCount} track{trackCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-80 -mx-2">
          <div className="grid gap-4 px-2">
            {groups.map((group) => (
              <div key={group.trackIndex} className="grid gap-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.trackName}
                </p>
                {group.rows.map((row) => (
                  <div
                    key={row.segmentId}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="grid gap-0.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.segmentId}
                      </span>
                      <span className="tabular-nums">
                        {row.pointCount.toLocaleString()} points ·{" "}
                        {formatDistanceMeters(row.distanceM)}
                        {row.excludedLegs > 0 && (
                          <span className="text-signal">
                            {" "}
                            (+{row.excludedLegs} leg
                            {row.excludedLegs === 1 ? "" : "s"} excluded)
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.firstTimeMs !== undefined
                          ? `${formatDateTime(row.firstTimeMs)} → ${formatDateTime(row.lastTimeMs)}`
                          : "No timestamps"}
                      </span>
                    </div>
                    {row.flaggedPoints > 0 && (
                      <StatusBadge tone="warning">
                        {row.flaggedPoints} flagged
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

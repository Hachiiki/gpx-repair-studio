/**
 * StatsPanel — original-only statistics table
 * (Phase 2 scope: "original-only StatsPanel"; §L-1/§L-2 honesty rules).
 *
 * Every row carries the mandatory provenance column (all "Recorded" until
 * reconstruction statistics arrive in Phase 5). Unsupported statistics
 * render "—" with a one-line reason — the app never fabricates values.
 * Excluded legs (damaged coordinates) are disclosed in a footnote.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import type { DistanceStats, TimeStats } from "@/hooks/use-gpx-session";
import { formatDistanceMeters, formatDurationMs } from "@/lib/utils/format";

function emDash(reason: string) {
  return <span title={reason}>—</span>;
}

export interface StatsPanelProps {
  distanceStats: DistanceStats;
  timeStats: TimeStats;
}

export function StatsPanel({ distanceStats, timeStats }: StatsPanelProps) {
  const noTime = !timeStats.hasTimingData;

  return (
    <Card data-testid="stats-panel">
      <CardHeader>
        <h3 className="leading-none font-semibold">Statistics</h3>
        <CardDescription>
          Original recording only — repairs are not included yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Metric</TableHead>
              <TableHead scope="col">Value</TableHead>
              <TableHead scope="col">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Total distance</TableCell>
              <TableCell className="tabular-nums">
                {formatDistanceMeters(distanceStats.totalDistanceM)}
              </TableCell>
              <TableCell>
                <ProvenanceBadge kind="recorded" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Recorded moving time</TableCell>
              <TableCell className="tabular-nums">
                {noTime
                  ? emDash("No timing data in this file")
                  : formatDurationMs(timeStats.recordedMovingTimeMs)}
              </TableCell>
              <TableCell>
                <ProvenanceBadge kind="recorded" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Wall time</TableCell>
              <TableCell className="tabular-nums">
                {noTime
                  ? emDash("No timing data in this file")
                  : timeStats.wallTimeMs === undefined
                    ? emDash("Timestamps are not monotonic")
                    : formatDurationMs(timeStats.wallTimeMs)}
              </TableCell>
              <TableCell>
                <ProvenanceBadge kind="recorded" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
          {noTime && (
            <p data-testid="no-timing-note">
              No timing data in this file — time and pace statistics are
              unavailable. A manual duration can be supplied per gap in a
              later repair step.
            </p>
          )}
          {!noTime && timeStats.gapLegs > 0 && (
            <p>
              Wall time includes{" "}
              {formatDurationMs(timeStats.gapTimeMs)} across{" "}
              {timeStats.gapLegs} gap span
              {timeStats.gapLegs === 1 ? "" : "s"} (excluded from moving
              time).
            </p>
          )}
          {!noTime && timeStats.reversedLegs > 0 && (
            <p>
              {timeStats.reversedLegs} reversed timestamp leg
              {timeStats.reversedLegs === 1 ? "" : "s"} — counted as zero
              duration.
            </p>
          )}
          {!noTime && timeStats.untimedLegs > 0 && (
            <p>
              {timeStats.untimedLegs} leg
              {timeStats.untimedLegs === 1 ? "" : "s"} without usable
              timestamps — excluded from moving time.
            </p>
          )}
          {distanceStats.excludedLegs > 0 && (
            <p>
              {distanceStats.excludedLegs} distance leg
              {distanceStats.excludedLegs === 1 ? "" : "s"} excluded —
              damaged coordinates (invalid:{" "}
              {distanceStats.excludedByReason["invalid-coord"]}, out-of-range:{" "}
              {distanceStats.excludedByReason["out-of-range-coord"]},
              zero-coordinate: {distanceStats.excludedByReason["zero-coord"]}).
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

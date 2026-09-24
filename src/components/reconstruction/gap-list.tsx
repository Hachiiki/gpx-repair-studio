/**
 * GapList — textual listing of detected repair sites
 * (Phase 2 scope: "detected gaps … textual, with times/elapsed/coords").
 *
 * Phase 2 is inspection only: rows show kind, severity, elapsed time,
 * straight-line diagnostics, and the boundary points' coordinates and
 * timestamps. Selection ↔ map focus sync arrives with the map (Phase 3);
 * repair actions arrive with the draw editor (Phase 4).
 */

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleCheck } from "lucide-react";
import { GapThresholdSettings } from "@/components/gpx/gap-threshold-settings";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/shared/status-badge";
import type { GapRow, GapThresholds } from "@/hooks/use-gpx-session";
import type { GapKind, GapSeverity } from "@/types/domain";
import {
  formatDateTime,
  formatDistanceMeters,
  formatDurationMs,
  formatLatLon,
  formatSpeedKmh,
} from "@/lib/utils/format";

const KIND_LABELS: Record<GapKind, string> = {
  "time-gap": "Time gap",
  "speed-anomaly": "Speed anomaly",
  "segment-break": "Segment break",
};

const SEVERITY_TONE: Record<GapSeverity, StatusTone> = {
  severe: "danger",
  suspect: "warning",
  info: "neutral",
};

function SeverityBadge({ severity }: { severity: GapSeverity }) {
  return <StatusBadge tone={SEVERITY_TONE[severity]}>{severity}</StatusBadge>;
}

function BoundaryLine({
  role,
  point,
}: {
  role: string;
  point: GapRow["before"];
}) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{role}</span>{" "}
      {point.time !== undefined ? formatDateTime(point.time) : "no time"} ·{" "}
      <span className="font-mono">{formatLatLon(point.lat, point.lon)}</span>{" "}
      <span className="font-mono text-[11px]">({point.pointId})</span>
    </p>
  );
}

export interface GapListProps {
  rows: readonly GapRow[];
  thresholds: GapThresholds;
  onThresholdsChange: (patch: Partial<GapThresholds>) => void;
  onThresholdsReset: () => void;
}

export function GapList({
  rows,
  thresholds,
  onThresholdsChange,
  onThresholdsReset,
}: GapListProps) {
  return (
    <Card data-testid="gap-list">
      <CardHeader>
        <h3 className="leading-none font-semibold">Detected gaps</h3>
        <CardDescription>
          {rows.length === 1
            ? "1 candidate repair site"
            : `${rows.length} candidate repair sites`}
        </CardDescription>
        <CardAction>
          <GapThresholdSettings
            thresholds={thresholds}
            onThresholdsChange={onThresholdsChange}
            onReset={onThresholdsReset}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck
              className="size-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            No gaps detected with the current thresholds.
          </p>
        ) : (
          <ScrollArea className="max-h-96 -mx-2">
            <ul className="grid gap-3 px-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="grid gap-1.5 rounded-lg border px-3 py-2.5"
                  data-testid="gap-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={row.severity} />
                    <span className="text-sm font-medium">
                      {KIND_LABELS[row.kind]}
                    </span>
                    <span className="ml-auto text-sm tabular-nums">
                      {row.elapsedMs !== undefined
                        ? `${formatDurationMs(row.elapsedMs)} elapsed`
                        : "elapsed unknown"}
                    </span>
                  </div>
                  <BoundaryLine role="From" point={row.before} />
                  <BoundaryLine role="To" point={row.after} />
                  <p className="text-xs text-muted-foreground">
                    Straight-line:{" "}
                    {row.impliedDistanceM !== undefined
                      ? formatDistanceMeters(row.impliedDistanceM)
                      : "—"}
                    {row.impliedSpeed !== undefined && (
                      <>
                        {" "}
                        · implied speed{" "}
                        {formatSpeedKmh(row.impliedSpeed * 3.6)}
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * GapList — textual listing of detected repair sites (Phase 2) with
 * selection sync (Phase 3: "GapList ↔ map selection sync").
 *
 * Rows show kind, severity, elapsed time, straight-line diagnostics, and
 * the boundary points' coordinates and timestamps. Selecting a row
 * highlights the gap on the map and focuses it (the map binding owns the
 * controller); selecting a gap on the map highlights the row here — both
 * directions flow through the shared `selectedGapId` in the UI store.
 *
 * Repair actions arrive with the draw editor (Phase 4).
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
  GAP_KIND_LABELS,
  GapSeverityBadge,
} from "@/components/shared/gap-vocabulary";
import type { GapRow, GapThresholds } from "@/hooks/use-gpx-session";
import type { GapId } from "@/types/domain";
import {
  formatDateTime,
  formatDistanceMeters,
  formatDurationMs,
  formatLatLon,
  formatSpeedKmh,
} from "@/lib/utils/format";

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
  /** The gap currently highlighted on the map (shared selection). */
  selectedGapId: GapId | null;
  /** Select (or, when already selected, deselect) a gap. */
  onSelectGap: (gapId: GapId | null) => void;
}

export function GapList({
  rows,
  thresholds,
  onThresholdsChange,
  onThresholdsReset,
  selectedGapId,
  onSelectGap,
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
              {rows.map((row) => {
                const selected = row.id === selectedGapId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      data-testid="gap-row"
                      data-selected={selected}
                      aria-pressed={selected}
                      aria-label={`Gap ${GAP_KIND_LABELS[row.kind]}, ${row.severity}. ${selected ? "Deselect" : "Select and focus on map"}.`}
                      className={`grid w-full gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 ${
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                          : "hover:bg-accent"
                      }`}
                      onClick={() => onSelectGap(selected ? null : row.id)}
                      ref={(el) => {
                        if (selected && el?.scrollIntoView) {
                          el.scrollIntoView({ block: "nearest" });
                        }
                      }}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <GapSeverityBadge severity={row.severity} />
                        <span className="text-sm font-medium">
                          {GAP_KIND_LABELS[row.kind]}
                        </span>
                        <span className="ml-auto text-sm tabular-nums">
                          {row.elapsedMs !== undefined
                            ? `${formatDurationMs(row.elapsedMs)} elapsed`
                            : "elapsed unknown"}
                        </span>
                      </span>
                      <BoundaryLine role="From" point={row.before} />
                      <BoundaryLine role="To" point={row.after} />
                      <span className="text-xs text-muted-foreground">
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
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

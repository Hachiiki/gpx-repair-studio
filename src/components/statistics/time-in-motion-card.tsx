/**
 * TimeInMotionCard — the §EE 15.3 stopped-time summary.
 *
 * The workbench answer to "was I actually moving?": in-motion vs
 * stopped time over the merged route, the stop events the detector
 * found (start, duration, where along the route), and the honest
 * breakdown around them (wall / moving / stopped / in-motion with the
 * gap/untimed/reversed bookkeeping — the time.ts vocabulary, so the
 * numbers here reconcile with the statistics table's time rows).
 *
 * The detection rule is disclosed in the card itself: a stop is time
 * with implied speed under 0.5 m/s; gaps in the recording are NOT
 * stops (the device stopped writing, not necessarily moving).
 *
 * Pure presentation: MotionSummary in, nothing out.
 */

"use client";

import { useState } from "react";
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
import type { MotionSummary } from "@/hooks/use-splits";
import {
  formatDateTime,
  formatDistanceMeters,
  formatDurationMs,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** One big summary number (the outcome banner's shape). */
function SummaryBlock({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-3 py-3",
        accent ? "bg-signal/[0.07]" : "bg-transparent",
      )}
    >
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
        {accent && (
          <span
            className="size-[7px] shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
        )}
        {label}
      </p>
      <p className="mt-1 font-display text-[25px] font-bold leading-[1.05] tabular-nums">
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground tabular-nums">
          {detail}
        </p>
      )}
    </div>
  );
}

export interface TimeInMotionCardProps {
  motion: MotionSummary;
}

export function TimeInMotionCard({ motion }: TimeInMotionCardProps) {
  const [stopsOpen, setStopsOpen] = useState(false);
  const stopCount = motion.stopEvents.length;
  const movingProvenance = motion.hasEstimatedLegs ? "mixed" : "recorded";

  return (
    <Card data-testid="time-in-motion-card" className="border-[1.5px] border-ink">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          Time in motion
        </h3>
        <CardDescription>
          A stop is time with an implied speed under {motion.stopSpeedMps} m/s
          — recorded gaps are excluded (the device stopped writing, not
          necessarily moving). Computed on the route as it would export.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          data-testid="motion-summary"
          className="grid grid-cols-[repeat(2,minmax(0,1fr))] overflow-hidden rounded-[8px] border-[1.5px] border-ink"
        >
          <SummaryBlock
            label="In motion"
            value={formatDurationMs(motion.inMotionMs)}
            detail={
              motion.wallTimeMs !== undefined
                ? `of ${formatDurationMs(motion.wallTimeMs)} wall time`
                : undefined
            }
          />
          <div className="border-l-[1.5px] border-ink/15">
            <SummaryBlock
              label="Stopped"
              value={formatDurationMs(motion.stoppedMs)}
              detail={
                stopCount > 0
                  ? `${stopCount} stop${stopCount === 1 ? "" : "s"} · longest ${formatDurationMs(motion.longestStopMs)}`
                  : "no stops detected"
              }
              accent={stopCount > 0}
            />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <Table data-testid="motion-breakdown">
            <TableHeader>
              <TableRow>
                <TableHead
                  scope="col"
                  className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                >
                  Time bucket
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                >
                  Value
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-auto pb-2 text-right text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                >
                  Source
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Wall time</TableCell>
                <TableCell className="tabular-nums">
                  {motion.wallTimeMs === undefined
                    ? "—"
                    : formatDurationMs(motion.wallTimeMs)}
                </TableCell>
                <TableCell className="text-right">
                  <ProvenanceBadge kind="recorded" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  Moving time
                  {motion.gapLegs > 0 && (
                    <span className="block text-[10.5px] leading-snug text-muted-foreground">
                      excludes {motion.gapLegs} gap leg
                      {motion.gapLegs === 1 ? "" : "s"} (
                      {formatDurationMs(motion.gapTimeMs)})
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatDurationMs(motion.movingMs)}
                </TableCell>
                <TableCell className="text-right">
                  <ProvenanceBadge kind={movingProvenance} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Stopped time</TableCell>
                <TableCell className="tabular-nums">
                  {formatDurationMs(motion.stoppedMs)}
                </TableCell>
                <TableCell className="text-right">
                  <ProvenanceBadge kind={movingProvenance} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">In motion</TableCell>
                <TableCell className="tabular-nums font-bold">
                  {formatDurationMs(motion.inMotionMs)}
                </TableCell>
                <TableCell className="text-right">
                  <ProvenanceBadge kind={movingProvenance} />
                </TableCell>
              </TableRow>
              {(motion.untimedLegs > 0 || motion.reversedLegs > 0) && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="pt-1 text-[11px] text-muted-foreground">
                    {[...((motion.untimedLegs > 0)
                      ? [`${motion.untimedLegs} untimed leg${motion.untimedLegs === 1 ? "" : "s"}`]
                      : []),
                      ...((motion.reversedLegs > 0)
                        ? [`${motion.reversedLegs} reversed leg${motion.reversedLegs === 1 ? "" : "s"}`]
                        : [])].join(" · ")}{" "}
                    — counted, never guessed into the buckets above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {stopCount > 0 && (
          <div className="mt-3">
            <button
              type="button"
              data-testid="stops-table-toggle"
              data-print-hide-on-print
              aria-expanded={stopsOpen}
              className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
              onClick={() => setStopsOpen((open) => !open)}
            >
              {stopsOpen
                ? "Hide stop list"
                : `List ${stopCount} stop${stopCount === 1 ? "" : "s"}`}
            </button>
            {stopsOpen && (
              <div className="mt-2 overflow-x-auto">
                <Table data-testid="stops-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        #
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        Started
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        At
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        Duration
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-right text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        Source
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motion.stopEvents.map((event) => (
                      <TableRow key={event.index} data-testid={`stop-row-${event.index}`}>
                        <TableCell className="tabular-nums">{event.index}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {event.startMs === undefined
                            ? "—"
                            : formatDateTime(event.startMs)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDistanceMeters(event.atDistanceM)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatDurationMs(event.durationMs)}
                        </TableCell>
                        <TableCell className="text-right">
                          <ProvenanceBadge kind={event.provenance} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

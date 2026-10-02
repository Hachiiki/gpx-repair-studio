/**
 * SplitsCard — the §EE 15.1/15.3 dashboard: pace-over-distance bars +
 * the splits table.
 *
 * The pace chart is one dependency-free SVG (static-export safe, the
 * elevation profile's recipe): one bar per split, height ∝ average
 * pace (slower reads taller), recorded splits in ink, splits touched
 * by reconstruction in signal orange, mixed carrying an ink outline —
 * the provenance vocabulary every chart in the app speaks. Splits
 * without time render a dashed baseline tick, never a zero bar.
 *
 * The table is the chart's textual equivalent (§C-5): the same rows
 * with distance, time, average pace, elevation gain, the provenance
 * badge, and the per-split honesty flags (gapped / untimed / reversed
 * legs — a partial time is disclosed, never padded).
 *
 * Pure presentation: view models in (the useSplits hook's output),
 * nothing out. The split unit follows the persisted pace toggle.
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
import type { SplitsResult, SplitRow } from "@/hooks/use-splits";
import { splitPaceMsPerMeter } from "@/hooks/use-splits";
import type { PaceUnit } from "@/lib/utils/format";
import {
  PACE_METERS_PER_UNIT,
  formatDistanceForUnit,
  formatDurationMs,
  formatElevationMeters,
  formatPace,
  formatPaceMs,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** Plot area inside the 600×150 viewBox. */
const WIDTH = 600;
const HEIGHT = 150;
const PAD_LEFT = 46;
const PAD_RIGHT = 10;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

/**
 * Table rows rendered before "show more". Bounds DOM on huge files
 * (the §C-2 budget: the 250k stress file spans ~687 km → 687 splits,
 * which once rendered every row and blew the <5000-node ceiling).
 * The full list always ships in the stats CSV — the cap is disclosed
 * next to the button, never silent.
 */
const TABLE_PAGE = 60;

/** Above this many bars, per-bar hover titles are dropped: a bar is
 * under a pixel wide, so a tooltip target is meaningless. Disclosed
 * in a caption under the chart. */
const DENSE_CHART_BARS = 120;

/** Compact distance for ranges: `0–1 km`, `4–4.2 km`. */
function rangeLabel(fromM: number, toM: number, unit: PaceUnit): string {
  const unitM = PACE_METERS_PER_UNIT[unit];
  const label = (meters: number): string => {
    const value = meters / unitM;
    return `${value >= 10 ? Math.round(value) : Number(value.toFixed(1))} ${unit}`;
  };
  return `${label(fromM)}–${label(toM)}`;
}

/** The per-split honesty flags as one muted line ("" when clean). */
function flagLabel(row: SplitRow): string {
  const parts: string[] = [];
  if (row.gapLegs > 0) parts.push(`${row.gapLegs} gap leg${row.gapLegs === 1 ? "" : "s"}`);
  if (row.untimedLegs > 0)
    parts.push(`${row.untimedLegs} untimed leg${row.untimedLegs === 1 ? "" : "s"}`);
  if (row.reversedLegs > 0)
    parts.push(`${row.reversedLegs} reversed leg${row.reversedLegs === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** One split's bar title (hover + SR text). */
function barTitle(row: SplitRow, unit: PaceUnit): string {
  const pace = splitPaceMsPerMeter(row);
  return `Split ${row.index} — ${
    pace === undefined ? "no time" : formatPace(row.timeMs, row.distanceM, unit)
  } (${row.provenance})`;
}

function PaceChart({
  splits,
  unit,
}: {
  splits: SplitsResult;
  unit: PaceUnit;
}) {
  const bars = splits.rows.filter((row) => splitPaceMsPerMeter(row) !== undefined);
  if (bars.length === 0) return null;

  const maxPace = Math.max(
    ...bars.map((row) => splitPaceMsPerMeter(row) as number),
  );
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotW / splits.rows.length;
  // Dense charts (hundreds of splits) draw ~1 px bars — a pace barcode —
  // instead of the 2 px minimum overlapping into mush.
  const barW = Math.max(1, Math.min(28, slot * 0.66));
  const dense = splits.rows.length > DENSE_CHART_BARS;

  const yScale = (paceMsPerMeter: number): number =>
    PAD_TOP + plotH - (plotH * paceMsPerMeter) / maxPace;

  // X tick cadence: at most ~10 labels however many splits there are.
  const every = Math.max(1, Math.ceil(splits.rows.length / 10));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-[150px] w-full"
      data-testid="splits-pace-chart"
      role="img"
      aria-label={`Average pace per ${unit === "km" ? "kilometer" : "mile"} — slower splits draw taller bars; signal-orange bars include reconstructed (estimated) stretches.`}
    >
      {/* Y axis: 0 (floor), the mid, and the slowest pace labels. */}
      {[0, maxPace / 2, maxPace].map((pace, index) => {
        const y = index === 0 ? PAD_TOP + plotH : yScale(pace);
        return (
          <g key={index}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={index === 1 ? "3 3" : undefined}
            />
            <text
              x={PAD_LEFT - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {index === 0
                ? "0"
                : formatPaceMs(pace * PACE_METERS_PER_UNIT[unit])}
            </text>
          </g>
        );
      })}
      {/* X axis: split ordinals. */}
      {splits.rows.map((row) =>
        row.index % every === 0 ? (
          <text
            key={row.index}
            x={PAD_LEFT + slot * (row.index - 1) + slot / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px] tabular-nums"
          >
            {row.index}
          </text>
        ) : null,
      )}
      {/* The bars (and the no-time ticks). Dense charts drop the hover
       * titles — a sub-pixel bar cannot be aimed at. */}
      {splits.rows.map((row) => {
        const cx = PAD_LEFT + slot * (row.index - 1) + slot / 2;
        const pace = splitPaceMsPerMeter(row);
        if (pace === undefined) {
          return (
            <line
              key={row.index}
              x1={cx - barW / 2}
              x2={cx + barW / 2}
              y1={PAD_TOP + plotH - 2}
              y2={PAD_TOP + plotH - 2}
              className="stroke-shade"
              strokeWidth={2.5}
              strokeDasharray="2 2"
            >
              {!dense && <title>{barTitle(row, unit)}</title>}
            </line>
          );
        }
        const y = yScale(pace);
        return (
          <rect
            key={row.index}
            x={cx - barW / 2}
            y={y}
            width={barW}
            height={PAD_TOP + plotH - y}
            data-testid="splits-pace-bar"
            className={cn(
              row.provenance === "recorded"
                ? "fill-ink"
                : "fill-signal",
            )}
            {...(row.provenance === "mixed"
              ? { stroke: "currentColor", strokeWidth: 1.25, style: { color: "var(--ink)" } }
              : {})}
            rx={1}
          >
            {!dense && <title>{barTitle(row, unit)}</title>}
          </rect>
        );
      })}
      {dense && (
        <text
          x={WIDTH - PAD_RIGHT}
          y={PAD_TOP + 8}
          textAnchor="end"
          className="fill-muted-foreground text-[9px]"
        >
          {splits.rows.length} bars — hover readouts off at this density
        </text>
      )}
    </svg>
  );
}

export interface SplitsCardProps {
  splits: SplitsResult;
  paceUnit: PaceUnit;
}

export function SplitsCard({ splits, paceUnit }: SplitsCardProps) {
  const [tableOpen, setTableOpen] = useState(true);
  const [rowsShown, setRowsShown] = useState(TABLE_PAGE);
  const rows = splits.rows;
  const visibleRows = rows.slice(0, rowsShown);
  const totalDistance = rows.reduce((sum, row) => sum + row.distanceM, 0);

  return (
    <Card data-testid="splits-card" className="border-[1.5px] border-ink">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          Splits &amp; pace
        </h3>
        <CardDescription>
          Every {paceUnit === "km" ? "kilometer" : "mile"} of the route as it
          would export — working copy plus committed repairs. Splits crossing
          reconstructed stretches are flagged; the unit follows the pace
          toggle above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {splits.hasTimingData ? (
          <PaceChart splits={splits} unit={paceUnit} />
        ) : (
          <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
            No timing data in this file — the splits below show distance and
            elevation only.
          </p>
        )}

        <div className="mt-3">
          <button
            type="button"
            data-testid="splits-table-toggle"
            data-print-hide-on-print
            aria-expanded={tableOpen}
            className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
            onClick={() => setTableOpen((open) => !open)}
          >
            {tableOpen ? "Hide split table" : "Show split table"}
          </button>
        </div>

        {tableOpen && rows.length > visibleRows.length && (
          <p
            data-testid="splits-cap-note"
            className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground"
          >
            Showing {visibleRows.length} of {rows.length} splits — the
            stats CSV carries every one.
          </p>
        )}

        {tableOpen && (
          <div className="mt-2 overflow-x-auto">
            <Table data-testid="splits-table">
              <TableHeader>
                <TableRow>
                  <TableHead
                    scope="col"
                    className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                  >
                    Split
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                  >
                    Distance
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                  >
                    Time
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                  >
                    Avg pace
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                  >
                    Gain
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
                {visibleRows.map((row) => {
                  const flags = flagLabel(row);
                  return (
                    <TableRow key={row.index} data-testid={`split-row-${row.index}`}>
                      <TableCell className="whitespace-nowrap font-mono text-[12px]">
                        {rangeLabel(row.fromM, row.toM, paceUnit)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDistanceForUnit(row.distanceM, paceUnit)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="tabular-nums">
                          {row.timeMs > 0 ? formatDurationMs(row.timeMs) : "—"}
                        </span>
                        {flags !== "" && (
                          <span
                            className="block text-[10.5px] leading-snug text-muted-foreground"
                            title="Partial time — these legs contributed distance but no time"
                          >
                            {flags}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {row.timeMs > 0
                          ? formatPace(row.timeMs, row.distanceM, paceUnit)
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {row.eleGainM === null
                          ? "—"
                          : formatElevationMeters(row.eleGainM)}
                        {row.eleEstimated && row.eleGainM !== null && (
                          <span className="ml-1 align-super text-[9px] font-bold text-signal-ink">
                            est
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <ProvenanceBadge kind={row.provenance} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length > visibleRows.length && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={6}
                      className="border-t-[1.5px] border-ink/25 pt-2"
                    >
                      <button
                        type="button"
                        data-testid="splits-show-more"
                        data-print-hide-on-print
                        className="rounded-[5px] border-[1.25px] border-ink/30 px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-signal hover:bg-signal/[0.08] focus-visible:outline-2"
                        onClick={() =>
                          setRowsShown((shown) => shown + TABLE_PAGE)
                        }
                      >
                        Show {TABLE_PAGE} more splits
                      </button>
                    </TableCell>
                  </TableRow>
                )}
                <TableRow className="hover:bg-transparent">
                  <TableCell className="border-t-[1.5px] border-ink/25 pt-2 font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="border-t-[1.5px] border-ink/25 pt-2 tabular-nums font-semibold">
                    {formatDistanceForUnit(totalDistance, paceUnit)}
                  </TableCell>
                  <TableCell
                    colSpan={4}
                    className="border-t-[1.5px] border-ink/25 pt-2 text-[11px] text-muted-foreground"
                  >
                    {rows.length} split{rows.length === 1 ? "" : "s"} of 1{" "}
                    {paceUnit} — gains use the{" "}
                    {splits.hysteresisThresholdM} m hysteresis deadband,
                    attributed where each climb completes.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

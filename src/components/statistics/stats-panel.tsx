/**
 * StatsPanel — the provenance-badged statistics table
 * (§L-1/§L-2; Phase 2 original-only rows, Phase 5 repair + pace rows,
 * Phase 7 re-imported repairs).
 *
 * Every row carries the mandatory provenance column (Recorded /
 * Estimated / Mixed). Unsupported statistics render "—" with their
 * reason — the app never fabricates values. When committed repairs
 * exist, the distance rows split (recorded / repaired / total-with) and
 * the §L-1 pace rows appear with the km/mi unit toggle. A re-uploaded
 * repaired file contributes its marked stretches to the same repaired
 * rows (estimated provenance, same as fresh repairs).
 *
 * Pure presentation: stats in (session view models + the repair join
 * from the draw binding), nothing computed here.
 */

import {
  Card,
  CardAction,
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
import { PaceUnitToggle } from "@/components/shared/pace-unit-toggle";
import type {
  DistanceStats,
  ReimportStats,
  TimeStats,
} from "@/hooks/use-gpx-session";
import type {
  PaceRow,
  RepairTimeStats,
} from "@/hooks/use-draw-editor";
import type { ElevationStatsRows } from "@/hooks/use-elevation";
import type { PaceUnit } from "@/lib/utils/format";
import {
  formatDistanceMeters,
  formatDurationMs,
  formatElevationMeters,
  formatPace,
} from "@/lib/utils/format";

function emDash(reason: string) {
  return <span title={reason}>—</span>;
}

export interface StatsPanelProps {
  distanceStats: DistanceStats;
  timeStats: TimeStats;
  /**
   * Phase 5: the committed-repair time join. Omitted/null → the
   * original-only table (exact Phase 2 presentation).
   */
  repair?: RepairTimeStats | null;
  /** §L-1 pace rows (recorded / repaired / overall). */
  paceRows?: readonly PaceRow[];
  /** §L-1 elevation rows (Phase 6) — omitted/null → no elevation rows. */
  elevation?: ElevationStatsRows | null;
  /** File-level manual total (no-timing files), when entered. */
  manualTotalDurationMs?: number | null;
  /** Re-imported repair stats (§H-7) — marked stretches of a re-upload. */
  reimport?: ReimportStats | null;
  /** §J-2 pace unit toggle. */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
}

const PACE_ROW_LABELS: Record<PaceRow["id"], string> = {
  recorded: "Pace (recorded)",
  repaired: "Pace (repairs)",
  overall: "Overall pace",
};

export function StatsPanel({
  distanceStats,
  timeStats,
  repair = null,
  paceRows = [],
  elevation = null,
  manualTotalDurationMs = null,
  reimport = null,
  paceUnit,
  onPaceUnitChange,
}: StatsPanelProps) {
  const noTime = !timeStats.hasTimingData;
  const reimportDistance = reimport?.repairedDistanceM ?? 0;
  const reimportTime = reimport?.repairTimeMs ?? null;
  const liveRepairDistance = repair?.reconstructedDistanceM ?? 0;
  const liveRepairTime = repair?.reconstructedTimeMs ?? null;
  const hasRepairs =
    (repair?.gapCount ?? 0) > 0 || (reimport?.markerCount ?? 0) > 0;
  // The file's own totals already contain the marked stretches of a
  // re-imported repair (originalDistanceStats measures every usable
  // leg, markers included) — so the recorded/total split SUBTRACTS the
  // marked distance instead of adding it on top (the Phase 7
  // double-count, fixed in Task 20: a re-upload's "Total with repairs"
  // used to read file-total + marked-legs).
  const recordedDistanceM = distanceStats.totalDistanceM - reimportDistance;
  const repairedDistanceM = liveRepairDistance + reimportDistance;
  // "Repair time" (estimated): every repair's duration — live editor
  // repairs plus re-imported runs.
  const repairTime =
    liveRepairTime != null || reimportTime != null
      ? (liveRepairTime ?? 0) + (reimportTime ?? 0)
      : null;
  // Only LIVE repairs add time the file does not already contain: a
  // re-imported run's distributed timestamps are already inside
  // recordedMovingTimeMs (its legs sit under the gap threshold in the
  // common export shape — resampled points every few dozen meters).
  const liveRepairsLackDuration =
    (repair?.gapCount ?? 0) > 0 && liveRepairTime === null;

  return (
    <Card data-testid="stats-panel">
      <CardHeader>
        <h3 className="leading-none font-semibold">Statistics</h3>
        <CardDescription>
          {hasRepairs
            ? "Original recording plus committed repairs — every estimated value is labeled with its source."
            : "Original recording only — repairs are not included yet."}
        </CardDescription>
        <CardAction>
          <PaceUnitToggle unit={paceUnit} onChange={onPaceUnitChange} />
        </CardAction>
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
            {/* Distance rows. */}
            {hasRepairs ? (
              <>
                <TableRow>
                  <TableCell>Recorded distance</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDistanceMeters(recordedDistanceM)}
                  </TableCell>
                  <TableCell>
                    <ProvenanceBadge kind="recorded" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Repaired distance</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDistanceMeters(repairedDistanceM)}
                  </TableCell>
                  <TableCell>
                    <ProvenanceBadge kind="estimated" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Total with repairs</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDistanceMeters(
                      recordedDistanceM + repairedDistanceM,
                    )}
                  </TableCell>
                  <TableCell>
                    <ProvenanceBadge kind="mixed" />
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableCell>Total distance</TableCell>
                <TableCell className="tabular-nums">
                  {formatDistanceMeters(distanceStats.totalDistanceM)}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind="recorded" />
                </TableCell>
              </TableRow>
            )}

            {/* Time rows. */}
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
            {hasRepairs && (
              <TableRow>
                <TableCell>Repair time</TableCell>
                <TableCell className="tabular-nums">
                  {repairTime === null
                    ? emDash("Repairs still need durations")
                    : formatDurationMs(repairTime)}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind="estimated" />
                </TableCell>
              </TableRow>
            )}
            {hasRepairs && !noTime && (
              <TableRow>
                <TableCell>Moving time incl. repairs</TableCell>
                <TableCell className="tabular-nums">
                  {liveRepairsLackDuration
                    ? emDash("Repairs still need durations")
                    : formatDurationMs(
                        timeStats.recordedMovingTimeMs + (liveRepairTime ?? 0),
                      )}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind="mixed" />
                </TableCell>
              </TableRow>
            )}
            {noTime && manualTotalDurationMs !== null && (
              <TableRow>
                <TableCell>Total duration (entered)</TableCell>
                <TableCell className="tabular-nums">
                  {manualTotalDurationMs > 0
                    ? formatDurationMs(manualTotalDurationMs)
                    : emDash("Enter a total duration")}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind="estimated" />
                </TableCell>
              </TableRow>
            )}

            {/* §L-1 pace rows (Phase 5). */}
            {paceRows.map((row) => (
              <TableRow key={row.id} data-testid={`pace-row-${row.id}`}>
                <TableCell>{PACE_ROW_LABELS[row.id]}</TableCell>
                <TableCell className="tabular-nums">
                  {row.durationMs === null ? (
                    <span
                      title={row.missingReason ?? "Not computable"}
                      className="text-muted-foreground"
                    >
                      — {row.missingReason ?? "not computable"}
                    </span>
                  ) : (
                    formatPace(row.durationMs, row.distanceM, paceUnit)
                  )}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind={row.provenance} />
                </TableCell>
              </TableRow>
            ))}

            {/* §L-1 elevation rows (Phase 6): gain/loss, provenance-split
                like the distance rows (single recorded rows without
                repairs, three-way split with them); coverage below 60%
                withholds the totals ("insufficient elevation data")
                rather than inventing numbers from a mostly-ele-less
                file. */}
            {elevation && elevation.pointsTotal > 0 && (
              <>
                {(elevation.insufficient
                  ? [
                      {
                        label: "Elevation gain / loss",
                        value: null as { gainM: number; lossM: number } | null,
                        provenance: "mixed" as const,
                      },
                    ]
                  : elevation.reconstructed
                    ? [
                        {
                          label: "Elevation gain (recorded)",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                        {
                          label: "Elevation gain (repairs)",
                          value: elevation.reconstructed,
                          provenance: "estimated" as const,
                        },
                        {
                          label: "Elevation gain (total)",
                          value: elevation.mixed,
                          provenance: "mixed" as const,
                        },
                        {
                          label: "Elevation loss (recorded)",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                        {
                          label: "Elevation loss (repairs)",
                          value: elevation.reconstructed,
                          provenance: "estimated" as const,
                        },
                        {
                          label: "Elevation loss (total)",
                          value: elevation.mixed,
                          provenance: "mixed" as const,
                        },
                      ]
                    : [
                        {
                          label: "Elevation gain",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                        {
                          label: "Elevation loss",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                      ]
                ).map((row) => (
                  <TableRow
                    key={row.label}
                    data-testid={
                      row.label.includes("gain") || row.label.includes("gain / loss")
                        ? "elevation-gain-row"
                        : "elevation-loss-row"
                    }
                  >
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="tabular-nums">
                      {elevation.insufficient
                        ? emDash(
                            `Insufficient elevation data — only ${Math.round(
                              elevation.coverage * 100,
                            )}% of points carry elevation`,
                          )
                        : row.value === null
                          ? emDash("No recorded elevation in this file")
                          : formatElevationMeters(
                              row.label.includes("loss")
                                ? row.value.lossM
                                : row.value.gainM,
                            )}
                    </TableCell>
                    <TableCell>
                      <ProvenanceBadge kind={row.provenance} />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>

        <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
          {elevation && elevation.pointsTotal > 0 && (
            <p data-testid="elevation-note">
              {elevation.insufficient
                ? `Insufficient elevation data — only ${Math.round(
                    elevation.coverage * 100,
                  )}% of points carry elevation, so gain and loss are withheld rather than estimated.`
                : `Gain/loss use a ${elevation.hysteresisThresholdM.toFixed(1)} m noise threshold (changes smaller than that are treated as GPS/DEM noise); ${
                    elevation.reconstructed
                      ? "repaired stretches are estimated from OpenTopoData terrain."
                      : "original elevation only — repairs without an estimate contribute nothing."
                  }`}
            </p>
          )}
          {elevation && elevation.repairsWithoutElevation > 0 && (
            <p data-testid="elevation-missing-note">
              {elevation.repairsWithoutElevation} repair
              {elevation.repairsWithoutElevation === 1 ? "" : "s"} without an
              elevation estimate — open the repair and use “Estimate
              elevation” to include it.
            </p>
          )}
          {(reimport?.markerCount ?? 0) > 0 && (
            <p data-testid="reimport-note">
              {reimport!.markerCount} points in this file were reconstructed
              by a previous repair — they count as repaired distance, not
              recorded, and the map draws them as repairs.
            </p>
          )}
          {noTime && (
            <p data-testid="no-timing-note">
              No timing data in this file — time and pace statistics are
              unavailable unless a duration is entered (per repair, or a
              total for the whole activity).
            </p>
          )}
          {hasRepairs && (repair?.gapsWithoutDuration ?? 0) > 0 && (
            <p data-testid="repair-duration-note">
              {repair!.gapsWithoutDuration} repair
              {repair!.gapsWithoutDuration === 1 ? "" : "s"} still need
              {repair!.gapsWithoutDuration === 1 ? "s" : ""} a duration —
              its time is not counted yet (open the repair&apos;s editor to
              add one).
            </p>
          )}
          {hasRepairs && (repair?.discrepancies.length ?? 0) > 0 && (
            <p data-testid="duration-discrepancy-note">
              {repair!.discrepancies.length} manual duration
              {repair!.discrepancies.length === 1 ? "" : "s"} disagree
              {repair!.discrepancies.length === 1 ? "s" : ""} with the
              recorded gap span — timestamps follow the manual value;
              recorded timestamps are never changed.
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

/**
 * StatsPanel — the provenance-badged statistics table
 * (§L-1/§L-2; Phase 2 original-only rows, Phase 5 repair + pace rows,
 * Phase 7 re-imported repairs).
 *
 * User pass 35 restructure: when repairs exist the panel opens with an
 * OUTCOME BANNER — Original / + Repaired / Outcome, three ruled columns
 * with the repaired one on the signal tint — so "what was edited, the
 * original, and the outcome" answers itself before the table starts.
 * The table itself is now grouped (Distance / Time / Pace / Elevation)
 * with quiet ruled section labels instead of one undifferentiated run
 * of rows.
 *
 * Every row still carries the mandatory provenance column (Recorded /
 * Estimated / Mixed). Unsupported statistics render "—" with their
 * reason — the app never fabricates values. When committed repairs
 * exist, the distance rows split (recorded / repaired / total-with) and
 * the §L-1 pace rows appear with the km/mi unit toggle. A re-uploaded
 * repaired file contributes its marked stretches to the same repaired
 * rows (estimated provenance, same as fresh repairs).
 *
 * Pure presentation: stats in (session view models + the repair join
 * from the draw binding), nothing computed here beyond the same joins
 * the rows themselves render.
 */

"use client";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Download, Printer } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
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
import { cn } from "@/lib/utils";

function emDash(reason: string) {
  return <span title={reason}>—</span>;
}

/** Field Plot stat-table value cell: bold, tabular, never wrapped. */
const VALUE_CELL = "tabular-nums font-bold whitespace-nowrap";
/** Field Plot stat-table head: small, quiet, ruled. */
const HEAD_CELL =
  "h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25";

/** A quiet ruled section label inside the table (user pass 35). */
function GroupRow({ label }: { label: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={3}
        className="h-auto border-b-[1.5px] border-ink/25 pb-1 pt-3.5"
      >
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      </TableCell>
    </TableRow>
  );
}

/** One column of the outcome banner (user pass 35). */
function OutcomeColumn({
  label,
  value,
  detail,
  provenance,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  provenance: "recorded" | "estimated" | "mixed";
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
      <ProvenanceBadge kind={provenance} className="mt-2" />
    </div>
  );
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
  /**
   * Phase 13 — the working copy's edit summary. Omitted/null → no
   * working-copy label; present with edits → the stats carry the
   * "modified" disclosure (§EE 13.2: affected distances are labeled).
   */
  working?: import("@/types/domain").WorkingMeta | null;
  /** §J-2 pace unit toggle. */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
  /**
   * Phase 15 — the stats-sheet intents (§EE 15.4). Omitted (the merge
   * and recovery studios) → no action buttons; provided → "Stats CSV"
   * and "Print" join the header's action row.
   */
  onDownloadStatsCsv?: () => void;
  onPrintStats?: () => void;
}

/** The §L-1 pace row labels, resolved through the active locale. */
function paceRowLabels(
  t: ReturnType<typeof useI18n>["t"],
): Record<PaceRow["id"], string> {
  return {
    recorded: t("stats.paceRecorded"),
    repaired: t("stats.paceRepairs"),
    overall: t("stats.paceOverall"),
  };
}

export function StatsPanel({
  distanceStats,
  timeStats,
  repair = null,
  paceRows = [],
  elevation = null,
  manualTotalDurationMs = null,
  reimport = null,
  working = null,
  paceUnit,
  onPaceUnitChange,
  onDownloadStatsCsv,
  onPrintStats,
}: StatsPanelProps) {
  const { t } = useI18n();
  const paceRowLabelMap = paceRowLabels(t);
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

  // Outcome banner numbers (user pass 35): the same joins the rows
  // below render, promoted to one glanceable strip.
  const bannerOutcomeDistanceM = recordedDistanceM + repairedDistanceM;
  const bannerOutcomeMovingMs = liveRepairsLackDuration
    ? null
    : timeStats.recordedMovingTimeMs + (liveRepairTime ?? 0);

  return (
    <Card
      className="border-[1.5px] border-ink"
      data-testid="stats-panel"
    >
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span className="size-2 shrink-0 rounded-[1px] bg-signal" aria-hidden="true" />
          {t("stats.title")}
        </h3>
        <CardDescription>
          {working?.hasEdits
            ? t("stats.desc.working")
            : hasRepairs
              ? t("stats.desc.repairs")
              : t("stats.desc.original")}
        </CardDescription>
        <CardAction>
          {(onDownloadStatsCsv !== undefined || onPrintStats !== undefined) && (
            /* §EE 15.4 — the stats-sheet intents: download the dashboard
             * as CSV, print the dashboard. Screen-only furniture. */
            <div
              data-print-hide-on-print
              className="flex items-center gap-1.5"
            >
              {onDownloadStatsCsv !== undefined && (
                <button
                  type="button"
                  data-testid="download-stats-csv-button"
                  onClick={onDownloadStatsCsv}
                  className="inline-flex items-center gap-1.5 rounded-[5px] border-[1.25px] border-ink/30 px-2 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-signal hover:bg-signal/[0.08] focus-visible:outline-2"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  {t("stats.statsCsv")}
                </button>
              )}
              {onPrintStats !== undefined && (
                <button
                  type="button"
                  data-testid="print-stats-button"
                  onClick={onPrintStats}
                  className="inline-flex items-center gap-1.5 rounded-[5px] border-[1.25px] border-ink/30 px-2 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-signal hover:bg-signal/[0.08] focus-visible:outline-2"
                >
                  <Printer className="size-3.5" aria-hidden="true" />
                  {t("stats.print")}
                </button>
              )}
            </div>
          )}
          <PaceUnitToggle unit={paceUnit} onChange={onPaceUnitChange} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {working?.hasEdits && (
          /* Phase 13 — the working-copy disclosure (§EE 13.2: affected
           * distances are labeled as modified). The numbers in this
           * panel recompute from the working copy; this note says so. */
          <p
            data-testid="stats-working-note"
            className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-[8px] border-[1.25px] border-signal/40 bg-signal/[0.06] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground"
          >
            <span className="font-semibold text-ink">{t("stats.working.label")}</span>
            <span>
              {[
                working.deletedPointCount > 0
                  ? t(
                      working.deletedPointCount === 1
                        ? "stats.working.pointsRemoved.one"
                        : "stats.working.pointsRemoved.many",
                      { count: working.deletedPointCount },
                    )
                  : null,
                working.splitCount > 0
                  ? t(
                      working.splitCount === 1
                        ? "stats.working.segmentsSplit.one"
                        : "stats.working.segmentsSplit.many",
                      { count: working.splitCount },
                    )
                  : null,
                working.duplicatedSegmentCount > 0
                  ? t(
                      working.duplicatedSegmentCount === 1
                        ? "stats.working.copiesInserted.one"
                        : "stats.working.copiesInserted.many",
                      { count: working.duplicatedSegmentCount },
                    )
                  : null,
                working.reorderedSegmentCount > 0
                  ? t(
                      working.reorderedSegmentCount === 1
                        ? "stats.working.manualReorders.one"
                        : "stats.working.manualReorders.many",
                      { count: working.reorderedSegmentCount },
                    )
                  : null,
                working.sortedSegmentIds.length > 0
                  ? t(
                      working.sortedSegmentIds.length === 1
                        ? "stats.working.segmentsSorted.one"
                        : "stats.working.segmentsSorted.many",
                      { count: working.sortedSegmentIds.length },
                    )
                  : null,
                working.overriddenEleCount > 0
                  ? t(
                      working.overriddenEleCount === 1
                        ? "stats.working.elevationsSmoothed.one"
                        : "stats.working.elevationsSmoothed.many",
                      { count: working.overriddenEleCount },
                    )
                  : null,
              ]
                .filter((part) => part !== null)
                .join(" · ")}
              {" — "}
              {t("stats.working.suffix")}
            </span>
          </p>
        )}
        {hasRepairs && (
          /* The outcome banner (user pass 35): original → what the edits
           * added → the outcome. The repaired column carries the signal
           * tint — it is the app's work, the one orange thing here. */
          <div
            data-testid="stats-outcome-banner"
            className="mb-4 grid grid-cols-[repeat(3,minmax(0,1fr))] overflow-hidden rounded-[8px] border-[1.5px] border-ink"
          >
            <OutcomeColumn
              label={t("stats.outcome.original")}
              value={formatDistanceMeters(recordedDistanceM)}
              detail={
                noTime
                  ? undefined
                  : t("stats.outcome.moving", {
                      duration: formatDurationMs(timeStats.recordedMovingTimeMs),
                    })
              }
              provenance="recorded"
            />
            <div className="border-l-[1.5px] border-ink/15">
              <OutcomeColumn
                label={t("stats.outcome.repaired")}
                value={formatDistanceMeters(repairedDistanceM)}
                detail={
                  noTime
                    ? undefined
                    : repairTime === null
                      ? t("stats.outcome.durationPending")
                      : t("stats.outcome.estTime", {
                          duration: formatDurationMs(repairTime),
                        })
                }
                provenance="estimated"
                accent
              />
            </div>
            <div className="border-l-[1.5px] border-ink/15">
              <OutcomeColumn
                label={t("stats.outcome.outcome")}
                value={formatDistanceMeters(bannerOutcomeDistanceM)}
                detail={
                  noTime
                    ? undefined
                    : bannerOutcomeMovingMs === null
                      ? t("stats.outcome.durationPending")
                      : t("stats.outcome.moving", {
                          duration: formatDurationMs(bannerOutcomeMovingMs),
                        })
                }
                provenance="mixed"
              />
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className={HEAD_CELL}>
                {t("stats.metric")}
              </TableHead>
              <TableHead scope="col" className={HEAD_CELL}>
                {t("stats.value")}
              </TableHead>
              <TableHead scope="col" className={`${HEAD_CELL} text-right`}>
                {t("stats.source")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Distance rows. */}
            <GroupRow label={t("stats.group.distance")} />
            {hasRepairs ? (
              <>
                <TableRow>
                  <TableCell>{t("stats.recordedDistance")}</TableCell>
                  <TableCell className={VALUE_CELL}>
                    {formatDistanceMeters(recordedDistanceM)}
                  </TableCell>
                  <TableCell>
                    <ProvenanceBadge kind="recorded" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t("stats.repairedDistance")}</TableCell>
                  <TableCell className={VALUE_CELL}>
                    {formatDistanceMeters(repairedDistanceM)}
                  </TableCell>
                  <TableCell>
                    <ProvenanceBadge kind="estimated" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t("stats.totalWithRepairs")}</TableCell>
                  <TableCell className={VALUE_CELL}>
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
                <TableCell>{t("stats.totalDistance")}</TableCell>
                <TableCell className={VALUE_CELL}>
                  {formatDistanceMeters(distanceStats.totalDistanceM)}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind="recorded" />
                </TableCell>
              </TableRow>
            )}

            {/* Time rows. */}
            <GroupRow label={t("stats.group.time")} />
            <TableRow>
              <TableCell>{t("stats.recordedMovingTime")}</TableCell>
              <TableCell className="tabular-nums">
                {noTime
                  ? emDash(t("stats.noTiming"))
                  : formatDurationMs(timeStats.recordedMovingTimeMs)}
              </TableCell>
              <TableCell>
                <ProvenanceBadge kind="recorded" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{t("stats.wallTime")}</TableCell>
              <TableCell className="tabular-nums">
                {noTime
                  ? emDash(t("stats.noTiming"))
                  : timeStats.wallTimeMs === undefined
                    ? emDash(t("stats.notMonotonic"))
                    : formatDurationMs(timeStats.wallTimeMs)}
              </TableCell>
              <TableCell>
                <ProvenanceBadge kind="recorded" />
              </TableCell>
            </TableRow>
            {hasRepairs && (
              <TableRow>
                <TableCell>{t("stats.repairTime")}</TableCell>
                <TableCell className={VALUE_CELL}>
                  {repairTime === null
                    ? emDash(t("stats.needDurations"))
                    : formatDurationMs(repairTime)}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind="estimated" />
                </TableCell>
              </TableRow>
            )}
            {hasRepairs && !noTime && (
              <TableRow>
                <TableCell>{t("stats.movingInclRepairs")}</TableCell>
                <TableCell className={VALUE_CELL}>
                  {liveRepairsLackDuration
                    ? emDash(t("stats.needDurations"))
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
                <TableCell>{t("stats.totalDurationEntered")}</TableCell>
                <TableCell className={VALUE_CELL}>
                  {manualTotalDurationMs > 0
                    ? formatDurationMs(manualTotalDurationMs)
                    : emDash(t("stats.enterDuration"))}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge kind="estimated" />
                </TableCell>
              </TableRow>
            )}

            {/* §L-1 pace rows (Phase 5). */}
            {paceRows.length > 0 && <GroupRow label={t("stats.group.pace")} />}
            {paceRows.map((row) => (
              <TableRow key={row.id} data-testid={`pace-row-${row.id}`}>
                <TableCell>{paceRowLabelMap[row.id]}</TableCell>
                <TableCell className={VALUE_CELL}>
                  {row.durationMs === null ? (
                    <span
                      title={row.missingReason ?? t("stats.notComputableTitle")}
                      className="text-muted-foreground"
                    >
                      — {row.missingReason ?? t("stats.notComputable")}
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
                <GroupRow label={t("stats.group.elevation")} />
                {(elevation.insufficient
                  ? [
                      {
                        id: "gain-loss",
                        kind: "gain" as const,
                        labelKey: "stats.eleGainLoss",
                        value: null as { gainM: number; lossM: number } | null,
                        provenance: "mixed" as const,
                      },
                    ]
                  : elevation.reconstructed
                    ? [
                        {
                          id: "gain-recorded",
                          kind: "gain" as const,
                          labelKey: "stats.eleGainRecorded",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                        {
                          id: "gain-repairs",
                          kind: "gain" as const,
                          labelKey: "stats.eleGainRepairs",
                          value: elevation.reconstructed,
                          provenance: "estimated" as const,
                        },
                        {
                          id: "gain-total",
                          kind: "gain" as const,
                          labelKey: "stats.eleGainTotal",
                          value: elevation.mixed,
                          provenance: "mixed" as const,
                        },
                        {
                          id: "loss-recorded",
                          kind: "loss" as const,
                          labelKey: "stats.eleLossRecorded",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                        {
                          id: "loss-repairs",
                          kind: "loss" as const,
                          labelKey: "stats.eleLossRepairs",
                          value: elevation.reconstructed,
                          provenance: "estimated" as const,
                        },
                        {
                          id: "loss-total",
                          kind: "loss" as const,
                          labelKey: "stats.eleLossTotal",
                          value: elevation.mixed,
                          provenance: "mixed" as const,
                        },
                      ]
                    : [
                        {
                          id: "gain",
                          kind: "gain" as const,
                          labelKey: "stats.eleGain",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                        {
                          id: "loss",
                          kind: "loss" as const,
                          labelKey: "stats.eleLoss",
                          value: elevation.original,
                          provenance: "recorded" as const,
                        },
                      ]
                ).map((row) => (
                  <TableRow
                    key={row.id}
                    data-testid={
                      row.kind === "gain"
                        ? "elevation-gain-row"
                        : "elevation-loss-row"
                    }
                  >
                    <TableCell>{t(row.labelKey)}</TableCell>
                    <TableCell className={VALUE_CELL}>
                      {elevation.insufficient
                        ? emDash(
                            t("stats.insufficientEle", {
                              percent: Math.round(elevation.coverage * 100),
                            }),
                          )
                        : row.value === null
                          ? emDash(t("stats.noRecordedEle"))
                          : formatElevationMeters(
                              row.kind === "loss"
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

        <div className="mt-3 grid gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {elevation && elevation.pointsTotal > 0 && (
            <p data-testid="elevation-note">
              {elevation.insufficient
                ? t("stats.note.insufficient", {
                    percent: Math.round(elevation.coverage * 100),
                  })
                : elevation.reconstructed
                  ? t("stats.note.thresholdRepairs", {
                      threshold: elevation.hysteresisThresholdM.toFixed(1),
                      sources:
                        elevation.estimatedFrom.length > 0
                          ? elevation.estimatedFrom.join(", ")
                          : t("stats.note.eleService"),
                    })
                  : t("stats.note.thresholdOriginal", {
                      threshold: elevation.hysteresisThresholdM.toFixed(1),
                    })}
            </p>
          )}
          {elevation && elevation.repairsWithoutElevation > 0 && (
            <p data-testid="elevation-missing-note">
              {t(
                elevation.repairsWithoutElevation === 1
                  ? "stats.note.repairsWithoutEle.one"
                  : "stats.note.repairsWithoutEle.many",
                { count: elevation.repairsWithoutElevation },
              )}
            </p>
          )}
          {(reimport?.markerCount ?? 0) > 0 && (
            <p data-testid="reimport-note">
              {t("stats.note.reimport", { count: reimport!.markerCount })}
            </p>
          )}
          {noTime && (
            <p data-testid="no-timing-note">{t("stats.note.noTiming")}</p>
          )}
          {hasRepairs && (repair?.gapsWithoutDuration ?? 0) > 0 && (
            <p data-testid="repair-duration-note">
              {t(
                repair!.gapsWithoutDuration === 1
                  ? "stats.note.repairDuration.one"
                  : "stats.note.repairDuration.many",
                { count: repair!.gapsWithoutDuration },
              )}
            </p>
          )}
          {hasRepairs && (repair?.discrepancies.length ?? 0) > 0 && (
            <p data-testid="duration-discrepancy-note">
              {t(
                repair!.discrepancies.length === 1
                  ? "stats.note.discrepancy.one"
                  : "stats.note.discrepancy.many",
                { count: repair!.discrepancies.length },
              )}
            </p>
          )}
          {!noTime && timeStats.gapLegs > 0 && (
            <p>
              {t(
                timeStats.gapLegs === 1
                  ? "stats.note.gapSpan.one"
                  : "stats.note.gapSpan.many",
                {
                  duration: formatDurationMs(timeStats.gapTimeMs),
                  count: timeStats.gapLegs,
                },
              )}
            </p>
          )}
          {!noTime && timeStats.reversedLegs > 0 && (
            <p>
              {t(
                timeStats.reversedLegs === 1
                  ? "stats.note.reversedLegs.one"
                  : "stats.note.reversedLegs.many",
                { count: timeStats.reversedLegs },
              )}
            </p>
          )}
          {!noTime && timeStats.untimedLegs > 0 && (
            <p>
              {t(
                timeStats.untimedLegs === 1
                  ? "stats.note.untimedLegs.one"
                  : "stats.note.untimedLegs.many",
                { count: timeStats.untimedLegs },
              )}
            </p>
          )}
          {distanceStats.excludedLegs > 0 && (
            <p>
              {t(
                distanceStats.excludedLegs === 1
                  ? "stats.note.excludedLegs.one"
                  : "stats.note.excludedLegs.many",
                {
                  count: distanceStats.excludedLegs,
                  invalid: distanceStats.excludedByReason["invalid-coord"],
                  outOfRange: distanceStats.excludedByReason["out-of-range-coord"],
                  zero: distanceStats.excludedByReason["zero-coord"],
                },
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ZonesCard — the Phase 23.1/23.2 dashboard (docs/plans/v3/
 * phase-23-fitness-zones-metrics.md): time-in-zone for heart rate,
 * power, and GAP-bucketed pace, cadence ranges, the whole-run GAP, the
 * opt-in calorie estimate, and the per-split zone breakdown.
 *
 * Every tab is the §L-2 honesty discipline applied to zones exactly as
 * it applies to pace: a file without the metric renders its reason,
 * never a zero row; legs without the metric (every reconstructed
 * stretch records none) count as no-data, disclosed under the table;
 * zones plus no-data sum to the route's moving time — the
 * reconciliation line says so. The settings popover rides in the
 * header (boundaries, FTP, the race result, the stop threshold, the
 * calorie weight — all local, all persisted).
 *
 * Pure presentation: view models in (the useZones hook's output),
 * nothing out beyond the settings props.
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
import { ZoneSettings } from "@/components/statistics/zone-settings";
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
import type {
  CadenceRangeRow,
  FitnessSettings,
  ZoneTimeResult,
  ZoneTimeRow,
  ZonesView,
} from "@/hooks/use-zones";
import type { PaceUnit } from "@/lib/utils/format";
import {
  PACE_METERS_PER_UNIT,
  formatDistanceForUnit,
  formatDurationMs,
  formatPaceMs,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** The zone-name keys, indexed by 1-based ordinal (typed tuples). */
const HR_ZONE_NAME_KEYS = [
  "zones.name.hr.1",
  "zones.name.hr.2",
  "zones.name.hr.3",
  "zones.name.hr.4",
  "zones.name.hr.5",
] as const;
const POWER_ZONE_NAME_KEYS = [
  "zones.name.power.1",
  "zones.name.power.2",
  "zones.name.power.3",
  "zones.name.power.4",
  "zones.name.power.5",
  "zones.name.power.6",
  "zones.name.power.7",
] as const;
const PACE_ZONE_NAME_KEYS = [
  "zones.name.pace.1",
  "zones.name.pace.2",
  "zones.name.pace.3",
  "zones.name.pace.4",
  "zones.name.pace.5",
  "zones.name.pace.6",
] as const;

type ZoneTab = "hr" | "power" | "pace" | "cadence";

/** Rows rendered before "show more" in the per-split breakdown. */
const SPLIT_TABLE_PAGE = 24;

function zoneNameKeys(tab: ZoneTab): readonly string[] {
  switch (tab) {
    case "hr":
      return HR_ZONE_NAME_KEYS;
    case "power":
      return POWER_ZONE_NAME_KEYS;
    case "pace":
      return PACE_ZONE_NAME_KEYS;
    default:
      return [];
  }
}

/** The bpm / W range label of one zone row. */
function unitRangeLabel(
  t: TranslatorArg,
  row: ZoneTimeRow,
  unit: string,
): string {
  if (row.fromValue === null) {
    return t("zones.range.openFloor", {
      value: `${Math.round(row.toValue ?? 0)} ${unit}`,
    });
  }
  if (row.toValue === null) {
    return t("zones.range.openCeil", {
      value: `${Math.round(row.fromValue)} ${unit}`,
    });
  }
  return t("zones.range.between", {
    from: `${Math.round(row.fromValue)}`,
    to: `${Math.round(row.toValue)}`,
  });
}

/** The pace range label of one zone row (ms per meter → the unit). */
function paceRangeLabel(
  t: TranslatorArg,
  row: ZoneTimeRow,
  unit: PaceUnit,
): string {
  const pace = (msPerMeter: number): string =>
    `${formatPaceMs(msPerMeter * PACE_METERS_PER_UNIT[unit])} /${unit}`;
  if (row.fromValue === null) {
    return t("zones.range.paceFaster", { value: pace(row.toValue ?? 0) });
  }
  if (row.toValue === null) {
    return t("zones.range.openCeil", { value: pace(row.fromValue) });
  }
  return t("zones.range.between", {
    from: pace(row.toValue),
    to: pace(row.fromValue),
  });
}

function cadenceRangeLabel(t: TranslatorArg, row: CadenceRangeRow): string {
  if (row.to === null) return t("zones.range.openCeil", { value: `${row.from}` });
  return t("zones.range.between", { from: `${row.from}`, to: `${row.to}` });
}

/** The zone-distribution table: one bar row per zone, share-labeled. */
function ZoneRows({
  zones,
  tab,
  paceUnit,
}: {
  zones: ZoneTimeResult;
  tab: ZoneTab;
  paceUnit: PaceUnit;
}) {
  const { t } = useI18n();
  const nameKeys = zoneNameKeys(tab);
  return (
    <Table data-testid="zones-table">
      <TableHeader>
        <TableRow>
          <TableHead
            scope="col"
            className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
          >
            {t("zones.colZone")}
          </TableHead>
          <TableHead
            scope="col"
            className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
          >
            {t("zones.colRange")}
          </TableHead>
          <TableHead
            scope="col"
            className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
          >
            {t("zones.colTime")}
          </TableHead>
          <TableHead
            scope="col"
            className="h-auto pb-2 text-right text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
          >
            {t("zones.colShare")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {zones.rows.map((row) => {
          const shareLabel = `${Math.round(row.share * 100)}%`;
          return (
            <TableRow key={row.zone} data-testid={`zone-row-${row.zone}`}>
              <TableCell className="whitespace-nowrap text-[12px] font-semibold">
                Z{row.zone}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {nameKeys[row.zone - 1] !== undefined
                    ? t(nameKeys[row.zone - 1])
                    : ""}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-[12px] tabular-nums">
                {tab === "pace"
                  ? paceRangeLabel(t, row, paceUnit)
                  : unitRangeLabel(t, row, tab === "hr" ? "bpm" : "W")}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {row.timeMs > 0 && (
                  <div
                    data-testid={`zones-bar-${row.zone}`}
                    className="mb-0.5 h-[6px] rounded-[1px] bg-ink"
                    style={{
                      width: `${Math.max(2, row.share * 100)}%`,
                      opacity:
                        zones.zoneCount > 1
                          ? 0.3 + (0.7 * (row.zone - 1)) / (zones.zoneCount - 1)
                          : 1,
                    }}
                    aria-hidden="true"
                  />
                )}
                {formatDurationMs(row.timeMs)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                {shareLabel}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The per-split × per-zone breakdown (collapsible). */
function SplitZoneTable({ zones }: { zones: NonNullable<ZonesView["hr"]> }) {
  const { t } = useI18n();
  const perSplit = zones.perSplit;
  const [open, setOpen] = useState(false);
  const [rowsShown, setRowsShown] = useState(SPLIT_TABLE_PAGE);
  if (perSplit === null || perSplit.length === 0) return null;
  const visible = perSplit.slice(0, rowsShown);
  const zoneCount = zones.zones.zoneCount;

  return (
    <div className="mt-3" data-testid="zones-split-breakdown">
      <button
        type="button"
        data-testid="zones-split-toggle"
        data-print-hide-on-print
        aria-expanded={open}
        className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? t("zones.perSplit.hide") : t("zones.perSplit.show")}
      </button>
      {open && (
        <>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {t("zones.perSplit.note")}
          </p>
          <div className="mt-2 overflow-x-auto">
            <Table data-testid="zones-split-table">
              <TableHeader>
                <TableRow>
                  <TableHead
                    scope="col"
                    className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                  >
                    {t("splits.colSplit")}
                  </TableHead>
                  {Array.from({ length: zoneCount }, (_, i) => (
                    <TableHead
                      key={i}
                      scope="col"
                      className="h-auto pb-2 text-right text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                    >
                      Z{i + 1}
                    </TableHead>
                  ))}
                  <TableHead
                    scope="col"
                    className="h-auto pb-2 text-right text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                  >
                    {t("zones.perSplit.noData")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.splitIndex}>
                    <TableCell className="whitespace-nowrap font-mono text-[12px]">
                      {row.splitIndex}
                    </TableCell>
                    {row.zoneTimesMs.map((timeMs, i) => (
                      <TableCell
                        key={i}
                        className={cn(
                          "whitespace-nowrap text-right tabular-nums",
                          row.dominantZone === i + 1 && "font-semibold",
                        )}
                      >
                        {timeMs > 0 ? formatDurationMs(timeMs) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {row.noDataMs > 0 ? formatDurationMs(row.noDataMs) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {perSplit.length > visible.length && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={zoneCount + 2}
                      className="border-t-[1.5px] border-ink/25 pt-2"
                    >
                      <button
                        type="button"
                        data-testid="zones-split-show-more"
                        data-print-hide-on-print
                        className="rounded-[5px] border-[1.25px] border-ink/30 px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-signal hover:bg-signal/[0.08] focus-visible:outline-2"
                        onClick={() =>
                          setRowsShown((shown) => shown + SPLIT_TABLE_PAGE)
                        }
                      >
                        {t("splits.showMore", { count: SPLIT_TABLE_PAGE })}
                      </button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

export interface ZonesCardProps {
  zones: ZonesView;
  paceUnit: PaceUnit;
  fitness: FitnessSettings;
  onFitnessChange: (patch: Partial<FitnessSettings>) => void;
  onResetFitness: () => void;
}

export function ZonesCard({
  zones,
  paceUnit,
  fitness,
  onFitnessChange,
  onResetFitness,
}: ZonesCardProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ZoneTab>(() =>
    zones.hr?.zones.hasMetricData
      ? "hr"
      : zones.power?.zones.hasMetricData
        ? "power"
        : "cadence",
  );

  const tabButton = (id: ZoneTab, labelKey: string) => (
    <button
      key={id}
      type="button"
      data-testid={`zones-tab-${id}`}
      aria-pressed={tab === id}
      className={cn(
        "rounded-[5px] border-[1.25px] px-2.5 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-2",
        tab === id
          ? "border-ink bg-ink/[0.06] text-ink"
          : "border-ink/25 text-muted-foreground hover:border-ink/50 hover:text-foreground",
      )}
      onClick={() => setTab(id)}
    >
      {t(labelKey)}
    </button>
  );

  const metricWord =
    tab === "hr"
      ? t("zones.metric.hr")
      : tab === "power"
        ? t("zones.metric.power")
        : t("zones.metric.cadence");

  const activeAnalysis =
    tab === "hr" ? zones.hr : tab === "power" ? zones.power : null;
  const activeZones = activeAnalysis?.zones ?? null;

  // The pace tab's zone table needs the race result; GAP shows anyway.
  const paceUsable = zones.pace?.boundaries !== null && zones.pace !== null;

  return (
    <Card data-testid="zones-card" className="border-[1.5px] border-ink">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
            <span
              className="size-2 shrink-0 rounded-[1px] bg-signal"
              aria-hidden="true"
            />
            {t("zones.title")}
          </h3>
          <div data-print-hide-on-print>
            <ZoneSettings
              fitness={fitness}
              onFitnessChange={onFitnessChange}
              onReset={onResetFitness}
            />
          </div>
        </div>
        <CardDescription>{t("zones.desc")}</CardDescription>
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          data-print-hide-on-print
          role="group"
          aria-label={t("zones.title")}
        >
          {tabButton("hr", "zones.tab.hr")}
          {tabButton("power", "zones.tab.power")}
          {tabButton("pace", "zones.tab.pace")}
          {tabButton("cadence", "zones.tab.cadence")}
        </div>
      </CardHeader>
      <CardContent>
        {/* --- the zone tabs ------------------------------------------------ */}
        {tab === "cadence" ? (
          zones.cadence === null ? null : !zones.cadence.hasTimingData ? (
            <p
              data-testid="zones-reason"
              className="text-[12.5px] leading-relaxed text-muted-foreground"
            >
              {t("zones.needTiming")}
            </p>
          ) : !zones.cadence.hasCadenceData ? (
            <p
              data-testid="zones-reason"
              className="text-[12.5px] leading-relaxed text-muted-foreground"
            >
              {t("zones.cadence.noData")}
            </p>
          ) : (
            <>
              <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
                {t("zones.cadence.desc")}
              </p>
              <div className="overflow-x-auto">
                <Table data-testid="zones-cadence-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        {t("zones.colRange")}
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        {t("zones.colTime")}
                      </TableHead>
                      <TableHead
                        scope="col"
                        className="h-auto pb-2 text-right text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25"
                      >
                        {t("zones.colShare")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zones.cadence.rows.map((row) => (
                      <TableRow key={row.from}>
                        <TableCell className="whitespace-nowrap font-mono text-[12px]">
                          {cadenceRangeLabel(t, row)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          <div
                            data-testid="cadence-bar"
                            className="mb-0.5 h-[6px] rounded-[1px] bg-ink"
                            style={{ width: `${Math.max(2, row.share * 100)}%` }}
                            aria-hidden="true"
                          />
                          {formatDurationMs(row.timeMs)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {Math.round(row.share * 100)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {zones.cadence.noDataMs > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("zones.noDataNote", {
                    time: formatDurationMs(zones.cadence.noDataMs),
                    metric: t("zones.metric.cadence"),
                  })}
                </p>
              )}
            </>
          )
        ) : tab === "pace" ? (
          <>
            {/* GAP first — it needs no settings. */}
            <div className="mb-3" data-testid="zones-gap">
              <p className="text-[12.5px] font-bold">{t("zones.gap.title")}</p>
              {zones.gap === null ||
              zones.gap.gapPaceMsPerMeter === null ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {zones.gap !== null && !zones.gap.hasTimingData
                    ? t("zones.needTiming")
                    : t("zones.gap.noElevation")}
                </p>
              ) : (
                <>
                  <p className="mt-1 font-mono text-[13px] tabular-nums">
                    {t("zones.gap.value", {
                      gap: `${formatPaceMs(
                        zones.gap.gapPaceMsPerMeter *
                          PACE_METERS_PER_UNIT[paceUnit],
                      )} /${paceUnit}`,
                      actual: `${formatPaceMs(
                        (zones.gap.actualPaceMsPerMeter ?? 0) *
                          PACE_METERS_PER_UNIT[paceUnit],
                      )} /${paceUnit}`,
                    })}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t("zones.gap.note")}
                  </p>
                </>
              )}
            </div>
            {/* The pace zones themselves (race-gated). */}
            {zones.pace === null ? null : !paceUsable ? (
              <p
                data-testid="zones-reason"
                className="text-[12.5px] leading-relaxed text-muted-foreground"
              >
                {t("zones.pace.raceUnset")}
              </p>
            ) : !zones.pace.zones.hasTimingData ? (
              <p
                data-testid="zones-reason"
                className="text-[12.5px] leading-relaxed text-muted-foreground"
              >
                {t("zones.needTiming")}
              </p>
            ) : (
              <>
                <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
                  {t("zones.pace.gapNote")}
                </p>
                <div className="overflow-x-auto">
                  <ZoneRows zones={zones.pace.zones} tab="pace" paceUnit={paceUnit} />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("zones.reconcile", {
                    time: formatDurationMs(zones.pace.zones.movingMs),
                  })}
                </p>
                {zones.pace.zones.noDataMs > 0 && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t("zones.noDataNote", {
                      time: formatDurationMs(zones.pace.zones.noDataMs),
                      metric: t("zones.metric.pace"),
                    })}
                  </p>
                )}
                <SplitZoneTable zones={zones.pace} />
              </>
            )}
          </>
        ) : activeZones === null ? null : !activeZones.hasTimingData ? (
          <p
            data-testid="zones-reason"
            className="text-[12.5px] leading-relaxed text-muted-foreground"
          >
            {t("zones.needTiming")}
          </p>
        ) : !activeZones.hasMetricData ? (
          <p
            data-testid="zones-reason"
            className="text-[12.5px] leading-relaxed text-muted-foreground"
          >
            {t(
              tab === "hr" ? "zones.noMetrics.hr" : "zones.noMetrics.power",
            )}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <ZoneRows zones={activeZones} tab={tab} paceUnit={paceUnit} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {t("zones.reconcile", {
                time: formatDurationMs(activeZones.movingMs),
              })}
            </p>
            {activeZones.noDataMs > 0 && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {t("zones.noDataNote", {
                  time: formatDurationMs(activeZones.noDataMs),
                  metric: metricWord,
                })}
              </p>
            )}
            <SplitZoneTable zones={activeAnalysis!} />
          </>
        )}

        {/* --- the opt-in calorie estimate --------------------------------- */}
        {zones.calories !== null && (
          <div className="mt-4 border-t border-ink/15 pt-3" data-testid="zones-calories">
            <p className="text-[12.5px] font-bold">
              {t("zones.calories.title")}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed">
              {zones.calories.kind === "power"
                ? t("zones.calories.power", {
                    kcal: Math.round(zones.calories.kcal),
                    watts: Math.round(zones.calories.averageWatts ?? 0),
                    time: formatDurationMs(
                      (zones.calories.powerSeconds ?? 0) * 1000,
                    ),
                  })
                : t("zones.calories.metabolic", {
                    kcal: Math.round(zones.calories.kcal),
                    weight: zones.calories.weightKg ?? 0,
                    distance: formatDistanceForUnit(
                      zones.calories.distanceM ?? 0,
                      paceUnit,
                    ),
                  })}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {t("zones.calories.note")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

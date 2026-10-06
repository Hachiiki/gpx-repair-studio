/**
 * LibraryTrends (Phase 24.3) — the trends tab: weekly/monthly volume
 * bars and the fitness-fatigue line (Banister as Coggan applied it),
 * each with the elevation/metrics charts' full discipline (§EE 15.2 +
 * §C-5): a dependency-free focusable SVG, ArrowLeft/Right/Home/End/
 * Escape cursor keys, pointer-nearest-bucket, a polite live region,
 * and a textual table twin of the SAME series.
 *
 * Honesty is structural here: the fitness line renders ONLY when both
 * minimum counts are met (a 21-day span and 8 sessions) — below that
 * the tab shows the counts and the reason, never a confident curve
 * over three rides. Undated sessions are counted out, not bucketed at
 * their save time. Volume charts cap at the most recent 24 buckets,
 * disclosed in place.
 *
 * Pure presentation: series in, nothing out.
 */

"use client";

import { useId, useMemo, useState } from "react";
import { CalendarRange, LineChart } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import type {
  FitnessFatigueResult,
  VolumeRow,
} from "@/hooks/use-library";
import {
  formatDistanceForUnit,
  formatDurationCompactMs,
  type PaceUnit,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** Plot area inside the 600×160 viewBox (the profile charts', with
 * room for the longer axis labels these charts draw — "39.34 km"). */
const WIDTH = 600;
const HEIGHT = 160;
const PAD_LEFT = 62;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/** The chart window: the most recent buckets (twin table shows these). */
const MAX_BUCKETS = 24;

type Granularity = "week" | "month";
type VolumeMetric = "distance" | "time";

export interface LibraryTrendsProps {
  volumeWeek: readonly VolumeRow[];
  volumeMonth: readonly VolumeRow[];
  fitness: FitnessFatigueResult | null;
  paceUnit: PaceUnit;
}

export function LibraryTrends({
  volumeWeek,
  volumeMonth,
  fitness,
  paceUnit,
}: LibraryTrendsProps) {
  const { t, locale } = useI18n();
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [metric, setMetric] = useState<VolumeMetric>("distance");

  const buckets = useMemo(
    () =>
      (granularity === "week" ? volumeWeek : volumeMonth).slice(
        -MAX_BUCKETS,
      ),
    [granularity, volumeWeek, volumeMonth],
  );
  const periodWord =
    granularity === "week"
      ? t("trends.granularity.week")
      : t("trends.granularity.month");

  const hasDated = volumeWeek.length + volumeMonth.length > 0;

  return (
    <section
      data-testid="trends-card"
      aria-label={t("trends.title")}
      className="grid gap-4"
    >
      <div>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <CalendarRange className="size-4 text-signal" aria-hidden="true" />
          {t("trends.title")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {t("trends.desc")}
        </p>
      </div>

      {!hasDated ? (
        <p
          data-testid="trends-empty"
          className="text-[12.5px] leading-relaxed text-muted-foreground"
        >
          {t("trends.empty")}
        </p>
      ) : (
        <>
          <VolumeChart
            buckets={buckets}
            totalCount={
              granularity === "week" ? volumeWeek.length : volumeMonth.length
            }
            metric={metric}
            granularity={granularity}
            periodWord={periodWord}
            paceUnit={paceUnit}
            onGranularity={setGranularity}
            onMetric={setMetric}
            localeTag={locale}
            t={t}
          />
          <FitnessCard fitness={fitness} t={t} localeTag={locale} />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The volume bar chart
// ---------------------------------------------------------------------------

function shortDate(ms: number, localeTag: string, month: boolean): string {
  return new Date(ms).toLocaleDateString(localeTag, {
    month: "short",
    ...(month ? { year: "numeric" } : { day: "numeric" }),
  });
}

interface VolumeChartProps {
  buckets: readonly VolumeRow[];
  /** The FULL bucket count (before the window slice). */
  totalCount: number;
  metric: VolumeMetric;
  granularity: Granularity;
  periodWord: string;
  paceUnit: PaceUnit;
  onGranularity: (g: Granularity) => void;
  onMetric: (m: VolumeMetric) => void;
  localeTag: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function VolumeChart({
  buckets,
  totalCount,
  metric,
  granularity,
  periodWord,
  paceUnit,
  onGranularity,
  onMetric,
  localeTag,
  t,
}: VolumeChartProps) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const liveId = useId();

  const values = buckets.map((b) =>
    metric === "distance" ? b.distanceM : b.movingTimeMs,
  );
  const maxValue = values.length > 0 ? Math.max(...values, 0) : 0;
  const span = maxValue > 0 ? maxValue : 1;
  const n = buckets.length;
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const barSlot = n > 0 ? plotWidth / n : plotWidth;
  const barWidth = Math.max(2, barSlot * 0.66);

  const yOf = (value: number): number =>
    HEIGHT - PAD_BOTTOM - ((HEIGHT - PAD_TOP - PAD_BOTTOM) * value) / span;
  const xOf = (index: number): number =>
    PAD_LEFT + barSlot * index + barSlot / 2;

  const formatValue = (value: number): string =>
    metric === "distance"
      ? formatDistanceForUnit(value, paceUnit)
      : formatDurationCompactMs(value);

  const readoutText =
    cursor === null || buckets[cursor] === undefined
      ? null
      : t("trends.readout.volume", {
          label: shortDate(
            buckets[cursor].startMs,
            localeTag,
            granularity === "month",
          ),
          distance: formatDistanceForUnit(
            buckets[cursor].distanceM,
            paceUnit,
          ),
          time: formatDurationCompactMs(buckets[cursor].movingTimeMs),
          activities: buckets[cursor].activities,
        });

  const indexForClientX = (
    clientX: number,
    target: SVGSVGElement,
  ): number => {
    if (n === 0) return 0;
    const rect = target.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const svgX = fraction * WIDTH;
    const slot = Math.floor((svgX - PAD_LEFT) / barSlot);
    return Math.max(0, Math.min(n - 1, slot));
  };

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const current =
        cursor ?? (event.key === "ArrowLeft" ? n - 1 : -1);
      setCursor(
        Math.max(0, Math.min(n - 1, current + (event.key === "ArrowRight" ? 1 : -1))),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(n - 1);
    } else if (event.key === "Escape") {
      setCursor(null);
    }
  };

  const chip = (
    active: boolean,
    testid: string,
    label: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={active}
      className={cn(
        "rounded-[5px] border-[1.25px] px-2.5 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-2",
        active
          ? "border-ink bg-ink/[0.06] text-ink"
          : "border-ink/25 text-muted-foreground hover:border-ink/50 hover:text-foreground",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div data-testid="trends-volume" className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold">{t("trends.volume.title")}</h4>
        <div className="flex flex-wrap gap-1.5" role="group">
          {chip(
            granularity === "week",
            "trends-granularity-week",
            t("trends.granularity.week"),
            () => {
              onGranularity("week");
              setCursor(null);
            },
          )}
          {chip(
            granularity === "month",
            "trends-granularity-month",
            t("trends.granularity.month"),
            () => {
              onGranularity("month");
              setCursor(null);
            },
          )}
          {chip(
            metric === "distance",
            "trends-metric-distance",
            t("trends.metric.distance"),
            () => {
              onMetric("distance");
              setCursor(null);
            },
          )}
          {chip(
            metric === "time",
            "trends-metric-time",
            t("trends.metric.time"),
            () => {
              onMetric("time");
              setCursor(null);
            },
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t(totalCount === 1 ? "trends.volume.windowOne" : "trends.volume.window", {
          ...(totalCount === 1 ? {} : { count: totalCount }),
          period: t(
            granularity === "week"
              ? totalCount === 1
                ? "trends.noun.week"
                : "trends.noun.weeks"
              : totalCount === 1
                ? "trends.noun.month"
                : "trends.noun.months",
          ),
          max: MAX_BUCKETS,
        })}
      </p>
      <p
        data-testid="trends-volume-readout"
        aria-live="polite"
        aria-atomic="true"
        id={liveId}
        className={cn(
          "min-h-[18px] font-mono text-[12px] tabular-nums",
          readoutText === null ? "text-muted-foreground" : "text-ink",
        )}
      >
        {readoutText ?? t("profile.readoutHint")}
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-40 w-full cursor-crosshair focus-visible:outline-2 focus-visible:outline-ring"
        role="img"
        tabIndex={0}
        data-testid="trends-volume-svg"
        aria-label={t("trends.aria.volume", {
          count: n,
          min: formatValue(0),
          max: formatValue(maxValue),
        }) + (readoutText !== null
          ? t("trends.aria.cursor", { readout: readoutText })
          : "")}
        onKeyDown={onKeyDown}
        onPointerMove={(event) =>
          setCursor(indexForClientX(event.clientX, event.currentTarget))
        }
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
      >
        {[0, span / 2, span].map((value, index) => {
          const y =
            HEIGHT -
            PAD_BOTTOM -
            ((HEIGHT - PAD_TOP - PAD_BOTTOM) * index) / 2;
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
                {formatValue(value)}
              </text>
            </g>
          );
        })}
        {buckets.map((bucket, index) => {
          const value =
            metric === "distance" ? bucket.distanceM : bucket.movingTimeMs;
          const y = yOf(value);
          return (
            <rect
              key={bucket.startMs}
              x={xOf(index) - barWidth / 2}
              y={y}
              width={barWidth}
              height={Math.max(0, HEIGHT - PAD_BOTTOM - y)}
              data-testid="trends-volume-bar"
              className={
                cursor === index
                  ? "fill-signal"
                  : "fill-foreground/[0.55]"
              }
              rx={1}
            />
          );
        })}
        {cursor !== null && buckets[cursor] !== undefined && (
          <line
            x1={xOf(cursor)}
            x2={xOf(cursor)}
            y1={PAD_TOP}
            y2={HEIGHT - PAD_BOTTOM}
            className="stroke-ink/60"
            strokeWidth={1}
            strokeDasharray="2 2"
            data-testid="trends-volume-cursor"
          />
        )}
        {n > 0 && (
          <>
            <text
              x={PAD_LEFT}
              y={HEIGHT - 6}
              textAnchor="start"
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {shortDate(buckets[0]!.startMs, localeTag, granularity === "month")}
            </text>
            <text
              x={WIDTH - PAD_RIGHT}
              y={HEIGHT - 6}
              textAnchor="end"
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {shortDate(
                buckets[n - 1]!.startMs,
                localeTag,
                granularity === "month",
              )}
            </text>
          </>
        )}
      </svg>

      {/* §C-5 — the textual twin of the SAME series. */}
      <div>
        <button
          type="button"
          data-testid="trends-volume-table-toggle"
          aria-expanded={tableOpen}
          className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
          onClick={() => setTableOpen((open) => !open)}
        >
          {tableOpen ? t("trends.table.hide") : t("trends.table.show")}
        </button>
        {tableOpen && (
          <>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {t("trends.table.note", { count: n, period: periodWord })}
            </p>
            <div className="mt-2 overflow-x-auto">
              <Table data-testid="trends-volume-table">
                <TableHeader>
                  <TableRow>
                    {[
                      "trends.col.period",
                      "trends.col.distance",
                      "trends.col.time",
                      "trends.col.activities",
                    ].map((key, i) => (
                      <TableHead
                        key={key}
                        scope="col"
                        className={cn(
                          "h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25",
                          i > 0 ? "text-right" : "",
                        )}
                      >
                        {t(key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buckets.map((bucket) => (
                    <TableRow key={bucket.startMs}>
                      <TableCell className="whitespace-nowrap text-[12px]">
                        {shortDate(
                          bucket.startMs,
                          localeTag,
                          granularity === "month",
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatDistanceForUnit(bucket.distanceM, paceUnit)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatDurationCompactMs(bucket.movingTimeMs)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {bucket.activities}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The fitness-fatigue line (gated by the honest minimum counts)
// ---------------------------------------------------------------------------

function FitnessCard({
  fitness,
  t,
  localeTag,
}: {
  fitness: FitnessFatigueResult | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  localeTag: string;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const liveId = useId();

  if (fitness === null || fitness.points.length === 0) {
    return (
      <div data-testid="trends-fitness" className="grid gap-1.5">
        <h4 className="flex items-center gap-1.5 text-[13px] font-bold">
          <LineChart className="size-3.5 text-signal" aria-hidden="true" />
          {t("trends.fitness.title")}
        </h4>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("trends.empty")}
        </p>
      </div>
    );
  }

  const gated = !fitness.minCountMet;

  // The display series: uniformly decimated when the span is long.
  const points = fitness.points;
  const stride = Math.max(1, Math.ceil(points.length / 600));
  const display =
    stride === 1
      ? points
      : points.filter((_, i) => i % stride === 0 || i === points.length - 1);

  const maxValue = Math.max(
    ...display.map((p) => Math.max(p.ctl, p.atl)),
    0.001,
  );
  const minValue = Math.min(...display.map((p) => p.form), 0);
  const span = maxValue - minValue > 0 ? maxValue - minValue : 1;
  const n = display.length;
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const xOf = (index: number): number =>
    PAD_LEFT + (n > 1 ? (plotWidth * index) / (n - 1) : 0);
  const yOf = (seconds: number): number =>
    HEIGHT -
    PAD_BOTTOM -
    ((HEIGHT - PAD_TOP - PAD_BOTTOM) * (seconds - minValue)) / span;

  const hours = (seconds: number): string =>
    formatDurationCompactMs(seconds * 1000);

  const readoutText =
    cursor === null || display[cursor] === undefined
      ? null
      : t("trends.readout.fitness", {
          date: new Date(display[cursor].dayMs).toLocaleDateString(
            localeTag,
            { month: "short", day: "numeric", year: "numeric" },
          ),
          ctl: hours(display[cursor].ctl),
          atl: hours(display[cursor].atl),
          form: hours(display[cursor].form),
        });

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const current = cursor ?? (event.key === "ArrowLeft" ? n - 1 : -1);
      setCursor(
        Math.max(0, Math.min(n - 1, current + (event.key === "ArrowRight" ? 1 : -1))),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(n - 1);
    } else if (event.key === "Escape") {
      setCursor(null);
    }
  };

  const indexForClientX = (
    clientX: number,
    target: SVGSVGElement,
  ): number => {
    if (n === 0) return 0;
    const rect = target.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.max(
      0,
      Math.min(n - 1, Math.round(fraction * (n - 1))),
    );
  };

  const linePath = (key: "ctl" | "atl" | "form"): string =>
    display
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${xOf(index).toFixed(1)},${yOf(point[key]).toFixed(1)}`,
      )
      .join(" ");

  // The twin samples the SAME display series down to ≤ 24 days.
  const twinStride = Math.max(1, Math.ceil(n / 24));
  const twin =
    twinStride === 1
      ? display
      : display.filter((_, i) => i % twinStride === 0 || i === n - 1);

  return (
    <div data-testid="trends-fitness" className="grid gap-2">
      <div>
        <h4 className="flex items-center gap-1.5 text-[13px] font-bold">
          <LineChart className="size-3.5 text-signal" aria-hidden="true" />
          {t("trends.fitness.title")}
        </h4>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          {t("trends.fitness.desc")}
        </p>
      </div>

      {gated ? (
        <p
          data-testid="trends-fitness-gated"
          className="rounded-[8px] border-[1.25px] border-ink/15 bg-ink/[0.02] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground"
        >
          {t("trends.fitness.gated", {
            days: 21,
            sessions: 8,
            spanDays: fitness.spanDays,
            sessionCount: fitness.sessionCount,
          })}
        </p>
      ) : (
        <>
          <p
            data-testid="trends-fitness-readout"
            aria-live="polite"
            aria-atomic="true"
            id={liveId}
            className={cn(
              "min-h-[18px] font-mono text-[12px] tabular-nums",
              readoutText === null ? "text-muted-foreground" : "text-ink",
            )}
          >
            {readoutText ?? t("profile.readoutHint")}
          </p>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-40 w-full cursor-crosshair focus-visible:outline-2 focus-visible:outline-ring"
            role="img"
            tabIndex={0}
            data-testid="trends-fitness-svg"
            aria-label={t("trends.aria.fitness", {
              days: fitness.spanDays,
              max: hours(maxValue),
            }) + (readoutText !== null
              ? t("trends.aria.cursor", { readout: readoutText })
              : "")}
            onKeyDown={onKeyDown}
            onPointerMove={(event) =>
              setCursor(indexForClientX(event.clientX, event.currentTarget))
            }
            onPointerLeave={() => setCursor(null)}
            onBlur={() => setCursor(null)}
          >
            {[minValue, (minValue + maxValue) / 2, maxValue].map(
              (value, index) => {
                const y =
                  HEIGHT -
                  PAD_BOTTOM -
                  ((HEIGHT - PAD_TOP - PAD_BOTTOM) * index) / 2;
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
                      {hours(value)}
                    </text>
                  </g>
                );
              },
            )}
            {/* Zero axis for form (may sit inside the plot). */}
            {minValue < 0 && maxValue > 0 && (
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={yOf(0)}
                y2={yOf(0)}
                className="stroke-foreground/25"
                strokeWidth={1}
              />
            )}
            <path
              d={linePath("atl")}
              data-testid="trends-fitness-atl"
              className="stroke-signal"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              fill="none"
            />
            <path
              d={linePath("form")}
              data-testid="trends-fitness-form"
              className="stroke-foreground/45"
              strokeWidth={1.25}
              strokeDasharray="2 3"
              fill="none"
            />
            <path
              d={linePath("ctl")}
              data-testid="trends-fitness-ctl"
              className="stroke-ink"
              strokeWidth={1.75}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {cursor !== null && display[cursor] !== undefined && (
              <g data-testid="trends-fitness-cursor" aria-hidden="true">
                <line
                  x1={xOf(cursor)}
                  x2={xOf(cursor)}
                  y1={PAD_TOP}
                  y2={HEIGHT - PAD_BOTTOM}
                  className="stroke-ink/60"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <circle
                  cx={xOf(cursor)}
                  cy={yOf(display[cursor].ctl)}
                  r={3}
                  className="fill-signal stroke-paper"
                  strokeWidth={1.5}
                />
              </g>
            )}
          </svg>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" className="stroke-ink" strokeWidth="2" />
              </svg>
              {t("trends.fitness.legend.fitness")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" className="stroke-signal" strokeWidth="2" strokeDasharray="5 3" />
              </svg>
              {t("trends.fitness.legend.fatigue")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" className="stroke-foreground/45" strokeWidth="2" strokeDasharray="2 3" />
              </svg>
              {t("trends.fitness.legend.form")}
            </span>
          </div>
          <div>
            <button
              type="button"
              data-testid="trends-fitness-table-toggle"
              aria-expanded={tableOpen}
              className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
              onClick={() => setTableOpen((open) => !open)}
            >
              {tableOpen ? t("trends.table.hide") : t("trends.table.show")}
            </button>
            {tableOpen && (
              <div className="mt-2 overflow-x-auto">
                <Table data-testid="trends-fitness-table">
                  <TableHeader>
                    <TableRow>
                      {[
                        "trends.col.day",
                        "trends.col.ctl",
                        "trends.col.atl",
                        "trends.col.form",
                      ].map((key, i) => (
                        <TableHead
                          key={key}
                          scope="col"
                          className={cn(
                            "h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25",
                            i > 0 ? "text-right" : "",
                          )}
                        >
                          {t(key)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {twin.map((point) => (
                      <TableRow key={point.dayMs}>
                        <TableCell className="whitespace-nowrap text-[12px]">
                          {new Date(point.dayMs).toLocaleDateString(
                            localeTag,
                            { month: "short", day: "numeric" },
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {hours(point.ctl)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {hours(point.atl)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {hours(point.form)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("trends.fitness.empty")}
        {fitness.untimedCount > 0
          ? ` ${t("trends.fitness.untimed", { count: fitness.untimedCount })}`
          : ""}
        {` ${t("trends.fitness.notAdvice")}`}
      </p>
    </div>
  );
}

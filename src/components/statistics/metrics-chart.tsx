/**
 * MetricsChart — the Phase 23.3 dashboard (docs/plans/v3/
 * phase-23-fitness-zones-metrics.md): heart rate, cadence, and power
 * over distance, each drawn over a faint elevation backdrop — Strava's
 * own documented chart pattern for all three metrics.
 *
 * The elevation profile's full discipline, applied verbatim (§EE 15.2
 * + §C-5): the dependency-free SVG is focusable, ArrowLeft/Right step
 * the sample, Home/End jump, Escape clears, pointer-move picks the
 * nearest sample by binary search, and a polite live region speaks
 * every move. Holes break the line (a point without the metric is
 * missing data, not zero). The display series arrives already
 * decimated and lightly smoothed from the pure builder — the smoothing
 * window ships with it and the copy discloses it. The textual table
 * twin buckets the SAME display series into at most 24 intervals.
 *
 * Pure presentation: profile in, nothing out.
 */

"use client";

import { useId, useMemo, useState } from "react";
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
import { useI18n } from "@/hooks/use-i18n";
import type { MetricsProfile } from "@/hooks/use-zones";
import { formatElevationMeters } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** Plot area inside the 600×160 viewBox (the elevation chart's). */
const WIDTH = 600;
const HEIGHT = 160;
const PAD_LEFT = 44;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/** The textual twin's row ceiling (§C-5 — the elevation chart's rule). */
const METRICS_TABLE_MAX_INTERVALS = 24;
const METRICS_TABLE_MIN_INTERVAL_M = 250;

type MetricTab = "hr" | "cad" | "power";

interface MetricAxis {
  tab: MetricTab;
  seriesKey: "hr" | "cad" | "watts";
  unit: string;
  min: number;
  max: number;
  available: boolean;
}

function axesOf(profile: MetricsProfile): Record<MetricTab, MetricAxis> {
  return {
    hr: {
      tab: "hr",
      seriesKey: "hr",
      unit: "bpm",
      min: profile.minHr,
      max: profile.maxHr,
      available: profile.hasHr,
    },
    cad: {
      tab: "cad",
      seriesKey: "cad",
      unit: "rpm",
      min: profile.minCad,
      max: profile.maxCad,
      available: profile.hasCad,
    },
    power: {
      tab: "power",
      seriesKey: "watts",
      unit: "W",
      min: profile.minWatts,
      max: profile.maxWatts,
      available: profile.hasPower,
    },
  };
}

/** Format a route distance the chart's axis does (m below 1 km). */
function axisDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

/** One contiguous drawable stretch of the metric series (holes break). */
interface Segment {
  points: { x: number; y: number }[];
}

function buildSegments(
  profile: MetricsProfile,
  axis: MetricAxis,
): { metric: Segment[]; elevation: Segment[] } {
  const span = profile.totalDistanceM > 0 ? profile.totalDistanceM : 1;
  const xScale = (xM: number): number =>
    PAD_LEFT + ((WIDTH - PAD_LEFT - PAD_RIGHT) * xM) / span;

  const metricSpan = axis.max - axis.min;
  const yScale = (value: number): number => {
    const padded = metricSpan > 0 ? metricSpan : 1;
    return (
      HEIGHT -
      PAD_BOTTOM -
      ((HEIGHT - PAD_TOP - PAD_BOTTOM) * (value - axis.min)) / padded
    );
  };

  const eleSpan = profile.maxEleM - profile.minEleM;
  const yEle = (ele: number): number => {
    const padded = eleSpan > 0 ? eleSpan : 1;
    return (
      HEIGHT -
      PAD_BOTTOM -
      ((HEIGHT - PAD_TOP - PAD_BOTTOM) * (ele - profile.minEleM)) / padded
    );
  };

  const metric: Segment[] = [];
  const elevation: Segment[] = [];
  let currentMetric: Segment | null = null;
  let currentEle: Segment | null = null;
  for (const point of profile.points) {
    const value = point[axis.seriesKey];
    if (value === undefined) {
      currentMetric = null;
    } else {
      if (!currentMetric) {
        currentMetric = { points: [] };
        metric.push(currentMetric);
      }
      currentMetric.points.push({ x: xScale(point.xM), y: yScale(value) });
    }
    if (point.ele === undefined) {
      currentEle = null;
    } else {
      if (!currentEle) {
        currentEle = { points: [] };
        elevation.push(currentEle);
      }
      currentEle.points.push({ x: xScale(point.xM), y: yEle(point.ele) });
    }
  }
  return {
    metric: metric.filter((s) => s.points.length > 1),
    elevation: elevation.filter((s) => s.points.length > 1),
  };
}

function segmentPath(segment: Segment): string {
  return segment.points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");
}

/** One row of the textual twin: a distance interval's metric stats. */
interface MetricInterval {
  fromM: number;
  toM: number;
  min?: number;
  max?: number;
  avg?: number;
  /** Elevation of the backdrop series over the same interval. */
  eleAvg?: number;
}

function buildIntervals(
  profile: MetricsProfile,
  axis: MetricAxis,
): MetricInterval[] {
  const points = profile.points;
  if (points.length === 0) return [];
  const last = points[points.length - 1].xM;
  const bucketCount = Math.max(
    1,
    Math.min(
      METRICS_TABLE_MAX_INTERVALS,
      Math.ceil(last / METRICS_TABLE_MIN_INTERVAL_M),
    ),
  );
  const step = last > 0 ? last / bucketCount : 0;
  if (step <= 0) return [];

  const intervals: MetricInterval[] = [];
  let current: {
    fromM: number;
    toM: number;
    min?: number;
    max?: number;
    sum: number;
    count: number;
    eleSum: number;
    eleCount: number;
  } | null = null;

  const flush = () => {
    if (current === null) return;
    intervals.push({
      fromM: current.fromM,
      toM: current.toM,
      ...(current.min !== undefined ? { min: current.min } : {}),
      ...(current.max !== undefined ? { max: current.max } : {}),
      ...(current.count > 0
        ? { avg: current.sum / current.count }
        : {}),
      ...(current.eleCount > 0
        ? { eleAvg: current.eleSum / current.eleCount }
        : {}),
    });
    current = null;
  };

  for (const point of points) {
    const bucket = Math.min(Math.floor(point.xM / step), bucketCount - 1);
    const fromM = bucket * step;
    if (current === null || Math.abs(current.fromM - fromM) > 1e-9) {
      flush();
      current = {
        fromM,
        toM: fromM + step,
        min: undefined,
        max: undefined,
        sum: 0,
        count: 0,
        eleSum: 0,
        eleCount: 0,
      };
    }
    const value = point[axis.seriesKey];
    if (value !== undefined) {
      if (current.min === undefined || value < current.min) current.min = value;
      if (current.max === undefined || value > current.max) current.max = value;
      current.sum += value;
      current.count += 1;
    }
    if (point.ele !== undefined) {
      current.eleSum += point.ele;
      current.eleCount += 1;
    }
  }
  flush();
  if (intervals.length > 0) {
    intervals[intervals.length - 1].toM = last;
  }
  return intervals;
}

export function MetricsChart({ profile }: { profile: MetricsProfile }) {
  const { t } = useI18n();
  const axes = useMemo(() => axesOf(profile), [profile]);
  const [tab, setTab] = useState<MetricTab>(() =>
    axes.hr.available ? "hr" : axes.cad.available ? "cad" : "power",
  );
  const [cursor, setCursor] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const liveId = useId();

  const axis = axes[tab];
  const segments = useMemo(
    () => buildSegments(profile, axis),
    [profile, axis],
  );
  const intervals = useMemo(
    () => (tableOpen ? buildIntervals(profile, axis) : []),
    [tableOpen, profile, axis],
  );

  if (!axis.available) return null;

  const metricName =
    tab === "hr"
      ? t("metrics.series.hr")
      : tab === "cad"
        ? t("metrics.series.cad")
        : t("metrics.series.power");

  const span = profile.totalDistanceM > 0 ? profile.totalDistanceM : 1;
  const xOfIndex = (index: number): number => {
    const xM = profile.points[index]?.xM ?? 0;
    return PAD_LEFT + ((WIDTH - PAD_LEFT - PAD_RIGHT) * xM) / span;
  };

  const indexForClientX = (clientX: number, target: SVGSVGElement): number => {
    const rect = target.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const svgX = fraction * WIDTH;
    const xM = ((svgX - PAD_LEFT) / (WIDTH - PAD_LEFT - PAD_RIGHT)) * span;
    let lo = 0;
    let hi = profile.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (profile.points[mid].xM < xM) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) {
      const before = Math.abs(profile.points[lo - 1].xM - xM);
      const at = Math.abs(profile.points[lo].xM - xM);
      if (before < at) lo -= 1;
    }
    return Math.max(0, Math.min(profile.points.length - 1, lo));
  };

  const cursorPoint = cursor !== null ? profile.points[cursor] : null;
  const metricSpan = axis.max - axis.min;
  const yOfValue = (value: number): number => {
    const padded = metricSpan > 0 ? metricSpan : 1;
    return (
      HEIGHT -
      PAD_BOTTOM -
      ((HEIGHT - PAD_TOP - PAD_BOTTOM) * (value - axis.min)) / padded
    );
  };

  const readoutText =
    cursorPoint === null
      ? null
      : cursorPoint[axis.seriesKey] === undefined
        ? t("metrics.readout.noValue", {
            distance: axisDistance(cursorPoint.xM),
            metric: metricName,
          })
        : cursorPoint.ele === undefined
          ? t("metrics.readout.noEle", {
              distance: axisDistance(cursorPoint.xM),
              value: Math.round(cursorPoint[axis.seriesKey] as number),
              unit: axis.unit,
            })
          : t("metrics.readout.at", {
              distance: axisDistance(cursorPoint.xM),
              value: Math.round(cursorPoint[axis.seriesKey] as number),
              unit: axis.unit,
              ele: formatElevationMeters(cursorPoint.ele),
            });

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (profile.points.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const current =
        cursor ?? (event.key === "ArrowLeft" ? profile.points.length - 1 : -1);
      const next = Math.max(
        0,
        Math.min(
          profile.points.length - 1,
          current + (event.key === "ArrowRight" ? 1 : -1),
        ),
      );
      setCursor(next);
    } else if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(profile.points.length - 1);
    } else if (event.key === "Escape") {
      setCursor(null);
    }
  };

  const tabButton = (id: MetricTab, labelKey: string) => (
    <button
      key={id}
      type="button"
      data-testid={`metrics-tab-${id}`}
      aria-pressed={tab === id}
      className={cn(
        "rounded-[5px] border-[1.25px] px-2.5 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-2",
        tab === id
          ? "border-ink bg-ink/[0.06] text-ink"
          : "border-ink/25 text-muted-foreground hover:border-ink/50 hover:text-foreground",
      )}
      onClick={() => {
        setTab(id);
        setCursor(null);
      }}
    >
      {t(labelKey)}
    </button>
  );

  return (
    <Card data-testid="metrics-chart">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("metrics.title")}
        </h3>
        <CardDescription>
          {t("metrics.desc", { window: profile.smoothingWindow })}
        </CardDescription>
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          data-print-hide-on-print
          role="group"
          aria-label={t("metrics.title")}
        >
          {axes.hr.available && tabButton("hr", "zones.tab.hr")}
          {axes.cad.available && tabButton("cad", "zones.tab.cadence")}
          {axes.power.available && tabButton("power", "zones.tab.power")}
        </div>
      </CardHeader>
      <CardContent>
        <p
          data-testid="metrics-readout"
          aria-live="polite"
          aria-atomic="true"
          id={liveId}
          className={`mb-2 min-h-[18px] font-mono text-[12px] tabular-nums ${
            readoutText === null ? "text-muted-foreground" : "text-ink"
          }`}
        >
          {readoutText ?? (
            <span data-print-hide-on-print>{t("profile.readoutHint")}</span>
          )}
        </p>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-40 w-full cursor-crosshair focus-visible:outline-2 focus-visible:outline-ring"
          role="img"
          tabIndex={0}
          data-testid="metrics-chart-svg"
          aria-label={t("metrics.ariaLabel", {
            metric: metricName,
            min: `${Math.round(axis.min)} ${axis.unit}`,
            max: `${Math.round(axis.max)} ${axis.unit}`,
            cursor:
              readoutText !== null
                ? ` ${t("profile.ariaCursor", { readout: readoutText })}.`
                : "",
          })}
          onKeyDown={onKeyDown}
          onPointerMove={(event) =>
            setCursor(indexForClientX(event.clientX, event.currentTarget))
          }
          onPointerLeave={() => setCursor(null)}
          onBlur={() => setCursor(null)}
        >
          {/* Y axis: min/mid/max labels + gridlines. */}
          {[axis.min, (axis.min + axis.max) / 2, axis.max].map(
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
                    {Math.round(value)}
                  </text>
                </g>
              );
            },
          )}
          {/* X axis: distance labels at start/mid/end. */}
          {[
            { t: 0, anchor: "start" as const },
            { t: 0.5, anchor: "middle" as const },
            { t: 1, anchor: "end" as const },
          ].map(({ t: fraction, anchor }) => (
            <text
              key={fraction}
              x={PAD_LEFT + (WIDTH - PAD_LEFT - PAD_RIGHT) * fraction}
              y={HEIGHT - 6}
              textAnchor={anchor}
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {axisDistance(profile.totalDistanceM * fraction)}
            </text>
          ))}

          {/* The elevation backdrop: a faint soft area under the
              profile (the pattern Strava documents for all three
              metrics — the metric reads over the terrain). */}
          {segments.elevation.map((segment, index) => {
            const floor = HEIGHT - PAD_BOTTOM;
            const first = segment.points[0];
            const last = segment.points[segment.points.length - 1];
            const area = [
              `M${first.x.toFixed(1)},${first.y.toFixed(1)}`,
              segment.points
                .slice(1)
                .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                .join(" "),
              `L${last.x.toFixed(1)},${floor}`,
              `L${first.x.toFixed(1)},${floor}`,
              "Z",
            ].join(" ");
            return (
              <path
                key={`ele-area-${index}`}
                d={area}
                data-testid="metrics-elevation-backdrop"
                className="fill-foreground/[0.05]"
                aria-hidden="true"
              />
            );
          })}
          {segments.elevation.map((segment, index) => (
            <path
              key={`ele-line-${index}`}
              d={segmentPath(segment)}
              data-testid="metrics-elevation-line"
              className="stroke-foreground/30"
              strokeWidth={1}
              fill="none"
              aria-hidden="true"
            />
          ))}

          {/* The metric series: solid ink, holes break the line. */}
          {segments.metric.map((segment, index) => (
            <path
              key={`metric-${index}`}
              d={segmentPath(segment)}
              data-testid="metrics-series"
              className="stroke-ink"
              strokeWidth={1.75}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* The readout cursor: crosshair + dot at the sample. */}
          {cursorPoint !== null && (
            <g data-testid="metrics-cursor" aria-hidden="true">
              <line
                x1={xOfIndex(cursor ?? 0)}
                x2={xOfIndex(cursor ?? 0)}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                className="stroke-ink/60"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {cursorPoint[axis.seriesKey] !== undefined && (
                <circle
                  cx={xOfIndex(cursor ?? 0)}
                  cy={yOfValue(cursorPoint[axis.seriesKey] as number)}
                  r={3}
                  className="fill-signal stroke-paper"
                  strokeWidth={1.5}
                />
              )}
            </g>
          )}
        </svg>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                className="stroke-ink"
                strokeWidth="2"
              />
            </svg>
            {t("metrics.legend.metric", { metric: metricName })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                className="stroke-foreground/30"
                strokeWidth="2"
              />
            </svg>
            {t("metrics.legend.ele")}
          </span>
        </div>

        {/* §C-5 — the textual equivalent of the SAME display series. */}
        <div className="mt-3">
          <button
            type="button"
            data-testid="metrics-table-toggle"
            data-print-hide-on-print
            aria-expanded={tableOpen}
            className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
            onClick={() => setTableOpen((open) => !open)}
          >
            {tableOpen ? t("metrics.hideTable") : t("metrics.showTable")}
          </button>
          {tableOpen && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {t("profile.tableNote", { count: intervals.length })}
            </p>
          )}
          {tableOpen && (
            <div className="mt-2 overflow-x-auto">
              <Table data-testid="metrics-table">
                <TableHeader>
                  <TableRow>
                    {[
                      "profile.colInterval",
                      "profile.colMin",
                      "metrics.colAvg",
                      "profile.colMax",
                      "stats.group.elevation",
                    ].map((labelKey, i) => (
                      <TableHead
                        key={labelKey}
                        scope="col"
                        className={`h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25 ${
                          i > 0 ? "text-right" : ""
                        }`}
                      >
                        {t(labelKey)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intervals.map((interval) => (
                    <TableRow key={interval.fromM}>
                      <TableCell className="whitespace-nowrap font-mono text-[12px]">
                        {axisDistance(interval.fromM)}–
                        {axisDistance(interval.toM)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {interval.min === undefined
                          ? "—"
                          : Math.round(interval.min)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {interval.avg === undefined
                          ? "—"
                          : Math.round(interval.avg)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {interval.max === undefined
                          ? "—"
                          : Math.round(interval.max)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {interval.eleAvg === undefined
                          ? "—"
                          : formatElevationMeters(interval.eleAvg)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

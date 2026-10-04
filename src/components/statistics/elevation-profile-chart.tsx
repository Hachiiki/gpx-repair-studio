/**
 * ElevationProfileChart — the FR-6.4 profile (Phase 6), upgraded by
 * Phase 15 (§EE 15.2): area shading, a hover/keyboard readout, and a
 * textual profile table.
 *
 * A dependency-free SVG line chart over the merged route: recorded
 * stretches draw solid in the foreground color, reconstructed stretches
 * draw dashed signal orange, and both now carry a soft AREA FILL under
 * the line (neutral ink tint vs signal tint) so the two provenances
 * read at a glance even where the dashes get dense (§EE 15.2
 * "original vs reconstructed shading"). Holes (points without
 * elevation) break the line instead of dropping to zero. The series
 * arrives already decimated and display-smoothed from the pure builder
 * (features/statistics/elevation.ts) — this component only scales and
 * paints.
 *
 * The readout (§EE 15.2): hovering the chart moves a crosshair to the
 * nearest sample; the keyboard does the same (the SVG is focusable —
 * ArrowLeft/ArrowRight step, Home/End jump, Escape clears), and a
 * polite live region speaks each move. The table below the chart is
 * the full textual equivalent (§C-5): the SAME display series bucketed
 * into at most 24 distance intervals — smoothing is display-only
 * (§K-2) and the table says so.
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
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { useI18n } from "@/hooks/use-i18n";
import type { ElevationProfile } from "@/hooks/use-elevation";
import { formatElevationMeters } from "@/lib/utils/format";

/** Plot area inside the 600×160 viewBox. */
const WIDTH = 600;
const HEIGHT = 160;
const PAD_LEFT = 44;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/** The profile table's row ceiling — the §C-5 textual equivalent stays
 * a summary, never a data dump (the Phase 15 VLM critique's confirmed
 * claim: the buggy formula once produced 161 near-identical rows). */
const PROFILE_TABLE_MAX_INTERVALS = 24;

/** Intervals never narrower than this — short routes keep a few readable
 * rows instead of 24 crumb-width ones. */
const PROFILE_TABLE_MIN_INTERVAL_M = 250;

/** One contiguous drawable stretch of one provenance. */
interface Segment {
  kind: "recorded" | "reconstructed";
  points: { x: number; y: number }[];
  /** Index of the run's first point in the profile series. */
  startIndex: number;
}

/** Format a route distance the chart's axis does (m below 1 km). */
function axisDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

/**
 * Split the series into contiguous same-kind segments with defined
 * elevation (holes break the line — never a false drop to zero).
 */
function buildSegments(profile: ElevationProfile): Segment[] {
  const xScale = (xM: number): number => {
    const span = profile.totalDistanceM > 0 ? profile.totalDistanceM : 1;
    return PAD_LEFT + ((WIDTH - PAD_LEFT - PAD_RIGHT) * xM) / span;
  };
  const eleSpan = profile.maxEleM - profile.minEleM;
  const yScale = (ele: number): number => {
    const padded = eleSpan > 0 ? eleSpan : 1;
    return (
      HEIGHT -
      PAD_BOTTOM -
      ((HEIGHT - PAD_TOP - PAD_BOTTOM) * (ele - profile.minEleM)) / padded
    );
  };

  const segments: Segment[] = [];
  let current: Segment | null = null;
  profile.points.forEach((point, index) => {
    if (point.ele === undefined) {
      current = null; // hole
      return;
    }
    const x = xScale(point.xM);
    const y = yScale(point.ele);
    if (current && current.kind !== point.kind) current = null;
    if (!current) {
      current = { kind: point.kind, points: [], startIndex: index };
      segments.push(current);
    }
    current.points.push({ x, y });
  });
  return segments.filter((segment) => segment.points.length > 1);
}

function segmentPath(segment: Segment): string {
  return segment.points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");
}

/** The area fill under one stretch (down to the plot floor and back). */
function segmentAreaPath(segment: Segment): string {
  const floor = HEIGHT - PAD_BOTTOM;
  const first = segment.points[0];
  const last = segment.points[segment.points.length - 1];
  return [
    `M${first.x.toFixed(1)},${first.y.toFixed(1)}`,
    segment.points
      .slice(1)
      .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" "),
    `L${last.x.toFixed(1)},${floor}`,
    `L${first.x.toFixed(1)},${floor}`,
    "Z",
  ].join(" ");
}

interface ProfileInterval {
  fromM: number;
  toM: number;
  minEleM?: number;
  maxEleM?: number;
  startEleM?: number;
  endEleM?: number;
  kind: "recorded" | "reconstructed" | "mixed";
}

/** The badge vocabulary of an interval (reconstructed reads estimated). */
function intervalBadgeKind(
  kind: ProfileInterval["kind"],
): "recorded" | "estimated" | "mixed" {
  return kind === "reconstructed" ? "estimated" : kind;
}

/** The display series bucketed into ≤24 distance intervals. */
function buildIntervals(profile: ElevationProfile): ProfileInterval[] {
  const points = profile.points;
  if (points.length === 0) return [];
  const last = points[points.length - 1].xM;
  // At most PROFILE_TABLE_MAX_INTERVALS rows over the whole route: the
  // cap is a ceiling on bucketCount, NOT a divisor of the distance (the
  // original `ceil(last / 24)` inverted it and produced 269 buckets for
  // a 6.5 km route — one row per display point).
  const bucketCount = Math.max(
    1,
    Math.min(
      PROFILE_TABLE_MAX_INTERVALS,
      Math.ceil(last / PROFILE_TABLE_MIN_INTERVAL_M),
    ),
  );
  const step = last > 0 ? last / bucketCount : 0;
  if (step <= 0) {
    // Degenerate: everything at distance 0 — one honest row.
    return buildOneInterval(points, 0, 0);
  }
  const intervals: ProfileInterval[] = [];
  let current: {
    fromM: number;
    toM: number;
    min?: number;
    max?: number;
    start?: number;
    end?: number;
    recorded: boolean;
    reconstructed: boolean;
  } | null = null;

  const flush = () => {
    if (current === null) return;
    intervals.push({
      fromM: current.fromM,
      toM: current.toM,
      ...(current.min !== undefined ? { minEleM: current.min } : {}),
      ...(current.max !== undefined ? { maxEleM: current.max } : {}),
      ...(current.start !== undefined ? { startEleM: current.start } : {}),
      ...(current.end !== undefined ? { endEleM: current.end } : {}),
      kind: current.recorded
        ? current.reconstructed
          ? "mixed"
          : "recorded"
        : "reconstructed",
    });
    current = null;
  };

  for (const point of points) {
    const bucket = Math.min(
      Math.floor(point.xM / step),
      bucketCount - 1,
    );
    const fromM = bucket * step;
    if (current === null || Math.abs(current.fromM - fromM) > 1e-9) {
      flush();
      current = {
        fromM,
        toM: fromM + step,
        recorded: false,
        reconstructed: false,
      };
    }
    if (point.kind === "recorded") current.recorded = true;
    else current.reconstructed = true;
    if (point.ele !== undefined) {
      if (current.min === undefined || point.ele < current.min) {
        current.min = point.ele;
      }
      if (current.max === undefined || point.ele > current.max) {
        current.max = point.ele;
      }
      if (current.start === undefined) current.start = point.ele;
      current.end = point.ele;
    }
  }
  flush();
  if (intervals.length > 0) {
    intervals[intervals.length - 1].toM = last;
  }
  return intervals;
}

function buildOneInterval(
  points: readonly { ele?: number; kind: "recorded" | "reconstructed" }[],
  fromM: number,
  toM: number,
): ProfileInterval[] {
  let min: number | undefined;
  let max: number | undefined;
  let start: number | undefined;
  let end: number | undefined;
  let recorded = false;
  let reconstructed = false;
  for (const point of points) {
    if (point.kind === "recorded") recorded = true;
    else reconstructed = true;
    if (point.ele !== undefined) {
      if (min === undefined || point.ele < min) min = point.ele;
      if (max === undefined || point.ele > max) max = point.ele;
      if (start === undefined) start = point.ele;
      end = point.ele;
    }
  }
  return [
    {
      fromM,
      toM,
      ...(min !== undefined ? { minEleM: min } : {}),
      ...(max !== undefined ? { maxEleM: max } : {}),
      ...(start !== undefined ? { startEleM: start } : {}),
      ...(end !== undefined ? { endEleM: end } : {}),
      kind: recorded ? (reconstructed ? "mixed" : "recorded") : "reconstructed",
    },
  ];
}

export function ElevationProfileChart({
  profile,
  gainLossSummary,
}: {
  profile: ElevationProfile;
  /** Textual summary for the a11y label (from the stats rows). */
  gainLossSummary?: string | null;
}) {
  const { t } = useI18n();
  const [cursor, setCursor] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const liveId = useId();

  const segments = useMemo(() => buildSegments(profile), [profile]);
  const intervals = useMemo(
    () => (tableOpen ? buildIntervals(profile) : []),
    [tableOpen, profile],
  );

  if (!profile.hasAnyEle) return null;
  if (segments.length === 0) return null;

  const distanceLabel =
    profile.totalDistanceM >= 1000
      ? `${(profile.totalDistanceM / 1000).toFixed(1)} km`
      : `${Math.round(profile.totalDistanceM)} m`;

  const span = profile.totalDistanceM > 0 ? profile.totalDistanceM : 1;
  const xOfIndex = (index: number): number => {
    const xM = profile.points[index]?.xM ?? 0;
    return PAD_LEFT + ((WIDTH - PAD_LEFT - PAD_RIGHT) * xM) / span;
  };

  // The nearest sample for a pointer x (SVG viewBox units).
  const indexForClientX = (clientX: number, target: SVGSVGElement): number => {
    const rect = target.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const svgX = fraction * WIDTH;
    const xM = ((svgX - PAD_LEFT) / (WIDTH - PAD_LEFT - PAD_RIGHT)) * span;
    // Binary search over the monotone xM series.
    let lo = 0;
    let hi = profile.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (profile.points[mid].xM < xM) lo = mid + 1;
      else hi = mid;
    }
    // lo is the first point at/after xM; step back when it is closer.
    if (lo > 0) {
      const before = Math.abs(profile.points[lo - 1].xM - xM);
      const at = Math.abs(profile.points[lo].xM - xM);
      if (before < at) lo -= 1;
    }
    return Math.max(0, Math.min(profile.points.length - 1, lo));
  };

  const cursorPoint = cursor !== null ? profile.points[cursor] : null;
  const eleSpan = profile.maxEleM - profile.minEleM;
  const yOfEle = (ele: number): number => {
    const padded = eleSpan > 0 ? eleSpan : 1;
    return (
      HEIGHT -
      PAD_BOTTOM -
      ((HEIGHT - PAD_TOP - PAD_BOTTOM) * (ele - profile.minEleM)) / padded
    );
  };

  const readoutText =
    cursorPoint === null
      ? null
      : cursorPoint.ele === undefined
        ? t("profile.readout.noEle", {
            distance: axisDistance(cursorPoint.xM),
          })
        : t("profile.readout.at", {
            distance: axisDistance(cursorPoint.xM),
            elevation: formatElevationMeters(cursorPoint.ele),
            kind:
              cursorPoint.kind === "recorded"
                ? t("profile.kindRecorded")
                : t("profile.kindReconstructed"),
          });

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (profile.points.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      // From rest, ArrowRight starts at the first sample and
      // ArrowLeft wraps to the last (the readout always has somewhere
      // to go).
      const current =
        cursor ?? (event.key === "ArrowLeft" ? profile.points.length - 1 : -1);
      const next = Math.max(
        0,
        Math.min(profile.points.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)),
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

  return (
    <Card data-testid="elevation-profile-chart">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("profile.title")}
        </h3>
        <CardDescription>
          {t("profile.desc", {
            min: formatElevationMeters(profile.minEleM),
            max: formatElevationMeters(profile.maxEleM),
            distance: distanceLabel,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p
          data-testid="elevation-profile-readout"
          aria-live="polite"
          aria-atomic="true"
          id={liveId}
          className={`mb-2 min-h-[18px] font-mono text-[12px] tabular-nums ${
            readoutText === null ? "text-muted-foreground" : "text-ink"
          }`}
        >
          {readoutText ?? (
            /* Screen-only instruction — a printed sheet has no pointer
             * (the Phase 15 VLM print critique's one confirmed claim). */
            <span data-print-hide-on-print>
              {t("profile.readoutHint")}
            </span>
          )}
        </p>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-40 w-full cursor-crosshair focus-visible:outline-2 focus-visible:outline-ring"
          role="img"
          tabIndex={0}
          data-testid="elevation-profile-svg"
          aria-label={t("profile.ariaLabel", {
            min: formatElevationMeters(profile.minEleM),
            max: formatElevationMeters(profile.maxEleM),
            distance: distanceLabel,
            gainLoss: gainLossSummary ? `, ${gainLossSummary}` : "",
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
          {/* Y axis: min/max labels + gridlines at min/mid/max. */}
          {[profile.minEleM, (profile.minEleM + profile.maxEleM) / 2, profile.maxEleM].map(
            (ele, index) => {
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
                    {Math.round(ele)}
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
          ].map(({ t, anchor }) => {
            const meters = profile.totalDistanceM * t;
            return (
              <text
                key={t}
                x={PAD_LEFT + (WIDTH - PAD_LEFT - PAD_RIGHT) * t}
                y={HEIGHT - 6}
                textAnchor={anchor}
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {axisDistance(meters)}
              </text>
            );
          })}

          {/* §EE 15.2 — the area fills: recorded neutral, reconstructed
              signal-tinted (the shading distinction). */}
          {segments
            .filter((segment) => segment.kind === "recorded")
            .map((segment, index) => (
              <path
                key={`area-recorded-${index}`}
                d={segmentAreaPath(segment)}
                data-testid="elevation-profile-area-recorded"
                className="fill-foreground/[0.06]"
                aria-hidden="true"
              />
            ))}
          {segments
            .filter((segment) => segment.kind === "reconstructed")
            .map((segment, index) => (
              <path
                key={`area-reconstructed-${index}`}
                d={segmentAreaPath(segment)}
                data-testid="elevation-profile-area-reconstructed"
                className="fill-signal/[0.10]"
                aria-hidden="true"
              />
            ))}

          {/* Recorded stretches: solid foreground line. */}
          {segments
            .filter((segment) => segment.kind === "recorded")
            .map((segment, index) => (
              <path
                key={`recorded-${index}`}
                d={segmentPath(segment)}
                data-testid="elevation-profile-recorded"
                className="stroke-foreground"
                strokeWidth={1.75}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

          {/* Reconstructed stretches: dashed signal orange (the estimate look). */}
          {segments
            .filter((segment) => segment.kind === "reconstructed")
            .map((segment, index) => (
              <path
                key={`reconstructed-${index}`}
                d={segmentPath(segment)}
                data-testid="elevation-profile-reconstructed"
                className="stroke-signal"
                strokeWidth={1.75}
                strokeDasharray="5 3"
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

          {/* The readout cursor: crosshair + dot at the sample. */}
          {cursorPoint !== null && (
            <g data-testid="elevation-profile-cursor" aria-hidden="true">
              <line
                x1={xOfIndex(cursor ?? 0)}
                x2={xOfIndex(cursor ?? 0)}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                className="stroke-ink/60"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {cursorPoint.ele !== undefined && (
                <circle
                  cx={xOfIndex(cursor ?? 0)}
                  cy={yOfEle(cursorPoint.ele)}
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
                className="stroke-foreground"
                strokeWidth="2"
              />
            </svg>
            {t("stats.provenance.recorded")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                className="stroke-signal"
                strokeWidth="2"
                strokeDasharray="5 3"
              />
            </svg>
            {t("profile.legendReconstructed")}
          </span>
        </div>

        {/* §C-5 — the textual equivalent, disclosed as the display
            series (smoothing is display-only, §K-2). */}
        <div className="mt-3">
          <button
            type="button"
            data-testid="elevation-profile-table-toggle"
            data-print-hide-on-print
            aria-expanded={tableOpen}
            className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
            onClick={() => setTableOpen((open) => !open)}
          >
            {tableOpen ? t("profile.hideTable") : t("profile.showTable")}
          </button>
          {tableOpen && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {t("profile.tableNote", { count: intervals.length })}
            </p>
          )}
          {tableOpen && (
            <div className="mt-2 overflow-x-auto">
              <Table data-testid="elevation-profile-table">
                <TableHeader>
                  <TableRow>
                    {[
                      "profile.colInterval",
                      "profile.colStart",
                      "profile.colEnd",
                      "profile.colMin",
                      "profile.colMax",
                      "stats.source",
                    ].map((labelKey, i) => (
                      <TableHead
                        key={labelKey}
                        scope="col"
                        className={`h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25 ${
                          i === 5 ? "text-right" : ""
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
                        {axisDistance(interval.fromM)}–{axisDistance(interval.toM)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {interval.startEleM === undefined
                          ? "—"
                          : formatElevationMeters(interval.startEleM)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {interval.endEleM === undefined
                          ? "—"
                          : formatElevationMeters(interval.endEleM)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {interval.minEleM === undefined
                          ? "—"
                          : formatElevationMeters(interval.minEleM)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {interval.maxEleM === undefined
                          ? "—"
                          : formatElevationMeters(interval.maxEleM)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ProvenanceBadge kind={intervalBadgeKind(interval.kind)} />
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

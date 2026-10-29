/**
 * PacePreviewCard — the "create from activity stats" review's pace
 * preview (Task 73): the Strava-style analysis the exported file will
 * produce, drawn from the SAME paced timeline the file's timestamps
 * follow (one basis — the preview and the export can never disagree).
 *
 * Two stacked charts, the Strava pattern:
 *   - the SPLITS bar graph: one bar per km/mile, the route average as
 *     a dashed reference — the "same pace everywhere" wall the feature
 *     exists to break, at a glance;
 *   - below it the DUAL-AXIS pace graph: the pace line over distance
 *     (Y inverted — faster plots higher, Strava's convention) over a
 *     faint elevation area (right axis), the metrics chart's backdrop
 *     pattern.
 *
 * The full §C-5 + §EE 15.2 discipline, verbatim: the SVG is focusable,
 * ArrowLeft/Right step the sample, Home/End jump, Escape clears,
 * pointer-move picks the nearest sample by binary search, a polite
 * live region speaks every move, and a textual table twin carries the
 * same series. The cursor is also the MAP's: every move calls
 * `onCursor` with the route position, and the studio paints the chart
 * cursor dot on the map (the hover sync).
 *
 * Pure presentation: timeline + track in, intents (the cursor) out.
 */

"use client";

import { useId, useState } from "react";
import { Gauge, TriangleAlert } from "lucide-react";
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
import type {
  CreateTrack,
  PaceSplit,
  PacedTimeline,
} from "@/hooks/use-create-pace";
import { useI18n } from "@/hooks/use-i18n";
import { UNIT_WORDS } from "@/i18n/units";
import {
  formatDistanceForUnit,
  formatDurationMs,
  formatElevationMeters,
  formatPaceMs,
  PACE_METERS_PER_UNIT,
  type PaceUnit,
} from "@/lib/utils/format";

/** The graph's viewBox (the elevation/metrics charts' proportions). */
const WIDTH = 600;
const HEIGHT = 150;
const PAD_LEFT = 46;
const PAD_RIGHT = 40;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;

/** The splits bar chart's viewBox. */
const BARS_HEIGHT = 104;
const BARS_PAD_LEFT = 46;
const BARS_PAD_RIGHT = 10;
const BARS_PAD_TOP = 8;
const BARS_PAD_BOTTOM = 18;

export interface PacePreviewCardProps {
  /** The review's final track (map positions + the distance domain). */
  track: CreateTrack;
  /** The paced timeline (null = nothing shapes it; the flat fallback renders). */
  timeline: PacedTimeline | null;
  /** The splits' pace over that timeline (the hook computed them). */
  splits: readonly PaceSplit[];
  /** The recorded duration — the file's total, and the average line's basis. */
  durationMs: number;
  paceUnit: PaceUnit;
  /** True while a fresh elevation estimate exists (the hint's condition). */
  hasElevation: boolean;
  /** The cursor moved on the graph — paint the map dot (null clears). */
  onCursor: (position: { lat: number; lon: number } | null) => void;
}

/** The flat fallback: nothing shapes the curve, the wall renders as a wall. */
function flatTimeline(
  track: CreateTrack,
  durationMs: number,
  startMs: number,
): PacedTimeline | null {
  const total = track.finalDistanceM;
  if (!(total > 0) || track.path.length === 0) return null;
  const avg = durationMs / total;
  return {
    times: track.times.map((time) => ({
      value: time?.value ?? startMs,
      method: "pace-estimated" as const,
    })),
    samples: [
      { cumM: 0, paceMsPerMeter: avg },
      { cumM: total, paceMsPerMeter: avg },
    ],
    totalMs: durationMs,
    plannedM: 0,
    remainderPaceMsPerMeter: avg,
    elevationModulated: false,
    clamped: false,
    segmentCount: 0,
  };
}

/** A distance the way this app's chart axes render it (per unit). */
function axisDistance(meters: number, unit: PaceUnit): string {
  const value = meters / PACE_METERS_PER_UNIT[unit];
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}`;
}

export function PacePreviewCard({
  track,
  timeline: paced,
  splits,
  durationMs,
  paceUnit,
  hasElevation,
  onCursor,
}: PacePreviewCardProps) {
  const { t, locale } = useI18n();
  const [cursor, setCursor] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const liveId = useId();

  const timeline = paced ?? flatTimeline(track, durationMs, 0);
  const unitMeters = PACE_METERS_PER_UNIT[paceUnit];
  const perUnitWord =
    paceUnit === "km" ? UNIT_WORDS[locale].perKm : UNIT_WORDS[locale].perMi;
  const unitWord = paceUnit === "km" ? UNIT_WORDS[locale].km : UNIT_WORDS[locale].mi;

  // The map sync: the cursor's route position (nearest path point).
  const positionAt = (cumM: number): { lat: number; lon: number } | null => {
    const path = track.path;
    if (path.length === 0) return null;
    if (cumM <= 0) return { lat: path[0].lat, lon: path[0].lon };
    const last = path[path.length - 1];
    if (cumM >= last.cumDistanceM) return { lat: last.lat, lon: last.lon };
    let lo = 0;
    let hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].cumDistanceM <= cumM) lo = mid;
      else hi = mid;
    }
    const a = path[lo];
    const b = path[hi];
    const span = b.cumDistanceM - a.cumDistanceM;
    const fraction = span > 0 ? (cumM - a.cumDistanceM) / span : 0;
    return { lat: a.lat + (b.lat - a.lat) * fraction, lon: a.lon + (b.lon - a.lon) * fraction };
  };

  const moveCursor = (index: number | null) => {
    setCursor(index);
    if (timeline === null || index === null) {
      onCursor(null);
      return;
    }
    const sample = timeline.samples[index];
    if (!sample) {
      onCursor(null);
      return;
    }
    onCursor(positionAt(sample.cumM));
  };

  if (timeline === null || timeline.samples.length < 2) return null;

  const totalM = track.finalDistanceM;
  const avgPaceMsPerMeter = durationMs / totalM;
  const metersPerUnit = PACE_METERS_PER_UNIT[paceUnit];

  // -- the pace domain (samples' min/max, padded) --------------------------
  let minPace = Number.POSITIVE_INFINITY;
  let maxPace = 0;
  let minEle = Number.POSITIVE_INFINITY;
  let maxEle = Number.NEGATIVE_INFINITY;
  let hasEle = false;
  for (const sample of timeline.samples) {
    if (sample.paceMsPerMeter < minPace) minPace = sample.paceMsPerMeter;
    if (sample.paceMsPerMeter > maxPace) maxPace = sample.paceMsPerMeter;
    if (sample.eleM !== undefined) {
      hasEle = true;
      if (sample.eleM < minEle) minEle = sample.eleM;
      if (sample.eleM > maxEle) maxEle = sample.eleM;
    }
  }
  // Keep the average line inside the padded domain (a fully flat plan
  // still renders the line mid-chart, not clipped).
  minPace = Math.min(minPace, avgPaceMsPerMeter);
  maxPace = Math.max(maxPace, avgPaceMsPerMeter);
  const paceSpan = Math.max(maxPace - minPace, avgPaceMsPerMeter * 0.04, 1e-9);
  const paceLow = Math.max(0, minPace - paceSpan * 0.15);
  const paceHigh = maxPace + paceSpan * 0.15;
  const paceDomain = paceHigh - paceLow;

  const xOfM = (m: number): number =>
    PAD_LEFT + ((WIDTH - PAD_LEFT - PAD_RIGHT) * m) / totalM;
  // Inverted pace axis: faster (smaller ms/m) plots HIGHER.
  const yOfPace = (pace: number): number =>
    PAD_TOP + ((pace - paceLow) / paceDomain) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  // The elevation scale (own domain — the right axis's).
  const yOfEle = (ele: number): number =>
    hasEle
      ? HEIGHT -
        PAD_BOTTOM -
        ((ele - minEle) / (maxEle - minEle || 1)) *
          (HEIGHT - PAD_TOP - PAD_BOTTOM)
      : HEIGHT - PAD_BOTTOM;

  // The pace polyline (one path; the display series is hole-free).
  const pacePath = timeline.samples
    .map(
      (sample, index) =>
        `${index === 0 ? "M" : "L"}${xOfM(sample.cumM).toFixed(1)},${yOfPace(
          sample.paceMsPerMeter,
        ).toFixed(1)}`,
    )
    .join(" ");

  // The elevation area + line.
  const eleSamples = timeline.samples.filter(
    (sample) => sample.eleM !== undefined,
  );
  const elePath = eleSamples
    .map(
      (sample, index) =>
        `${index === 0 ? "M" : "L"}${xOfM(sample.cumM).toFixed(1)},${yOfEle(
          sample.eleM!,
        ).toFixed(1)}`,
    )
    .join(" ");
  const eleArea =
    eleSamples.length > 1
      ? `${elePath} L${xOfM(eleSamples[eleSamples.length - 1].cumM).toFixed(1)},${(
          HEIGHT - PAD_BOTTOM
        ).toFixed(1)} L${xOfM(eleSamples[0].cumM).toFixed(1)},${(
          HEIGHT - PAD_BOTTOM
        ).toFixed(1)} Z`
      : "";

  // -- the splits domain ----------------------------------------------------
  const splitPaces = splits.map((split) => split.paceMsPerMeter);
  const minSplit = splitPaces.length > 0 ? Math.min(...splitPaces) : avgPaceMsPerMeter;
  const maxSplit = splitPaces.length > 0 ? Math.max(...splitPaces) : avgPaceMsPerMeter;
  const splitSpan = Math.max(maxSplit - minSplit, avgPaceMsPerMeter * 0.05, 1e-9);
  const splitLow = Math.max(0, minSplit - splitSpan * 0.4);
  const splitDomain = Math.max(maxSplit + splitSpan * 0.15 - splitLow, 1e-9);
  const barX = (index: number): number => {
    const plotW = WIDTH - BARS_PAD_LEFT - BARS_PAD_RIGHT;
    const step = plotW / Math.max(splits.length, 1);
    return BARS_PAD_LEFT + step * index + step * 0.12;
  };
  const barW = (() => {
    const plotW = WIDTH - BARS_PAD_LEFT - BARS_PAD_RIGHT;
    const step = plotW / Math.max(splits.length, 1);
    return Math.max(2, step * 0.76);
  })();
  const barY = (pace: number): number => {
    const h =
      ((pace - splitLow) / splitDomain) * (BARS_HEIGHT - BARS_PAD_TOP - BARS_PAD_BOTTOM);
    return BARS_HEIGHT - BARS_PAD_BOTTOM - Math.max(1, h);
  };
  const barH = (pace: number): number =>
    Math.max(
      1,
      ((pace - splitLow) / splitDomain) * (BARS_HEIGHT - BARS_PAD_TOP - BARS_PAD_BOTTOM),
    );

  // -- the cursor ------------------------------------------------------------
  const cursorSample = cursor !== null ? timeline.samples[cursor] : null;
  const cursorSplitIndex =
    cursorSample !== null
      ? Math.min(
          splits.length - 1,
          Math.max(0, Math.floor(cursorSample.cumM / unitMeters)),
        )
      : null;

  const indexForClientX = (clientX: number, target: SVGSVGElement): number => {
    const rect = target.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const svgX = fraction * WIDTH;
    const xM = ((svgX - PAD_LEFT) / (WIDTH - PAD_LEFT - PAD_RIGHT)) * totalM;
    let lo = 0;
    let hi = timeline.samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timeline.samples[mid].cumM < xM) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) {
      const before = Math.abs(timeline.samples[lo - 1].cumM - xM);
      const at = Math.abs(timeline.samples[lo].cumM - xM);
      if (before < at) lo -= 1;
    }
    return Math.max(0, Math.min(timeline.samples.length - 1, lo));
  };

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (timeline.samples.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const current =
        cursor ??
        (event.key === "ArrowLeft" ? timeline.samples.length - 1 : -1);
      const next = Math.max(
        0,
        Math.min(
          timeline.samples.length - 1,
          current + (event.key === "ArrowRight" ? 1 : -1),
        ),
      );
      moveCursor(next);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveCursor(timeline.samples.length - 1);
    } else if (event.key === "Escape") {
      moveCursor(null);
    }
  };

  const paceValue = (paceMsPerMeter: number): string =>
    `${formatPaceMs(paceMsPerMeter * metersPerUnit)} ${perUnitWord}`;

  const readoutText =
    cursorSample === null
      ? null
      : cursorSample.eleM === undefined
        ? t("create.pacePreview.readoutNoEle", {
            distance: formatDistanceForUnit(cursorSample.cumM, paceUnit),
            pace: paceValue(cursorSample.paceMsPerMeter),
          })
        : t("create.pacePreview.readout", {
            distance: formatDistanceForUnit(cursorSample.cumM, paceUnit),
            pace: paceValue(cursorSample.paceMsPerMeter),
            ele: formatElevationMeters(cursorSample.eleM),
          });

  return (
    <Card
      className="border-[1.5px] border-ink"
      data-testid="pace-preview-card"
    >
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Gauge className="size-4 text-signal" aria-hidden="true" />
          {t("create.pacePreview.title")}
        </h3>
        <CardDescription>{t("create.pacePreview.blurb")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* The readout (the shared live region). */}
        <p
          data-testid="pace-preview-readout"
          aria-live="polite"
          aria-atomic="true"
          id={liveId}
          className={`min-h-[18px] font-mono text-[12px] tabular-nums ${
            readoutText === null ? "text-muted-foreground" : "text-ink"
          }`}
        >
          {readoutText ?? t("create.pacePreview.readoutHint")}
        </p>

        {/* The splits bar graph — the at-a-glance "not one flat pace". */}
        <svg
          viewBox={`0 0 ${WIDTH} ${BARS_HEIGHT}`}
          className="h-[104px] w-full"
          role="img"
          data-testid="pace-splits-svg"
          aria-label={t("create.pacePreview.splitsA11y", {
            count: splits.length,
            avg: paceValue(avgPaceMsPerMeter),
          })}
        >
          {/* Left axis: pace labels (min/mid/max of the split domain). */}
          {[splitLow, (splitLow + maxSplit) / 2, maxSplit].map((pace, index) => {
            const y =
              BARS_HEIGHT -
              BARS_PAD_BOTTOM -
              ((BARS_HEIGHT - BARS_PAD_TOP - BARS_PAD_BOTTOM) * index) / 2;
            return (
              <text
                key={index}
                x={BARS_PAD_LEFT - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {formatPaceMs(pace * metersPerUnit)}
              </text>
            );
          })}
          {/* The bars — the split under the graph cursor lights signal. */}
          {splits.map((split, index) => (
            <rect
              key={split.index}
              x={barX(index)}
              y={barY(split.paceMsPerMeter)}
              width={barW}
              height={barH(split.paceMsPerMeter)}
              data-testid="pace-split-bar"
              data-split={split.index}
              className={
                cursorSplitIndex === index
                  ? "fill-signal"
                  : "fill-ink/60"
              }
              rx={1.5}
            />
          ))}
          {/* The average reference line (dashed). */}
          <line
            x1={BARS_PAD_LEFT}
            x2={WIDTH - BARS_PAD_RIGHT}
            y1={(() => {
              const y = barY(avgPaceMsPerMeter);
              return Math.min(
                BARS_HEIGHT - BARS_PAD_BOTTOM - 1,
                Math.max(BARS_PAD_TOP, y),
              );
            })()}
            y2={(() => {
              const y = barY(avgPaceMsPerMeter);
              return Math.min(
                BARS_HEIGHT - BARS_PAD_BOTTOM - 1,
                Math.max(BARS_PAD_TOP, y),
              );
            })()}
            className="stroke-signal"
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />
          {/* X labels: split numbers at start/mid/end. */}
          {[0, 0.5, 1].map((fraction) => {
            const index = Math.min(
              splits.length - 1,
              Math.floor((splits.length - 1) * fraction),
            );
            if (index < 0) return null;
            return (
              <text
                key={fraction}
                x={barX(index) + barW / 2}
                y={BARS_HEIGHT - 5}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {splits[index].index}
              </text>
            );
          })}
        </svg>

        {/* The dual-axis pace graph — pace line over the elevation area. */}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-40 w-full cursor-crosshair focus-visible:outline-2 focus-visible:outline-ring"
          role="img"
          tabIndex={0}
          data-testid="pace-graph-svg"
          aria-label={t("create.pacePreview.graphA11y", {
            min: paceValue(minPace),
            max: paceValue(maxPace),
            cursor:
              readoutText !== null
                ? ` ${t("profile.ariaCursor", { readout: readoutText })}.`
                : "",
          })}
          onKeyDown={onKeyDown}
          onPointerMove={(event) =>
            moveCursor(indexForClientX(event.clientX, event.currentTarget))
          }
          onPointerLeave={() => moveCursor(null)}
          onBlur={() => moveCursor(null)}
        >
          {/* Left axis: pace labels (inverted — fastest on top). */}
          {[paceLow, (paceLow + paceHigh) / 2, paceHigh].map((pace, index) => {
            const y =
              PAD_TOP + ((HEIGHT - PAD_TOP - PAD_BOTTOM) * index) / 2;
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
                  {formatPaceMs(pace * metersPerUnit)}
                </text>
              </g>
            );
          })}
          {/* Right axis: elevation labels (min/mid/max). */}
          {hasEle &&
            [minEle, (minEle + maxEle) / 2, maxEle].map((ele, index) => {
              const y =
                HEIGHT -
                PAD_BOTTOM -
                ((HEIGHT - PAD_TOP - PAD_BOTTOM) * index) / 2;
              return (
                <text
                  key={index}
                  x={WIDTH - PAD_RIGHT + 6}
                  y={y + 3}
                  textAnchor="start"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {formatElevationMeters(ele)}
                </text>
              );
            })}
          {/* X axis: distance labels at start/mid/end. */}
          {[
            { t: 0, anchor: "start" as const },
            { t: 0.5, anchor: "middle" as const },
            { t: 1, anchor: "end" as const },
          ].map(({ t: fraction, anchor }) => (
            <text
              key={fraction}
              x={PAD_LEFT + (WIDTH - PAD_LEFT - PAD_RIGHT) * fraction}
              y={HEIGHT - 5}
              textAnchor={anchor}
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {axisDistance(totalM * fraction, paceUnit)} {unitWord}
            </text>
          ))}

          {/* The elevation area + line (the metrics chart's backdrop). */}
          {eleArea !== "" && (
            <path
              d={eleArea}
              data-testid="pace-elevation-area"
              className="fill-foreground/[0.05]"
              aria-hidden="true"
            />
          )}
          {elePath !== "" && (
            <path
              d={elePath}
              data-testid="pace-elevation-line"
              className="stroke-foreground/30"
              strokeWidth={1}
              fill="none"
              aria-hidden="true"
            />
          )}

          {/* The pace line (inverted axis — faster is higher). */}
          <path
            d={pacePath}
            data-testid="pace-series"
            className="stroke-ink"
            strokeWidth={1.75}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* The average pace reference (dashed signal). */}
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={Math.min(
              HEIGHT - PAD_BOTTOM - 1,
              Math.max(PAD_TOP, yOfPace(avgPaceMsPerMeter)),
            )}
            y2={Math.min(
              HEIGHT - PAD_BOTTOM - 1,
              Math.max(PAD_TOP, yOfPace(avgPaceMsPerMeter)),
            )}
            className="stroke-signal"
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />

          {/* The cursor: crosshair + dots at the pace and the elevation. */}
          {cursorSample !== null && (
            <g data-testid="pace-cursor" aria-hidden="true">
              <line
                x1={xOfM(cursorSample.cumM)}
                x2={xOfM(cursorSample.cumM)}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                className="stroke-ink/60"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle
                cx={xOfM(cursorSample.cumM)}
                cy={yOfPace(cursorSample.paceMsPerMeter)}
                r={3}
                className="fill-signal stroke-paper"
                strokeWidth={1.5}
              />
              {cursorSample.eleM !== undefined && (
                <circle
                  cx={xOfM(cursorSample.cumM)}
                  cy={yOfEle(cursorSample.eleM)}
                  r={2.5}
                  className="fill-paper stroke-foreground/50"
                  strokeWidth={1.25}
                />
              )}
            </g>
          )}
        </svg>

        {/* The legend. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
            {t("create.pacePreview.legendPace")}
          </span>
          {hasEle && (
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
              {t("create.pacePreview.legendEle")}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                className="stroke-signal"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
            {t("create.pacePreview.legendAvg", {
              pace: formatPaceMs(avgPaceMsPerMeter * metersPerUnit),
              unit: unitWord,
            })}
          </span>
        </div>

        {/* The plan's honesty notes. */}
        <div className="grid gap-1" data-testid="pace-preview-notes">
          {timeline.clamped && (
            <p
              className="flex items-start gap-1.5 rounded-md border border-signal/40 bg-signal/[0.06] px-2.5 py-2 text-[11.5px] leading-snug text-ink"
              role="status"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {t("create.pacePreview.clampedNote")}
            </p>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("create.pacePreview.totalNote", {
              duration: formatDurationMs(durationMs),
            })}
          </p>
          {timeline.segmentCount > 0 && (
            <p
              className="text-[11px] leading-snug tabular-nums text-muted-foreground"
              data-testid="pace-preview-coverage"
            >
              {t("create.pacePreview.coverageNote", {
                planned: formatDistanceForUnit(timeline.plannedM, paceUnit),
                remainder:
                  timeline.remainderPaceMsPerMeter === null
                    ? ""
                    : paceValue(timeline.remainderPaceMsPerMeter),
              })}
            </p>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">
            {hasElevation
              ? t("create.pacePreview.modelNote")
              : t("create.pacePreview.noEleNote")}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("create.pacePreview.mapNote")}
          </p>
        </div>

        {/* §C-5 — the textual twin of the SAME splits series. */}
        <div className="mt-0">
          <button
            type="button"
            data-testid="pace-table-toggle"
            data-print-hide-on-print
            aria-expanded={tableOpen}
            className="rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
            onClick={() => setTableOpen((open) => !open)}
          >
            {tableOpen
              ? t("create.pacePreview.hideTable")
              : t("create.pacePreview.showTable")}
          </button>
          {tableOpen && (
            <div className="mt-2 overflow-x-auto">
              <Table data-testid="pace-splits-table">
                <TableHeader>
                  <TableRow>
                    {[
                      "create.pacePreview.colSplit",
                      "create.pacePreview.colPace",
                      "create.pacePreview.colEle",
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
                  {splits.map((split) => (
                    <TableRow key={split.index}>
                      <TableCell className="whitespace-nowrap font-mono text-[12px]">
                        {split.index} ·{" "}
                        {formatDistanceForUnit(split.fromM, paceUnit)}–{" "}
                        {formatDistanceForUnit(split.toM, paceUnit)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {paceValue(split.paceMsPerMeter)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {split.eleM === undefined
                          ? "—"
                          : formatElevationMeters(split.eleM)}
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

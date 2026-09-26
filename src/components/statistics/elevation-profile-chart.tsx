/**
 * ElevationProfileChart — the FR-6.4 profile (Phase 6).
 *
 * A dependency-free SVG line chart over the merged route: recorded
 * stretches draw solid in the foreground color, reconstructed stretches
 * draw dashed amber with the "estimated" legend — the two provenances
 * are visually distinct everywhere elevation appears (§K-2). Holes
 * (points without elevation) break the line instead of dropping to
 * zero. The series arrives already decimated and display-smoothed from
 * the pure builder (features/statistics/elevation.ts) — this component
 * only scales and paints.
 *
 * Pure presentation: profile in, nothing out. The numbers live in the
 * stats table; the chart carries `role="img"` with a textual summary.
 */

"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { ElevationProfile } from "@/hooks/use-elevation";
import { formatElevationMeters } from "@/lib/utils/format";

/** Plot area inside the 600×160 viewBox. */
const WIDTH = 600;
const HEIGHT = 160;
const PAD_LEFT = 44;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/** One contiguous drawable stretch of one provenance. */
interface Segment {
  kind: "recorded" | "reconstructed";
  points: { x: number; y: number }[];
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
  for (const point of profile.points) {
    if (point.ele === undefined) {
      current = null; // hole
      continue;
    }
    const x = xScale(point.xM);
    const y = yScale(point.ele);
    if (current && current.kind !== point.kind) current = null;
    if (!current) {
      current = { kind: point.kind, points: [] };
      segments.push(current);
    }
    current.points.push({ x, y });
  }
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

export function ElevationProfileChart({
  profile,
  gainLossSummary,
}: {
  profile: ElevationProfile;
  /** Textual summary for the a11y label (from the stats rows). */
  gainLossSummary?: string | null;
}) {
  if (!profile.hasAnyEle) return null;
  const segments = buildSegments(profile);
  if (segments.length === 0) return null;

  const distanceLabel =
    profile.totalDistanceM >= 1000
      ? `${(profile.totalDistanceM / 1000).toFixed(1)} km`
      : `${Math.round(profile.totalDistanceM)} m`;

  return (
    <Card data-testid="elevation-profile-chart">
      <CardHeader>
        <h3 className="leading-none font-semibold">Elevation profile</h3>
        <CardDescription>
          {formatElevationMeters(profile.minEleM)} to{" "}
          {formatElevationMeters(profile.maxEleM)} over {distanceLabel} —
          recorded stretches solid, reconstructed stretches estimated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-40 w-full"
          role="img"
          data-testid="elevation-profile-svg"
          aria-label={`Elevation profile from ${formatElevationMeters(
            profile.minEleM,
          )} to ${formatElevationMeters(profile.maxEleM)} over ${distanceLabel}${
            gainLossSummary ? `, ${gainLossSummary}` : ""
          }. Reconstructed stretches are estimated.`}
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
            const label =
              meters >= 1000
                ? `${(meters / 1000).toFixed(1)} km`
                : `${Math.round(meters)} m`;
            return (
              <text
                key={t}
                x={PAD_LEFT + (WIDTH - PAD_LEFT - PAD_RIGHT) * t}
                y={HEIGHT - 6}
                textAnchor={anchor}
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {label}
              </text>
            );
          })}

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

          {/* Reconstructed stretches: dashed amber (the estimate look). */}
          {segments
            .filter((segment) => segment.kind === "reconstructed")
            .map((segment, index) => (
              <path
                key={`reconstructed-${index}`}
                d={segmentPath(segment)}
                data-testid="elevation-profile-reconstructed"
                className="stroke-amber-500"
                strokeWidth={1.75}
                strokeDasharray="5 3"
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
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
            Recorded
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                className="stroke-amber-500"
                strokeWidth="2"
                strokeDasharray="5 3"
              />
            </svg>
            Reconstructed (estimated)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * CreateGuideCard — the "create from activity stats" drawing phase's
 * orientation card: the recorded statistics recap (the numbers the route
 * reconciles against), how to draw, and the two create-specific aids —
 * the one-shot "Find my position" geolocation fly-to (a blank world map
 * needs one) and the way back to the statistics form.
 *
 * Pure presentation: props in, intents out.
 */

"use client";

import { ArrowLeft, LocateFixed, MapPin, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ConsistencyNote } from "@/components/create/consistency-note";
import type { ActivityStats, ConsistencyNotice } from "@/hooks/use-create-session";
import type { LocateStatus } from "@/hooks/use-create-map";
import {
  formatDistanceForUnit,
  formatDurationMs,
  formatPaceMs,
  type PaceUnit,
} from "@/lib/utils/format";
import { PACE_METERS_PER_UNIT } from "@/lib/utils/format";

export interface CreateGuideCardProps {
  stats: ActivityStats;
  paceUnit: PaceUnit;
  /** The confirmed statistics' cross-check verdict (null = consistent). */
  consistency: ConsistencyNotice | null;
  /** The one-shot geolocation fly-to. */
  onLocate: () => void;
  locateStatus: LocateStatus;
  /** Return to the statistics form (values kept). */
  onBackToStats: () => void;
  /** Points drawn so far (the "what now" hint flips once drawing began). */
  vertexCount: number;
}

const LOCATE_NOTICE: Record<LocateStatus, string | null> = {
  idle: null,
  locating: "Finding your position…",
  denied:
    "Location was declined — pan and zoom to your starting point instead.",
  unavailable:
    "This browser has no location support — pan and zoom to your starting point instead.",
};

export function CreateGuideCard({
  stats,
  paceUnit,
  consistency,
  onLocate,
  locateStatus,
  onBackToStats,
  vertexCount,
}: CreateGuideCardProps) {
  const metersPerUnit = PACE_METERS_PER_UNIT[paceUnit];
  const pacePerUnitMs =
    (stats.paceMsPerKm / PACE_METERS_PER_UNIT.km) * metersPerUnit;
  const locateNotice = LOCATE_NOTICE[locateStatus];

  return (
    <Card className="border-[1.5px] border-ink" data-testid="create-guide-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <MapPin className="size-4 text-signal" aria-hidden="true" />
          Draw your route
        </h3>
        <CardDescription>
          The whole activity — there is no recording to fall back on. What
          you draw is what the file becomes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3.5">
        {/* The recorded statistics this route reconciles against — the
            numbers the drawing aims at, always in view. */}
        <div
          className="grid gap-[3px] rounded-lg border border-ink/15 bg-ink/[0.03] px-2.5 py-2 text-xs text-muted-foreground"
          data-testid="create-stats-recap"
        >
          <p className="font-semibold text-ink">Your watch recorded</p>
          <p className="tabular-nums">
            <span className="font-semibold text-ink">Distance</span>{" "}
            {formatDistanceForUnit(stats.distanceM, paceUnit)} ·{" "}
            <span className="font-semibold text-ink">Time</span>{" "}
            {formatDurationMs(stats.durationMs)} ·{" "}
            <span className="font-semibold text-ink">Pace</span>{" "}
            {formatPaceMs(pacePerUnitMs)} /{paceUnit}
          </p>
        </div>

        {consistency && consistency.level !== "consistent" && (
          <ConsistencyNote
            notice={consistency}
            enteredDurationMs={stats.durationMs}
          />
        )}

        {vertexCount === 0 ? (
          <p
            className="rounded-md border border-signal/40 bg-signal/[0.06] px-3 py-2 text-xs leading-relaxed text-ink"
            data-testid="create-draw-instructions"
            role="status"
          >
            Find your starting point on the map (or use{" "}
            <span className="font-semibold">Find my position</span>), then
            click to place the route point by point — the line follows real
            roads between your clicks. Pan with the P key or the mode chip;
            draw with D.
          </p>
        ) : (
          <p
            className="rounded-md border border-signal/40 bg-signal/[0.06] px-3 py-2 text-xs leading-relaxed text-ink"
            role="status"
          >
            Keep clicking to extend the route. Drag any point to adjust it,
            double-click to remove it, and finish when the line matches
            where you went.
          </p>
        )}

        <div className="grid gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full gap-1.5"
            data-testid="locate-button"
            onClick={onLocate}
            disabled={locateStatus === "locating"}
          >
            <LocateFixed className="size-3.5" aria-hidden="true" />
            {locateStatus === "locating"
              ? "Finding your position…"
              : "Find my position"}
          </Button>
          {locateNotice && locateStatus !== "locating" && (
            <p
              className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground"
              role="status"
              data-testid="locate-notice"
            >
              <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
              {locateNotice}
            </p>
          )}
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Road following sends only the points you click to a public
          routing service (OSRM / Valhalla); nothing else leaves this
          browser.
        </p>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full gap-1.5 text-muted-foreground hover:text-foreground"
          data-testid="back-to-stats-button"
          onClick={onBackToStats}
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to statistics
        </Button>
      </CardContent>
    </Card>
  );
}

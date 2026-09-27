/**
 * RouteReviewCard — Step 3 of the "create from activity stats"
 * workflow: reconcile the drawn route with the recorded distance, show
 * the final activity summary, and export the GPX.
 *
 * The recorded statistics are AUTHORITATIVE — the reconciliation
 * defaults to scaling the drawn shape to the recorded distance (the
 * spec's preference), with "keep the drawn distance" one checkbox away.
 * The summary always shows what the FILE will carry (the final distance
 * and the pace implied by time ÷ distance), never a re-statement of the
 * entered pace, and the honest notes say exactly what is estimated.
 *
 * Pure presentation: the {@link CreateReview} binding in, intents out.
 */

"use client";

import { useState } from "react";
import { ArrowLeft, Check, Download, Ruler, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { ConsistencyNote } from "@/components/create/consistency-note";
import type { CreateReview } from "@/hooks/use-create-export";
import type { ActivityStats, ConsistencyNotice } from "@/hooks/use-create-session";
import {
  formatDateTime,
  formatDistanceForUnit,
  formatDurationMs,
  formatPaceMs,
  type PaceUnit,
} from "@/lib/utils/format";
import { PACE_METERS_PER_UNIT } from "@/lib/utils/format";

export interface RouteReviewCardProps {
  review: CreateReview;
  stats: ActivityStats;
  paceUnit: PaceUnit;
  /** The confirmed statistics' cross-check verdict (null = consistent). */
  consistency: ConsistencyNotice | null;
  /** Leave the review → back to the map to keep drawing. */
  onEditRoute: () => void;
}

export function RouteReviewCard({
  review,
  stats,
  paceUnit,
  consistency,
  onEditRoute,
}: RouteReviewCardProps) {
  const { track } = review;
  const { reconciliation } = track;
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  const finalDistanceM = track.finalDistanceM;
  // The pace the FILE implies — duration ÷ final distance (the summary
  // never re-states the entered pace; it shows the file's arithmetic).
  const metersPerUnit = PACE_METERS_PER_UNIT[paceUnit];
  const impliedPaceMsPerUnit =
    finalDistanceM > 0
      ? (stats.durationMs / finalDistanceM) * metersPerUnit
      : null;

  const onExport = () => {
    const fileName = review.download();
    setDownloadedFile(fileName);
  };

  return (
    <Card className="border-[1.5px] border-ink" data-testid="route-review-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Ruler className="size-4 text-signal" aria-hidden="true" />
          Review &amp; export
        </h3>
        <CardDescription>
          The drawn route against your recorded statistics — your numbers
          stay authoritative.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Route distance reconciliation. */}
        <div
          className="grid gap-[3px] rounded-lg border border-ink/15 bg-ink/[0.03] px-2.5 py-2 text-xs tabular-nums text-muted-foreground"
          data-testid="distance-reconciliation"
        >
          <p>
            <span className="font-semibold text-ink">Recorded distance</span>{" "}
            {formatDistanceForUnit(reconciliation.recordedM, paceUnit)}
          </p>
          <p>
            <span className="font-semibold text-ink">Drawn route</span>{" "}
            {formatDistanceForUnit(reconciliation.drawnM, paceUnit)}
          </p>
          <p data-testid="distance-difference">
            <span className="font-semibold text-ink">Difference</span>{" "}
            {reconciliation.differenceM >= 0 ? "+" : "−"}
            {formatDistanceForUnit(
              Math.abs(reconciliation.differenceM),
              paceUnit,
            )}
          </p>
        </div>

        {reconciliation.needsScaling ? (
          <div className="grid gap-1.5">
            <label
              className="flex items-start gap-2.5 rounded-md border border-signal/40 bg-signal/[0.06] px-3 py-2.5 text-xs leading-relaxed text-ink"
              data-testid="match-distance-label"
            >
              <Checkbox
                checked={review.track.scaleApplied}
                onCheckedChange={(checked) =>
                  review.setMatchDistance(checked === true)
                }
                aria-label="Scale the route to match the recorded distance"
                data-testid="match-distance-toggle"
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">
                  Scale the route to your recorded distance
                </span>{" "}
                — the drawn shape is preserved and every point moves by the
                same proportion (×
                {reconciliation.scaleFactor?.toFixed(3)}). Your recorded{" "}
                {formatDistanceForUnit(reconciliation.recordedM, paceUnit)}{" "}
                stays authoritative.
              </span>
            </label>
            {reconciliation.extreme && (
              <Alert
                className="rounded-lg border-signal bg-signal/[0.08]"
                data-testid="extreme-scale-warning"
              >
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertTitle>The drawn route differs a lot</AlertTitle>
                <AlertDescription>
                  Scaling would stretch the route ×
                  {reconciliation.scaleFactor?.toFixed(2)} — consider going
                  back and drawing closer to your real distance, or keep the
                  drawn distance below.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" role="status">
            The drawn route matches your recorded distance — nothing to
            reconcile.
          </p>
        )}

        {/* The final activity summary — what the file will carry. */}
        <div className="grid gap-2" data-testid="activity-summary">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            The file will carry
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-[13px] tabular-nums">
            <dt className="text-xs font-semibold text-muted-foreground">
              Distance
            </dt>
            <dd className="flex flex-wrap items-baseline gap-2 font-semibold">
              {formatDistanceForUnit(finalDistanceM, paceUnit)}
              {track.scaleApplied && <ProvenanceBadge kind="estimated" />}
            </dd>
            <dt className="text-xs font-semibold text-muted-foreground">
              Time
            </dt>
            <dd className="font-semibold">
              {formatDurationMs(stats.durationMs)}
            </dd>
            <dt className="text-xs font-semibold text-muted-foreground">
              Average pace
            </dt>
            <dd className="font-semibold">
              {impliedPaceMsPerUnit === null
                ? "—"
                : `${formatPaceMs(impliedPaceMsPerUnit)} /${paceUnit}`}
            </dd>
            <dt className="text-xs font-semibold text-muted-foreground">
              Start
            </dt>
            <dd className="font-semibold">
              {formatDateTime(stats.startMs)}
            </dd>
            <dt className="text-xs font-semibold text-muted-foreground">
              Route
            </dt>
            <dd className="font-semibold">
              Reconstructed manually — {track.pointCount} points
            </dd>
          </dl>
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Timestamps are estimated — your recorded total time, spread
          evenly by effort along the route. No elevation is included: the
          watch recorded none, and none is invented.
        </p>

        {consistency && consistency.level !== "consistent" && (
          <ConsistencyNote
            notice={consistency}
            enteredDurationMs={stats.durationMs}
          />
        )}

        <div className="grid gap-2 border-t border-ink/10 pt-3">
          <Button
            type="button"
            className="h-10 w-full gap-1.5 text-[15px] font-bold"
            data-testid="export-gpx-button"
            onClick={onExport}
          >
            <Download className="size-4" aria-hidden="true" />
            Export GPX
          </Button>
          {downloadedFile && (
            <p
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-foreground"
              role="status"
              data-testid="export-success"
            >
              <Check className="size-3.5 text-signal" aria-hidden="true" />
              Downloaded {downloadedFile} — import it into Strava or any
              GPX platform.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full gap-1.5 text-muted-foreground hover:text-foreground"
            data-testid="edit-route-button"
            onClick={onEditRoute}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Edit route
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

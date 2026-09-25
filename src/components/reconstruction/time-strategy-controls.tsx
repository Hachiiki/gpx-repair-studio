/**
 * TimeStrategyControls — the §J-1 case matrix, rendered for the gap
 * being edited (Phase 5).
 *
 * Teaches which case applies and lets the user steer it:
 *   - both boundary timestamps → segmented strategy (By distance /
 *     Evenly / Manual — the Case 4 override with its discrepancy flag);
 *   - one or none → a manual duration is the only honest source; the
 *     controls say so and collect it (the "—" prompt answered).
 *
 * Live readouts: the resolved duration (derived vs. your estimate) and
 * the estimated pace over the RENDERED distance — always badged, per
 * §J-2 ("the system never presents estimated pace as measured pace").
 *
 * Pure presentation over the resolved `GapTimePlan` (the hook owns all
 * resolution); the pace unit is the persisted ui-store setting.
 */

"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HintTip } from "@/components/shared/hint-tip";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { ManualDurationDialog } from "@/components/reconstruction/manual-duration-dialog";
import { Pencil, TriangleAlert } from "lucide-react";
import type { GapTimePlan } from "@/hooks/use-draw-editor";
import type { TimeStrategy } from "@/types/domain";
import { useUiStore } from "@/state/ui-store";
import { formatDurationMs, formatPace } from "@/lib/utils/format";

export interface TimeStrategyControlsProps {
  /** The resolved plan of the active gap (never null while editing). */
  plan: GapTimePlan;
  /** Live rendered path length of the active gap (null when inactive). */
  distanceM: number | null;
  /** Drawn point count — pace reads only once there is a route. */
  vertexCount: number;
  /** Strategy intent (a setting — never undoable). */
  setTimeStrategy: (strategy: TimeStrategy) => void;
}

const STRATEGY_CHOICES = [
  {
    value: "distance-proportional" as const,
    label: "By distance",
    hint: "Timestamps spread in proportion to how far each point sits along the drawn route — the natural choice for an even-effort run.",
  },
  {
    value: "uniform" as const,
    label: "Evenly",
    hint: "Timestamps spread by point count, ignoring distance — mostly useful with resampling switched off.",
  },
  {
    value: "manual-duration" as const,
    label: "Manual",
    hint: "You state how long the missing stretch took. The repair's timestamps follow your value even when it disagrees with the recorded span — the disagreement is shown, never hidden.",
  },
];

export function TimeStrategyControls({
  plan,
  distanceM,
  vertexCount,
  setTimeStrategy,
}: TimeStrategyControlsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const paceUnit = useUiStore((s) => s.paceUnit);

  const bothBoundaries = plan.boundaryCase === "both-boundaries";
  const strategyKind = plan.strategy.kind;
  const manualMs =
    plan.strategy.kind === "manual-duration"
      ? plan.strategy.durationMs
      : null;

  const openDialog = () => setDialogOpen(true);
  const saveManual = (durationMs: number) =>
    setTimeStrategy({ kind: "manual-duration", durationMs });

  return (
    <div
      className="grid gap-1.5"
      data-testid="time-strategy-controls"
      role="group"
      aria-label="Time estimation"
    >
      <p className="text-xs font-medium">Timestamps for this repair</p>

      {/* The case, in plain language. */}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {bothBoundaries && plan.durationSource === "derived" && (
          <>
            The watch was paused for{" "}
            <span className="font-medium text-foreground">
              {formatDurationMs(plan.durationMs ?? 0)}
            </span>{" "}
            — your drawn route&apos;s points will span exactly that gap,
            estimated as even effort.
          </>
        )}
        {bothBoundaries && plan.durationSource === "manual" && (
          <>
            Your estimate (
            <span className="font-medium text-foreground">
              {formatDurationMs(plan.durationMs ?? 0)}
            </span>
            ) replaces the recorded span for this repair&apos;s interior —
            recorded timestamps are never changed.
          </>
        )}
        {plan.boundaryCase === "before-only" && (
          <>
            Only the start of this gap has a timestamp. Enter how long the
            missing stretch took and the interior spreads forward from it.
          </>
        )}
        {plan.boundaryCase === "after-only" && (
          <>
            Only the end of this gap has a timestamp. Enter how long the
            missing stretch took and the interior counts back from it.
          </>
        )}
        {plan.boundaryCase === "no-boundaries" && (
          <>
            No timestamps around this gap. Enter a duration to estimate its
            interior{plan.anchoredByFileStart
              ? " — it will start from your entered activity start time (its position within the activity is an assumption)."
              : " (points export without times until an activity start is entered for the file)."}
          </>
        )}
      </p>

      {/* Strategy steering. */}
      {bothBoundaries ? (
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_CHOICES.map((choice) => (
            <HintTip
              key={choice.value}
              side="left"
              title={choice.label}
              description={choice.hint}
            >
              <Button
                type="button"
                size="sm"
                variant={strategyKind === choice.value ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                aria-pressed={strategyKind === choice.value}
                data-testid={`time-strategy-${choice.value}`}
                onClick={() =>
                  choice.value === "manual-duration"
                    ? openDialog()
                    : setTimeStrategy({ kind: choice.value })
                }
              >
                {choice.label}
              </Button>
            </HintTip>
          ))}
        </div>
      ) : (
        <div>
          {plan.durationMs !== null ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              data-testid="edit-duration-button"
              onClick={openDialog}
            >
              <Pencil className="size-3" aria-hidden="true" />
              Edit duration ({formatDurationMs(plan.durationMs)})
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-xs"
              data-testid="add-duration-button"
              onClick={openDialog}
            >
              Add a duration
            </Button>
          )}
        </div>
      )}

      {/* Live duration + pace readout. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p
          className="flex items-baseline gap-1.5 text-sm"
          data-testid="gap-duration"
        >
          <span className="font-medium tabular-nums">
            {plan.durationMs === null ? "—" : formatDurationMs(plan.durationMs)}
          </span>
          <span className="text-xs text-muted-foreground">
            {plan.durationSource === "manual" ? "your estimate" : "gap duration"}
          </span>
          <ProvenanceBadge
            kind={plan.durationSource === "manual" ? "estimated" : "recorded"}
          />
        </p>
        <p
          className="flex items-baseline gap-1.5 text-sm"
          data-testid="gap-pace"
        >
          <span className="font-medium tabular-nums">
            {vertexCount > 0 && distanceM !== null && plan.durationMs !== null
              ? formatPace(plan.durationMs, distanceM, paceUnit)
              : "—"}
          </span>
          <span className="text-xs text-muted-foreground">estimated pace</span>
          <ProvenanceBadge kind="estimated" />
        </p>
      </div>

      {plan.durationMs === null && plan.missingReason && (
        <p className="text-[11px] text-muted-foreground" data-testid="time-missing-reason">
          {plan.missingReason}
        </p>
      )}

      {/* Case 4: the manual-vs-recorded disagreement, surfaced. */}
      {plan.discrepancyMs !== null && plan.recordedSpanMs !== null && (
        <Alert data-testid="duration-discrepancy">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Differs from the recorded span</AlertTitle>
          <AlertDescription>
            Your duration ({formatDurationMs(plan.durationMs ?? 0)}) disagrees
            with the recorded gap ({formatDurationMs(plan.recordedSpanMs)}).
            The repair&apos;s timestamps follow your value; the original
            timestamps stay untouched and the difference is reported in the
            statistics.
          </AlertDescription>
        </Alert>
      )}

      <ManualDurationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialDurationMs={manualMs ?? undefined}
        context="gap"
        onSave={saveManual}
      />
    </div>
  );
}

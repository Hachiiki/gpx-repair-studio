/**
 * TimeStrategyControls — the §J-1 case matrix, rendered for the gap
 * being edited (Phase 5; extended in Task 28).
 *
 * Teaches which case applies and lets the user steer it:
 *   - both boundary timestamps → segmented strategy (By distance /
 *     Evenly / Manual — the Case 4 override with its discrepancy flag);
 *   - one or none → a manual duration is the only honest source; the
 *     controls say so and collect it (the "—" prompt answered);
 *   - Task 28: when the section provides the file's recorded average
 *     pace (`paceAvailable` — the Gap Recovery section's drawn
 *     "unmeasured sections"), a fourth source joins both shapes:
 *     "From your pace" — the app estimates the duration from the drawn
 *     distance ÷ the file's pace, and the user never types a number.
 *
 * Live readouts: the resolved duration (derived vs. estimated vs. your
 * estimate) and the estimated pace over the RENDERED distance — always
 * badged, per §J-2 ("the system never presents estimated pace as
 * measured pace").
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
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
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
  /**
   * Task 28: the file's recorded average pace is available (the recovery
   * section populates it). Adds the "From your pace" strategy chip and
   * its copy; the repair studio never sets it, so its UI is unchanged.
   */
  paceAvailable?: boolean;
}

/** The strategy chips (i18n: labels and hints are t-driven). */
function getStrategyChoices(
  t: TranslatorArg,
): readonly {
  value:
    | "distance-proportional"
    | "uniform"
    | "pace-estimated"
    | "manual-duration";
  label: string;
  hint: string;
}[] {
  return [
    {
      value: "distance-proportional",
      label: t("timeStrategy.byDistance"),
      hint: t("timeStrategy.byDistanceHint"),
    },
    {
      value: "uniform",
      label: t("timeStrategy.evenly"),
      hint: t("timeStrategy.evenlyHint"),
    },
    {
      value: "pace-estimated",
      label: t("timeStrategy.paceLabel"),
      hint: t("timeStrategy.paceHint"),
    },
    {
      value: "manual-duration",
      label: t("timeStrategy.manual"),
      hint: t("timeStrategy.manualHint"),
    },
  ];
}

export function TimeStrategyControls({
  plan,
  distanceM,
  vertexCount,
  setTimeStrategy,
  paceAvailable = false,
}: TimeStrategyControlsProps) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const paceUnit = useUiStore((s) => s.paceUnit);

  const bothBoundaries = plan.boundaryCase === "both-boundaries";
  const strategyKind = plan.strategy.kind;
  const manualMs =
    plan.strategy.kind === "manual-duration"
      ? plan.strategy.durationMs
      : null;
  const paceEstimated = strategyKind === "pace-estimated";

  // The chips a boundary shape can honestly offer: both boundaries →
  // every source; one boundary → only the sources that can resolve
  // (pace + manual). No boundaries → the manual-duration flow (pace
  // needs recorded timing, which such files lack by definition).
  // A single offer (one boundary, no file pace) renders the original
  // add/edit-duration button instead of a one-chip row.
  const choices = getStrategyChoices(t).filter((choice) => {
    if (choice.value === "pace-estimated") return paceAvailable;
    if (!bothBoundaries) {
      return choice.value === "manual-duration";
    }
    return true;
  });

  const openDialog = () => setDialogOpen(true);
  const saveManual = (durationMs: number) =>
    setTimeStrategy({ kind: "manual-duration", durationMs });

  return (
    <div
      className="grid gap-2"
      data-testid="time-strategy-controls"
      role="group"
      aria-label={t("timeStrategy.groupAria")}
    >
      <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
        {t("timeStrategy.label")}
        <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
      </p>

      {/* The case, in plain language. */}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {paceEstimated && (
          <>
            {t("timeStrategy.paceIntro")}{" "}
            <span className="font-medium text-foreground">
              {plan.durationMs === null
                ? "—"
                : formatDurationMs(plan.durationMs)}
            </span>
            {t("timeStrategy.atYourPace")}
            <span className="font-medium text-foreground">
              {plan.durationMs !== null && distanceM !== null && distanceM > 0
                ? formatPace(plan.durationMs, distanceM, paceUnit)
                : "—"}
            </span>
            {t("timeStrategy.paceOutro")}
          </>
        )}
        {!paceEstimated && bothBoundaries && plan.durationSource === "derived" && (
          <>
            {t("timeStrategy.pausedFor")}{" "}
            <span className="font-medium text-foreground">
              {formatDurationMs(plan.durationMs ?? 0)}
            </span>{" "}
            {t("timeStrategy.pausedSuffix")}
          </>
        )}
        {!paceEstimated &&
          bothBoundaries &&
          plan.durationSource === "manual" && (
            <>
              {t("timeStrategy.yourEstimatePrefix")}
              <span className="font-medium text-foreground">
                {formatDurationMs(plan.durationMs ?? 0)}
              </span>
              {t("timeStrategy.yourEstimateSuffix")}
            </>
          )}
        {!paceEstimated && plan.boundaryCase === "before-only" && (
          <>{t("timeStrategy.beforeOnly")}</>
        )}
        {!paceEstimated && plan.boundaryCase === "after-only" && (
          <>{t("timeStrategy.afterOnly")}</>
        )}
        {!paceEstimated && plan.boundaryCase === "no-boundaries" && (
          <>
            {t("timeStrategy.noBoundaries")}
            {plan.anchoredByFileStart
              ? t("timeStrategy.noBoundariesAnchored")
              : t("timeStrategy.noBoundariesUnanchored")}
          </>
        )}
      </p>

      {/* Strategy steering. */}
      {choices.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((choice) => (
            <HintTip
              key={choice.value}
              side="left"
              title={choice.label}
              description={choice.hint}
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={
                  strategyKind === choice.value
                    ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper hover:bg-inkplus hover:text-paper"
                    : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                }
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
              className="h-auto gap-1.5 px-3 py-[5px] text-[12.5px]"
              data-testid="edit-duration-button"
              onClick={openDialog}
            >
              <Pencil className="size-3" aria-hidden="true" />
              {t("timeStrategy.editDuration", {
                duration: formatDurationMs(plan.durationMs),
              })}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-auto px-3 py-[5px] text-[12.5px]"
              data-testid="add-duration-button"
              onClick={openDialog}
            >
              {t("timeStrategy.addDuration")}
            </Button>
          )}
        </div>
      )}

      {/* Live duration + pace readout — the Field Plot readout box:
          an ink-ruled instrument panel with the stenciled numeral. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-lg border-[1.5px] border-ink bg-card px-3.5 py-2.5">
        <p
          className="flex items-baseline gap-2"
          data-testid="gap-duration"
        >
          <span className="font-display text-[30px] font-bold leading-none tabular-nums">
            {plan.durationMs === null ? "—" : formatDurationMs(plan.durationMs)}
          </span>
          <span className="text-[11.5px] font-medium text-muted-foreground">
            {plan.durationSource === "manual"
              ? t("timeStrategy.yourEstimate")
              : plan.durationSource === "estimated"
                ? t("timeStrategy.paceEstimate")
                : t("timeStrategy.gapDuration")}
          </span>
          <ProvenanceBadge
            kind={
              plan.durationSource === "manual" ||
              plan.durationSource === "estimated"
                ? "estimated"
                : "recorded"
            }
          />
        </p>
        <p
          className="flex items-baseline gap-2 text-[13px] font-semibold"
          data-testid="gap-pace"
        >
          <span className="tabular-nums">
            {vertexCount > 0 && distanceM !== null && plan.durationMs !== null
              ? formatPace(plan.durationMs, distanceM, paceUnit)
              : "—"}
          </span>
          <span className="text-[11.5px] font-medium text-muted-foreground">
            {t("timeStrategy.estimatedPace")}
          </span>
          <ProvenanceBadge kind="estimated" />
        </p>
      </div>

      {plan.durationMs === null && plan.missingReason && (
        <p className="text-[11px] leading-snug text-muted-foreground" data-testid="time-missing-reason">
          {plan.missingReason}
        </p>
      )}

      {/* Case 4 / PE: the estimate-vs-recorded disagreement, surfaced. */}
      {plan.discrepancyMs !== null && plan.recordedSpanMs !== null && (
        <Alert
          className="rounded-lg border-signal bg-signal/[0.08]"
          data-testid="duration-discrepancy"
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>{t("timeStrategy.discrepancyTitle")}</AlertTitle>
          <AlertDescription>
            {paceEstimated ? (
              t("timeStrategy.discrepancyPace", {
                estimate: formatDurationMs(plan.durationMs ?? 0),
                recorded: formatDurationMs(plan.recordedSpanMs),
              })
            ) : (
              t("timeStrategy.discrepancyManual", {
                duration: formatDurationMs(plan.durationMs ?? 0),
                recorded: formatDurationMs(plan.recordedSpanMs),
              })
            )}
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

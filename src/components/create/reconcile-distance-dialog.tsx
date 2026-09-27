/**
 * ReconcileDistanceDialog — the finish-time warning of the "create from
 * activity stats" workflow.
 *
 * Fires once, the moment the drawing finishes, when the drawn route's
 * distance disagrees with the recorded one beyond the notice ratio
 * (features/create/track.RECONCILE_NOTICE_RATIO). Watches routinely
 * misreport distance by a few percent and a hand-traced route along real
 * streets is often closer to what platforms will measure from the file —
 * so the DRAWN distance is what the file carries by default, and this
 * dialog says so out loud instead of deciding silently:
 *
 *   - primary   "Use drawn distance"  — keep the geometry as drawn (the
 *                default; also what closing the dialog does);
 *   - secondary "Use my watch's distance" — the escape hatch: the same
 *                shape, uniformly scaled to the recorded distance.
 *
 * Either way the recorded TOTAL TIME stands verbatim; the average pace is
 * always recomputed from the whole route (time ÷ the chosen distance).
 * When the gap is extreme (a km/miles mixup or a missed loop is the usual
 * culprit) an extra hint asks the user to double-check — a hint, never a
 * block.
 *
 * Pure presentation: props in (choice intents out). The open/close state
 * lives with the composition root (CreateStudio), the choice itself in
 * the create store (`setMatchDistance`).
 */

"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { impliedPaceMsPerUnit, type Reconciliation } from "@/hooks/use-create-session";
import {
  formatDistanceForUnit,
  formatDurationMs,
  formatPaceMs,
  type PaceUnit,
} from "@/lib/utils/format";

export interface ReconcileDistanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The recorded-vs-drawn verdict the copy renders. */
  reconciliation: Reconciliation;
  /** The recorded total time — kept verbatim either way. */
  durationMs: number;
  paceUnit: PaceUnit;
  /** Keep the drawn geometry (the default choice). */
  onUseDrawn: () => void;
  /** Scale the shape to the recorded distance (the escape hatch). */
  onUseRecorded: () => void;
}

export function ReconcileDistanceDialog({
  open,
  onOpenChange,
  reconciliation,
  durationMs,
  paceUnit,
  onUseDrawn,
  onUseRecorded,
}: ReconcileDistanceDialogProps) {
  const shorter = reconciliation.differenceM < 0;
  const percent = Math.round(reconciliation.relativeDifference * 100);
  // The pace the file implies on the drawn distance (time ÷ whole route).
  const drawnPaceMs = impliedPaceMsPerUnit(
    durationMs,
    reconciliation.drawnM,
    paceUnit,
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="rounded-[12px] border-2 border-ink"
        data-testid="reconcile-distance-dialog"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-left">
            The drawn route&apos;s distance is different from the one you
            entered
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            Your watch recorded{" "}
            <span className="font-semibold text-ink">
              {formatDistanceForUnit(reconciliation.recordedM, paceUnit)}
            </span>
            , but the route you drew measures{" "}
            <span className="font-semibold text-ink">
              {formatDistanceForUnit(reconciliation.drawnM, paceUnit)}
            </span>{" "}
            — {percent}% {shorter ? "shorter" : "longer"}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="text-left text-sm leading-relaxed text-ink">
          The file will use the{" "}
          <span className="font-semibold">drawn route&apos;s distance</span>{" "}
          instead — GPS watches often misjudge distance, and the route you
          traced is usually closer to reality. Your total time of{" "}
          <span className="font-semibold">{formatDurationMs(durationMs)}</span>{" "}
          is kept exactly as recorded, and the average pace is recalculated from
          the whole route
          {drawnPaceMs === null
            ? ""
            : ` (${formatPaceMs(drawnPaceMs)} /${paceUnit})`}
          .
        </p>

        {reconciliation.extreme && (
          <p
            className="rounded-[10px] border-[1.5px] border-ink bg-ink/[0.04] px-3 py-2 text-left text-xs leading-relaxed text-ink"
            data-testid="reconcile-extreme-hint"
            role="note"
          >
            A difference this large usually means a km/miles mixup or a missed
            loop in the drawing — double-check what you entered, or close this
            and edit the route before exporting.
          </p>
        )}

        <AlertDialogFooter className="sm:flex-col sm:items-stretch">
          <AlertDialogAction
            className="h-10 gap-1.5 font-bold"
            data-testid="use-drawn-distance-button"
            onClick={onUseDrawn}
          >
            Use drawn distance (
            {formatDistanceForUnit(reconciliation.drawnM, paceUnit)})
          </AlertDialogAction>
          <AlertDialogCancel
            className="h-10 gap-1.5 border-[1.5px] font-semibold"
            data-testid="use-recorded-distance-button"
            onClick={onUseRecorded}
          >
            Use my watch&apos;s distance (
            {formatDistanceForUnit(reconciliation.recordedM, paceUnit)})
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

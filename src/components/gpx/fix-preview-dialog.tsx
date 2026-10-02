/**
 * FixPreviewDialog (Phase 13) — the what-would-change gate.
 *
 * Every one-click fix and preset opens here BEFORE anything is applied
 * (§EE non-goals: never auto-apply without preview). The dialog renders
 * the pure `FixPlan`s' own summary lines — the plan's words, not a
 * re-derivation — plus the affected points as a textual list (the a11y
 * equivalent of the map's jump, §C-5). Confirm applies the plans (one
 * working-copy edit per plan); cancel changes nothing.
 *
 * Store-driven like every dialog in this app: `plans` null = closed.
 * The Dialog primitive traps focus and returns it to the invoker.
 */

"use client";

import { CircleCheck, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FixPlan } from "@/types/domain";
import { formatDateTime, formatLatLon } from "@/lib/utils/format";

/** One affected point, resolved by the card for the textual list. */
export interface PreviewPointInfo {
  pointId: string;
  segmentId: string;
  lat: number;
  lon: number;
  time?: number;
  ele?: number;
}

export interface FixPreviewDialogProps {
  /** The plans awaiting confirmation (null/empty = closed). */
  plans: readonly FixPlan[] | null;
  /** Heading for the batch (a fix's label, or the preset's name). */
  title: string;
  /** Resolve a point reference for the textual list (null = unknown). */
  resolvePoint: (pointId: string) => PreviewPointInfo | null;
  /** Apply the plans (the caller closes on success). */
  onConfirm: () => void;
  /** Close without applying (Esc, X, backdrop, Cancel). */
  onClose: () => void;
}

/** The point list cap — the dialog lists 30, then says how many more. */
const LISTED_POINTS_CAP = 30;

export function FixPreviewDialog({
  plans,
  title,
  resolvePoint,
  onConfirm,
  onClose,
}: FixPreviewDialogProps) {
  const open = plans !== null && plans.length > 0;
  const touched = plans?.flatMap((plan) => plan.points) ?? [];
  const shown = touched.slice(0, LISTED_POINTS_CAP);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="fix-preview-dialog"
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="border-b-[1.5px] border-ink pl-5 pr-12 pt-4">
          <DialogTitle className="flex items-center gap-2 text-left text-[17px] font-bold tracking-tight">
            <Wrench className="size-4 text-signal" aria-hidden="true" />
            {title}
          </DialogTitle>
          <DialogDescription className="mt-0.5 pb-3 text-left text-[13px] text-muted-foreground">
            Preview what would change. Nothing is applied until you confirm —
            the original file is never rewritten.
          </DialogDescription>
        </div>

        <ScrollArea className="max-h-[min(70vh,640px)]">
          <div className="grid gap-4 p-5">
            {plans?.map((plan, index) => (
              <section
                key={`${plan.kind}-${index}`}
                data-testid="fix-preview-plan"
                className="grid gap-2"
                aria-label={plan.label}
              >
                <h3 className="text-[13.5px] font-bold">
                  <span className="mr-1.5 inline-flex size-[18px] items-center justify-center rounded-[4px] border-[1.25px] border-ink/40 font-mono text-[10.5px] font-semibold">
                    {index + 1}
                  </span>
                  {plan.label}
                </h3>
                <ul className="grid gap-1.5">
                  {plan.summary.map((line, lineIndex) => (
                    <li
                      key={lineIndex}
                      className="flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground"
                    >
                      <CircleCheck
                        className="mt-0.5 size-3.5 shrink-0 text-ink/60"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {shown.length > 0 && (
              <section aria-label="Affected points" className="grid gap-2">
                <h3 className="text-[13.5px] font-bold">
                  Affected points{" "}
                  <span className="font-normal text-muted-foreground">
                    ({touched.length})
                  </span>
                </h3>
                <ul className="grid gap-1 rounded-lg border-[1.25px] border-ink/15 px-3 py-2.5">
                  {shown.map((ref, index) => {
                    const info = resolvePoint(ref.pointId);
                    return (
                      <li
                        key={`${ref.pointId}-${index}`}
                        className="text-[11.5px] leading-relaxed text-muted-foreground"
                      >
                        <span className="font-mono text-[10.5px] text-ink">
                          {ref.pointId}
                        </span>
                        {info ? (
                          <>
                            {" · "}
                            <span className="font-mono text-[10.5px]">
                              {formatLatLon(info.lat, info.lon)}
                            </span>
                            {info.ele !== undefined
                              ? ` · ${Math.round(info.ele)} m`
                              : ""}
                            {info.time !== undefined
                              ? ` · ${formatDateTime(info.time)}`
                              : ""}
                          </>
                        ) : (
                          " · unknown position"
                        )}
                      </li>
                    );
                  })}
                  {touched.length > shown.length && (
                    <li className="text-[11.5px] text-muted-foreground">
                      …and {touched.length - shown.length} more
                    </li>
                  )}
                </ul>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  The list above is the text equivalent of the map view —
                  every affected point is identifiable without the map.
                </p>
              </section>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t-[1.5px] border-ink px-5 py-3.5">
          <button
            type="button"
            data-testid="fix-preview-cancel"
            className="rounded-[8px] border-[1.5px] border-ink/35 bg-card px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-ink hover:text-foreground focus-visible:outline-2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="fix-preview-confirm"
            className="rounded-[8px] border-[1.5px] border-signal bg-signal px-3.5 py-2 text-[13px] font-bold text-inkplus transition-colors hover:bg-signal/90 focus-visible:outline-2"
            onClick={onConfirm}
          >
            Apply{" "}
            {plans && plans.length > 1 ? `${plans.length} fixes` : "fix"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

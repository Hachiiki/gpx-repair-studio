/**
 * OnboardingTour (Phase 11) — the first-run, 4-step overlay.
 *
 * A guided introduction over the landing's tool cards: the local-first
 * promise, the six tools, the pen system, and the honest-numbers /
 * autosave guarantees. Auto-opens once per browser (the controller
 * decides when — hooks/use-onboarding-tour); the landing's "Take the
 * tour" link replays it anytime.
 *
 * Built on the Dialog primitive for the Phase 8 contract: focus trap,
 * Esc to close (writes the flag — every exit counts as "seen"), and
 * focus returned to the trigger on close. Each step's heading receives
 * focus on entry, so screen readers hear the step turn.
 *
 * Pure presentation: the controller prop carries every behavior. The
 * copy is a contract — nothing here promises what the app does not do.
 */

"use client";

import { useEffect, useRef } from "react";
import {
  History,
  LayoutGrid,
  PenLine,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OnboardingTourController } from "@/hooks/use-onboarding-tour";
import { ONBOARDING_TOUR_STEPS } from "@/hooks/use-onboarding-tour";
import { cn } from "@/lib/utils";

/** One step of the tour — icon, title, and one honest paragraph. */
export interface TourStep {
  icon: LucideIcon;
  kicker: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    icon: ShieldCheck,
    kicker: "Privacy first",
    title: "Your files stay on this device",
    body: "Uploading, parsing, gap detection, drawing, statistics, and export all happen in this browser tab. There is no account, and no copy of anything you open here exists anywhere else. The only network requests are map tiles — plus the road-follow and elevation lookups you explicitly trigger.",
  },
  {
    icon: LayoutGrid,
    kicker: "The workbench",
    title: "Pick a tool",
    body: "Six cards, six jobs: repair a recording, create a share card, recover a GPS gap, create an activity from its stats, combine recordings, or plan a route. Each opens its own workspace — with the same map, the same pens, and its own file.",
  },
  {
    icon: PenLine,
    kicker: "Drawing",
    title: "Draw, then refine",
    body: "The Default pen places points that follow real roads or footpaths; the Curve pen draws freehand. Switch to Move (M) to drag any point into place — and everything undoes, step by step.",
  },
  {
    icon: History,
    kicker: "The guarantees",
    title: "Nothing is lost, nothing is invented",
    body: "Statistics always separate recorded data from your reconstructions, and exports carry those markers into Strava and every other platform. Unfinished work is autosaved on this device and offered back the next time you return.",
  },
];

export interface OnboardingTourProps {
  /** The controller (hooks/use-onboarding-tour) — every behavior. */
  tour: OnboardingTourController;
}

export function OnboardingTour({ tour }: OnboardingTourProps) {
  const open = tour.step !== null;
  const step = TOUR_STEPS[tour.step ?? 0];
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Announce each step turn: the heading takes focus, so a screen
  // reader hears the new step's title the moment it shows.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, tour.step]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && tour.close()}>
      <DialogContent
        data-testid="onboarding-tour"
        showCloseButton={false}
        aria-describedby={`tour-step-body-${tour.step ?? 0}`}
        className="gap-0 p-0 sm:max-w-md"
      >
        {/* The step's header: mono kicker + display title, the Field
            Plot card voice. The icon plate spends the orange once. */}
        <div className="flex items-start gap-3.5 p-6 pb-4">
          <span className="inline-flex shrink-0 rounded-[10px] border-[1.5px] border-signal bg-signal/10 p-2.5">
            <step.icon className="size-[22px] text-signal" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-shade">
              {step.kicker}
            </p>
            <DialogTitle
              ref={headingRef}
              tabIndex={-1}
              data-testid={`tour-step-title-${tour.step ?? 0}`}
              className="mt-1 text-left text-[21px] leading-tight focus-visible:outline-none"
            >
              {step.title}
            </DialogTitle>
          </div>
        </div>

        <DialogDescription
          id={`tour-step-body-${tour.step ?? 0}`}
          data-testid={`tour-step-body-${tour.step ?? 0}`}
          className="px-6 text-left text-[14px] leading-relaxed text-muted-foreground"
        >
          {step.body}
        </DialogDescription>

        {/* Footer: progress + controls. Skip is honest (it counts as
            seen), Back/Next walk the steps, "Get started" finishes. */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t-[1.5px] border-ink/15 p-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="tour-skip"
            onClick={tour.close}
          >
            Skip
          </Button>

          <div className="flex items-center gap-3">
            {/* Step dots + an sr-only count for assistive tech. */}
            <div
              className="flex items-center gap-1.5"
              aria-hidden="true"
              data-testid="tour-dots"
            >
              {TOUR_STEPS.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "size-1.5 rounded-full",
                    index === tour.step
                      ? "bg-signal"
                      : index < (tour.step ?? 0)
                        ? "bg-ink/40"
                        : "bg-ink/15",
                  )}
                />
              ))}
            </div>
            <span className="sr-only" data-testid="tour-step-count">
              Step {(tour.step ?? 0) + 1} of {ONBOARDING_TOUR_STEPS}
            </span>

            {(tour.step ?? 0) > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tour-back"
                onClick={tour.back}
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              data-testid="tour-next"
              onClick={tour.next}
            >
              {(tour.step ?? 0) >= ONBOARDING_TOUR_STEPS - 1
                ? "Get started"
                : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

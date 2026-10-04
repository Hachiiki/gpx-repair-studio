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
 *
 * Phase 21: the step content is a KEY map (icons stay code-side);
 * getTourSteps(t) resolves the display strings through the
 * translator, so a locale switch re-renders the tour.
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
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
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

/** One step's copy as dictionary keys (the icon stays code-side). */
interface TourStepCopy {
  icon: LucideIcon;
  kickerKey: string;
  titleKey: string;
  bodyKey: string;
}

/**
 * The four steps' content — keys into the tours dictionary
 * (`onboarding.step<N>.kicker|title|body`).
 */
const ONBOARDING_TOUR_COPY: readonly TourStepCopy[] = [
  {
    icon: ShieldCheck,
    kickerKey: "onboarding.step1.kicker",
    titleKey: "onboarding.step1.title",
    bodyKey: "onboarding.step1.body",
  },
  {
    icon: LayoutGrid,
    kickerKey: "onboarding.step2.kicker",
    titleKey: "onboarding.step2.title",
    bodyKey: "onboarding.step2.body",
  },
  {
    icon: PenLine,
    kickerKey: "onboarding.step3.kicker",
    titleKey: "onboarding.step3.title",
    bodyKey: "onboarding.step3.body",
  },
  {
    icon: History,
    kickerKey: "onboarding.step4.kicker",
    titleKey: "onboarding.step4.title",
    bodyKey: "onboarding.step4.body",
  },
];

/** Resolve the tour's display strings for one locale. */
export function getTourSteps(t: TranslatorArg): readonly TourStep[] {
  return ONBOARDING_TOUR_COPY.map((step) => ({
    icon: step.icon,
    kicker: t(step.kickerKey),
    title: t(step.titleKey),
    body: t(step.bodyKey),
  }));
}

export interface OnboardingTourProps {
  /** The controller (hooks/use-onboarding-tour) — every behavior. */
  tour: OnboardingTourController;
}

export function OnboardingTour({ tour }: OnboardingTourProps) {
  const { t } = useI18n();
  const open = tour.step !== null;
  const steps = getTourSteps(t);
  const step = steps[tour.step ?? 0];
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
            {t("onboarding.skip")}
          </Button>

          <div className="flex items-center gap-3">
            {/* Step dots + an sr-only count for assistive tech. */}
            <div
              className="flex items-center gap-1.5"
              aria-hidden="true"
              data-testid="tour-dots"
            >
              {steps.map((_, index) => (
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
              {t("onboarding.stepCount", {
                current: (tour.step ?? 0) + 1,
                count: ONBOARDING_TOUR_STEPS,
              })}
            </span>

            {(tour.step ?? 0) > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tour-back"
                onClick={tour.back}
              >
                {t("onboarding.back")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              data-testid="tour-next"
              onClick={tour.next}
            >
              {(tour.step ?? 0) >= ONBOARDING_TOUR_STEPS - 1
                ? t("onboarding.getStarted")
                : t("onboarding.next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

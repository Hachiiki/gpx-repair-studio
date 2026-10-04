/**
 * ToolTour (Phase 19 — §EE 19.3) — the per-tool guided walkthrough
 * dialog, plus every tour's step content.
 *
 * The Phase 11 onboarding tour's shape, generalized: same Dialog
 * primitive (focus trap, Esc = seen, focus return), same footer
 * rhythm (Skip · dots · Back · Next), one addition — a step may
 * carry an ACTION that loads the tour's teaching payload (the Phase
 * 12 samples ride the same pipelines as uploads). The action button
 * shows only while the AppShell says it can run (a sample can load),
 * and running it advances the tour: the next step describes what just
 * appeared on screen.
 *
 * The copy is a contract, like everywhere else: no step promises what
 * the app does not do, and every provenance word matches the cards'.
 *
 * Phase 21: the tour content is a KEY map (icons stay code-side);
 * getToolTours(t) resolves the display strings through the
 * translator, so a locale switch re-renders every walkthrough.
 */

"use client";

import { useEffect, useRef } from "react";
import {
  ArrowUpDown,
  Calculator,
  Clock,
  Download,
  FileArchive,
  GitCompareArrows,
  GitMerge,
  Image,
  Map as MapIcon,
  Palette,
  PenLine,
  Route,
  ScanSearch,
  Sparkles,
  UploadCloud,
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
import { TOOL_TOUR_STEPS } from "@/hooks/use-tool-tours";
import type { ToolToursController } from "@/hooks/use-tool-tours";
import type { ToolTourId } from "@/lib/storage/tour-flag";
import { cn } from "@/lib/utils";

/** One step of a tool tour — the onboarding step plus an action. */
export interface ToolTourStep {
  icon: LucideIcon;
  kicker: string;
  title: string;
  body: string;
  /** Optional payload action (loads the tour's teaching sample). */
  actionLabel?: string;
}

export interface ToolTourDefinition {
  /** The tour's name (the offer banner and the help list use it). */
  title: string;
  /** What the tour teaches (one line, the help dialog's blurb). */
  blurb: string;
  steps: readonly ToolTourStep[];
}

/** One step's copy as dictionary keys (the icon stays code-side). */
interface ToolTourStepCopy {
  icon: LucideIcon;
  kickerKey: string;
  titleKey: string;
  bodyKey: string;
  /** Optional payload action (loads the tour's teaching sample). */
  actionKey?: string;
}

/** One tour's copy as dictionary keys. */
interface ToolTourDefinitionCopy {
  titleKey: string;
  blurbKey: string;
  steps: readonly ToolTourStepCopy[];
}

/**
 * The seven walkthroughs' content — keys into the tours dictionary
 * (`tour.<tool>.title` / `.blurb` / `.step<N>.kicker|title|body` /
 * optional `.step<N>.action`), icons and step order code-side.
 */
const TOOL_TOUR_COPY: Record<ToolTourId, ToolTourDefinitionCopy> = {
  repair: {
    titleKey: "tour.repair.title",
    blurbKey: "tour.repair.blurb",
    steps: [
      {
        icon: UploadCloud,
        kickerKey: "tour.repair.step1.kicker",
        titleKey: "tour.repair.step1.title",
        bodyKey: "tour.repair.step1.body",
        actionKey: "tour.repair.step1.action",
      },
      {
        icon: ScanSearch,
        kickerKey: "tour.repair.step2.kicker",
        titleKey: "tour.repair.step2.title",
        bodyKey: "tour.repair.step2.body",
      },
      {
        icon: GitCompareArrows,
        kickerKey: "tour.repair.step3.kicker",
        titleKey: "tour.repair.step3.title",
        bodyKey: "tour.repair.step3.body",
      },
      {
        icon: Download,
        kickerKey: "tour.repair.step4.kicker",
        titleKey: "tour.repair.step4.title",
        bodyKey: "tour.repair.step4.body",
      },
    ],
  },
  share: {
    titleKey: "tour.share.title",
    blurbKey: "tour.share.blurb",
    steps: [
      {
        icon: Image,
        kickerKey: "tour.share.step1.kicker",
        titleKey: "tour.share.step1.title",
        bodyKey: "tour.share.step1.body",
        actionKey: "tour.share.step1.action",
      },
      {
        icon: Palette,
        kickerKey: "tour.share.step2.kicker",
        titleKey: "tour.share.step2.title",
        bodyKey: "tour.share.step2.body",
      },
      {
        icon: Download,
        kickerKey: "tour.share.step3.kicker",
        titleKey: "tour.share.step3.title",
        bodyKey: "tour.share.step3.body",
      },
    ],
  },
  recovery: {
    titleKey: "tour.recovery.title",
    blurbKey: "tour.recovery.blurb",
    steps: [
      {
        icon: Route,
        kickerKey: "tour.recovery.step1.kicker",
        titleKey: "tour.recovery.step1.title",
        bodyKey: "tour.recovery.step1.body",
        actionKey: "tour.recovery.step1.action",
      },
      {
        icon: PenLine,
        kickerKey: "tour.recovery.step2.kicker",
        titleKey: "tour.recovery.step2.title",
        bodyKey: "tour.recovery.step2.body",
      },
      {
        icon: Clock,
        kickerKey: "tour.recovery.step3.kicker",
        titleKey: "tour.recovery.step3.title",
        bodyKey: "tour.recovery.step3.body",
      },
      {
        icon: Download,
        kickerKey: "tour.recovery.step4.kicker",
        titleKey: "tour.recovery.step4.title",
        bodyKey: "tour.recovery.step4.body",
      },
    ],
  },
  create: {
    titleKey: "tour.create.title",
    blurbKey: "tour.create.blurb",
    steps: [
      {
        icon: Calculator,
        kickerKey: "tour.create.step1.kicker",
        titleKey: "tour.create.step1.title",
        bodyKey: "tour.create.step1.body",
      },
      {
        icon: PenLine,
        kickerKey: "tour.create.step2.kicker",
        titleKey: "tour.create.step2.title",
        bodyKey: "tour.create.step2.body",
      },
      {
        icon: Sparkles,
        kickerKey: "tour.create.step3.kicker",
        titleKey: "tour.create.step3.title",
        bodyKey: "tour.create.step3.body",
      },
      {
        icon: Image,
        kickerKey: "tour.create.step4.kicker",
        titleKey: "tour.create.step4.title",
        bodyKey: "tour.create.step4.body",
      },
    ],
  },
  merge: {
    titleKey: "tour.merge.title",
    blurbKey: "tour.merge.blurb",
    steps: [
      {
        icon: GitMerge,
        kickerKey: "tour.merge.step1.kicker",
        titleKey: "tour.merge.step1.title",
        bodyKey: "tour.merge.step1.body",
        actionKey: "tour.merge.step1.action",
      },
      {
        icon: ArrowUpDown,
        kickerKey: "tour.merge.step2.kicker",
        titleKey: "tour.merge.step2.title",
        bodyKey: "tour.merge.step2.body",
      },
      {
        icon: Route,
        kickerKey: "tour.merge.step3.kicker",
        titleKey: "tour.merge.step3.title",
        bodyKey: "tour.merge.step3.body",
      },
      {
        icon: Download,
        kickerKey: "tour.merge.step4.kicker",
        titleKey: "tour.merge.step4.title",
        bodyKey: "tour.merge.step4.body",
      },
    ],
  },
  plan: {
    titleKey: "tour.plan.title",
    blurbKey: "tour.plan.blurb",
    steps: [
      {
        icon: MapIcon,
        kickerKey: "tour.plan.step1.kicker",
        titleKey: "tour.plan.step1.title",
        bodyKey: "tour.plan.step1.body",
      },
      {
        icon: PenLine,
        kickerKey: "tour.plan.step2.kicker",
        titleKey: "tour.plan.step2.title",
        bodyKey: "tour.plan.step2.body",
      },
      {
        icon: Sparkles,
        kickerKey: "tour.plan.step3.kicker",
        titleKey: "tour.plan.step3.title",
        bodyKey: "tour.plan.step3.body",
      },
      {
        icon: Route,
        kickerKey: "tour.plan.step4.kicker",
        titleKey: "tour.plan.step4.title",
        bodyKey: "tour.plan.step4.body",
      },
    ],
  },
  batch: {
    titleKey: "tour.batch.title",
    blurbKey: "tour.batch.blurb",
    steps: [
      {
        icon: FileArchive,
        kickerKey: "tour.batch.step1.kicker",
        titleKey: "tour.batch.step1.title",
        bodyKey: "tour.batch.step1.body",
        actionKey: "tour.batch.step1.action",
      },
      {
        icon: Sparkles,
        kickerKey: "tour.batch.step2.kicker",
        titleKey: "tour.batch.step2.title",
        bodyKey: "tour.batch.step2.body",
      },
      {
        icon: FileArchive,
        kickerKey: "tour.batch.step3.kicker",
        titleKey: "tour.batch.step3.title",
        bodyKey: "tour.batch.step3.body",
      },
      {
        icon: Download,
        kickerKey: "tour.batch.step4.kicker",
        titleKey: "tour.batch.step4.title",
        bodyKey: "tour.batch.step4.body",
      },
    ],
  },
};

/** Resolve every tour's display strings for one locale. */
export function getToolTours(
  t: TranslatorArg,
): Record<ToolTourId, ToolTourDefinition> {
  const resolve = (copy: ToolTourDefinitionCopy): ToolTourDefinition => ({
    title: t(copy.titleKey),
    blurb: t(copy.blurbKey),
    steps: copy.steps.map((step) => ({
      icon: step.icon,
      kicker: t(step.kickerKey),
      title: t(step.titleKey),
      body: t(step.bodyKey),
      ...(step.actionKey !== undefined
        ? { actionLabel: t(step.actionKey) }
        : {}),
    })),
  });
  return {
    repair: resolve(TOOL_TOUR_COPY.repair),
    share: resolve(TOOL_TOUR_COPY.share),
    recovery: resolve(TOOL_TOUR_COPY.recovery),
    create: resolve(TOOL_TOUR_COPY.create),
    merge: resolve(TOOL_TOUR_COPY.merge),
    plan: resolve(TOOL_TOUR_COPY.plan),
    batch: resolve(TOOL_TOUR_COPY.batch),
  };
}

export interface ToolTourDialogProps {
  /** The controller (hooks/use-tool-tours) — every behavior. */
  tour: ToolToursController;
  /** Whether the active tour's action can run right now. */
  actionAvailable: boolean;
}

export function ToolTourDialog({ tour, actionAvailable }: ToolTourDialogProps) {
  const { t } = useI18n();
  const open = tour.active !== null && tour.step !== null;
  const activeId = tour.active;
  const definition = activeId !== null ? getToolTours(t)[activeId] : null;
  const stepIndex = tour.step ?? 0;
  const step = definition !== null ? definition.steps[stepIndex] : null;
  const stepCount = activeId !== null ? TOOL_TOUR_STEPS[activeId] : 0;
  const action = step?.actionLabel !== undefined && actionAvailable;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Announce each step turn (the onboarding tour's contract).
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, tour.step]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && tour.close()}>
      <DialogContent
        data-testid="tool-tour"
        data-tour-id={activeId ?? ""}
        showCloseButton={false}
        aria-describedby={`tool-tour-body-${stepIndex}`}
        className="gap-0 p-0 sm:max-w-md"
      >
        {/* The step header — the onboarding tour's voice. */}
        <div className="flex items-start gap-3.5 p-6 pb-4">
          <span className="inline-flex shrink-0 rounded-[10px] border-[1.5px] border-signal bg-signal/10 p-2.5">
            {step && <step.icon className="size-[22px] text-signal" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-shade">
              {step?.kicker ?? ""}
            </p>
            <DialogTitle
              ref={headingRef}
              tabIndex={-1}
              data-testid={`tool-tour-step-title-${stepIndex}`}
              className="mt-1 text-left text-[21px] leading-tight focus-visible:outline-none"
            >
              {step?.title ?? ""}
            </DialogTitle>
          </div>
        </div>

        <DialogDescription
          id={`tool-tour-body-${stepIndex}`}
          data-testid={`tool-tour-step-body-${stepIndex}`}
          className="px-6 text-left text-[14px] leading-relaxed text-muted-foreground"
        >
          {step?.body ?? ""}
        </DialogDescription>

        {/* Footer: Skip · dots · (action) · Back · Next. */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t-[1.5px] border-ink/15 p-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="tool-tour-skip"
            onClick={tour.close}
          >
            {t("tour.skip")}
          </Button>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5"
              aria-hidden="true"
              data-testid="tool-tour-dots"
            >
              {(definition?.steps ?? []).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "size-1.5 rounded-full",
                    index === stepIndex
                      ? "bg-signal"
                      : index < stepIndex
                        ? "bg-ink/40"
                        : "bg-ink/15",
                  )}
                />
              ))}
            </div>
            <span className="sr-only" data-testid="tool-tour-step-count">
              {t("tour.stepCount", { current: stepIndex + 1, count: stepCount })}
            </span>

            {stepIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tool-tour-back"
                onClick={tour.back}
              >
                {t("tour.back")}
              </Button>
            )}
            {action && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tool-tour-action"
                onClick={tour.runAction}
              >
                {step.actionLabel}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              data-testid="tool-tour-next"
              onClick={tour.next}
            >
              {stepIndex >= stepCount - 1
                ? t("tour.getStarted")
                : t("tour.next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface ToolTourOfferProps {
  /** The controller (hooks/use-tool-tours). */
  tour: ToolToursController;
}

/** The dismissible first-visit strip above a tool's workspace. */
export function ToolTourOffer({ tour }: ToolTourOfferProps) {
  const { t } = useI18n();
  const offerId = tour.offer;
  if (offerId === null) return null;
  const definition = getToolTours(t)[offerId];
  const stepCount = TOOL_TOUR_STEPS[offerId];
  const firstStep = definition.steps[0];
  return (
    <div
      data-testid="tool-tour-offer"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border-[1.5px] border-signal/50 bg-signal/[0.06] px-3.5 py-2.5"
    >
      <span
        className="inline-flex shrink-0 rounded-[8px] border-[1.5px] border-signal bg-card p-1.5"
        aria-hidden="true"
      >
        {firstStep && <firstStep.icon className="size-4 text-signal" />}
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
        <span className="font-semibold text-ink">
          {t("tour.offer.new", { title: definition.title })}
        </span>{" "}
        {t("tour.offer.meta", { count: stepCount })}
        {firstStep?.actionLabel ? t("tour.offer.samples") : ""}.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid="tool-tour-offer-start"
          onClick={() => tour.start(offerId)}
          className="inline-flex items-center gap-1.5 rounded-[6px] border-[1.5px] border-ink bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-[0_1.5px_0_0_var(--ink)] transition-colors hover:bg-ink/[0.05] focus-visible:outline-2"
        >
          {t("tour.offer.start")}
        </button>
        <button
          type="button"
          data-testid="tool-tour-offer-dismiss"
          onClick={tour.dismissOffer}
          className="rounded-[6px] px-2 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-ink focus-visible:outline-2"
        >
          {t("tour.offer.dismiss")}
        </button>
      </div>
    </div>
  );
}

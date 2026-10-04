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

export const TOOL_TOURS: Record<ToolTourId, ToolTourDefinition> = {
  repair: {
    title: "Repair a recording",
    blurb: "Find the defects, fix them with previews, see exactly what changed.",
    steps: [
      {
        icon: UploadCloud,
        kicker: "Repair · Step 1",
        title: "Start with a recording",
        body: "Drop a GPX, TCX, or FIT file onto the upload zone — or load the bundled sample ride, which carries two GPS gaps and a handful of deep defects to practice on. Everything parses in this tab; the file on disk is never touched.",
        actionLabel: "Load the sample ride",
      },
      {
        icon: ScanSearch,
        kicker: "Repair · Step 2",
        title: "Find the problems",
        body: "The deep-validation card walks the recording for teleports, duplicate points, reversed timestamps, elevation spikes, GPS drift, and missing altitude. Every finding previews its fix before you confirm anything — and confirmed fixes land on a working copy you can undo.",
      },
      {
        icon: GitCompareArrows,
        kicker: "Repair · Step 3",
        title: "See what changed",
        body: "The Before/after card overlays the original as a dashed ghost under your working copy and highlights every touched stretch in orange; side-by-side shows both pictures at one scale, and the delta table counts the differences. The repair summary prints as a sheet for your records.",
      },
      {
        icon: Download,
        kicker: "Repair · Step 4",
        title: "Export with provenance",
        body: "Review & export writes the repaired file with gpxr markers that disclose every change — Strava and every other platform keeps them, so nothing pretends to be recorded data. The original stays on your disk exactly as it was.",
      },
    ],
  },
  share: {
    title: "Share card",
    blurb: "Turn a clean run into a picture worth posting.",
    steps: [
      {
        icon: Image,
        kicker: "Share card · Step 1",
        title: "A picture of your activity",
        body: "Upload the recording you want to show off — a clean continuous run works best — or load the bundled steady-run sample. The card renders from the same parsed data as every other tool, in this tab.",
        actionLabel: "Load the sample run",
      },
      {
        icon: Palette,
        kicker: "Share card · Step 2",
        title: "Make it yours",
        body: "Themes, artwork, units, and the route's framing live on the card itself — click around and watch it re-render live. The numbers carry their provenance just like the statistics panel.",
      },
      {
        icon: Download,
        kicker: "Share card · Step 3",
        title: "PNG, rendered locally",
        body: "Download the card as an image when it looks right. It was drawn entirely in your browser — no server ever saw the file.",
      },
    ],
  },
  recovery: {
    title: "Gap recovery",
    blurb: "Redraw the stretch your GPS dropped, with honest timestamps.",
    steps: [
      {
        icon: Route,
        kicker: "Recovery · Step 1",
        title: "A recording with a hole",
        body: "Upload a file whose GPS dropped for a stretch — it needs timestamps on both sides of the hole so the missing interval can be detected. The bundled sample ride has exactly that; load it to follow along.",
        actionLabel: "Load the sample ride",
      },
      {
        icon: PenLine,
        kicker: "Recovery · Step 2",
        title: "Draw the missing route",
        body: "Open the gap and draw: the Default pen places points that follow real roads or footpaths, the Curve pen draws freehand, and Move (M) drags any point afterward. Everything undoes, step by step.",
      },
      {
        icon: Clock,
        kicker: "Recovery · Step 3",
        title: "Time is estimated — and labeled",
        body: "The recovered stretch's timestamps are interpolated, and the app says so everywhere: the pace rows, the statistics panel, and the export's markers. Nothing invented is presented as recorded.",
      },
      {
        icon: Download,
        kicker: "Recovery · Step 4",
        title: "Export the whole activity",
        body: "The export writes recorded data and your recovered stretch in one file, with gpxr markers disclosing which is which.",
      },
    ],
  },
  create: {
    title: "Create from stats",
    blurb: "Turn numbers from another app into a drawn route.",
    steps: [
      {
        icon: Calculator,
        kicker: "Create · Step 1",
        title: "From your numbers",
        body: "Type the distance, duration, and elevation your watch recorded somewhere else. The form prefills example numbers if you just want to see how it works — nothing is uploaded anywhere.",
      },
      {
        icon: PenLine,
        kicker: "Create · Step 2",
        title: "Draw the route",
        body: "Draw the route you actually took: click by click with road-following, or freehand with the Curve pen. The live distance readout keeps score against your target.",
      },
      {
        icon: Sparkles,
        kicker: "Create · Step 3",
        title: "Refine until it fits",
        body: "Move points, undo anything, and watch the numbers reconcile. When the drawn route matches the real activity, it is done — no guessing hidden anywhere.",
      },
      {
        icon: Image,
        kicker: "Create · Step 4",
        title: "Share it if you like",
        body: "The review track can become a share card, exactly like an uploaded activity. Your original numbers stay in the session if you come back to adjust.",
      },
    ],
  },
  merge: {
    title: "Merge recordings",
    blurb: "Combine two or more recordings into one honest route.",
    steps: [
      {
        icon: GitMerge,
        kicker: "Merge · Step 1",
        title: "Two or more recordings",
        body: "Add the files in the order you rode or ran them — a commute split in two, a watch that died mid-ride, an activity broken by a pause. The bundled sample pair is a two-part commute you can load with one click.",
        actionLabel: "Load the sample pair",
      },
      {
        icon: ArrowUpDown,
        kicker: "Merge · Step 2",
        title: "Arrange the chain",
        body: "Drag the files into order or sort by start time. The chained preview shows how the pieces connect, end to start, with the joins disclosed.",
      },
      {
        icon: Route,
        kicker: "Merge · Step 3",
        title: "One route, honestly",
        body: "The combined route reconciles the overlaps and carries the merged statistics — with each file's own numbers still one click away.",
      },
      {
        icon: Download,
        kicker: "Merge · Step 4",
        title: "Export the combined file",
        body: "One GPX out, provenance preserved: the export notes where the pieces came from.",
      },
    ],
  },
  plan: {
    title: "Plan a route",
    blurb: "A draw-and-measure scratchpad for the route you're thinking about.",
    steps: [
      {
        icon: MapIcon,
        kicker: "Plan · Step 1",
        title: "A scratchpad, not a session",
        body: "No file needed — start planning and the map is yours. Draw the route you're thinking about, from scratch or around a place you know.",
      },
      {
        icon: PenLine,
        kicker: "Plan · Step 2",
        title: "Draw and measure",
        body: "The same pens as everywhere else: click-by-click with road-following, freehand curves, and draggable points. The distance readout updates with every change.",
      },
      {
        icon: Sparkles,
        kicker: "Plan · Step 3",
        title: "Check your work",
        body: "The plan's numbers — distance, the route's shape, the elevation profile when you ask for it — stay live while you refine. Undo everything, step by step.",
      },
      {
        icon: Route,
        kicker: "Plan · Step 4",
        title: "When it's right",
        body: "Plans stay on this device — there is no export here by design, just a clear route to draw into your usual planning app once it feels right. Unfinished plans are autosaved and offered back next visit.",
      },
    ],
  },
  batch: {
    title: "Batch cleanup",
    blurb: "One preset across a folder of files, one ZIP out, sessions to keep.",
    steps: [
      {
        icon: FileArchive,
        kicker: "Batch · Step 1",
        title: "Many files, one pass",
        body: "Queue up to fifty files at once — the whole season's exports, the folder from your old watch. Each parses one at a time with its own status; nothing is uploaded anywhere. Load two sample files to see the flow.",
        actionLabel: "Load two sample files",
      },
      {
        icon: Sparkles,
        kicker: "Batch · Step 2",
        title: "One preset, per-file previews",
        body: "Pick a preset and every file previews exactly what it would change — point by point, file by file. Confirm applies it across the queue, and any file's last fix undoes on its own.",
      },
      {
        icon: FileArchive,
        kicker: "Batch · Step 3",
        title: "One ZIP out",
        body: "Download everything at once: one repaired GPX per file plus a MANIFEST.txt that states, for each file, exactly what changed and what did not. Files with no issues export unchanged.",
      },
      {
        icon: Download,
        kicker: "Batch · Step 4",
        title: "Come back anytime",
        body: "The queue can be saved as a named session — exported as a .gpxrepair.json file that carries the originals and every fix, and reopened here on any device.",
      },
    ],
  },
};

export interface ToolTourDialogProps {
  /** The controller (hooks/use-tool-tours) — every behavior. */
  tour: ToolToursController;
  /** Whether the active tour's action can run right now. */
  actionAvailable: boolean;
}

export function ToolTourDialog({ tour, actionAvailable }: ToolTourDialogProps) {
  const open = tour.active !== null && tour.step !== null;
  const activeId = tour.active;
  const definition = activeId !== null ? TOOL_TOURS[activeId] : null;
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
            Skip
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
              Step {stepIndex + 1} of {stepCount}
            </span>

            {stepIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tool-tour-back"
                onClick={tour.back}
              >
                Back
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
              {stepIndex >= stepCount - 1 ? "Get started" : "Next"}
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
  const offerId = tour.offer;
  if (offerId === null) return null;
  const definition = TOOL_TOURS[offerId];
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
          New: the {definition.title} walkthrough.
        </span>{" "}
        {stepCount} steps, about a minute
        {firstStep?.actionLabel ? " — teaching samples included" : ""}.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid="tool-tour-offer-start"
          onClick={() => tour.start(offerId)}
          className="inline-flex items-center gap-1.5 rounded-[6px] border-[1.5px] border-ink bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-[0_1.5px_0_0_var(--ink)] transition-colors hover:bg-ink/[0.05] focus-visible:outline-2"
        >
          Start
        </button>
        <button
          type="button"
          data-testid="tool-tour-offer-dismiss"
          onClick={tour.dismissOffer}
          className="rounded-[6px] px-2 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-ink focus-visible:outline-2"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

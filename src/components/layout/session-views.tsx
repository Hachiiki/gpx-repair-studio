/**
 * SessionViews — the non-workspace session states (AppShell
 * reorganization pass).
 *
 * AppShell is the composition root (§D-6 "App.tsx rule"): it wires the
 * session hooks and picks the view. These are the views it picks while
 * there is no workspace yet — the landing (which doubles as the retry
 * surface when a load attempt failed) and the parsing state. Pure
 * presentation: props in, intents out, no session logic.
 *
 * Task 42: the landing is TWO pages now, and SessionIdleView dispatches
 * between them. "home" is the tool cards (LandingCardsView — one card
 * per destination); "tool" is the selected tool's detail page
 * (ToolDetailView below), which carries everything the old tab swap
 * used to reveal: the hero, the "How it works" trio, the tool facts,
 * and the intake. The mode toggle is gone — opening a card is the only
 * way in, and "All tools" is the only way back, so the remembered
 * intent and the open page can never disagree.
 *
 * The detail page speaks the design language established with the
 * two-section workspace (QoL pass): bordered cards, muted hierarchy,
 * tracking-tight headings, `minmax(0, 1fr)` grids, CSS-only motion
 * (hero entrance + scroll reveal), and use-case teaching copy — the
 * copy is a contract, not a roadmap; the steps only promise what the
 * app does today.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Download,
  Eye,
  Layers,
  ListOrdered,
  PenLine,
  PencilRuler,
  Route,
  Ruler,
  ScanSearch,
  ShieldCheck,
  TimerReset,
  Upload,
  Watch,
} from "lucide-react";
import { SessionErrorAlert } from "@/components/gpx/session-error-alert";
import { UploadZone } from "@/components/gpx/upload-zone";
import { ActivityStatsForm } from "@/components/create/activity-stats-form";
import { MergeIntake } from "@/components/merge/merge-intake";
import { LandingCardsView } from "@/components/layout/landing-cards";
import { PlanStartCard } from "@/components/plan/plan-start-card";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityStats } from "@/hooks/use-create-session";
import type { PaceUnit } from "@/lib/utils/format";
import type { LandingMode, LandingView } from "@/state/ui-store";
import type { SessionError, SessionStatus } from "@/state/session-store";

export interface SessionIdleViewProps {
  /** A failed load attempt, surfaced above the hero; retry stays possible. */
  error: SessionError | null;
  /** File intake intent, handed to the UploadZone. */
  onFile: (file: File) => void;
  /** The remembered tool (Task 20 + Task 42): whose detail page is open. */
  mode: LandingMode;
  /** Which landing page is showing (Task 42): the cards or the tool page. */
  view: LandingView;
  /** Open a tool card — becomes the remembered intent. */
  onOpenTool: (mode: LandingMode) => void;
  /** Leave the tool page, back to the cards. */
  onBackToCards: () => void;
  /**
   * Create-tool intake (no file exists): confirm the statistics and
   * enter the drawing phase. The tool page's create branch renders the
   * stats form instead of the upload zone.
   */
  onCreateBegin: (stats: ActivityStats) => void;
  /**
   * Plan-tool intake (Task 50): enter the planning studio — no file,
   * no statistics, just the map and the user's curiosity.
   */
  onPlanBegin: () => void;
  /** Previously confirmed statistics (prefill when returning to the form). */
  createStats: ActivityStats | null;
  /** The app-wide distance/pace unit (the create form's entry unit). */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
}

export function SessionIdleView({
  error,
  onFile,
  mode,
  view,
  onOpenTool,
  onBackToCards,
  onCreateBegin,
  onPlanBegin,
  createStats,
  paceUnit,
  onPaceUnitChange,
}: SessionIdleViewProps) {
  /*
   * Focus return (Task 42): remember which card opened the tool page,
   * so "All tools" can hand focus back to it — the SPA equivalent of
   * the browser's back-focus. Local state: it only matters while the
   * idle view stays mounted (a workspace upload unmounts this view and
   * resets the trip).
   */
  const [returnFocus, setReturnFocus] = useState<LandingMode | null>(null);

  if (view === "home") {
    return (
      <LandingCardsView
        returnFocusTo={returnFocus}
        onOpenTool={(tool) => {
          setReturnFocus(tool);
          onOpenTool(tool);
        }}
      />
    );
  }
  return (
    <ToolDetailView
      error={error}
      onFile={onFile}
      mode={mode}
      onBack={onBackToCards}
      onCreateBegin={onCreateBegin}
      onPlanBegin={onPlanBegin}
      createStats={createStats}
      paceUnit={paceUnit}
      onPaceUnitChange={onPaceUnitChange}
    />
  );
}

/**
 * What the app does with a file, as taught on the tool page. Kept in
 * step with shipped behavior only — the copy is a contract, not a
 * roadmap. The trio follows the open tool: the repair workflow, the
 * share-card workflow, the gap-recovery workflow, or the
 * create-from-stats workflow.
 */
const WORKFLOW_STEPS: Record<
  LandingMode,
  readonly {
    icon: typeof ScanSearch;
    title: string;
    description: string;
  }[]
> = {
  repair: [
    {
      icon: ScanSearch,
      title: "Inspect",
      description:
        "See every segment, gap, and anomaly with recorded-only statistics — nothing is invented.",
    },
    {
      icon: Route,
      title: "Repair",
      description:
        "Draw the missing route on the map — clicks follow real roads, drag a curve freehand with the Curve pen, every point adjusts in Move mode, everything undoes.",
    },
    {
      icon: ShieldCheck,
      title: "Honest by default",
      description:
        "Download the repaired GPX with every reconstructed point marked — the original recording is never modified, and repairs stay labelled even after re-uploading.",
    },
  ],
  share: [
    {
      icon: Upload,
      title: "Upload any GPX",
      description:
        "Drop an activity file — it is read locally in this tab, and nothing is uploaded anywhere.",
    },
    {
      icon: Eye,
      title: "See the card",
      description:
        "Your route renders on a transparent 9:16 canvas with the distance, pace, and time the file actually records.",
    },
    {
      icon: Download,
      title: "Download as PNG",
      description:
        "Export a 1080×1920 image (2160×3840 optional) — white on transparent, ready for stories and posts.",
    },
  ],
  recovery: [
    {
      icon: Clock,
      title: "Detect the gap",
      description:
        "The app finds sections where your watch kept counting time but GPS coordinates went missing — the interval, its duration, and both anchor points.",
    },
    {
      icon: PenLine,
      title: "Draw the missing route",
      description:
        "Trace where you actually went on the map — clicks follow real roads, the Curve pen draws freehand curves, and everything undoes. The original recording is never modified.",
    },
    {
      icon: Download,
      title: "Export the corrected file",
      description:
        "GPS points are generated along your drawing with timestamps fitted into the missing interval, the completed route is previewed with recalculated statistics, and the export marks every generated point as estimated.",
    },
  ],
  create: [
    {
      icon: Watch,
      title: "Enter your statistics",
      description:
        "The distance, average pace, total time, and start your watch recorded — no GPX needed. The app checks they agree (time ≈ distance × pace) and never overwrites your numbers.",
    },
    {
      icon: Route,
      title: "Draw the route",
      description:
        "Trace where you went on the map — clicks follow real roads, the Curve pen draws freehand curves, and everything undoes. This is the whole activity, drawn from scratch.",
    },
    {
      icon: Ruler,
      title: "Export the GPX",
      description:
        "The route is scaled to your recorded distance, your recorded time is spread along it as timestamps, and the file imports into Strava and other GPX platforms.",
    },
  ],
  merge: [
    {
      icon: Layers,
      title: "Add your files",
      description:
        "Drop two or more GPX files — each is read locally in this tab and inspected before it joins the merge. One bad file never blocks the rest.",
    },
    {
      icon: ListOrdered,
      title: "Arrange the merge",
      description:
        "Set the order the routes join in — or sort by start time — remove any file, and name the combined activity. The map and the statistics follow every change.",
    },
    {
      icon: Download,
      title: "Download one GPX",
      description:
        "One track with every recorded point from every file — elevation, timestamps, and waypoints carried over verbatim, nothing rewritten.",
    },
  ],
  plan: [
    {
      icon: PencilRuler,
      title: "Draw your route",
      description:
        "Sketch where you might go — clicks follow real roads, the Curve pen draws freehand curves, Move mode adjusts any point, everything undoes. No file needed.",
    },
    {
      icon: Ruler,
      title: "Read the estimates",
      description:
        "The distance updates live as the line takes shape, terrain elevation is one opt-in lookup away, and the straight-line comparison shows how winding your plan is.",
    },
    {
      icon: TimerReset,
      title: "Pace from your time",
      description:
        "Enter a goal time and see the pace and speed it implies, with even splits along the route. This is a scratchpad — nothing is exported and nothing is shared.",
    },
  ],
};

const HERO_COPY: Record<
  LandingMode,
  { heading: string; description: string }
> = {
  repair: {
    heading: "Repair incomplete GPS recordings",
    description:
      "Upload a GPX activity with gaps or damage, inspect exactly what was recorded, then draw the missing route yourself — with a clear line between recorded and reconstructed data.",
  },
  share: {
    heading: "Create a share card from your GPX",
    description:
      "Upload an activity and download a Strava-style share graphic — your route with the distance, pace, and time this file records. Need to fix it first? The repair workspace is one click away after upload.",
  },
  recovery: {
    heading: "Recover a missing GPS section",
    description:
      "Upload an activity where the recording dropped out mid-workout — the clock kept running but the route has a hole. Draw the part that went missing and get a corrected GPX with the elapsed time untouched.",
  },
  create: {
    heading: "Create an activity from its stats",
    description:
      "Your watch recorded the distance, pace, and time — but no map. Enter those statistics, draw the route you took, and download a GPX ready for Strava and every other platform.",
  },
  merge: {
    heading: "Combine GPX files into one route",
    description:
      "Upload two or more activities — or several takes of the same one — and merge them into a single GPX. Everything recorded comes along: points, elevation, timestamps, and waypoints. Then arrange the order, name the result, and download one file.",
  },
  plan: {
    heading: "Plan a route, read its numbers",
    description:
      "Sketch a route on the map — along real roads, footpaths, or freehand — and watch the distance, the terrain, and the pace take shape. Enter a time and see what it demands. This is a planning scratchpad: nothing is exported, nothing is shared.",
  },
};

/**
 * The tool page's fact strip (Task 42): what goes in, what comes out,
 * and who the tool is for — the concrete contract under the teaching
 * copy, three slots per tool.
 */
const TOOL_FACTS: Record<
  LandingMode,
  { input: string; output: string; bestFor: string }
> = {
  repair: {
    input:
      "Any GPX 1.0 or 1.1 activity file — exported from any watch, phone, or platform.",
    output:
      "The same file with your repairs added — every reconstructed point marked, the original recording untouched.",
    bestFor:
      "Recordings with missing sections or suspicious stretches you want to see and fix yourself.",
  },
  share: {
    input: "Any GPX activity file — gaps and all, no fixes needed.",
    output:
      "A 1080×1920 transparent PNG (2160×3840 at 2×) — route, distance, pace, and time exactly as recorded.",
    bestFor:
      "Turning a finished activity into a story-ready graphic for Strava, group chats, or anywhere else.",
  },
  recovery: {
    input:
      "A GPX with timestamps, where the clock kept running through a GPS dropout.",
    output:
      "A corrected .gpx — points generated along your drawing, timestamps fitted into the missing interval, elapsed time untouched.",
    bestFor:
      "Mid-activity signal loss — tunnels, downtown canyons, forest trails: the hole in an otherwise good recording.",
  },
  create: {
    input:
      "No file at all — just the distance, average pace, total time, and start time your watch recorded.",
    output:
      "A .gpx scaled to your recorded distance, your time spread along the route as timestamps — imports into Strava and every GPX platform.",
    bestFor:
      "Treadmill runs and GPS-less days: the numbers exist, the map does not — until you draw it.",
  },
  merge: {
    input:
      "Two or more GPX 1.0 or 1.1 activity files — mixed sources welcome (watch, phone, platform exports).",
    output:
      "One .gpx with a single track — every point, waypoint, and route from every file, in your chosen order, under your chosen name.",
    bestFor:
      "Multi-take recordings, activities a platform split into pieces, or building one route from several days' rides and runs.",
  },
  plan: {
    input: "No file at all — just the map. Draw the route you are considering, with the same pens every editor has.",
    output:
      "On-screen estimates only — distance, elevation, the straight-line comparison, and a pace from a time you enter. No export, no share: the plan stays on this page.",
    bestFor:
      "Planning tomorrow's run or ride, measuring a commute, comparing route options before recording one for real.",
  },
};

export interface ToolDetailViewProps {
  /** A failed load attempt, surfaced above the hero; retry stays possible. */
  error: SessionError | null;
  /** File intake intent, handed to the UploadZone. */
  onFile: (file: File) => void;
  /** Whose page this is — picks the hero, the trio, the facts, the intake. */
  mode: LandingMode;
  /** Back to the tool cards ("All tools"). */
  onBack: () => void;
  /** Create-tool intake (no file exists): confirm the statistics and draw. */
  onCreateBegin: (stats: ActivityStats) => void;
  /** Plan-tool intake (Task 50): enter the planning studio. */
  onPlanBegin: () => void;
  /** Previously confirmed statistics (prefill when returning to the form). */
  createStats: ActivityStats | null;
  /** The app-wide distance/pace unit (the create form's entry unit). */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
}

/**
 * One tool's landing page (Task 42): the back link, the hero, the
 * intake, the "How it works" trio, and the fact strip. The heading
 * receives focus on mount — the page-turn announcement for screen
 * readers and a sane Tab restart for keyboard users (the card that
 * opened this page is gone from the DOM).
 */
export function ToolDetailView({
  error,
  onFile,
  mode,
  onBack,
  onCreateBegin,
  onPlanBegin,
  createStats,
  paceUnit,
  onPaceUnitChange,
}: ToolDetailViewProps) {
  const hero = HERO_COPY[mode];
  const facts = TOOL_FACTS[mode];
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The page-turn focus (see component doc). The error alert, when
  // present, self-announces (role="alert") and sits above this heading
  // in the DOM, so nothing is stolen from it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex w-full flex-1 flex-col py-8">
      {/*
       * Margin-based centering (mt-auto here, mb-auto below) instead of
       * justify-center: when the content outgrows the viewport on short
       * screens, auto margins collapse to zero and nothing gets clipped
       * above the fold — the flex-centering overflow trap.
       */}
      <div className="hero-entrance mx-auto mt-auto flex w-full max-w-lg flex-col items-center gap-6">
        {error && <SessionErrorAlert error={error} />}
        {/* The way back to the cards — the page's top-left control,
            inside the hero column so it sits flush with the heading. */}
        <div className="flex w-full justify-start">
          <button
            type="button"
            data-testid="landing-back-to-cards"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All tools
          </button>
        </div>
        <div className="space-y-2 text-center">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[clamp(2.625rem,6vw,3.875rem)] font-extrabold leading-[0.98] tracking-[0.012em] text-balance"
          >
            {hero.heading}
          </h2>
          <p className="mx-auto max-w-[56ch] text-balance text-[15.5px] leading-relaxed text-muted-foreground">
            {hero.description}
          </p>
        </div>
        {/*
         * The intake: the upload zone for the three file workflows, the
         * statistics form for the create workflow (there is no file to
         * upload — the watch recorded no GPS at all), the multi-file
         * intake for the merge workflow (it needs two or more files
         * before it can open its studio — the intake owns the collected
         * list and the contract gate), and the start card for the plan
         * workflow (Task 50 — the map is the input, so the intake is
         * just the honest contract and the enter intent).
         */}
        {mode === "create" ? (
          <ActivityStatsForm
            initialStats={createStats}
            paceUnit={paceUnit}
            onPaceUnitChange={onPaceUnitChange}
            onBegin={onCreateBegin}
          />
        ) : mode === "merge" ? (
          <MergeIntake />
        ) : mode === "plan" ? (
          <PlanStartCard onBegin={onPlanBegin} />
        ) : (
          <UploadZone onFile={onFile} />
        )}
      </div>

      {/*
       * The teaching section: wider than the intake column so the three
       * cards keep a comfortable line length, revealed on scroll like
       * the workspace's details section. The fact strip rides along —
       * the concrete in/out/who-for contract under the workflow copy.
       */}
      <RevealOnScroll className="mx-auto mb-auto mt-12 w-full max-w-4xl">
        <h3 className="text-center font-display text-[2rem] font-bold tracking-[0.01em]">
          How it works
        </h3>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          The whole workflow runs in this tab — nothing to install, no
          account.
        </p>
        <ol
          className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))]"
          data-testid="workflow-steps"
        >
          {WORKFLOW_STEPS[mode].map((step) => (
            <li
              key={step.title}
              className="rounded-[10px] border-[1.5px] border-ink bg-card p-[18px] transition-[translate,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="inline-flex rounded-[10px] border-[1.5px] border-signal bg-signal/10 p-2.5">
                <step.icon
                  className="size-5 text-signal"
                  aria-hidden="true"
                />
              </span>
              <h4 className="mt-2.5 text-[15px] font-bold">{step.title}</h4>
              <p className="mt-1 text-pretty text-[13px] leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
        <dl
          data-testid="tool-facts"
          className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 rounded-[10px] border-[1.5px] border-ink bg-card p-[18px] sm:grid-cols-[repeat(3,minmax(0,1fr))]"
        >
          <div>
            <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
              Input
            </dt>
            <dd className="mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {facts.input}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
              Output
            </dt>
            <dd className="mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {facts.output}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
              Best for
            </dt>
            <dd className="mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {facts.bestFor}
            </dd>
          </div>
        </dl>
      </RevealOnScroll>
    </div>
  );
}

export interface SessionLoadingViewProps {
  /** The file being parsed (announced to assistive technology). */
  fileName: string | null;
}

/**
 * One placeholder tools card — the bench's blocks taking shape (user
 * pass 35: skeleton loading instead of a bare spinner). Same radius
 * and rule vocabulary as the real cards so the swap is seamless.
 */
function SkeletonCard() {
  return (
    <div className="rounded-[10px] border-[1.5px] border-ink/25 bg-card p-4">
      <Skeleton className="h-4 w-28 rounded-[3px]" />
      <div className="mt-3 grid gap-2">
        <Skeleton className="h-3 w-full rounded-[3px]" />
        <Skeleton className="h-3 w-4/5 rounded-[3px]" />
        <Skeleton className="h-3 w-3/5 rounded-[3px]" />
      </div>
      <div className="mt-3.5">
        <Skeleton className="h-8 w-full rounded-[5px]" />
      </div>
    </div>
  );
}

export function SessionLoadingView({ fileName }: SessionLoadingViewProps) {
  return (
    <div
      role="status"
      data-testid="loading-state"
      aria-label={`Parsing ${fileName ?? "your file"}`}
      className="mx-auto w-full max-w-6xl flex-1 py-8"
    >
      {/*
       * The workspace taking shape (user pass 35): the map plate and
       * the tools column arrive as Field Plot skeletons — the same
       * frame, radius, and rule vocabulary the parsed view will use, so
       * the loading state reads as "the bench is being set" rather than
       * a detached spinner. The parsing copy stays verbatim (it is the
       * screen-reader announcement and the pinned string).
       */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div
          className="relative flex h-[65dvh] min-h-[420px] w-full min-w-0 items-center justify-center overflow-hidden rounded-[12px] border-2 border-ink bg-card lg:h-[calc(100dvh-11.875rem)] lg:min-h-[540px]"
        >
          {/* A ghost route — the plate's future content, drawn in the
              field's own ink at a whisper. */}
          <svg
            className="absolute inset-0 size-full text-ink/[0.08]"
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M-20 240 C 120 80, 260 300, 420 180 S 640 60, 820 200 S 1060 320, 1240 160"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </svg>
          <div className="relative z-10 flex flex-col items-center gap-3 rounded-[10px] border-[1.5px] border-ink bg-card px-8 py-6 text-center shadow-float">
            <p className="font-medium">Parsing {fileName ?? "your file"}…</p>
            <p className="text-sm text-muted-foreground">
              Everything happens locally in your browser.
            </p>
            <Skeleton className="mt-1 h-1.5 w-40 rounded-full" />
          </div>
        </div>
        <aside
          className="hidden min-w-0 grid-cols-1 content-start gap-4 lg:grid"
          aria-hidden="true"
        >
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </aside>
      </div>
    </div>
  );
}

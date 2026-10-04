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
 * between them. "home" is the tool tiles (LandingCardsView — one
 * compact illustrated tile per destination, Task 56); "tool" is the
 * selected tool's detail page
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

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Clock,
  Download,
  Eye,
  FileCheck2,
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
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
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
  /**
   * Phase 12 — "Try a sample" for the open file tool (repair, share,
   * recovery): loads the tool's bundled sample through the same onFile
   * pipeline. Undefined for tools without a file sample.
   */
  onTrySample?: () => void;
  /** What the sample link calls the sample (a dictionary key). */
  sampleLabelKey?: string;
  /**
   * Phase 18 — the batch tool's intake node (the shell owns the
   * use-batch-session instance; see ToolDetailViewProps.batchIntake).
   */
  batchIntake?: ReactNode;
  /** Previously confirmed statistics (prefill when returning to the form). */
  createStats: ActivityStats | null;
  /** The app-wide distance/pace unit (the create form's entry unit). */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
  /**
   * Phase 10 — the session-recovery prompt (rendered on the cards page,
   * above the hero, exactly when restorable work exists on this device).
   */
  restorePrompt?: ReactNode;
  /**
   * Phase 11 — replay the onboarding tour from the cards page's
   * "Take the tour" link (the shell owns the tour controller).
   */
  onStartTour?: () => void;
  /**
   * Phase 18 — the cards page's "Continue a saved session" link (the
   * shell owns the sessions manager).
   */
  onOpenSessions?: () => void;
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
  onTrySample,
  sampleLabelKey,
  batchIntake,
  createStats,
  paceUnit,
  onPaceUnitChange,
  restorePrompt,
  onStartTour,
  onOpenSessions,
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
        restorePrompt={restorePrompt}
        onStartTour={onStartTour}
        onOpenSessions={onOpenSessions}
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
      onTrySample={onTrySample}
      sampleLabelKey={sampleLabelKey}
      batchIntake={batchIntake}
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
 *
 * Phase 21: the copy lives in the dictionary (i18n/dicts/en/
 * toolpages.ts); these records keep only the ICONS, and the
 * accessors below resolve the copy per locale at render time.
 */
const WORKFLOW_STEP_ICONS: Record<
  LandingMode,
  readonly (typeof ScanSearch)[]
> = {
  repair: [ScanSearch, Route, ShieldCheck],
  share: [Upload, Eye, Download],
  recovery: [Clock, PenLine, Download],
  create: [Watch, Route, Ruler],
  merge: [Layers, ListOrdered, Download],
  plan: [PencilRuler, Ruler, TimerReset],
  batch: [Layers, FileCheck2, Download],
};

export interface WorkflowStep {
  icon: typeof ScanSearch;
  title: string;
  description: string;
}

/** Resolve one tool's "How it works" trio for the active locale. */
export function getWorkflowSteps(
  t: TranslatorArg,
  mode: LandingMode,
): readonly WorkflowStep[] {
  return WORKFLOW_STEP_ICONS[mode].map((icon, index) => ({
    icon,
    title: t(`toolpage.${mode}.step${index + 1}.title`),
    description: t(`toolpage.${mode}.step${index + 1}.description`),
  }));
}

export interface ToolHeroCopy {
  heading: string;
  description: string;
}

/** Resolve one tool's hero copy for the active locale. */
export function getHeroCopy(t: TranslatorArg, mode: LandingMode): ToolHeroCopy {
  return {
    heading: t(`toolpage.${mode}.hero.heading`),
    description: t(`toolpage.${mode}.hero.description`),
  };
}

export interface ToolFacts {
  input: string;
  output: string;
  bestFor: string;
}

/**
 * Resolve one tool's fact strip (Task 42) for the active locale —
 * what goes in, what comes out, and who the tool is for.
 */
export function getToolFacts(t: TranslatorArg, mode: LandingMode): ToolFacts {
  return {
    input: t(`toolpage.${mode}.fact.input`),
    output: t(`toolpage.${mode}.fact.output`),
    bestFor: t(`toolpage.${mode}.fact.bestFor`),
  };
}


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
  /** Phase 12 — the file tools' "Try a sample" intent (see UploadZone). */
  onTrySample?: () => void;
  /** What the sample link calls the sample (a dictionary key). */
  sampleLabelKey?: string;
  /** Previously confirmed statistics (prefill when returning to the form). */
  createStats: ActivityStats | null;
  /** The app-wide distance/pace unit (the create form's entry unit). */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
  /**
   * Phase 18 — the batch tool's intake (the multi-file queue door). A
   * node so the shell owns the use-batch-session instance (one parse
   * pump for the intake AND the studio — two would race the queue).
   */
  batchIntake?: ReactNode;
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
  onTrySample,
  sampleLabelKey,
  createStats,
  paceUnit,
  onPaceUnitChange,
  batchIntake,
}: ToolDetailViewProps) {
  const { t } = useI18n();
  const hero = getHeroCopy(t, mode);
  const facts = getToolFacts(t, mode);
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
            {t("toolpage.backToCards")}
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
        ) : mode === "batch" ? (
          (batchIntake ?? null)
        ) : (
          <UploadZone
            onFile={onFile}
            onTrySample={onTrySample}
            sampleLabelKey={sampleLabelKey}
          />
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
          {t("toolpage.howItWorks")}
        </h3>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          {t("toolpage.howItWorksSub")}
        </p>
        <ol
          className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))]"
          data-testid="workflow-steps"
        >
          {getWorkflowSteps(t, mode).map((step) => (
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
              {t("toolpage.factInput")}
            </dt>
            <dd className="mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {facts.input}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
              {t("toolpage.factOutput")}
            </dt>
            <dd className="mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {facts.output}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
              {t("toolpage.factBestFor")}
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
  /**
   * Worker-parse progress (Phase 9) — non-null only while a large file
   * streams through the parse worker; drives the determinate bar.
   * Null (small files) keeps the indeterminate skeleton.
   */
  progress?: { phase: string; fraction: number } | null;
}

/** Phase-label dictionary keys for the determinate readout (Phase 9). */
const PROGRESS_PHASE_KEYS: Record<string, string> = {
  parse: "loading.phase.parse",
  validate: "loading.phase.validate",
  gaps: "loading.phase.gaps",
  transfer: "loading.phase.transfer",
};

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

export function SessionLoadingView({ fileName, progress }: SessionLoadingViewProps) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      data-testid="loading-state"
      aria-label={t("loading.aria", { file: fileName ?? t("loading.yourFile") })}
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
            <p className="font-medium">{t("loading.parsing", { file: fileName ?? t("loading.yourFile") })}</p>
            <p className="text-sm text-muted-foreground">
              {t("loading.local")}
            </p>
            {progress ? (
              /* Phase 9 — large files stream through the parse worker: a
               * real determinate readout (phase + %) replaces the
               * indeterminate skeleton; the enclosing role="status"
               * region is polite-live, so updates announce themselves. */
              <div className="w-56" data-testid="parse-progress">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.fraction * 100)}
                  aria-label={t("loading.progressA11y")}
                >
                  <div
                    data-testid="parse-progress-fill"
                    className="h-full rounded-full bg-ink transition-[width] duration-150 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.min(100, Math.max(0, progress.fraction * 100))}%` }}
                  />
                </div>
                <p
                  data-testid="parse-progress-label"
                  className="mt-1.5 text-xs tabular-nums text-muted-foreground"
                >
                  {t(PROGRESS_PHASE_KEYS[progress.phase] ?? "loading.phase.working")} —{" "}
                  {Math.round(progress.fraction * 100)}%
                </p>
              </div>
            ) : (
              <Skeleton className="mt-1 h-1.5 w-40 rounded-full" />
            )}
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

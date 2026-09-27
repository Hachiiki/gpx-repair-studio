/**
 * SessionViews — the non-workspace session states (AppShell
 * reorganization pass).
 *
 * AppShell is the composition root (§D-6 "App.tsx rule"): it wires the
 * session hooks and picks the view. These are the views it picks while
 * there is no workspace yet — the landing/hero state (which doubles as
 * the retry surface when a load attempt failed) and the parsing state.
 * Pure presentation: props in, intents out, no session logic.
 *
 * The landing page speaks the design language established with the
 * two-section workspace (QoL pass): bordered cards, muted hierarchy,
 * tracking-tight headings, `minmax(0, 1fr)` grids, CSS-only motion
 * (hero entrance + scroll reveal), and use-case teaching copy — the
 * landing-page sibling of the map tools' dwell hints. The three
 * workflow steps only promise what the app does today.
 *
 * Task 26 revision: the mode toggle is a THREE-tab segmented control —
 * "Repair a recording" / "Create a share card" / "Recover a GPS gap" —
 * the single front door to all three destinations (the repair/share
 * workspaces of the repair studio's session, and the Gap Recovery
 * section's own session). There is no header section switcher; the
 * remembered tab is the intent for the NEXT upload. The recovery hero
 * and steps moved here from the retired RecoveryIdleView.
 */

import {
  Clock,
  Download,
  Eye,
  PenLine,
  Route,
  ScanSearch,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { SessionErrorAlert } from "@/components/gpx/session-error-alert";
import { UploadZone } from "@/components/gpx/upload-zone";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { Skeleton } from "@/components/ui/skeleton";
import type { LandingMode } from "@/state/ui-store";
import type { SessionError, SessionStatus } from "@/state/session-store";

export interface SessionIdleViewProps {
  /** A failed load attempt, surfaced above the hero; retry stays possible. */
  error: SessionError | null;
  /** File intake intent, handed to the UploadZone. */
  onFile: (file: File) => void;
  /** The remembered landing tab (Task 20 + Task 26 revision): the destination of the next upload. */
  mode: LandingMode;
  onModeChange: (mode: LandingMode) => void;
}

/**
 * What the app does with a file, as taught on the landing page. Kept in
 * step with shipped behavior only — the copy is a contract, not a
 * roadmap. The trio follows the selected tab: the repair workflow, the
 * share-card workflow, or the gap-recovery workflow.
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
        "Draw the missing route on the map — clicks follow real roads, every point drags, everything undoes.",
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
        "Trace where you actually went on the map — clicks follow real roads, every point drags, and everything undoes. The original recording is never modified.",
    },
    {
      icon: Download,
      title: "Export the corrected file",
      description:
        "GPS points are generated along your drawing with timestamps fitted into the missing interval, the completed route is previewed with recalculated statistics, and the export marks every generated point as estimated.",
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
};

const MODE_OPTIONS: readonly {
  value: LandingMode;
  /** Full label — shown from the sm breakpoint up. */
  label: string;
  /** Compact label for sub-sm viewports: three tabs share one 343 px row. */
  shortLabel: string;
}[] = [
  { value: "repair", label: "Repair a recording", shortLabel: "Repair" },
  { value: "share", label: "Create a share card", shortLabel: "Share card" },
  { value: "recovery", label: "Recover a GPS gap", shortLabel: "Recovery" },
];

export function SessionIdleView({
  error,
  onFile,
  mode,
  onModeChange,
}: SessionIdleViewProps) {
  const hero = HERO_COPY[mode];
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
        {/*
         * The mode switch (Task 20, widened in Task 26): the remembered
         * intent for the next upload. Three mutually exclusive
         * destinations for one upload — a segmented control in the app's
         * toggle language. Below sm the compact labels keep the trio on
         * one row (the 375 px mobile contract).
         */}
        <div
          className="flex w-full gap-1 rounded-lg border-[1.5px] border-ink bg-card p-1"
          role="radiogroup"
          aria-label="What do you want to do?"
          data-testid="landing-mode-toggle"
        >
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              data-testid={`landing-mode-${option.value}`}
              className={
                mode === option.value
                  ? "flex-1 rounded-[5px] bg-signal px-2 py-2.5 text-sm font-semibold text-inkplus shadow-[inset_0_0_0_1.5px_#222222] sm:px-3"
                  : "flex-1 rounded-[5px] px-2 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2 sm:px-3"
              }
              onClick={() => onModeChange(option.value)}
            >
              {/* Full label from sm up; compact below (three tabs, one
                  row — the sub-sm viewport has no room for sentences). */}
              <span className="sm:hidden">{option.shortLabel}</span>
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2 text-center">
          <h2 className="font-display text-[clamp(2.625rem,6vw,3.875rem)] font-extrabold leading-[0.98] tracking-[0.012em] text-balance">
            {hero.heading}
          </h2>
          <p className="mx-auto max-w-[56ch] text-balance text-[15.5px] leading-relaxed text-muted-foreground">
            {hero.description}
          </p>
        </div>
        <UploadZone onFile={onFile} />
      </div>

      {/*
       * The workflow trio: wider than the intake column so the three
       * cards keep a comfortable line length, revealed on scroll like
       * the workspace's details section.
       */}
      <RevealOnScroll className="mx-auto mb-auto mt-12 w-full max-w-4xl">
        <h2 className="text-center font-display text-[2rem] font-bold tracking-[0.01em]">
          How it works
        </h2>
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
              <h3 className="mt-2.5 text-[15px] font-bold">{step.title}</h3>
              <p className="mt-1 text-pretty text-[13px] leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
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

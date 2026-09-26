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
  Loader2,
  PenLine,
  Route,
  ScanSearch,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { SessionErrorAlert } from "@/components/gpx/session-error-alert";
import { UploadZone } from "@/components/gpx/upload-zone";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
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
          className="flex w-full overflow-hidden rounded-lg border bg-card p-1"
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
                  ? "flex-1 rounded-md bg-inkplus px-2 py-2 text-sm font-semibold text-white sm:px-3"
                  : "flex-1 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 sm:px-3"
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
          <h2 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            {hero.heading}
          </h2>
          <p className="text-balance text-muted-foreground">
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
        <h2 className="text-center font-display text-lg font-bold tracking-tight">
          How it works
        </h2>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          The whole workflow runs in this tab — nothing to install, no
          account.
        </p>
        <ol
          className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]"
          data-testid="workflow-steps"
        >
          {WORKFLOW_STEPS[mode].map((step) => (
            <li
              key={step.title}
              className="rounded-xl border bg-card p-4 transition-colors hover:border-signal/50"
            >
              <span className="inline-flex rounded-full bg-signal/10 p-2">
                <step.icon
                  className="size-4 text-signal"
                  aria-hidden="true"
                />
              </span>
              <h3 className="mt-3 font-medium">{step.title}</h3>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">
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

export function SessionLoadingView({ fileName }: SessionLoadingViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 py-8">
      {/*
       * role="status" → polite live region: screen readers announce the
       * parsing state instead of staying silent through the load (the
       * a11y fix of this pass; also implied aria-atomic="true").
       */}
      <div
        role="status"
        data-testid="loading-state"
        className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 text-center"
      >
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <p className="font-medium">Parsing {fileName ?? "your file"}…</p>
        <p className="text-sm text-muted-foreground">
          Everything happens locally in your browser.
        </p>
      </div>
    </div>
  );
}

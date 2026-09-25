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
 */

import { Loader2, Route, ScanSearch, ShieldCheck } from "lucide-react";
import { SessionErrorAlert } from "@/components/gpx/session-error-alert";
import { UploadZone } from "@/components/gpx/upload-zone";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import type { SessionError } from "@/state/session-store";

export interface SessionIdleViewProps {
  /** A failed load attempt, surfaced above the hero; retry stays possible. */
  error: SessionError | null;
  /** File intake intent, handed to the UploadZone. */
  onFile: (file: File) => void;
}

/**
 * What the app does with a file, as taught on the landing page. Kept in
 * step with shipped behavior only — the copy is a contract, not a
 * roadmap (export lands in a later phase and is not promised here).
 */
const WORKFLOW_STEPS = [
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
      "The original recording is never modified, and reconstructed sections stay labelled — every number says where it came from.",
  },
] as const;

export function SessionIdleView({ error, onFile }: SessionIdleViewProps) {
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
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Repair incomplete GPS recordings
          </h2>
          <p className="text-balance text-muted-foreground">
            Upload a GPX activity with gaps or damage, inspect exactly what
            was recorded, then draw the missing route yourself — with a
            clear line between recorded and reconstructed data.
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
        <h2 className="text-center text-lg font-semibold tracking-tight">
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
          {WORKFLOW_STEPS.map((step) => (
            <li
              key={step.title}
              className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <span className="inline-flex rounded-full bg-muted p-2">
                <step.icon
                  className="size-4 text-muted-foreground"
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

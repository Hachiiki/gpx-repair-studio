/**
 * RecoveryWorkspace — the Gap Recovery section's two-section layout
 * (Task 26).
 *
 * The same two-section measure as the repair workspace (QoL redesign):
 * a dominant, viewport-tall map with the recovery tools in a sticky side
 * panel, and the preview & statistics below the fold. Layout only —
 * slots in, no data logic (§F layout rule).
 *
 * A sibling of `WorkspaceLayout` rather than a reuse of it: the ids,
 * test ids, and landmark labels must say "recovery" (the anchor nav, the
 * e2e suite, and screen-reader users all deserve honest names), and the
 * scroll-cue copy reflects this section's second section. The measure
 * and structure are otherwise identical by design.
 */

import type { ReactNode } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";

export interface RecoveryWorkspaceProps {
  /** The map area (MapCanvas) — owns its own tall sizing. */
  map: ReactNode;
  /** The recovery tools column beside the map. */
  tools: ReactNode;
  /** Preview + statistics below the fold. */
  details: ReactNode;
}

export function RecoveryWorkspace({ map, tools, details }: RecoveryWorkspaceProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      {/* Section 1 — map + tools. */}
      <section
        id="recovery"
        aria-label="Recovery map and tools"
        data-testid="recovery-section"
        className="scroll-mt-20"
      >
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 [&>*]:min-w-0">{map}</div>
          <aside
            className="grid min-w-0 content-start gap-4 [&>*]:min-w-0 lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
            data-testid="recovery-tools-panel"
            aria-label="Recovery tools"
          >
            {tools}
          </aside>
        </div>

        {/* Scroll cue — hands the user the second section. */}
        <div className="mt-5 flex justify-center">
          <a
            href="#recovery-details"
            data-testid="recovery-scroll-cue"
            className="group inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:outline-2"
          >
            Preview &amp; statistics
            <ChevronDown
              className="size-4 transition-transform group-hover:translate-y-0.5 motion-safe:animate-bounce motion-reduce:animate-none"
              aria-hidden="true"
            />
          </a>
        </div>
      </section>

      {/* Section 2 — preview + stats. */}
      <section
        id="recovery-details"
        aria-label="Completed route preview and statistics"
        data-testid="recovery-details-section"
        className="scroll-mt-20"
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight">
              Completed route — preview &amp; statistics
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The original recording plus your recovered sections — the
              elapsed time is untouched, and every generated point stays
              labeled as estimated.
            </p>
          </div>
          <a
            href="#recovery"
            data-testid="recovery-back-to-map-link"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2"
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
            Back to the map
          </a>
        </div>
        {details}
      </section>
    </div>
  );
}

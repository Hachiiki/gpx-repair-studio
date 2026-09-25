/**
 * WorkspaceLayout — the two-section repair workspace (QoL redesign).
 *
 * Section 1 "Repair": a dominant, viewport-tall map with the repair
 * tools in a side panel — everything needed to pick, draw, and adjust a
 * repair without leaving the first screen. On desktop the tools panel is
 * sticky and scrolls independently when its content outgrows the map.
 * Section 2 "Details": statistics and file inspection, reached by
 * scrolling (a centered scroll cue closes section 1; the header nav
 * links here too).
 *
 * Layout only — slots in, no data logic (the §F layout rule).
 */

import type { ReactNode } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";

export interface WorkspaceLayoutProps {
  /** The map area (MapCanvas) — owns its own tall sizing. */
  map: ReactNode;
  /** The repair tools column beside the map. */
  tools: ReactNode;
  /** Statistics + file details below the fold. */
  details: ReactNode;
}

export function WorkspaceLayout({ map, tools, details }: WorkspaceLayoutProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      {/* Section 1 — map + tools. */}
      <section
        id="repair"
        aria-label="Repair map and tools"
        data-testid="repair-section"
        className="scroll-mt-20"
      >
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 [&>*]:min-w-0">{map}</div>
          {/*
           * Sticky tools column: same visual height as the tall map,
           * scrolling internally only when its cards outgrow it. The
           * min-w-0 chain keeps wide intrinsic content (tables, long
           * coordinates) from blowing the column sideways — the same
           * rule the old PanelGrid enforced.
           */}
          <aside
            className="grid min-w-0 content-start gap-4 [&>*]:min-w-0 lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
            data-testid="tools-panel"
            aria-label="Repair tools"
          >
            {tools}
          </aside>
        </div>

        {/* Scroll cue — hands the user the second section. */}
        <div className="mt-5 flex justify-center">
          <a
            href="#details"
            data-testid="scroll-cue"
            className="group inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:outline-2"
          >
            Statistics &amp; file details
            <ChevronDown
              className="size-4 transition-transform group-hover:translate-y-0.5 motion-safe:animate-bounce motion-reduce:animate-none"
              aria-hidden="true"
            />
          </a>
        </div>
      </section>

      {/* Section 2 — stats + details. */}
      <section
        id="details"
        aria-label="Statistics and file details"
        data-testid="details-section"
        className="scroll-mt-20"
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight">
              Statistics &amp; file details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything the app knows about the original recording —
              honest numbers with their provenance, never fabricated.
            </p>
          </div>
          <a
            href="#repair"
            data-testid="back-to-map-link"
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

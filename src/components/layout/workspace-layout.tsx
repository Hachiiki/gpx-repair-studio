/**
 * WorkspaceLayout — the two-section workspace (QoL redesign).
 *
 * Section 1: a dominant, viewport-tall map with the workflow's tools
 * in a side panel — everything needed to work without leaving the
 * first screen. On desktop the tools panel is sticky and scrolls
 * independently when its content outgrows the map.
 * Section 2 "Details": statistics and file inspection, reached by
 * scrolling (a centered scroll cue closes section 1; the header nav
 * links here too).
 *
 * Task 43: the layout is shared by the repair workspace (the defaults)
 * and the merge studio (its own labels/copy through the optional
 * props) — one implementation of the two-section shape, two voices.
 *
 * Layout only — slots in, no data logic (the §F layout rule).
 */

import type { ReactNode } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { WorkspaceToolsColumn } from "@/components/layout/workspace-tools-column";

export interface WorkspaceLayoutProps {
  /** The map area (MapCanvas) — owns its own tall sizing. */
  map: ReactNode;
  /** The workflow's tools column beside the map. */
  tools: ReactNode;
  /** Statistics + file details below the fold. */
  details: ReactNode;
  /** Section 1's anchor id + testid stem (default: repair). */
  sectionId?: string;
  /** Section 1's aria label. */
  sectionLabel?: string;
  /** The tools column's aria label. */
  toolsLabel?: string;
  /** Section 2's heading. */
  detailsTitle?: string;
  /** Section 2's intro sentence under the heading. */
  detailsIntro?: string;
  /** The scroll cue's label (defaults to the details title). */
  scrollCueLabel?: string;
}

export function WorkspaceLayout({
  map,
  tools,
  details,
  sectionId = "repair",
  sectionLabel = "Repair map and tools",
  toolsLabel = "Repair tools",
  detailsTitle = "Statistics & file details",
  detailsIntro =
    "Everything the app knows about the original recording — honest numbers with their provenance, never fabricated.",
  scrollCueLabel,
}: WorkspaceLayoutProps) {
  const cueLabel = scrollCueLabel ?? detailsTitle;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      {/* Section 1 — map + tools. */}
      <section
        id={sectionId}
        aria-label={sectionLabel}
        data-testid={`${sectionId}-section`}
        className="scroll-mt-20"
      >
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 [&>*]:min-w-0">{map}</div>
          {/**
           * Phase 8: one component, two tools layouts — the sticky
           * column at lg+ (the same classes as before), a
           * viewport-pinned bottom sheet on touch-width viewports
           * (map and tools on one screen). The min-w-0 chain keeps
           * wide intrinsic content (tables, long coordinates) from
           * blowing the column sideways — the same rule the old
           * PanelGrid enforced.
           */}
          <WorkspaceToolsColumn testid="tools-panel" label={toolsLabel}>
            {tools}
          </WorkspaceToolsColumn>
        </div>

        {/* Scroll cue — hands the user the second section (the Field
            Plot pill: ink border, signal hover). */}
        <div className="mt-5 flex justify-center">
          <a
            href="#details"
            data-testid="scroll-cue"
            className="group inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-signal hover:bg-signal/[0.08] hover:text-foreground focus-visible:outline-2"
          >
            {cueLabel}
            <ChevronDown
              className="size-3.5 transition-transform group-hover:translate-y-0.5 motion-safe:animate-bounce motion-reduce:animate-none"
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
            <h2 className="flex items-center gap-2.5 font-display text-[30px] font-bold leading-[1.05] tracking-[0.01em]">
              <span
                className="size-[11px] shrink-0 rounded-[1.5px] bg-signal"
                aria-hidden="true"
              />
              {detailsTitle}
            </h2>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
              {detailsIntro}
            </p>
          </div>
          <a
            href={`#${sectionId}`}
            data-testid="back-to-map-link"
            className="inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
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

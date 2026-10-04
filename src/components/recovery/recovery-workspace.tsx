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
import { useI18n } from "@/hooks/use-i18n";
import { WorkspaceToolsColumn } from "@/components/layout/workspace-tools-column";

export interface RecoveryWorkspaceProps {
  /** The map area (MapCanvas) — owns its own tall sizing. */
  map: ReactNode;
  /** The recovery tools column beside the map. */
  tools: ReactNode;
  /** Preview + statistics below the fold. */
  details: ReactNode;
}

export function RecoveryWorkspace({ map, tools, details }: RecoveryWorkspaceProps) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      {/* Section 1 — map + tools. */}
      <section
        id="recovery"
        aria-label={t("recovery.workspace.mapA11y")}
        data-testid="recovery-section"
        className="scroll-mt-20"
      >
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 [&>*]:min-w-0">{map}</div>
          {/* Phase 8 — sticky column at lg+, bottom sheet on touch. */}
          <WorkspaceToolsColumn
            testid="recovery-tools-panel"
            label={t("recovery.workspace.toolsLabel")}
          >
            {tools}
          </WorkspaceToolsColumn>
        </div>

        {/* Scroll cue — hands the user the second section. */}
        <div className="mt-5 flex justify-center">
          <a
            href="#recovery-details"
            data-testid="recovery-scroll-cue"
            className="group inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-signal hover:bg-signal/[0.08] hover:text-foreground focus-visible:outline-2"
          >
            {t("recovery.workspace.scrollCue")}
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
        aria-label={t("recovery.workspace.detailsA11y")}
        data-testid="recovery-details-section"
        className="scroll-mt-20"
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2.5 font-display text-[30px] font-bold leading-[1.05] tracking-[0.01em]">
              <span
                className="size-[11px] shrink-0 rounded-[1.5px] bg-signal"
                aria-hidden="true"
              />
              {t("recovery.workspace.detailsTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("recovery.workspace.detailsBlurb")}
            </p>
          </div>
          <a
            href="#recovery"
            data-testid="recovery-back-to-map-link"
            className="inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
            {t("recovery.workspace.backToMap")}
          </a>
        </div>
        {details}
      </section>
    </div>
  );
}

/**
 * PlanWorkspace — the "plan a route" section's layout.
 *
 * A sibling of `WorkspaceLayout` / `RecoveryWorkspace` /
 * `CreateWorkspace`: the same dominant, viewport-tall map with the
 * tools in a sticky side panel. No below-the-fold details section — the
 * estimates ARE the tools column (the workflow is a single live phase:
 * draw and read), so the ids, test ids, and landmark labels say "plan"
 * and the scroll cue is not needed. Layout only — slots in, no data
 * logic (§F layout rule).
 */

import type { ReactNode } from "react";

export interface PlanWorkspaceProps {
  /** The map area (MapCanvas) — owns its own tall sizing. */
  map: ReactNode;
  /** The planner's tools column beside the map. */
  tools: ReactNode;
}

export function PlanWorkspace({ map, tools }: PlanWorkspaceProps) {
  return (
    <section
      id="plan"
      aria-label="Plan a route map and tools"
      data-testid="plan-section"
      className="scroll-mt-20"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 [&>*]:min-w-0">{map}</div>
        <aside
          className="grid min-w-0 content-start gap-4 [&>*]:min-w-0 lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
          data-testid="plan-tools-panel"
          aria-label="Plan tools"
        >
          {tools}
        </aside>
      </div>
    </section>
  );
}

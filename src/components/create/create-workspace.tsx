/**
 * CreateWorkspace — the "create from activity stats" section's layout.
 *
 * A sibling of `WorkspaceLayout` / `RecoveryWorkspace`: the same dominant,
 * viewport-tall map with the tools in a sticky side panel. No
 * below-the-fold details section — the review IS the tools column (the
 * workflow is linear: draw → review → export), so the ids, test ids, and
 * landmark labels say "create" and the scroll cue is not needed.
 * Layout only — slots in, no data logic (§F layout rule).
 */

import type { ReactNode } from "react";
import { WorkspaceToolsColumn } from "@/components/layout/workspace-tools-column";

export interface CreateWorkspaceProps {
  /** The map area (MapCanvas) — owns its own tall sizing. */
  map: ReactNode;
  /** The create tools column beside the map. */
  tools: ReactNode;
}

export function CreateWorkspace({ map, tools }: CreateWorkspaceProps) {
  return (
    <section
      id="create"
      aria-label="Create route map and tools"
      data-testid="create-section"
      className="scroll-mt-20"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 [&>*]:min-w-0">{map}</div>
        {/* Phase 8 — sticky column at lg+, bottom sheet on touch. The
         * create studio's whole purpose is drawing, so the sheet
         * starts EXPANDED on phones. */}
        <WorkspaceToolsColumn
          testid="create-tools-panel"
          label="Create tools"
          defaultExpanded
        >
          {tools}
        </WorkspaceToolsColumn>
      </div>
    </section>
  );
}

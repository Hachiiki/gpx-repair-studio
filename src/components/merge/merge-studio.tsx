/**
 * MergeStudio — the composition root of the Merge section (Task 43).
 *
 * This section's counterpart of the repair studio's AppShell wiring:
 * it calls the section's own hooks (`useMergeSession`,
 * `useMergeMap`) and distributes data/intents to the views as props.
 * It contains no GPX logic, no math, no parsing — composition only,
 * per the §D-6 rule.
 *
 * The studio IS the arrangement view: the merged route on the map
 * (reframed after every edit), the file list (order, remove, focus,
 * add, sort), the combined activity's name and facts, and the export.
 * The details section below the fold reuses the repair workspace's
 * inspection cards over the MERGED model — the summary card, the
 * validation report (fresh eyes on the joined result), and the
 * statistics panel — so the merged file is inspected exactly like an
 * uploaded one.
 *
 * Everything downstream is REUSED from the existing app: MapCanvas
 * (toolbar, provider popover, offline degradation), the two-section
 * WorkspaceLayout, GpxSummaryCard, ValidationReport, StatsPanel. The
 * only section-specific pieces are the three merge cards.
 *
 * The shell mounts this only while the section's phase is "studio"
 * (≥ 2 files combined); its uploads happen on the landing's merge tool
 * page (MergeIntake). The header's reset clears the section back to
 * that intake.
 *
 * Task 43 — Merge tool. Client component.
 */

"use client";

import { MapCanvas } from "@/components/map/map-canvas";
import { GpxSummaryCard } from "@/components/gpx/gpx-summary-card";
import { ValidationReport } from "@/components/gpx/validation-report";
import { StatsPanel } from "@/components/statistics/stats-panel";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { MergeFilesCard } from "@/components/merge/merge-files-card";
import { MergeDetailsCard } from "@/components/merge/merge-details-card";
import { MergeExportCard } from "@/components/merge/merge-export-card";
import { useMergeSession } from "@/hooks/use-merge-session";
import { useMergeMap } from "@/hooks/use-merge-map";
import { useUiStore } from "@/state/ui-store";

export function MergeStudio() {
  const session = useMergeSession();
  const map = useMergeMap(session);
  const paceUnit = useUiStore((s) => s.paceUnit);
  const setPaceUnit = useUiStore((s) => s.setPaceUnit);

  const merged = session.merged;
  const anyTimed = session.files.some(
    (file) => file.status === "parsed" && file.summary?.hasTimingData,
  );

  return (
    <WorkspaceLayout
      sectionId="merge"
      sectionLabel="Merge map and arrangement"
      toolsLabel="Merge tools"
      detailsTitle="The merged recording"
      detailsIntro="Everything the app knows about the combined file — every point carried over verbatim from its source, in the order you set."
      scrollCueLabel="Statistics & file details"
      map={
        <MapCanvas
          map={map}
          attachContainer={map.setContainer}
          srNote={`This is the merged route of ${session.parsedCount} recordings.`}
        />
      }
      tools={
        <>
          <MergeFilesCard
            files={session.files}
            parsedCount={session.parsedCount}
            anyTimed={anyTimed}
            onMove={session.moveFile}
            onFocusFile={map.focusFile}
            onRemove={session.removeFile}
            onAddFiles={(files) => void session.addFiles(files)}
            onSortByStartTime={session.sortByStartTime}
          />
          {merged && (
            <MergeDetailsCard
              combinedName={session.combinedName}
              onNameChange={session.setCombinedName}
              fileCount={session.parsedCount}
              totalPoints={merged.totalPoints}
              distanceM={merged.distanceStats.totalDistanceM}
              waypointCount={merged.waypointCount}
            />
          )}
          <MergeExportCard
            canDownload={session.parsedCount >= 2}
            fileCount={session.parsedCount}
            pointCount={merged?.totalPoints ?? 0}
            onDownload={session.download}
          />
        </>
      }
      details={
        <RevealOnScroll>
          {merged ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
                <GpxSummaryCard
                  fileName={
                    session.combinedName.trim() || "Merged recording"
                  }
                  data={merged.model}
                  timeStats={merged.timeStats}
                />
                <ValidationReport issues={merged.issues} />
              </div>
              <div className="mt-4">
                <StatsPanel
                  distanceStats={merged.distanceStats}
                  timeStats={merged.timeStats}
                  reimport={merged.reimport}
                  paceUnit={paceUnit}
                  onPaceUnitChange={setPaceUnit}
                />
              </div>
            </>
          ) : (
            /*
             * The degenerate state: every file removed while arranging.
             * Recoverable in place — the files card's "Add files" is
             * still right there.
             */
            <div className="rounded-[10px] border-[1.5px] border-ink bg-card p-[18px] text-sm text-muted-foreground">
              Nothing to merge yet — add at least two files and the
              combined route, its statistics, and its export appear here.
            </div>
          )}
        </RevealOnScroll>
      }
    />
  );
}

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
import { MergeShareView } from "@/components/merge/merge-share-view";
import { ShareMergeDialog } from "@/components/merge/share-merge-dialog";
import { useI18n } from "@/hooks/use-i18n";
import { useMergeSession, mergedFileName } from "@/hooks/use-merge-session";
import { useMergeShare } from "@/hooks/use-merge-share";
import { useMergeMap } from "@/hooks/use-merge-map";
import { useMergeStore } from "@/state/merge-store";
import { useUiStore } from "@/state/ui-store";

export function MergeStudio() {
  const { t } = useI18n();
  const session = useMergeSession();
  const map = useMergeMap(session);
  const view = useMergeStore((s) => s.view);
  const shareDialogOpen = useMergeStore((s) => s.shareDialogOpen);
  const paceUnit = useUiStore((s) => s.paceUnit);
  const setPaceUnit = useUiStore((s) => s.setPaceUnit);

  const merged = session.merged;
  const anyTimed = session.files.some(
    (file) => file.status === "parsed" && file.summary?.hasTimingData,
  );

  // The share binding over the CURRENT arrangement — the same derived
  // merge the map and the statistics show, so the card can never
  // disagree with the studio (and a reorder while away is impossible:
  // the share view replaces the studio).
  const share = useMergeShare(merged, session.combinedName, session.parsedCount);

  // The share view (the header's Share after the warning confirms):
  // the same merged route and numbers, as the card stage. Everything
  // stays mounted behind it — coming back is just a view switch.
  if (view === "share" && share) {
    return (
      <MergeShareView
        share={share}
        onBackToArrangement={() => useMergeStore.getState().setView("studio")}
      />
    );
  }

  return (
    <>
      <WorkspaceLayout
        sectionId="merge"
        sectionLabel={t("merge.studio.sectionLabel")}
        toolsLabel={t("merge.studio.toolsLabel")}
        detailsTitle={t("merge.studio.detailsTitle")}
        detailsIntro={t("merge.studio.detailsIntro")}
        scrollCueLabel={t("merge.studio.scrollCueLabel")}
        map={
          <MapCanvas
            map={map}
            attachContainer={map.setContainer}
            srNote={t("merge.studio.srNote", {
              count: session.parsedCount,
            })}
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
                      session.combinedName.trim() ||
                      t("merge.studio.defaultFileName")
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
                {t("merge.studio.emptyDetails")}
              </div>
            )}
          </RevealOnScroll>
        }
      />

      {/*
       * The header's Share gate (studio view only — openShareDialog is
       * a no-op elsewhere): confirm downloads the merged GPX (the same
       * file the Download button produces, the CURRENT arrangement
       * serialized at click time) and switches to the share card view.
       */}
      <ShareMergeDialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          if (!open) useMergeStore.getState().closeShareDialog();
        }}
        fileName={mergedFileName(session.combinedName)}
        content={share?.content ?? null}
        onConfirm={() => {
          session.download();
          useMergeStore.getState().closeShareDialog();
          useMergeStore.getState().setView("share");
        }}
      />
    </>
  );
}

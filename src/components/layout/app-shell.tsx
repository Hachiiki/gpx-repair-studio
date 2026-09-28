/**
 * AppShell — the composition root of the application (§D-6 "App.tsx rule").
 *
 * This is the only component allowed to wire the top-level session: it
 * calls `useGpxSession`, `useMapController`, and `useDrawEditor`, and
 * distributes data/intents to the views as props. It contains no GPX
 * logic, no math, no parsing — composition only, per the master plan.
 *
 * The shell is three fixed regions (skip link / header / main / footer)
 * sharing one measure (SHELL_CONTAINER), and `main` hosts exactly one
 * of the four session states:
 *
 *   - parsed  → the two-section workspace (layout/workspace-layout.tsx)
 *   - loading → SessionLoadingView
 *   - idle or error → SessionIdleView (the landing, which is also
 *     the retry surface — the error alert sits above the hero and the
 *     upload zone stays available)
 *
 * The non-workspace views live in layout/session-views.tsx; the shell
 * only picks between them (AppShell reorganization pass). Task 42:
 * the landing itself is two pages (tool cards ↔ tool detail), and the
 * idle view dispatches between them from the ui-store's landingView.
 *
 * Also owns one app-level behavior: rehydrating persisted settings
 * after mount (skipHydration pattern, see state/ui-store.ts).
 */

"use client";

import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/layout/header";
import {
  SessionIdleView,
  SessionLoadingView,
} from "@/components/layout/session-views";
import { SHELL_CONTAINER } from "@/components/layout/shell-container";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ShareView } from "@/components/share/share-view";
import { MapCanvas } from "@/components/map/map-canvas";
import { ExportCard } from "@/components/gpx/export-card";
import { GpxSummaryCard } from "@/components/gpx/gpx-summary-card";
import { SegmentList } from "@/components/gpx/segment-list";
import { ValidationReport } from "@/components/gpx/validation-report";
import { RecoveryStudio } from "@/components/recovery/recovery-studio";
import { CreateStudio } from "@/components/create/create-studio";
import { MergeStudio } from "@/components/merge/merge-studio";
import { DrawEditorPanel } from "@/components/reconstruction/draw-editor-panel";
import { FileTimingCard } from "@/components/reconstruction/file-timing-card";
import { GapList } from "@/components/reconstruction/gap-list";
import { ManualRepairsCard } from "@/components/reconstruction/manual-repairs-card";
import { ElevationProfileChart } from "@/components/statistics/elevation-profile-chart";
import { StatsPanel } from "@/components/statistics/stats-panel";
import { useDrawEditor } from "@/hooks/use-draw-editor";
import { useElevation, useElevationStats } from "@/hooks/use-elevation";
import { useGpxExport } from "@/hooks/use-gpx-export";
import { useGpxSession } from "@/hooks/use-gpx-session";
import { useMapController } from "@/hooks/use-map-controller";
import { useShareCard } from "@/hooks/use-share-card";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { useUiStore, type AppSection } from "@/state/ui-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useCreateStore } from "@/state/create-store";
import { useMergeStore } from "@/state/merge-store";
import { loadRecoveryFile } from "@/hooks/use-recovery-session";
import { cn } from "@/lib/utils";

export function AppShell() {
  const session = useGpxSession();
  const map = useMapController(session);
  const draw = useDrawEditor(session, map);
  const elevation = useElevation(session, draw);
  const exporter = useGpxExport(session, draw, elevation.attachment);
  const elevationStats = useElevationStats(exporter.merge);
  /*
   * Task 35 — the share card renders the EDITED route: the committed
   * repairs' join rides along, so the card's route and trio are the
   * outcome (the same population the statistics panel and the export
   * use), updated live as repairs commit.
   */
  const share = useShareCard(
    session,
    draw.repairTimeStats,
    draw.fileTiming.totalDurationMs,
  );
  const paceUnit = useUiStore((s) => s.paceUnit);
  const setPaceUnit = useUiStore((s) => s.setPaceUnit);
  const landingMode = useUiStore((s) => s.landingMode);
  const landingView = useUiStore((s) => s.landingView);

  // Task 26 revision — the active section is DERIVED, not switched: the
  // Gap Recovery section is mounted exactly while its own session is
  // loading or parsed (its uploads arrive through the landing page's
  // recovery tool page; resetting it returns to the landing). The
  // repair studio keeps this shell's original wiring; recovery state
  // lives in its own store (state/recovery-store) and raw selectors keep
  // the header honest without duplicating the section's hook tree.
  //
  // The Create-from-stats section follows the same rule: it holds the
  // stage exactly while its phase is past the form (its entry is the
  // landing page's create tool page, whose statistics form lives
  // there; resetting it returns there).
  const recoveryStatus = useRecoveryStore((s) => s.status);
  const recoveryFileName = useRecoveryStore((s) => s.fileName);
  const recoveryError = useRecoveryStore((s) => s.error);
  const createPhase = useCreateStore((s) => s.phase);
  const createStats = useCreateStore((s) => s.stats);
  const createView = useCreateStore((s) => s.view);
  const mergePhase = useMergeStore((s) => s.phase);
  const mergeView = useMergeStore((s) => s.view);
  const mergeCombinedName = useMergeStore((s) => s.combinedName);
  const mergeParsedCount = useMergeStore((s) =>
    s.files.filter((file) => file.status === "parsed").length,
  );
  const section: AppSection =
    mergePhase === "studio"
      ? "merge"
      : createPhase !== "form"
        ? "create"
        : recoveryStatus === "loading" || recoveryStatus === "parsed"
          ? "recovery"
          : "repair";

  // Rehydrate persisted settings after mount — the prerendered HTML and
  // the first client render both use defaults, so there is no hydration
  // mismatch; the store then updates in place (see state/ui-store.ts).
  useEffect(() => {
    void useUiStore.persist.rehydrate();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Keyboard users jump straight past the header. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>

      <AppHeader
        fileName={
          section === "recovery"
            ? recoveryFileName
            : section === "create"
              ? "Activity from stats"
              : section === "merge"
                ? mergeCombinedName.trim() ||
                  `${mergeParsedCount} recordings merged`
                : session.fileName
        }
        status={
          section === "recovery"
            ? recoveryStatus
            : section === "create" || section === "merge"
              ? "parsed"
              : session.status
        }
        onReset={
          section === "recovery"
            ? () => useRecoveryStore.getState().reset()
            : section === "create"
              ? () => useCreateStore.getState().reset()
              : section === "merge"
                ? () => useMergeStore.getState().reset()
                : session.reset
        }
        view={session.view}
        onSwitchView={session.setView}
        section={section}
        resetLabel={
          section === "create" || section === "merge"
            ? "Start over"
            : undefined
        }
        /*
         * The create section's Share flow: the header button appears
         * in the review phase (a finishable route exists) and opens the
         * warning dialog; from the share view it becomes the way back.
         */
        onShare={
          section === "create" &&
          createPhase === "review" &&
          createView === "studio"
            ? () => useCreateStore.getState().openShareDialog()
            : undefined
        }
        onLeaveShare={
          section === "create" && createView === "share"
            ? () => useCreateStore.getState().setView("studio")
            : undefined
        }
        /*
         * The merge section's Share flow: the same pattern as the
         * create section's — the header button appears in the studio
         * view (a merge exists) and opens the warning dialog; from the
         * share view it becomes the way back (Task 44).
         */
        onMergeShare={
          section === "merge" && mergeView === "studio"
            ? () => useMergeStore.getState().openShareDialog()
            : undefined
        }
        onLeaveMergeShare={
          section === "merge" && mergeView === "share"
            ? () => useMergeStore.getState().setView("studio")
            : undefined
        }
      />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(SHELL_CONTAINER, "flex flex-1 flex-col py-6")}
      >
        {section === "create" ? (
          /*
           * The Create-from-stats section: no file was uploaded — the
           * statistics were entered on the landing's create tab and the
           * whole route is drawn by hand. Own store, own map; the repair
           * studio below keeps whatever file and repairs it already had.
           */
          <CreateStudio />
        ) : section === "merge" ? (
          /*
           * Task 43 — the Merge section: two or more files combined
           * into one route, arranged in the studio. Own store, own map;
           * the other sections keep whatever state they already had.
           * Its uploads happen on the landing's merge tool page (the
           * multi-file intake); the header's reset clears back there.
           */
          <MergeStudio />
        ) : section === "recovery" ? (
          /*
           * Task 26 — the Gap Recovery section: a separate workflow for
           * recovering a missing GPS section (upload → detect the missing
           * interval → draw the route → preview → export). Own session,
           * own map, own repairs; the repair studio below keeps whatever
           * file and repairs it already had.
           */
          <RecoveryStudio />
        ) : session.status === "parsed" && session.data ? (
          session.view === "share" ? (
            /*
             * The share-card workspace (Task 20): the same parsed
             * file, the card preview + download instead of the map.
             */
            <ShareView
              fileName={session.fileName}
              share={share}
              onOpenRepair={() => session.setView("repair")}
            />
          ) : (
            <WorkspaceLayout
            map={
              <MapCanvas
                map={map}
                attachContainer={map.setContainer}
                draw={draw}
              />
            }
            tools={
              <>
                <DrawEditorPanel draw={draw} elevation={elevation.controls} />
                <ManualRepairsCard
                  rows={draw.manualRows}
                  detectedGapIds={session.gapRows.map((row) => row.id)}
                  pickMode={draw.pickMode}
                  editorActive={draw.active}
                  onBeginPickAnchor={draw.beginPickAnchor}
                  onBeginPickPair={draw.beginPickPair}
                  onCancelPick={draw.cancelPickSpan}
                  onOpenEditor={draw.openEditor}
                  onRemoveSpan={draw.removeManualSpan}
                  statusById={draw.statusById}
                />
                <GapList
                  rows={session.gapRows}
                  thresholds={session.gapThresholds}
                  onThresholdsChange={session.setGapThresholds}
                  onThresholdsReset={session.resetGapThresholds}
                  selectedGapId={map.selectedGapId}
                  onSelectGap={map.selectGap}
                  statusById={draw.statusById}
                  onOpenEditor={draw.openEditor}
                  onBeginPick={draw.beginPickAnchor}
                  editorActive={draw.active}
                />
                {/*
                 * File-level “no timing data” mode (§J-1 Case 3): only
                 * when the loaded file carries no usable timestamps.
                 */}
                {session.timeStats !== null &&
                  !session.timeStats.hasTimingData && (
                    <FileTimingCard
                      fileTiming={draw.fileTiming}
                      setFileTiming={draw.setFileTiming}
                    />
                  )}
                {/*
                 * The workflow's end: review the repair summary and
                 * download the repaired file (§H-7/8).
                 */}
                <ExportCard exporter={exporter} />
              </>
            }
            details={
              <RevealOnScroll>
                <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
                  <GpxSummaryCard
                    fileName={session.fileName ?? ""}
                    data={session.data}
                    timeStats={session.timeStats}
                  />
                  <ValidationReport issues={session.issues} />
                  <SegmentList rows={session.segmentRows} />
                </div>
                {session.distanceStats && session.timeStats && (
                  /* mt-4 — the same breathing room the grid above gives
                   * its cards; without it the two 1.5 px ink borders
                   * sit flush against each other (recovery's layout
                   * already had this gap). */
                  <div className="mt-4">
                    <StatsPanel
                      distanceStats={session.distanceStats}
                      timeStats={session.timeStats}
                      repair={draw.repairTimeStats}
                      paceRows={draw.paceRows}
                      elevation={elevationStats.rows}
                      manualTotalDurationMs={draw.fileTiming.totalDurationMs}
                      reimport={session.reimport}
                      paceUnit={paceUnit}
                      onPaceUnitChange={setPaceUnit}
                    />
                  </div>
                )}
                {elevationStats.profile && elevationStats.profile.hasAnyEle && (
                  <div className="mt-4">
                    <ElevationProfileChart
                      profile={elevationStats.profile}
                      gainLossSummary={
                        elevationStats.rows.mixed
                          ? `${Math.round(
                              elevationStats.rows.mixed.gainM,
                            )} m up, ${Math.round(
                              elevationStats.rows.mixed.lossM,
                            )} m down`
                          : null
                      }
                    />
                  </div>
                )}
              </RevealOnScroll>
            }
            />
          )
        ) : session.status === "loading" ? (
          <SessionLoadingView fileName={session.fileName} />
        ) : (
          /* The landing is a two-page flow (Task 42): the tool cards,
             then the chosen tool's page. The remembered mode decides
             which session an upload enters — and which session's
             failure sits above the hero for retry; the pages swap the
             error along with the destination, so a stale failure never
             guards the wrong intake. */
          <SessionIdleView
            /* Merge load failures are per-file INSIDE the intake (one
             * bad file never blocks the rest) — never a session-level
             * alert above the hero. */
            error={
              landingMode === "recovery"
                ? recoveryError
                : landingMode === "merge"
                  ? null
                  : session.error
            }
            onFile={
              landingMode === "recovery" ? loadRecoveryFile : session.loadFile
            }
            mode={landingMode}
            view={landingView}
            onOpenTool={(mode) => useUiStore.getState().openLandingTool(mode)}
            onBackToCards={() => useUiStore.getState().closeLandingTool()}
            onCreateBegin={(stats) =>
              useCreateStore.getState().beginDrawing(stats)
            }
            createStats={createStats}
            paceUnit={paceUnit}
            onPaceUnitChange={setPaceUnit}
          />
        )}
      </main>

      <footer className="mt-auto border-t-[1.5px] border-ink/15 bg-background">
        <div
          className={cn(
            SHELL_CONTAINER,
            "flex items-center justify-center gap-1.5 py-4 text-[12.5px] text-muted-foreground",
          )}
        >
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            All processing happens in your browser — the file never leaves
            this device.
          </span>
        </div>
      </footer>
    </div>
  );
}

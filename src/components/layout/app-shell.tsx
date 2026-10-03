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

import { useCallback, useEffect, useState } from "react";
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
import { DeepValidationCard } from "@/components/gpx/deep-validation-card";
import type { PreviewPointInfo } from "@/components/gpx/fix-preview-dialog";
import { RecoveryStudio } from "@/components/recovery/recovery-studio";
import { CreateStudio } from "@/components/create/create-studio";
import { MergeStudio } from "@/components/merge/merge-studio";
import { PlanStudio } from "@/components/plan/plan-studio";
import { DrawEditorPanel } from "@/components/reconstruction/draw-editor-panel";
import { FileTimingCard } from "@/components/reconstruction/file-timing-card";
import { GapList } from "@/components/reconstruction/gap-list";
import { ManualRepairsCard } from "@/components/reconstruction/manual-repairs-card";
import { ElevationProfileChart } from "@/components/statistics/elevation-profile-chart";
import { SplitsCard } from "@/components/statistics/splits-card";
import { StatsPanel } from "@/components/statistics/stats-panel";
import { StatsPrintHeader } from "@/components/statistics/stats-print-header";
import { TimeInMotionCard } from "@/components/statistics/time-in-motion-card";
import { useDrawEditor } from "@/hooks/use-draw-editor";
import { useRepairAnnouncements } from "@/hooks/use-repair-announcements";
import { useDeepValidation } from "@/hooks/use-deep-validation";
import { useSurgery } from "@/hooks/use-surgery";
import { SurgeryCard } from "@/components/gpx/surgery-card";
import { useElevation, useElevationStats } from "@/hooks/use-elevation";
import { useGpxExport } from "@/hooks/use-gpx-export";
import { useGpxSession } from "@/hooks/use-gpx-session";
import { useSplits, useStoppedTime } from "@/hooks/use-splits";
import { useStatsExport } from "@/hooks/use-stats-export";
import { useSessionStore } from "@/state/session-store";
import { useMapController } from "@/hooks/use-map-controller";
import { useShareCard } from "@/hooks/use-share-card";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { Announcer } from "@/components/layout/announcer";
import { useUiStore, type AppSection } from "@/state/ui-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useCreateStore } from "@/state/create-store";
import { useMergeStore } from "@/state/merge-store";
import { usePlanStore } from "@/state/plan-store";
import { loadRecoveryFile } from "@/hooks/use-recovery-session";
import { useSessionRecovery } from "@/hooks/use-session-recovery";
import { useOnboardingTour } from "@/hooks/use-onboarding-tour";
import { useTheme } from "@/hooks/use-theme";
import { RestorePrompt } from "@/components/layout/restore-prompt";
import { OnboardingTour } from "@/components/layout/onboarding-tour";
import { InfoDialog, type InfoPane } from "@/components/layout/info-dialog";
import { HelpDialog } from "@/components/layout/help-dialog";
import { SiteFooter } from "@/components/layout/site-footer";
import { makeSampleFile } from "@/samples";
import { parsePointIdRef } from "@/types/ids";
import type { PointRef } from "@/types/domain";
import { cn } from "@/lib/utils";

export function AppShell() {
  const session = useGpxSession();
  const map = useMapController(session);
  const draw = useDrawEditor(session, map);
  /*
   * Phase 13 — the deep-validation binding: the working copy's
   * report, fix/preset planning, and the confirmed-fix log. Mounted
   * after the map (its jump intent focuses the camera) and before the
   * export (the export reads the same working view via the session).
   */
  const deep = useDeepValidation(session);
  /*
   * Phase 16 — the track-surgery binding (§EE 16.1): map picks for
   * split/range selection, the pure planners, and the apply intent.
   * Mounted after the deep validation (its edits land in the same
   * log the deep card's change list renders) and before the export.
   */
  const surgery = useSurgery(session, map);
  const elevation = useElevation(session, draw);
  const exporter = useGpxExport(session, draw, elevation.attachment);
  const elevationStats = useElevationStats(exporter.merge);
  /*
   * Phase 15 — the stats dashboard (§EE 15): splits, stopped time,
   * and the stats-sheet intents, all over the SAME merge the export
   * and the elevation rows use (the one-merge rule). Re-imported
   * repair markers ride along so marked stretches flag estimated.
   */
  const splits = useSplits(exporter.merge, session.workingData?.repairMarkers);
  const motion = useStoppedTime(exporter.merge);
  const statsExport = useStatsExport({
    session,
    splits,
    motion,
    elevation: elevationStats.rows,
    repair: draw.repairTimeStats,
  });
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

  /*
   * Phase 8 — the repair flow's non-visual moments (gaps detected,
   * reconstruction finished) spoken through the shell's single
   * aria-live region. The export-ready twin lives inside the export
   * hooks themselves (each download function announces its own file).
   */
  useRepairAnnouncements({
    status: session.status,
    fileName: session.fileName,
    data: session.data,
    gapCount: session.gapRows.length,
    statusById: draw.statusById,
  });

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
  // Phase 9 — the repair session's worker-parse progress (large files).
  const parseProgress = useSessionStore((s) => s.progress);
  const createPhase = useCreateStore((s) => s.phase);
  const createStats = useCreateStore((s) => s.stats);
  const createView = useCreateStore((s) => s.view);
  const mergePhase = useMergeStore((s) => s.phase);
  const mergeView = useMergeStore((s) => s.view);
  const mergeCombinedName = useMergeStore((s) => s.combinedName);
  const mergeParsedCount = useMergeStore((s) =>
    s.files.filter((file) => file.status === "parsed").length,
  );
  const planPhase = usePlanStore((s) => s.phase);
  const section: AppSection =
    mergePhase === "studio"
      ? "merge"
      : planPhase === "studio"
        ? "plan"
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

  /*
   * Phase 10 — session recovery: the debounced IndexedDB autosave of
   * in-progress work (all four drawing sessions) plus the landing page's
   * restore/discard prompt. Mounted once, here, because the shell is
   * the only always-alive component — subscriptions live for the page.
   */
  const sessionRecovery = useSessionRecovery();

  /*
   * Phase 11 — the first-run onboarding tour (4 steps, once per
   * browser). Auto-opens on the cards page for genuinely new visitors,
   * after the storage scan above settles; the landing's "Take the
   * tour" link replays it anytime.
   */
  const tour = useOnboardingTour({
    enabled: landingView === "home" && session.status === "idle",
    storageScanDone: sessionRecovery.hasScanned,
    hasRestoreOffers: sessionRecovery.offers.length > 0,
  });

  /*
   * Phase 11 — the About / "Privacy & Data" dialog (§M-3): opened
   * from the footer, the restore prompt's privacy link, and the tour's
   * first step's "full privacy page" door. One pane state, one dialog.
   */
  const [infoPane, setInfoPane] = useState<InfoPane | null>(null);
  const openInfo = (pane: InfoPane) => setInfoPane(pane);

  /*
   * Phase 12 — the shortcuts & help dialog: the footer button and the
   * "?" key open it. The key listener guards text fields and open
   * dialogs (any [role=dialog] — the info dialog, the tour, the draw
   * editor's confirmations) so "?" never stacks a dialog on a dialog.
   */
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "?") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector("[role='dialog']")) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  /*
   * Phase 12 — the theme binding (dark mode). Mounted at the shell so
   * the .dark class + color-scheme stay in sync for the whole app even
   * if the footer (which owns the toggle) were ever conditional; the
   * toggle, the legend, and every map hook read the same store.
   */
  useTheme();

  /*
   * Phase 13 — point-id resolution for the deep-validation surfaces
   * (jump labels, textual lists, preview dialogs). Resolved against
   * the ORIGINAL model first (fixes never move points, so original
   * coordinates are exact); Phase 16 adds the working-view fallback
   * so points that only exist there (a split piece's tail, a
   * duplicated segment's copies) resolve too — the same honest
   * treatment, one more place to look.
   */
  const resolvePreviewPoint = useCallback(
    (pointId: string): PreviewPointInfo | null => {
      const data = session.data;
      if (!data) return null;
      const ref = parsePointIdRef(pointId as PointRef["pointId"]);
      if (ref === null) return null;
      const segment = data.segments.find((s) => s.id === ref.segmentId);
      const point = segment?.points[ref.index];
      if (point) {
        return {
          pointId: point.id,
          segmentId: ref.segmentId,
          lat: point.lat,
          lon: point.lon,
          ...(point.ele !== undefined ? { ele: point.ele } : {}),
          ...(point.time !== undefined ? { time: point.time } : {}),
        };
      }
      // Phase 16 — derived ids (split tails keep original ids, but a
      // duplicate's rewritten `{derived}:{i}` only exists in the
      // working view). Walk it before giving up.
      const working = session.workingData;
      if (!working) return null;
      for (const workingSegment of working.segments) {
        const workingPoint = workingSegment.points.find(
          (p) => p.id === pointId,
        );
        if (workingPoint) {
          return {
            pointId: workingPoint.id,
            segmentId: workingSegment.id,
            lat: workingPoint.lat,
            lon: workingPoint.lon,
            ...(workingPoint.ele !== undefined
              ? { ele: workingPoint.ele }
              : {}),
            ...(workingPoint.time !== undefined
              ? { time: workingPoint.time }
              : {}),
          };
        }
      }
      return null;
    },
    [session.data, session.workingData],
  );

  /* Phase 13 — jump-to-map: resolve the issue point, focus the camera. */
  const jumpToPoint = useCallback(
    (ref: PointRef) => {
      const info = resolvePreviewPoint(ref.pointId);
      if (info) map.focusPoint?.(info.lat, info.lon);
    },
    [resolvePreviewPoint, map],
  );

  /*
   * Phase 12 — "Try a sample" (§EE 12.1): each file tool's bundled
   * sample, loaded through the SAME pipeline as an upload (the mode's
   * own onFile — recovery routes to its session, repair/share to the
   * main one). The create form carries its own example-numbers prefill;
   * plan starts empty; merge adds its pair inside its intake.
   */
  const trySample = () => {
    const file = makeSampleFile(
      landingMode === "share" ? "clean-run" : "repair-ride",
    );
    if (landingMode === "recovery") {
      void loadRecoveryFile(file);
    } else {
      void session.loadFile(file);
    }
  };
  const sampleLabel =
    landingMode === "share" ? "a sample run" : "a sample ride";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Keyboard users jump straight past the header. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Phase 8 — the single polite aria-live region (app-wide). */}
      <Announcer />

      <AppHeader
        fileName={
          section === "recovery"
            ? recoveryFileName
            : section === "create"
              ? "Activity from stats"
              : section === "merge"
                ? mergeCombinedName.trim() ||
                  `${mergeParsedCount} recordings merged`
                : section === "plan"
                  ? "Route plan"
                  : session.fileName
        }
        status={
          section === "recovery"
            ? recoveryStatus
            : section === "create" || section === "merge" || section === "plan"
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
                : section === "plan"
                  ? () => usePlanStore.getState().reset()
                  : session.reset
        }
        view={session.view}
        onSwitchView={session.setView}
        section={section}
        resetLabel={
          section === "create" || section === "merge" || section === "plan"
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
        ) : section === "plan" ? (
          /*
           * Task 50 — the Plan-a-route section: a draw-and-measure
           * scratchpad. Own store, own map; the entry is the landing's
           * plan tool page (the "Start planning" card), and the
           * section's whole contract lives in what it never renders:
           * no export card, no share dialog, no share view.
           */
          <PlanStudio />
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
                {/*
                 * Phase 13 — the deep-validation card leads the tools:
                 * find problems first, then repair gaps, then export.
                 */}
                <DeepValidationCard
                  deep={deep}
                  onJumpToPoint={jumpToPoint}
                  resolvePoint={resolvePreviewPoint}
                />
                {/*
                 * Phase 16 — track surgery: manual geometry control on
                 * the same working copy (find problems, then reshape).
                 */}
                <SurgeryCard
                  surgery={surgery}
                  rows={session.segmentRows}
                  onJumpToPoint={jumpToPoint}
                  resolvePoint={resolvePreviewPoint}
                />
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
                {/*
                 * Phase 15 — the stats dashboard prints as its own sheet
                 * (§EE 15.4): everything else in the details column hides
                 * under print, the dashboard region carries the print-only
                 * masthead, and the print CSS re-pins the palette.
                 */}
                <div
                  className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[repeat(3,minmax(0,1fr))]"
                  data-print-hide
                >
                  <GpxSummaryCard
                    fileName={session.fileName ?? ""}
                    data={session.data}
                    timeStats={session.timeStats}
                  />
                  <ValidationReport issues={session.issues} />
                  <SegmentList rows={session.segmentRows} />
                </div>
                {session.distanceStats && session.timeStats && (
                  <div data-print-region="stats" className="mt-4">
                    <StatsPrintHeader fileName={session.fileName} />
                    <StatsPanel
                      distanceStats={session.distanceStats}
                      timeStats={session.timeStats}
                      repair={draw.repairTimeStats}
                      paceRows={draw.paceRows}
                      elevation={elevationStats.rows}
                      manualTotalDurationMs={draw.fileTiming.totalDurationMs}
                      reimport={session.reimport}
                      working={deep.working}
                      paceUnit={paceUnit}
                      onPaceUnitChange={setPaceUnit}
                      onDownloadStatsCsv={statsExport.downloadStatsCsv}
                      onPrintStats={statsExport.printStats}
                    />
                    {splits !== null && (
                      /* mt-4 — the same breathing room the grid gives its
                       * cards (the ink borders never sit flush). */
                      <div className="mt-4">
                        <SplitsCard splits={splits} paceUnit={paceUnit} />
                      </div>
                    )}
                    {motion.hasTimingData && (
                      <div className="mt-4">
                        <TimeInMotionCard motion={motion} />
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
                  </div>
                )}
              </RevealOnScroll>
            }
            />
          )
        ) : session.status === "loading" ? (
          <SessionLoadingView
            fileName={session.fileName}
            progress={parseProgress}
          />
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
            onPlanBegin={() => usePlanStore.getState().beginPlanning()}
            onTrySample={
              landingMode === "repair" ||
              landingMode === "share" ||
              landingMode === "recovery"
                ? trySample
                : undefined
            }
            sampleLabel={sampleLabel}
            createStats={createStats}
            paceUnit={paceUnit}
            onPaceUnitChange={setPaceUnit}
            restorePrompt={
              <RestorePrompt
                recovery={sessionRecovery}
                onOpenPrivacy={() => openInfo("privacy")}
              />
            }
            onStartTour={tour.start}
          />
        )}
      </main>

      {/*
       * Phase 11 — the shared footer: the local-first line plus the
       * About / Privacy & Data doors (§M-3 — the disclosure is one
       * click away in every app state). Phase 12 adds the theme toggle
       * and the Shortcuts & help door.
       */}
      <SiteFooter onOpenInfo={openInfo} onOpenHelp={() => setHelpOpen(true)} />

      {/* Phase 11 — the first-run tour and the info dialog, mounted at
       * the shell level so they sit above every view. Phase 12 adds
       * the shortcuts & help dialog. */}
      <OnboardingTour tour={tour} />
      <InfoDialog
        pane={infoPane}
        onPaneChange={setInfoPane}
        onClose={() => setInfoPane(null)}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

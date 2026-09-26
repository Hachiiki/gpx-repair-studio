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
 *   - idle or error → SessionIdleView (the landing page, which is also
 *     the retry surface — the error alert sits above the hero and the
 *     upload zone stays available)
 *
 * The non-workspace views live in layout/session-views.tsx; the shell
 * only picks between them (AppShell reorganization pass).
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
import { useUiStore } from "@/state/ui-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { cn } from "@/lib/utils";

export function AppShell() {
  const session = useGpxSession();
  const map = useMapController(session);
  const draw = useDrawEditor(session, map);
  const elevation = useElevation(session, draw);
  const exporter = useGpxExport(session, draw, elevation.attachment);
  const elevationStats = useElevationStats(exporter.merge);
  const share = useShareCard(session);
  const paceUnit = useUiStore((s) => s.paceUnit);
  const setPaceUnit = useUiStore((s) => s.setPaceUnit);
  const landingMode = useUiStore((s) => s.landingMode);
  const setLandingMode = useUiStore((s) => s.setLandingMode);

  // Task 26 — the top-level section switch. "repair" keeps this shell's
  // original wiring untouched; "recovery" mounts the Gap Recovery
  // section, a self-contained workflow with its own session, map, draw
  // editor, and export (state/recovery-store — nothing is shared with the
  // repair session except user preferences). Raw store selectors keep the
  // header honest without duplicating the section's hook tree.
  const section = useUiStore((s) => s.activeSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const recoveryStatus = useRecoveryStore((s) => s.status);
  const recoveryFileName = useRecoveryStore((s) => s.fileName);

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
        fileName={section === "recovery" ? recoveryFileName : session.fileName}
        status={section === "recovery" ? recoveryStatus : session.status}
        onReset={
          section === "recovery"
            ? () => useRecoveryStore.getState().reset()
            : session.reset
        }
        view={session.view}
        onSwitchView={session.setView}
        section={section}
        onSwitchSection={setActiveSection}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(SHELL_CONTAINER, "flex flex-1 flex-col py-6")}
      >
        {section === "recovery" ? (
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
          <SessionIdleView
            error={session.error}
            onFile={session.loadFile}
            mode={landingMode}
            onModeChange={setLandingMode}
          />
        )}
      </main>

      <footer className="mt-auto border-t">
        <div
          className={cn(
            SHELL_CONTAINER,
            "flex items-center gap-1.5 py-4 text-xs text-muted-foreground",
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

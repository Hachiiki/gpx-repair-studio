/**
 * RecoveryStudio — the composition root of the Gap Recovery section
 * (Task 26; extended in Task 28).
 *
 * This section's counterpart of the repair studio's AppShell wiring: it
 * calls the section's own hooks (`useRecoverySession`,
 * `useRecoveryMap`, `useRecoveryDraw`, `useRecoveryElevation`,
 * `useRecoveryExport`) and distributes data/intents to the views as
 * props. It contains no GPX logic, no math, no parsing — composition
 * only, per the §D-6 rule.
 *
 * Everything downstream is REUSED from the existing app: MapCanvas (with
 * its toolbar, legend, distance badge, Draw/Pan + pick chrome),
 * DrawEditorPanel (with the undo/redo bar, the §J-1 + PE time-strategy
 * controls, and the elevation controls), ManualRepairsCard (Task 28:
 * the section's "draw an unmeasured section" front door — the same
 * pick-then-draw interaction the repair studio offers, voiced for
 * recovery), GapList, FileTimingCard, ExportCard + the pre-export
 * dialog, GpxSummaryCard, ValidationReport, SegmentList, StatsPanel,
 * the elevation profile chart, and the loading view. The only
 * section-specific pieces are the layout wrapper, the guide card, and
 * the completed-route preview card.
 *
 * Task 28 contract: the user can upload a file with NOTHING detected
 * and still draw the route they lost — the app calculates its time from
 * the file's recorded pace (and its elevation from the DEM provider).
 *
 * Task 26 revision: this root no longer renders a landing state — the
 * shell mounts it only while the section's session is loading or
 * parsed, and its uploads arrive through the landing page's "Recover a
 * GPS gap" tab. A failed load returns the user to the landing (the
 * shell routes the section's error there for retry).
 *
 * Task 26 — Gap Recovery section. Client component.
 */

"use client";

import {
  MapCanvas,
} from "@/components/map/map-canvas";
import { ExportCard } from "@/components/gpx/export-card";
import { GpxSummaryCard } from "@/components/gpx/gpx-summary-card";
import { SegmentList } from "@/components/gpx/segment-list";
import { ValidationReport } from "@/components/gpx/validation-report";
import { DrawEditorPanel } from "@/components/reconstruction/draw-editor-panel";
import { FileTimingCard } from "@/components/reconstruction/file-timing-card";
import { GapList } from "@/components/reconstruction/gap-list";
import { ManualRepairsCard } from "@/components/reconstruction/manual-repairs-card";
import { StatsPanel } from "@/components/statistics/stats-panel";
import { ElevationProfileChart } from "@/components/statistics/elevation-profile-chart";
import { RecoveryGuideCard } from "@/components/recovery/recovery-guide-card";
import { RecoveryPreviewCard } from "@/components/recovery/recovery-preview-card";
import { RecoveryWorkspace } from "@/components/recovery/recovery-workspace";
import { SessionLoadingView } from "@/components/layout/session-views";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { useRecoveryDraw } from "@/hooks/use-recovery-draw";
import { useRecoveryElevation } from "@/hooks/use-recovery-elevation";
import { useRecoveryExport } from "@/hooks/use-recovery-export";
import { useRecoveryMap } from "@/hooks/use-recovery-map";
import { useRecoverySession } from "@/hooks/use-recovery-session";
import { useElevationStats } from "@/hooks/use-elevation";
import { useUiStore } from "@/state/ui-store";

export function RecoveryStudio() {
  const session = useRecoverySession();
  const map = useRecoveryMap(session);
  const draw = useRecoveryDraw(session, map);
  const elevation = useRecoveryElevation(session, draw);
  const exporter = useRecoveryExport(session, draw, elevation.attachment);
  const elevationStats = useElevationStats(exporter.merge);
  const paceUnit = useUiStore((s) => s.paceUnit);
  const setPaceUnit = useUiStore((s) => s.setPaceUnit);

  if (session.status === "parsed" && session.data) {
    return (
      <RecoveryWorkspace
        map={
          <MapCanvas
            map={map}
            attachContainer={map.setContainer}
            draw={draw}
          />
        }
        tools={
          <>
            <RecoveryGuideCard
              detectedCount={session.gapRows.length}
              recoveredCount={draw.reconstructedCount}
              editorOpen={draw.active}
            />
            {/*
             * Task 28 — the always-available front door: draw an
             * unmeasured section even when nothing was detected. The
             * same pick-then-draw interaction the repair studio's
             * ManualRepairsCard offers, voiced for recovery: the app
             * calculates the drawn route's time from the file's pace.
             */}
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
              copy={{
                title: "Unmeasured sections",
                description:
                  "Draw the route you lost — the app estimates its time from your pace in this file.",
                anchorLabel: "Draw an unmeasured section",
                anchorHint:
                  "One click on any point of your recorded route, then click anywhere on the map — the line follows the road between your clicks. Use it for any stretch the watch never measured, even when nothing was detected.",
                pairLabel: "Redraw a stretch",
                pairHint:
                  "Click two points on the recorded route — the stretch between them is what you replace. Use it when the watch drew a straight line over the road you actually took; the time comes from the file.",
                empty:
                  "Nothing drawn yet. Start anywhere on the route — a tunnel the watch cut straight through, a section it never measured — even when no gap was detected.",
                anchorInstructions:
                  "Click ONE point on your recorded route where the unmeasured section attaches — then draw freely anywhere on the map. Route start/end extends into the open; a middle point inserts after it. Esc cancels.",
                pairInstructions:
                  "Click two points on the recorded route — the stretch between them is what you replace. Pan and zoom stay available; Esc cancels.",
              }}
            />
            {/*
             * The detected missing GPS sections. Detection is the same
             * engine the repair studio runs; thresholds are the shared
             * user preference (uiStore), adjustable in place. Detection
             * is a helper, never a gate — the card above draws with or
             * without it.
             */}
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
             * The drawing editor — the reused repair-studio panel, driven
             * by this section's binding (its own store, its own map).
             * Task 28: elevation estimation is wired here too — the
             * drawn route's elevations come from the same DEM provider
             * the repair studio uses.
             */}
            <DrawEditorPanel draw={draw} elevation={elevation.controls} />
            {/*
             * File-level "no timing data" mode (§J-1 Case 3): only when
             * the loaded activity carries no usable timestamps.
             */}
            {session.timeStats !== null &&
              !session.timeStats.hasTimingData && (
                <FileTimingCard
                  fileTiming={draw.fileTiming}
                  setFileTiming={draw.setFileTiming}
                />
              )}
            <RecoveryPreviewCard
              distanceStats={session.distanceStats}
              timeStats={session.timeStats}
              repair={draw.repairTimeStats}
              insertedPoints={exporter.merge?.insertedPoints ?? null}
              recoveredCount={draw.reconstructedCount}
              detectedCount={session.gapRows.length}
            />
            {/*
             * The workflow's end: review the summary and download the
             * corrected file (reused card + dialog).
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
                <ElevationProfileChart profile={elevationStats.profile} />
              </div>
            )}
          </RevealOnScroll>
        }
      />
    );
  }

  if (session.status === "loading") {
    return <SessionLoadingView fileName={session.fileName} />;
  }

  // Unreachable from the shell (it only mounts this section while its
  // session is loading or parsed — idle/error render the landing, where
  // the section's error surfaces above the hero for retry). Defensive
  // null for any other direct mount, so a stale root can't paint a ghost
  // workspace against a cleared store.
  return null;
}

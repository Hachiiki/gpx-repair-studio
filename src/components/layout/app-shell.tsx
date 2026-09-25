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
import { MapCanvas } from "@/components/map/map-canvas";
import { GpxSummaryCard } from "@/components/gpx/gpx-summary-card";
import { SegmentList } from "@/components/gpx/segment-list";
import { ValidationReport } from "@/components/gpx/validation-report";
import { DrawEditorPanel } from "@/components/reconstruction/draw-editor-panel";
import { GapList } from "@/components/reconstruction/gap-list";
import { ManualRepairsCard } from "@/components/reconstruction/manual-repairs-card";
import { StatsPanel } from "@/components/statistics/stats-panel";
import { useDrawEditor } from "@/hooks/use-draw-editor";
import { useGpxSession } from "@/hooks/use-gpx-session";
import { useMapController } from "@/hooks/use-map-controller";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";
import { useUiStore } from "@/state/ui-store";
import { cn } from "@/lib/utils";

export function AppShell() {
  const session = useGpxSession();
  const map = useMapController(session);
  const draw = useDrawEditor(session, map);

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
        fileName={session.fileName}
        status={session.status}
        onReset={session.reset}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(SHELL_CONTAINER, "flex flex-1 flex-col py-6")}
      >
        {session.status === "parsed" && session.data ? (
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
                <DrawEditorPanel draw={draw} />
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
                  />
                )}
              </RevealOnScroll>
            }
          />
        ) : session.status === "loading" ? (
          <SessionLoadingView fileName={session.fileName} />
        ) : (
          <SessionIdleView error={session.error} onFile={session.loadFile} />
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

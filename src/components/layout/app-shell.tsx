/**
 * AppShell — the composition root of the application (§D-6 "App.tsx rule").
 *
 * This is the only component allowed to wire the top-level session: it
 * calls `useGpxSession` and distributes data/intents to the panels as
 * props. It contains no GPX logic, no math, no parsing — composition
 * only, per the master plan.
 *
 * Also owns two app-level behaviors:
 *   - rehydrating persisted settings after mount (skipHydration pattern,
 *     see state/ui-store.ts), and
 *   - the four session states (idle hero / loading / error / workspace).
 *
 * QoL pass — two-section workspace: section 1 is the tall map with the
 * repair tools in a sticky side panel (everything needed to repair on
 * the first screen); section 2 (reached by scrolling) carries the file
 * details and statistics.
 *
 * Phase 3 — Map Display: composes the map binding (useMapController) and
 * distributes selection state to the map canvas and the gap list.
 */

"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/header";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { MapCanvas } from "@/components/map/map-canvas";
import { GpxSummaryCard } from "@/components/gpx/gpx-summary-card";
import { SegmentList } from "@/components/gpx/segment-list";
import { SessionErrorAlert } from "@/components/gpx/session-error-alert";
import { UploadZone } from "@/components/gpx/upload-zone";
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
      <AppHeader
        fileName={session.fileName}
        status={session.status}
        onReset={session.reset}
      />

      <main className="mx-auto flex w-full max-w-[92rem] flex-1 flex-col px-4 py-6 sm:px-6">
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
        ) : (
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 py-8">
            {session.status === "loading" ? (
              <div
                className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 text-center"
                data-testid="loading-state"
              >
                <Loader2
                  className="size-6 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="font-medium">Parsing {session.fileName}…</p>
                <p className="text-sm text-muted-foreground">
                  Everything happens locally in your browser.
                </p>
              </div>
            ) : (
              <>
                {session.status === "error" && session.error && (
                  <SessionErrorAlert error={session.error} />
                )}
                <div className="space-y-2 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Repair incomplete GPS recordings
                  </h2>
                  <p className="text-balance text-muted-foreground">
                    Upload a GPX activity with gaps or damage, inspect what
                    was recorded, and later draw the missing route — with a
                    clear line between recorded and reconstructed data.
                  </p>
                </div>
                <UploadZone onFile={session.loadFile} />
              </>
            )}
          </div>
        )}
      </main>

      <footer className="mt-auto border-t">
        <div className="mx-auto w-full max-w-[92rem] px-4 py-4 text-xs text-muted-foreground sm:px-6">
          All processing happens in your browser. No GPX data is uploaded to
          any server.
        </div>
      </footer>
    </div>
  );
}

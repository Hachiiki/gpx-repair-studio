/**
 * CreateStudio — the composition root of the "create from activity
 * stats" section.
 *
 * This section's counterpart of the repair studio's AppShell wiring: it
 * calls the section's own hooks (`useCreateMap`, `useCreateDraw`,
 * `useCreateExport`, `useCreateElevation`, `useCreateShare`) and
 * distributes data/intents to the views as props. It contains no GPX
 * logic, no math, no parsing — composition only, per the §D-6 rule.
 *
 * Everything downstream is REUSED from the existing app: MapCanvas (with
 * its toolbar, legend, distance badge, and Draw/Pan chrome — driven
 * through the structural `MapDrawChromeBinding`), the UndoRedoBar, the
 * road-follow chips' interaction language, the elevation controls and
 * disclosure (Phase 6), the share card canvas + painter, and the
 * export/download utilities. The section-specific pieces are the guide
 * card, the draw panel, the review card, and the share view.
 *
 * The in-section views render in the SAME layout: while drawing, the
 * tools column carries the guide + draw panel (the draw session renders
 * the route as the draft); in review, the draw session ends, the final
 * (scaled) track renders as the committed-reconstruction line, and the
 * tools column carries the review card (with the opt-in elevation
 * estimate). The share view (the header's "Share card" after the warning
 * dialog confirms) replaces the workspace with the card stage — the map
 * returns untouched when the user comes back.
 *
 * "Create from activity stats" section. Client component.
 */

"use client";

import { useState } from "react";
import { MapCanvas } from "@/components/map/map-canvas";
import { CreateGuideCard } from "@/components/create/create-guide-card";
import { CreateShareView } from "@/components/create/create-share-view";
import { CreateWorkspace } from "@/components/create/create-workspace";
import { ReconcileDistanceDialog } from "@/components/create/reconcile-distance-dialog";
import { RouteDrawPanel } from "@/components/create/route-draw-panel";
import { RouteReviewCard } from "@/components/create/route-review-card";
import { ShareCreateDialog } from "@/components/create/share-create-dialog";
import { useCreateDraw } from "@/hooks/use-create-draw";
import { useCreateElevation } from "@/hooks/use-create-elevation";
import { useCreateExport } from "@/hooks/use-create-export";
import { useCreateMap } from "@/hooks/use-create-map";
import { useCreateShare } from "@/hooks/use-create-share";
import { useI18n } from "@/hooks/use-i18n";
import { createTrackFileName } from "@/hooks/use-create-session";
import { useCreateStore } from "@/state/create-store";
import { useUiStore } from "@/state/ui-store";

export function CreateStudio() {
  const { t } = useI18n();
  const phase = useCreateStore((s) => s.phase);
  const view = useCreateStore((s) => s.view);
  const stats = useCreateStore((s) => s.stats);
  const consistency = useCreateStore((s) => s.consistency);
  const setMatchDistance = useCreateStore((s) => s.setMatchDistance);
  const shareDialogOpen = useCreateStore((s) => s.shareDialogOpen);
  const paceUnit = useUiStore((s) => s.paceUnit);

  const map = useCreateMap();
  const draw = useCreateDraw(map);
  const review = useCreateExport();
  const elevation = useCreateElevation(review?.track ?? null);
  const share = useCreateShare(review, elevation.attachment);

  // The finish-time reconciliation warning: fires on every draw → review
  // transition whose difference exceeds the notice ratio, and never
  // mid-review (spacing changes and edits within the review don't
  // re-interrupt). Closing the dialog any way keeps the drawn distance
  // (the default basis); the escape-hatch button opts into the watch's.
  // Transition detection is the "derive during render" pattern (state
  // adjusted when a prop changes — no effect, no cascade).
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [wasReview, setWasReview] = useState(false);
  if (phase === "review" && !wasReview) {
    setWasReview(true);
    if (review?.track.reconciliation.needsNotice) setReconcileOpen(true);
  } else if (phase !== "review" && wasReview) {
    setWasReview(false);
    setReconcileOpen(false); // never stuck open outside the review
  }

  if (!stats) return null; // unreachable from the shell (form gates entry)

  // The share view (the header's Share after the warning confirms): the
  // same track and numbers as the review, as the card stage. Everything
  // stays mounted behind it — coming back is just a view switch.
  if (view === "share" && review && share) {
    return (
      <CreateShareView
        share={share}
        onBackToReview={() => useCreateStore.getState().setView("studio")}
      />
    );
  }

  return (
    <>
      <CreateWorkspace
        map={
          <MapCanvas
            map={map}
            attachContainer={map.setContainer}
            draw={draw}
            srNote={` ${t("create.studio.srNote")}`}
          />
        }
        tools={
          phase === "review" && review ? (
            <RouteReviewCard
              review={review}
              stats={stats}
              paceUnit={paceUnit}
              consistency={consistency}
              elevation={elevation.controls}
              onEditRoute={() => useCreateStore.getState().editRoute()}
            />
          ) : (
            <>
              <CreateGuideCard
                stats={stats}
                paceUnit={paceUnit}
                consistency={consistency}
                onLocate={map.locate}
                locateStatus={map.locateStatus}
                onBackToStats={() => useCreateStore.getState().backToForm()}
                vertexCount={draw.vertexCount}
              />
              <RouteDrawPanel draw={draw} stats={stats} paceUnit={paceUnit} />
            </>
          )
        }
      />

      {/* The finish-time distance warning (modal over the review). */}
      {review && (
        <ReconcileDistanceDialog
          open={reconcileOpen}
          onOpenChange={setReconcileOpen}
          reconciliation={review.track.reconciliation}
          durationMs={stats.durationMs}
          paceUnit={paceUnit}
          onUseDrawn={() => setMatchDistance(false)}
          onUseRecorded={() => setMatchDistance(true)}
        />
      )}

      {/*
       * The header's Share gate (review phase only — openShareDialog is a
       * no-op elsewhere): confirm downloads the GPX (the same file the
       * Export button produces) and switches to the share card view.
       */}
      {review && (
        <ShareCreateDialog
          open={shareDialogOpen}
          onOpenChange={(open) => {
            if (!open) useCreateStore.getState().closeShareDialog();
          }}
          fileName={createTrackFileName(stats.startMs)}
          content={share?.content ?? null}
          onConfirm={() => {
            review.download();
            useCreateStore.getState().closeShareDialog();
            useCreateStore.getState().setView("share");
          }}
        />
      )}
    </>
  );
}

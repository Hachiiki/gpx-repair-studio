/**
 * CreateStudio — the composition root of the "create from activity
 * stats" section.
 *
 * This section's counterpart of the repair studio's AppShell wiring: it
 * calls the section's own hooks (`useCreateMap`, `useCreateDraw`,
 * `useCreateExport`) and distributes data/intents to the views as props.
 * It contains no GPX logic, no math, no parsing — composition only, per
 * the §D-6 rule.
 *
 * Everything downstream is REUSED from the existing app: MapCanvas (with
 * its toolbar, legend, distance badge, and Draw/Pan chrome — driven
 * through the structural `MapDrawChromeBinding`), the UndoRedoBar, the
 * road-follow chips' interaction language, and the export/download
 * utilities. The section-specific pieces are the guide card, the draw
 * panel, and the review card.
 *
 * The two in-studio phases render in the SAME layout: while drawing, the
 * tools column carries the guide + draw panel (the draw session renders
 * the route as the draft); in review, the draw session ends, the final
 * (scaled) track renders as the committed-reconstruction line, and the
 * tools column carries the review card.
 *
 * "Create from activity stats" section. Client component.
 */

"use client";

import { useState } from "react";
import { MapCanvas } from "@/components/map/map-canvas";
import { CreateGuideCard } from "@/components/create/create-guide-card";
import { CreateWorkspace } from "@/components/create/create-workspace";
import { ReconcileDistanceDialog } from "@/components/create/reconcile-distance-dialog";
import { RouteDrawPanel } from "@/components/create/route-draw-panel";
import { RouteReviewCard } from "@/components/create/route-review-card";
import { useCreateDraw } from "@/hooks/use-create-draw";
import { useCreateExport } from "@/hooks/use-create-export";
import { useCreateMap } from "@/hooks/use-create-map";
import { useCreateStore } from "@/state/create-store";
import { useUiStore } from "@/state/ui-store";

export function CreateStudio() {
  const phase = useCreateStore((s) => s.phase);
  const stats = useCreateStore((s) => s.stats);
  const consistency = useCreateStore((s) => s.consistency);
  const setMatchDistance = useCreateStore((s) => s.setMatchDistance);
  const paceUnit = useUiStore((s) => s.paceUnit);

  const map = useCreateMap();
  const draw = useCreateDraw(map);
  const review = useCreateExport();

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

  return (
    <>
      <CreateWorkspace
        map={
          <MapCanvas
            map={map}
            attachContainer={map.setContainer}
            draw={draw}
            srNote=" No recorded route — this activity is drawn from scratch from your entered statistics."
          />
        }
        tools={
          phase === "review" && review ? (
            <RouteReviewCard
              review={review}
              stats={stats}
              paceUnit={paceUnit}
              consistency={consistency}
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
    </>
  );
}

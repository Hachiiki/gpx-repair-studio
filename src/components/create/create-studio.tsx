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

import { MapCanvas } from "@/components/map/map-canvas";
import { CreateGuideCard } from "@/components/create/create-guide-card";
import { CreateWorkspace } from "@/components/create/create-workspace";
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
  const paceUnit = useUiStore((s) => s.paceUnit);
  const setPaceUnit = useUiStore((s) => s.setPaceUnit);

  const map = useCreateMap();
  const draw = useCreateDraw(map);
  const review = useCreateExport();

  if (!stats) return null; // unreachable from the shell (form gates entry)

  return (
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
  );
}

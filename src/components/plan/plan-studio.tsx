/**
 * PlanStudio — the composition root of the "plan a route" section
 * (Task 50).
 *
 * This section's counterpart of the repair studio's AppShell wiring: it
 * calls the section's own hooks (`usePlanMap`, `usePlanDraw`,
 * `usePlanElevation`) and distributes data/intents to the views as
 * props. It contains no GPX logic, no math, no parsing — composition
 * only, per the §D-6 rule.
 *
 * Everything downstream is REUSED from the existing app: MapCanvas
 * (with its toolbar, legend, distance badge, and Draw/Move/Pan chrome),
 * the UndoRedoBar, the pen + path-style chips' interaction language,
 * and the elevation controls + disclosure (Phase 6). The
 * section-specific pieces are the workspace wrapper, the guide card,
 * the draw panel, and the estimates card (the pace calculator lives
 * there).
 *
 * The section's contract is visible in what is ABSENT: no export card,
 * no share dialog, no share view — the route and its numbers are for
 * reading on this page, nothing else. The single phase is the studio:
 * draw, adjust, read; the header's "Start over" is the only way out.
 *
 * "Plan a route" section. Client component.
 */

"use client";

import { MapCanvas } from "@/components/map/map-canvas";
import { PlanDrawPanel } from "@/components/plan/plan-draw-panel";
import { PlanEstimatesCard } from "@/components/plan/plan-estimates-card";
import { PlanGuideCard } from "@/components/plan/plan-guide-card";
import { PlanWorkspace } from "@/components/plan/plan-workspace";
import { useI18n } from "@/hooks/use-i18n";
import { usePlanDraw } from "@/hooks/use-plan-draw";
import { usePlanElevation } from "@/hooks/use-plan-elevation";
import { usePlanEstimates } from "@/hooks/use-plan-estimates";
import { usePlanMap } from "@/hooks/use-plan-map";
import { usePlanStore } from "@/state/plan-store";
import { useUiStore } from "@/state/ui-store";

export function PlanStudio() {
  const { t } = useI18n();
  const plannedTimeMs = usePlanStore((s) => s.plannedTimeMs);
  const setPlannedTime = usePlanStore((s) => s.setPlannedTime);
  const paceUnit = useUiStore((s) => s.paceUnit);
  const setPaceUnit = useUiStore((s) => s.setPaceUnit);

  const map = usePlanMap();
  const draw = usePlanDraw(map);
  const elevation = usePlanElevation();

  // The crow-flies comparison runs over the SAME rendered join the
  // distance badge and the elevation fetch use (one join, one truth).
  const { crowFliesM, detour } = usePlanEstimates();

  return (
    <PlanWorkspace
      map={
        <MapCanvas
          map={map}
          attachContainer={map.setContainer}
          draw={draw}
          srNote={t("plan.studio.srNote")}
        />
      }
      tools={
        <>
          <PlanGuideCard
            onLocate={map.locate}
            locateStatus={map.locateStatus}
            vertexCount={draw.vertexCount}
            onClear={draw.clearVertices}
          />
          <PlanDrawPanel draw={draw} paceUnit={paceUnit} />
          <PlanEstimatesCard
            distanceM={draw.distanceM}
            crowFliesM={crowFliesM}
            detour={detour}
            elevation={elevation.controls}
            plannedTimeMs={plannedTimeMs}
            setPlannedTimeMs={setPlannedTime}
            paceUnit={paceUnit}
            onPaceUnitChange={setPaceUnit}
          />
        </>
      }
    />
  );
}

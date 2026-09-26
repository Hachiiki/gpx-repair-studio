/**
 * useRecoveryExport — the export orchestration hook of the Gap Recovery
 * section (Task 26).
 *
 * A compact mirror of the repair studio's `useGpxExport`, reading the
 * recovery store instead of the editor store. It joins the section's
 * COMMITTED recoveries (the same population its statistics use:
 * `statusById === "reconstructed"` — vertices exist, no open editor, not
 * skipped) into pure `MergeRepairSite`s, memoizes the `MergeResult`, and
 * derives the honest `ExportSummary` the reused pre-export dialog renders.
 *
 * The heavy lifting is the SAME pure machinery the repair studio runs:
 * `mergeRepairs` (which resamples the drawn route into points, distributes
 * `Estimated` timestamps inside the missing interval via the §J-1 case
 * matrix, and inserts them between the untouched boundary points) and
 * `exportGpxRepaired` (which re-emits every original point verbatim and
 * marks every generated point with its `gpxr:reconstructed` provenance
 * extension). The activity's elapsed time is therefore preserved by
 * construction: nothing outside the recovered interval is ever rewritten.
 *
 * Task 26 — Gap Recovery section. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import { mergeRepairs, type MergeRepairSite, type MergeResult } from "@/features/reconstruction/merge";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import {
  exportGpxRepaired,
  type ExportMode,
} from "@/features/gpx/exportGpx";
import { createDomXmlIo } from "@/lib/utils/xml";
import { downloadTextFile, repairedFileName } from "@/lib/utils/download";
import { useRecoveryStore } from "@/state/recovery-store";
import { useUiStore } from "@/state/ui-store";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
import type { RecoverySession } from "@/hooks/use-recovery-session";
import type { GpxExportBinding } from "@/hooks/use-gpx-export";

export type { ExportMode };

export function useRecoveryExport(
  session: RecoverySession,
  draw: DrawEditorBinding,
): GpxExportBinding {
  const reconstructions = useRecoveryStore((s) => s.reconstructions);
  const roadLegs = useRecoveryStore((s) => s.roadLegs);
  const skippedGapIds = useRecoveryStore((s) => s.skippedGapIds);
  const activeGapId = useRecoveryStore((s) => s.activeGapId);
  const fileTiming = useRecoveryStore((s) => s.fileTiming);

  const exportMode = useUiStore((s) => s.exportMode);
  const prettyPrint = useUiStore((s) => s.exportPrettyPrint);
  const setExportMode = useUiStore((s) => s.setExportMode);
  const setPrettyPrint = useUiStore((s) => s.setExportPrettyPrint);

  const data = session.data;
  const statusById = draw.statusById;
  const repairTimeStats = draw.repairTimeStats;

  // Committed recoveries → pure merge sites. The population rule mirrors
  // the statistics join exactly, so the numbers the preview shows are the
  // numbers the export writes. Recovery rows are always bounded (both
  // boundary points exist by construction).
  const sites = useMemo<readonly MergeRepairSite[]>(() => {
    if (!data) return [];
    const result: MergeRepairSite[] = [];
    for (const row of session.gapRows) {
      if (statusById[row.id] !== "reconstructed") continue;
      const recon = reconstructions[row.id];
      if (!recon) continue;
      if (row.before === undefined || row.after === undefined) continue;
      result.push({
        gapId: row.id,
        beforePointId: row.before.pointId,
        afterPointId: row.after.pointId,
        vertices: recon.vertices,
        resampleSpacingM: recon.resampleSpacingM,
        timeStrategy: recon.timeStrategy,
        roadLegs: roadLegs[row.id] ?? [],
      });
    }
    return result;
  }, [data, session.gapRows, statusById, reconstructions, roadLegs]);

  const hasTimingData = session.timeStats?.hasTimingData ?? false;

  // One merge serves every download — mode/pretty only affect bytes.
  const merge = useMemo(
    () =>
      data
        ? mergeRepairs(data, sites, {
            fileTiming,
            fileHasTimingData: hasTimingData,
          })
        : null,
    [data, sites, fileTiming, hasTimingData],
  );

  const summary = useMemo(() => {
    if (!data || !merge) return null;
    const openRepairCount = session.gapRows.filter(
      (row) =>
        row.id === activeGapId && (reconstructions[row.id]?.vertices.length ?? 0) > 0,
    ).length;
    return {
      repairCount: merge.repairCount,
      insertedPoints: merge.insertedPoints,
      addedDistanceM: merge.reconstructedDistanceM,
      openRepairCount,
      skippedCount: skippedGapIds.length,
      gapsWithoutDuration: repairTimeStats.gapsWithoutDuration,
      discrepancyCount: repairTimeStats.discrepancies.length,
      hasTimingData,
      fileTiming,
      willUpgradeTo11: data.fileMeta.version === "1.0" && merge.repairCount > 0,
      reimportedPoints: session.reimport?.markerCount ?? 0,
      repairsWithElevation: merge.elevatedRepairCount,
      staleElevationCount: 0,
    };
  }, [
    data,
    merge,
    session.gapRows,
    session.reimport,
    activeGapId,
    reconstructions,
    skippedGapIds,
    repairTimeStats,
    hasTimingData,
    fileTiming,
  ]);

  const download = useCallback((): string | null => {
    if (!data || !merge) return null;
    const xml = exportGpxRepaired(
      data,
      merge,
      { mode: exportMode, prettyPrint },
      createDomXmlIo(),
    );
    const fileName = repairedFileName(session.fileName ?? "activity.gpx");
    downloadTextFile(fileName, xml);
    return fileName;
  }, [data, merge, exportMode, prettyPrint, session.fileName]);

  return {
    ready: merge !== null,
    merge,
    summary,
    exportMode,
    prettyPrint,
    setExportMode,
    setPrettyPrint,
    download,
  };
}

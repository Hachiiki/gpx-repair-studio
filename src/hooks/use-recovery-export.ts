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
import type { ElevationSample } from "@/features/elevation/samples";
import {
  exportGpxRepaired,
  type ExportMode,
} from "@/features/gpx/exportGpx";
import { exportKml } from "@/features/formats/export-kml";
import { exportGeoJson } from "@/features/formats/export-geojson";
import { exportCsv } from "@/features/formats/export-csv";
import type { ExportFormat } from "@/features/formats/export-formats";
import { createDomXmlIo } from "@/lib/utils/xml";
import {
  downloadTextFile,
  exportFileName,
  exportMimeType,
} from "@/lib/utils/download";
import { announce } from "@/lib/announcements";
import { useRecoveryStore } from "@/state/recovery-store";
import { useUiStore } from "@/state/ui-store";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
import type { RecoverySession } from "@/hooks/use-recovery-session";
import type { GpxExportBinding } from "@/hooks/use-gpx-export";

export type { ExportMode, ExportFormat };

/**
 * The elevation data the merge consumes — the same input shape the
 * repair studio's export hook takes (Task 28: recovery's elevation
 * mirror provides it).
 */
export type ElevationAttachmentInput = {
  samplesByGap: Readonly<
    Record<string, { providerName: string; samples: readonly ElevationSample[] }>
  >;
  staleCount: number;
} | null;

export function useRecoveryExport(
  session: RecoverySession,
  draw: DrawEditorBinding,
  elevation: ElevationAttachmentInput = null,
): GpxExportBinding {
  const reconstructions = useRecoveryStore((s) => s.reconstructions);
  const roadLegs = useRecoveryStore((s) => s.roadLegs);
  const skippedGapIds = useRecoveryStore((s) => s.skippedGapIds);
  const activeGapId = useRecoveryStore((s) => s.activeGapId);
  const fileTiming = useRecoveryStore((s) => s.fileTiming);

  const exportMode = useUiStore((s) => s.exportMode);
  const prettyPrint = useUiStore((s) => s.exportPrettyPrint);
  const exportFormat = useUiStore((s) => s.exportFormat);
  const setExportMode = useUiStore((s) => s.setExportMode);
  const setPrettyPrint = useUiStore((s) => s.setExportPrettyPrint);
  const setExportFormat = useUiStore((s) => s.setExportFormat);

  const data = session.data;
  const statusById = draw.statusById;
  const repairTimeStats = draw.repairTimeStats;

  // Every repairable row, detected or user-drawn — the join basis.
  const allRows = useMemo(
    () => [...session.gapRows, ...draw.manualRows],
    [session.gapRows, draw.manualRows],
  );

  // Committed recoveries → pure merge sites. The population rule mirrors
  // the statistics join exactly (`deriveGapStatus === "reconstructed"`), so
  // the numbers the stats show are the numbers the export writes. Bounded
  // rows (detected sections, pair/insert spans) carry both boundaries;
  // open extensions carry their anchor + side.
  const elevationByGap = elevation?.samplesByGap ?? null;
  const sites = useMemo<readonly MergeRepairSite[]>(() => {
    if (!data) return [];
    const result: MergeRepairSite[] = [];
    for (const row of allRows) {
      if (statusById[row.id] !== "reconstructed") continue;
      const recon = reconstructions[row.id];
      if (!recon) continue;
      const bounded = row.before !== undefined && row.after !== undefined;
      const elevationResult = elevationByGap?.[row.id];
      result.push({
        gapId: row.id,
        ...(bounded
          ? {
              beforePointId: row.before!.pointId,
              afterPointId: row.after!.pointId,
            }
          : {
              // Open extension: the side tells merge where the interior
              // attaches; the anchor rides the boundary the row kept.
              ...(row.before !== undefined
                ? { beforePointId: row.before.pointId, extendSide: "after" as const }
                : {}),
              ...(row.after !== undefined
                ? { afterPointId: row.after.pointId, extendSide: "before" as const }
                : {}),
            }),
        vertices: recon.vertices,
        resampleSpacingM: recon.resampleSpacingM,
        timeStrategy: recon.timeStrategy,
        roadLegs: roadLegs[row.id] ?? [],
        ...(elevationResult
          ? {
              elevation: {
                providerName: elevationResult.providerName,
                // Freshness was verified against the current revision and
                // road signature by the elevation mirror; these two
                // fields only carry the provenance snapshot.
                fetchedAtRevision: recon.geometryRevision,
                fetchedAtRoadSignature: "",
                samples: elevationResult.samples,
              },
            }
          : {}),
      });
    }
    return result;
  }, [data, allRows, statusById, reconstructions, roadLegs, elevationByGap]);

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
    const openRepairCount = allRows.filter(
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
      staleElevationCount: elevation?.staleCount ?? 0,
      // Phase 13: the recovery section has no working copy — its
      // deep-validation fields are honestly zero.
      workingDeletedPoints: 0,
      workingSortedSegments: 0,
      workingSmoothedElevations: 0,
    };
  }, [
    data,
    merge,
    allRows,
    session.reimport,
    activeGapId,
    reconstructions,
    skippedGapIds,
    repairTimeStats,
    hasTimingData,
    fileTiming,
    elevation,
  ]);

  const download = useCallback((): string | null => {
    if (!data || !merge) return null;
    /*
     * §EE 14.4 — the same format picker as the repair studio (the
     * recovery section has no working copy; the note honestly says so).
     */
    const stats = {
      distanceM: session.distanceStats?.totalDistanceM ?? 0,
      ...(session.timeStats?.hasTimingData
        ? { movingMs: session.timeStats.recordedMovingTimeMs }
        : {}),
    };
    const text =
      exportFormat === "kml"
        ? exportKml(data, merge, {
            prettyPrint,
            sourceName: session.fileName ?? undefined,
            stats,
          })
        : exportFormat === "geojson"
          ? exportGeoJson(data, merge, {
              prettyPrint,
              sourceName: session.fileName ?? undefined,
              stats,
            })
          : exportFormat === "csv"
            ? exportCsv(data, merge, {
                prettyPrint,
                sourceName: session.fileName ?? undefined,
                stats,
              })
            : exportGpxRepaired(
                data,
                merge,
                { mode: exportMode, prettyPrint },
                createDomXmlIo(),
              );
    const fileName = exportFileName(session.fileName ?? "activity.gpx", exportFormat);
    downloadTextFile(fileName, text, exportMimeType(exportFormat));
    // Phase 8: the download handed the browser a blob — no visual
    // focus moves, so the aria-live region speaks it.
    announce(`Export ready — ${fileName} downloaded.`);
    return fileName;
  }, [
    data,
    merge,
    exportMode,
    prettyPrint,
    exportFormat,
    session.fileName,
    session.distanceStats,
    session.timeStats,
  ]);

  return {
    ready: merge !== null,
    merge,
    summary,
    exportMode,
    prettyPrint,
    exportFormat,
    setExportMode,
    setPrettyPrint,
    setExportFormat,
    download,
  };
}

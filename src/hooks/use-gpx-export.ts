/**
 * useGpxExport — the export orchestration hook (docs/MASTER_PLAN.md
 * §H-6/7/8, Phase 7).
 *
 * Owns the merge → serialize → download pipeline for the pre-export
 * dialog and the tools-panel export card:
 *
 *   - joins the COMMITTED repairs (the same population the statistics
 *     use: `statusById === "reconstructed"` — vertices exist, no open
 *     editor, not skipped) into pure `MergeRepairSite`s;
 *   - memoizes the `MergeResult` (mode/pretty-print affect only the
 *     serialization, never the merge — one merge serves every download);
 *   - derives the honest `ExportSummary` the dialog renders (inserted
 *     points, added distance, open editors excluded, repairs still
 *     lacking durations, the 1.0→1.1 upgrade notice);
 *   - `download()` serializes with the persisted settings and hands the
 *     file to the browser.
 *
 * Composition root pattern: AppShell wires `(session, draw)` in; nothing
 * here touches components or the map. The merge itself is pure — this
 * hook only reads stores and calls the domain.
 *
 * Phase 7 — Merge & Export. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import { mergeRepairs, type MergeRepairSite } from "@/features/reconstruction/merge";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import {
  exportGpxRepaired,
  type ExportMode,
} from "@/features/gpx/exportGpx";
import { createDomXmlIo } from "@/lib/utils/xml";
import { downloadTextFile, repairedFileName } from "@/lib/utils/download";
import { useEditorStore } from "@/state/editor-store";
import { useUiStore } from "@/state/ui-store";
import type { DrawEditorBinding, RepairRow } from "@/hooks/use-draw-editor";
import type { GpxSession } from "@/hooks/use-gpx-session";

// App-layer facade: components may not import feature internals (ESLint
// boundary, §F), so the export vocabulary they need flows through here.
export type { ExportMode } from "@/features/gpx/exportGpx";

/** What the pre-export dialog shows — every number is derived, never stored. */
export interface ExportSummary {
  /** Committed repairs the export will include. */
  repairCount: number;
  /** Reconstructed points inserted. */
  insertedPoints: number;
  /** Σ path lengths added, meters. */
  addedDistanceM: number;
  /** Repairs with an open editor (drawn but not committed — excluded). */
  openRepairCount: number;
  /** Gaps the user explicitly skipped. */
  skippedCount: number;
  /** Committed repairs whose duration is unknown → no timestamps. */
  gapsWithoutDuration: number;
  /** Case 4: manual durations disagreeing with recorded spans. */
  discrepancyCount: number;
  /** Whether the file carries any usable timestamps. */
  hasTimingData: boolean;
  /** File-level timing entries (no-timing files, §J-1 Case 3). */
  fileTiming: FileTimingContext;
  /** GPX 1.0 input with repairs → export upgrades to 1.1. */
  willUpgradeTo11: boolean;
  /** Points in this file already marked as reconstructed (re-import). */
  reimportedPoints: number;
}

/** App-layer facade for the export card + dialog. */
export interface GpxExportBinding {
  /** Memoized merge of every committed repair (null without a file). */
  ready: boolean;
  summary: ExportSummary | null;
  /** Persisted export settings (§H-7). */
  exportMode: ExportMode;
  prettyPrint: boolean;
  setExportMode: (mode: ExportMode) => void;
  setPrettyPrint: (pretty: boolean) => void;
  /** Serialize + download; returns the file name handed to the browser. */
  download: () => string | null;
}

export function useGpxExport(
  session: GpxSession,
  draw: DrawEditorBinding,
): GpxExportBinding {
  const reconstructions = useEditorStore((s) => s.reconstructions);
  const roadLegs = useEditorStore((s) => s.roadLegs);
  const skippedGapIds = useEditorStore((s) => s.skippedGapIds);
  const activeGapId = useEditorStore((s) => s.activeGapId);
  const fileTiming = useEditorStore((s) => s.fileTiming);

  const exportMode = useUiStore((s) => s.exportMode);
  const prettyPrint = useUiStore((s) => s.exportPrettyPrint);
  const setExportMode = useUiStore((s) => s.setExportMode);
  const setPrettyPrint = useUiStore((s) => s.setExportPrettyPrint);

  const data = session.data;
  const statusById = draw.statusById;
  const repairTimeStats = draw.repairTimeStats;

  // Every repairable row, detected or manual — the join basis.
  const allRows = useMemo<readonly RepairRow[]>(
    () => [...session.gapRows, ...draw.manualRows],
    [session.gapRows, draw.manualRows],
  );

  // Committed repairs → pure merge sites. The population rule mirrors the
  // statistics join exactly (`deriveGapStatus === "reconstructed"`), so
  // the numbers the stats show are the numbers the export writes.
  const sites = useMemo<readonly MergeRepairSite[]>(() => {
    if (!data) return [];
    const result: MergeRepairSite[] = [];
    for (const row of allRows) {
      if (statusById[row.id] !== "reconstructed") continue;
      const recon = reconstructions[row.id];
      if (!recon) continue;
      const bounded = row.before !== undefined && row.after !== undefined;
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
      });
    }
    return result;
  }, [data, allRows, statusById, reconstructions, roadLegs]);

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

  const summary = useMemo<ExportSummary | null>(() => {
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
    };
  }, [
    data,
    merge,
    allRows,
    activeGapId,
    reconstructions,
    skippedGapIds,
    repairTimeStats,
    hasTimingData,
    fileTiming,
    session.reimport,
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
    summary,
    exportMode,
    prettyPrint,
    setExportMode,
    setPrettyPrint,
    download,
  };
}

/**
 * useStatsExport — the Phase 15 stats-sheet intents (docs/MASTER_PLAN.md
 * §EE 15.4): download the dashboard as CSV, print the dashboard.
 *
 * Composition root pattern (the useGpxExport shape): AppShell wires the
 * session + the dashboard's view models in; the hook joins them into the
 * pure CSV builder's input, hands the sheet to the browser (with the
 * Phase 8 no-focus-move announcement), and drives the print flow.
 *
 * The print flow adds `printing-stats` to <body> — the @media print
 * rules in globals.css re-pin the palette to the light anchors, hide
 * everything outside the stats region, and show the print masthead —
 * then calls window.print() and cleans up on afterprint (the dialog
 * blocks the main thread in every major engine, so the class lives
 * exactly as long as the sheet; the 10 s backstop covers embedded
 * webviews that neither block nor fire afterprint).
 *
 * The numbers are the SAME numbers the cards render — the hook consumes
 * the view models, never a second computation.
 */

"use client";

import { useCallback } from "react";
import type { MotionSummary } from "@/features/statistics/motion";
import type { SplitsResult } from "@/features/statistics/splits";
import { buildStatsCsv } from "@/features/statistics/statsCsv";
import type { ZonesCsvInput } from "@/features/statistics/statsCsv";
import type { ElevationStatsRows } from "@/hooks/use-elevation";
import type { RepairTimeStats } from "@/hooks/use-draw-editor";
import type { GpxSession } from "@/hooks/use-gpx-session";
import type { ZonesView } from "@/hooks/use-zones";
import type { FitnessSettings } from "@/features/statistics/zones";
import { downloadTextFile } from "@/lib/utils/download";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";

/** `ride.gpx` → `ride.stats.csv` (the stem rule the other exports use). */
export function statsFileName(originalName: string): string {
  const stem = originalName.replace(/\.(gpx|tcx|fit|xml|kml|geojson|csv)$/i, "");
  return `${stem}.stats.csv`;
}

export interface StatsExportBinding {
  /** Serialize + download the stats sheet; returns the file name. */
  downloadStatsCsv: () => string | null;
  /** Print the stats region (the print stylesheet does the shaping). */
  printStats: () => void;
}

export interface UseStatsExportInput {
  session: GpxSession;
  splits: SplitsResult | null;
  motion: MotionSummary | null;
  elevation: ElevationStatsRows | null;
  /** The committed-repair join (draw.repairTimeStats). */
  repair: RepairTimeStats | null;
  /** Phase 23 — the zone analysis + settings (the sheet's zone rows). */
  zones?: ZonesView | null;
  fitness?: FitnessSettings;
}

export function useStatsExport(
  input: UseStatsExportInput,
): StatsExportBinding {
  const { t } = useI18n();
  const { session, splits, motion, elevation, repair, zones, fitness } = input;

  const downloadStatsCsv = useCallback((): string | null => {
    const distanceStats = session.distanceStats;
    const timeStats = session.timeStats;
    if (!distanceStats || !timeStats) return null;

    // The stats panel's distance join (the same arithmetic, one place
    // removed): a re-upload's marked stretches are already inside the
    // file total, so the recorded/total split SUBTRACTS them and the
    // repaired column adds them back (Task 20's double-count fix).
    const reimportDistance = session.reimport?.repairedDistanceM ?? 0;
    const liveRepairDistance = repair?.reconstructedDistanceM ?? 0;
    const hasRepairs =
      (repair?.gapCount ?? 0) > 0 || (session.reimport?.markerCount ?? 0) > 0;

    const text = buildStatsCsv({
      fileName: session.fileName,
      generatedAtIso: new Date().toISOString(),
      splits,
      motion,
      elevation: elevation
        ? {
            gainM: elevation.mixed?.gainM ?? null,
            lossM: elevation.mixed?.lossM ?? null,
            coverage: elevation.coverage,
            insufficient: elevation.insufficient,
          }
        : null,
      distance: {
        totalDistanceM: distanceStats.totalDistanceM,
        recordedDistanceM: distanceStats.totalDistanceM - reimportDistance,
        repairedDistanceM: liveRepairDistance + reimportDistance,
        hasRepairs,
      },
      time: {
        hasTimingData: timeStats.hasTimingData,
        recordedMovingMs: timeStats.recordedMovingTimeMs,
        ...(timeStats.wallTimeMs !== undefined
          ? { wallMs: timeStats.wallTimeMs }
          : {}),
      },
      working: {
        deletedPointCount: session.workingData?.working?.deletedPointCount ?? 0,
        sortedSegmentCount:
          session.workingData?.working?.sortedSegmentIds.length ?? 0,
        overriddenEleCount:
          session.workingData?.working?.overriddenEleCount ?? 0,
        hasEdits: session.workingData?.working?.hasEdits ?? false,
      },
      ...(zones && fitness
        ? {
            zones: {
              hr: zones.hr,
              power: zones.power,
              pace: zones.pace,
              cadence: zones.cadence,
              gap: zones.gap,
              calories: zones.calories,
              settings: fitness,
            } satisfies ZonesCsvInput,
          }
        : {}),
    });

    const fileName = statsFileName(session.fileName ?? "activity.gpx");
    downloadTextFile(fileName, text, "text/csv;charset=utf-8");
    // No visual focus moves on a blob download — the aria-live region
    // speaks it (the Phase 8 export contract).
    announce(t("hook.export.statsReady", { fileName }));
    return fileName;
  }, [session, splits, motion, elevation, repair, zones, fitness, t]);

  const printStats = useCallback(() => {
    if (typeof window === "undefined" || typeof window.print !== "function") {
      return;
    }
    const cleanup = () => {
      document.body.classList.remove("printing-stats");
      window.removeEventListener("afterprint", cleanup);
      if (backstop !== undefined) window.clearTimeout(backstop);
    };
    // Webviews that neither block on print() nor fire afterprint would
    // leave the class on; the backstop returns the app to the screen
    // layout no matter what.
    let backstop: number | undefined;
    if (typeof window.setTimeout === "function") {
      backstop = window.setTimeout(cleanup, 10_000);
    }
    window.addEventListener("afterprint", cleanup);
    document.body.classList.add("printing-stats");
    window.print();
  }, []);

  return { downloadStatsCsv, printStats };
}

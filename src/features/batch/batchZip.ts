/**
 * Batch export (Phase 18 — docs/MASTER_PLAN.md §EE 18.2): the ZIP +
 * manifest half of the batch flow.
 *
 * One repaired GPX per parsed file + `MANIFEST.txt`, zipped client-side
 * with fflate (vetted, pure JS, static-export compatible — the sync
 * `zipSync` API keeps the worker story out of it) and handed to the
 * browser as one download.
 *
 * Honesty rules:
 *   - every entry is exported from the file's WORKING copy through the
 *     SAME pipeline a single-file export takes (`applyWorkingEdits` →
 *     `mergeRepairs` with zero batch repair sites → `exportGpxRepaired`
 *     with the user's persisted mode/pretty settings) — a batch export
 *     and a manual export of the same work can never disagree;
 *   - a file with no applied edits exports byte-identical to the
 *     identity export (Mode A with an empty log reduces to it — the
 *     Phase 7 contract), and the manifest says "no changes" plainly;
 *   - the manifest counts what each edit did using the SAME vocabulary
 *     the GPX repair note uses (`workingMetaOf`), never a second
 *     computation;
 *   - duplicate download names get a numeric suffix (`ride.gpx` and a
 *     second `ride.gpx` → `ride.repaired.gpx` + `ride.repaired.2.gpx`)
 *     — nothing is silently overwritten.
 *
 * Pure given the injected XML IO — no DOM globals here (domain purity).
 *
 * Phase 18 — Batch & portable sessions. Pure TypeScript.
 */

import { translateLabel, translatorFor } from "@/i18n/runtime";

const enT = translatorFor("en");

import {
  applyWorkingEdits,
  workingMetaOf,
} from "@/features/validation/workingCopy";
import { mergeRepairs } from "@/features/reconstruction/merge";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import { exportGpxRepaired, type ExportMode } from "@/features/gpx/exportGpx";
import { exportFileName } from "@/lib/utils/download";
import type { XmlIo } from "@/lib/utils/xml";
import type { OriginalTrackData, WorkingEdit } from "@/types/domain";

/** The batch flow never has repair sites (no drawing in batch mode). */
const EMPTY_SITES: readonly never[] = [];

/** Batch files carry no file-level timing fallback (no manual-duration UI). */
const BATCH_FILE_TIMING: FileTimingContext = {
  startMs: null,
  totalDurationMs: null,
  recordedSpeedMps: null,
};

/** What one batch export entry needs (the store's item, distilled). */
export interface BatchExportItem {
  fileName: string;
  /** The frozen original model (status "parsed" is the caller's gate). */
  data: OriginalTrackData;
  /** The applied working-copy fixes (empty = identity export). */
  edits: readonly WorkingEdit[];
  /** Optional line about the applied preset, for the manifest. */
  presetName?: string;
}

/** The user's persisted export settings, passed through unchanged. */
export interface BatchExportSettings {
  mode: ExportMode;
  prettyPrint: boolean;
}

/** One built ZIP entry: name + UTF-8 bytes. */
export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** What the manifest + status word need per file, computed once. */
export interface BatchFileOutcome {
  /** The ZIP entry name this file exported under. */
  exportName: string;
  /** Points removed by the applied edits (the working meta's count). */
  deletedPoints: number;
  /** Segments reordered by timestamp. */
  sortedSegments: number;
  /** Elevations smoothed. */
  smoothedElevations: number;
  /** Whether the working copy changed at all. */
  changed: boolean;
}

const UTF8 = new TextEncoder();

/** The `.gpx` stem → the download name this app always derives. */
function repairedName(fileName: string): string {
  return exportFileName(fileName, "gpx");
}

/**
 * Deduplicate download names: the first keeps its name, later collisions
 * gain ` - 2`, ` - 3`, … before the extension. Insertion-ordered, so the
 * queue order decides who keeps the plain name.
 */
function dedupeName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (taken.has(`${stem} - ${n}${ext}`)) n++;
  const unique = `${stem} - ${n}${ext}`;
  taken.add(unique);
  return unique;
}

/**
 * Build every ZIP entry for the queue: one repaired GPX per item (in
 * queue order) + the manifest. Returns the entries and the per-file
 * outcomes (the store turns those into `exported` flags + status words).
 */
export function buildBatchZipEntries(
  items: readonly BatchExportItem[],
  settings: BatchExportSettings,
  io: XmlIo,
  exportedAt: Date = new Date(),
): { entries: ZipEntry[]; outcomes: BatchFileOutcome[] } {
  const taken = new Set<string>();
  const gpxEntries: ZipEntry[] = [];
  const outcomes: BatchFileOutcome[] = [];

  for (const item of items) {
    // The SAME working-copy pipeline a single-file export runs.
    const workingData = applyWorkingEdits(item.data, item.edits);
    const merge = mergeRepairs(workingData, EMPTY_SITES, {
      fileTiming: BATCH_FILE_TIMING,
      fileHasTimingData: true,
    });
    const text = exportGpxRepaired(
      workingData,
      merge,
      { mode: settings.mode, prettyPrint: settings.prettyPrint },
      io,
    );
    const exportName = dedupeName(repairedName(item.fileName), taken);
    gpxEntries.push({ name: exportName, bytes: UTF8.encode(text) });

    const meta = workingMetaOf(item.edits);
    outcomes.push({
      exportName,
      deletedPoints: meta.deletedPointCount,
      sortedSegments: meta.sortedSegmentIds.length,
      smoothedElevations: meta.overriddenEleCount,
      changed: meta.hasEdits,
    });
  }

  const manifest = buildManifest(items, outcomes, exportedAt);
  const entries = [
    ...gpxEntries,
    { name: "MANIFEST.txt", bytes: UTF8.encode(manifest) },
  ];
  return { entries, outcomes };
}

/** Count the file's recorded points (the manifest's parse line). */
function pointCountOf(data: OriginalTrackData): number {
  let total = 0;
  for (const segment of data.segments) total += segment.points.length;
  return total;
}

/**
 * The manifest: plain text, human-readable, one block per file plus a
 * header and an honest footer. The per-file sentences reuse the working
 * meta counts (the GPX repair note's own numbers — never a second
 * computation).
 */
export function buildManifest(
  items: readonly BatchExportItem[],
  outcomes: readonly BatchFileOutcome[],
  exportedAt: Date,
): string {
  const lines: string[] = [
    "GPX Repair Studio — batch export manifest",
    `Exported ${exportedAt.toISOString()}`,
    `${items.length} file${items.length === 1 ? "" : "s"} · everything processed in this browser — no file was uploaded anywhere, and no original was modified.`,
    "",
  ];

  let changedCount = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const outcome = outcomes[i];
    lines.push(`— ${item.fileName}`);
    lines.push(`   parsed: ${pointCountOf(item.data)} recorded points`);

    if (item.presetName !== undefined && item.edits.length > 0) {
      // The manifest is an exported artifact: labels pin to English
      // (Phase 21 — artifacts never follow the authoring machine).
      const fixNames = item.edits
        .map((edit) => translateLabel(enT, edit.label))
        .join("; ");
      lines.push(`   applied: ${item.presetName} — ${fixNames}`);
    }

    if (outcome.changed) {
      changedCount++;
      const sentences: string[] = [];
      if (outcome.deletedPoints > 0) {
        sentences.push(
          `${outcome.deletedPoints} point${outcome.deletedPoints === 1 ? " was" : "s were"} removed`,
        );
      }
      if (outcome.sortedSegments > 0) {
        sentences.push(
          `${outcome.sortedSegments} segment${outcome.sortedSegments === 1 ? " was" : "s were"} reordered by timestamp (order is estimated)`,
        );
      }
      if (outcome.smoothedElevations > 0) {
        sentences.push(
          `${outcome.smoothedElevations} elevation${outcome.smoothedElevations === 1 ? " was" : "s were"} smoothed (interpolated; gpxr:modified markers)`,
        );
      }
      lines.push(`   working copy: ${sentences.join("; ")}.`);
    } else {
      lines.push("   working copy: no changes (exported as recorded)");
    }
    lines.push(`   export: ${outcome.exportName}`);
    lines.push("");
  }

  lines.push(
    `${changedCount} of ${items.length} file${items.length === 1 ? "" : "s"} changed; the rest exported unchanged.`,
    "Every change is disclosed in the file's own metadata note; reconstructed/modified points carry gpxr markers.",
  );
  return lines.join("\n") + "\n";
}

/**
 * Photo batch export (Phase 26 — docs/plans/v3/
 * phase-26-photo-geotagging.md §26.4): many photos, one pass, a ZIP
 * out with a manifest — the Phase 18 batch pattern applied to images.
 *
 * Honesty rules:
 *   - every JPEG entry is the ORIGINAL bytes with the GPS block
 *     injected by the same `injectGps` the single-file Save As uses —
 *     a batch export and a one-by-one export of the same photo can
 *     never disagree;
 *   - unmatched photos are never silently dropped and never silently
 *     tagged: they ride along byte-identical, and the manifest says
 *     why (no timestamp / outside the window) in plain sentences;
 *   - refused files (HEIC/RAW/…) never enter the ZIP — they were
 *     never photos this tool could write, and the manifest counts
 *     them out loud;
 *   - duplicate names get a numeric suffix, nothing overwritten;
 *   - the manifest is English-pinned (Phase 21: exported artifacts
 *     never follow the authoring machine's locale).
 *
 * Pure domain module (the §F boundary rules).
 *
 * Phase 26 — Photo geotagging. Pure TypeScript.
 */

import type { ZipEntry } from "@/features/batch/batchZip";
import { formatUtcOffset, type PhotoMatch } from "@/features/photos/matching";

/** One photo's export inputs (the hook distills the state). */
export interface PhotoZipItem {
  fileName: string;
  /** The original, untouched JPEG bytes. */
  bytes: Uint8Array;
  /**
   * The tagged bytes (null = unmatched → copied unchanged, reason in
   * the manifest).
   */
  injected: Uint8Array | null;
  /** The match outcome the manifest narrates. */
  match: PhotoMatch;
  /** EXIF DateTimeOriginal as stored (null = none). */
  exifTime: string | null;
  /** The calibration the pass ran under (the manifest's header). */
  timezoneOffsetMinutes: number;
  driftSeconds: number;
}

/** Per-photo outcome (the hook turns these into notices). */
export interface PhotoZipOutcome {
  /** The ZIP entry name this photo landed under. */
  entryName: string;
  /** Whether GPS was written (false = copied unchanged). */
  tagged: boolean;
}

const UTF8 = new TextEncoder();

/** `.jpg`/`.jpeg`/`.JPG` → stem + `.geotagged.jpg` (the Save As name). */
export function photoGeotaggedName(fileName: string): string {
  const stem = fileName.replace(/\.(jpe?g|jpeg)$/i, "");
  return `${stem || "photo"}.geotagged.jpg`;
}

/**
 * Deduplicate entry names: the first keeps its name, later collisions
 * gain ` - 2`, ` - 3`, … — the Phase 18 rule, nothing overwritten.
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

/** A +/− seconds label the manifest shares with the UI. */
function signedSeconds(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec === 0) return "0 s";
  return sec > 0 ? `+${sec} s` : `\u2212${Math.abs(sec)} s`;
}

/**
 * Build every ZIP entry: one JPEG per photo (tagged or unchanged, in
 * import order) + the manifest. Refused files are the caller's to
 * keep out (they never had bytes worth zipping).
 */
export function buildPhotoZipEntries(
  items: readonly PhotoZipItem[],
  exportedAt: Date = new Date(),
): { entries: ZipEntry[]; outcomes: PhotoZipOutcome[] } {
  const taken = new Set<string>();
  const entries: ZipEntry[] = [];
  const outcomes: PhotoZipOutcome[] = [];

  for (const item of items) {
    const tagged = item.injected !== null;
    const base = tagged ? photoGeotaggedName(item.fileName) : item.fileName;
    const entryName = dedupeName(base, taken);
    entries.push({
      name: entryName,
      bytes: tagged ? item.injected! : item.bytes,
    });
    outcomes.push({ entryName, tagged });
  }

  entries.push({
    name: "MANIFEST.txt",
    bytes: UTF8.encode(buildPhotoManifest(items, outcomes, exportedAt)),
  });
  return { entries, outcomes };
}

/**
 * The manifest: plain text, human-readable — the header states the
 * calibration, one block per photo says exactly what happened, and
 * the footer carries the two promises (nothing uploaded, no original
 * modified).
 */
export function buildPhotoManifest(
  items: readonly PhotoZipItem[],
  outcomes: readonly PhotoZipOutcome[],
  exportedAt: Date,
): string {
  const matchedCount = outcomes.filter((outcome) => outcome.tagged).length;
  // The header states the calibration this pass ran under (the first
  // item's — the UI runs one calibration for the whole batch).
  const tz = items[0]?.timezoneOffsetMinutes ?? 0;
  const drift = items[0]?.driftSeconds ?? 0;
  const calibration =
    `the camera clock set to ${formatUtcOffset(tz)}` +
    (drift !== 0
      ? ` and a ${drift > 0 ? "+" : "\u2212"}${Math.abs(drift)} s drift nudge`
      : "");
  const lines: string[] = [
    "GPX Repair Studio — photo geotag manifest",
    `Exported ${exportedAt.toISOString()}`,
    `${items.length} photo${items.length === 1 ? "" : "s"} · matched against the working track with ${calibration}.`,
    "Everything was matched and tagged in this browser — no photo was uploaded anywhere, and no original file was modified.",
    "",
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const outcome = outcomes[i]!;
    lines.push(`— ${item.fileName}`);
    lines.push(
      item.exifTime !== null
        ? `   camera clock: ${item.exifTime}`
        : "   camera clock: no timestamp in EXIF",
    );
    if (outcome.tagged) {
      const match = item.match;
      if (match.status === "matched") {
        lines.push(
          `   matched: ${signedSeconds(match.deltaMs)} from the track — ${match.lat.toFixed(6)}, ${match.lon.toFixed(6)}` +
            (match.ele !== null ? ` · ${Math.round(match.ele)} m` : ""),
        );
        if (match.onReconstructed) {
          lines.push(
            "   note: the position rides a drawn-in repair stretch — estimated geometry, disclosed.",
          );
        }
      }
      lines.push(`   GPS written into the copy: ${outcome.entryName}`);
    } else if (item.match.status === "no-timestamp") {
      lines.push("   result: no timestamp to match — copied unchanged.");
    } else if (item.match.status === "out-of-window") {
      const seconds = item.match.nearestDeltaSec;
      lines.push(
        `   result: outside the track's time by ${Number.isFinite(seconds) ? `${seconds} s` : "an unknown margin (the track has no timestamps)"} — copied unchanged.`,
      );
    }
    lines.push("");
  }

  lines.push(
    `${matchedCount} of ${items.length} photo${items.length === 1 ? "" : "s"} geotagged; the rest copied unchanged with the reason above.`,
    "Tagged copies carry a fresh GPS block (GPSLatitude/GPSLongitude/GPSTimeStamp); every other EXIF tag was preserved.",
  );
  return lines.join("\n") + "\n";
}

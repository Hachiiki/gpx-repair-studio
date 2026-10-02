/**
 * File download utility (docs/MASTER_PLAN.md §H-8 — Phase 7; §EE 14.4).
 *
 * The browser-side half of the export pipeline: hand the serialized file
 * to the user as `<original-name>.repaired.<ext>` via the standard Blob +
 * object URL + anchor click dance. The object URL is revoked shortly
 * after the click hands the blob to the browser's download pipeline —
 * long enough to be safe, short enough not to leak.
 *
 * Infrastructure layer: touches DOM globals by design (like the XmlIo
 * adapter, this is the one place it is allowed).
 */

import { exportFormatOption, type ExportFormat } from "@/features/formats/export-formats";

/** The MIME type every GPX consumer expects. */
const GPX_MIME_TYPE = "application/gpx+xml";

/**
 * Derive the download filename for one export format:
 * `route.gpx` → `route.repaired.gpx`, `route.repaired.kml`, …
 * (Phase 14 generalizes the Phase 7 GPX rule to every format; a source
 * in another format still gets the clean stem.)
 */
export function exportFileName(
  originalName: string,
  format: ExportFormat = "gpx",
): string {
  const option = exportFormatOption(format);
  const stem = originalName.replace(/\.(gpx|tcx|fit|xml|kml|geojson|csv)$/i, "");
  return `${stem}.repaired.${option.extension}`;
}

/** Derive the download filename: `route.gpx` → `route.repaired.gpx`. */
export function repairedFileName(originalName: string): string {
  return exportFileName(originalName, "gpx");
}

/** The MIME type a format's download carries. */
export function exportMimeType(format: ExportFormat): string {
  return exportFormatOption(format).mimeType;
}

/** Derive the share card's filename: `route.gpx` → `route.share-card.png`. */
export function shareCardFileName(originalName: string): string {
  const stem = originalName.replace(/\.gpx$/i, "");
  return `${stem}.share-card.png`;
}

/** Offer a blob as a file download (never throws for sane inputs). */
export function downloadBlobFile(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // The click synchronously hands the blob to the browser's download
  // pipeline; the revoke is deferred so nothing races it in any engine.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Offer a string as a file download (the GPX export's entry point). */
export function downloadTextFile(
  fileName: string,
  text: string,
  mimeType: string = GPX_MIME_TYPE,
): void {
  downloadBlobFile(fileName, new Blob([text], { type: mimeType }));
}

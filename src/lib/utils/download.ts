/**
 * File download utility (docs/MASTER_PLAN.md §H-8 — Phase 7).
 *
 * The browser-side half of the export pipeline: hand the serialized GPX
 * to the user as `<original-name>.repaired.gpx` via the standard Blob +
 * object URL + anchor click dance. The object URL is revoked shortly
 * after the click hands the blob to the browser's download pipeline —
 * long enough to be safe, short enough not to leak.
 *
 * Infrastructure layer: touches DOM globals by design (like the XmlIo
 * adapter, this is the one place it is allowed).
 */

/** The MIME type every GPX consumer expects. */
const GPX_MIME_TYPE = "application/gpx+xml";

/** Derive the download filename: `route.gpx` → `route.repaired.gpx`. */
export function repairedFileName(originalName: string): string {
  const stem = originalName.replace(/\.gpx$/i, "");
  return `${stem}.repaired.gpx`;
}

/** Offer a string as a file download (never throws for sane inputs). */
export function downloadTextFile(
  fileName: string,
  text: string,
  mimeType: string = GPX_MIME_TYPE,
): void {
  const blob = new Blob([text], { type: mimeType });
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

/**
 * The export format registry (§EE 14.4) — the single source for the
 * picker's options, file extensions, and MIME types. The GPX option is
 * the full-fidelity native export; KML/GeoJSON/CSV are the interchange
 * views built from the same working copy + merge.
 *
 * Phase 14 — Formats in & out. Pure data; no runtime behavior.
 */

/** Every format the pre-export dialog offers. */
export type ExportFormat = "gpx" | "kml" | "geojson" | "csv";

export interface ExportFormatOption {
  value: ExportFormat;
  /** The format's own name (never localized — a product noun). */
  label: string;
  /** The hint's DICTIONARY KEY (Phase 21 — resolved at render). */
  hintKey: string;
  /** Download file extension (without the dot). */
  extension: string;
  /** The MIME type handed to the browser with the blob. */
  mimeType: string;
}

export const EXPORT_FORMAT_OPTIONS: readonly ExportFormatOption[] = [
  {
    value: "gpx",
    label: "GPX",
    hintKey: "export.format.gpx",
    extension: "gpx",
    mimeType: "application/gpx+xml",
  },
  {
    value: "kml",
    label: "KML",
    hintKey: "export.format.kml",
    extension: "kml",
    mimeType: "application/vnd.google-earth.kml+xml",
  },
  {
    value: "geojson",
    label: "GeoJSON",
    hintKey: "export.format.geojson",
    extension: "geojson",
    mimeType: "application/geo+json",
  },
  {
    value: "csv",
    label: "CSV",
    hintKey: "export.format.csv",
    extension: "csv",
    mimeType: "text/csv",
  },
] as const;

/** Look up one option (defensive: unknown values fall back to GPX). */
export function exportFormatOption(format: ExportFormat): ExportFormatOption {
  return EXPORT_FORMAT_OPTIONS.find((o) => o.value === format) ?? EXPORT_FORMAT_OPTIONS[0];
}

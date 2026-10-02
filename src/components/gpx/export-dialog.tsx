/**
 * ExportDialog — the pre-export summary (docs/MASTER_PLAN.md §H-7,
 * Phase 7; §EE 14.4 Phase 14).
 *
 * The honesty surface of the export: what will change (inserted repairs,
 * never-touched originals), the final numbers, the settings (format +
 * mode + pretty-print), and every caveat that applies — repairs still
 * lacking durations export without timestamps, open editors are excluded,
 * a 1.0 file upgrades to 1.1 because the provenance extensions require it.
 *
 * Phase 14 adds the format picker: GPX (full fidelity, gpxr markers),
 * KML, GeoJSON, and CSV — the interchange views of the same working
 * copy + merge, each carrying the provenance labels its own way.
 *
 * Pure presentation: summary + settings in, intents out. Nothing is
 * computed here beyond formatting.
 */

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import {
  EXPORT_FORMAT_OPTIONS,
  type ExportFormat,
  type ExportSummary,
  type ExportMode,
} from "@/hooks/use-gpx-export";
import { formatDistanceMeters } from "@/lib/utils/format";

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ExportSummary;
  exportMode: ExportMode;
  prettyPrint: boolean;
  exportFormat: ExportFormat;
  onExportModeChange: (mode: ExportMode) => void;
  onPrettyPrintChange: (pretty: boolean) => void;
  onExportFormatChange: (format: ExportFormat) => void;
  onDownload: () => void;
}

const MODE_OPTIONS: readonly {
  value: ExportMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "structure-preserving",
    label: "Structure-preserving",
    hint: "Keep the original segments; each repair becomes its own segment at the gap. Recommended for Strava and Garmin Connect.",
  },
  {
    value: "merged",
    label: "Merged single segment",
    hint: "One continuous segment per track with the repairs interleaved — for tools that dislike multi-segment tracks.",
  },
];

export function ExportDialog({
  open,
  onOpenChange,
  summary,
  exportMode,
  prettyPrint,
  exportFormat,
  onExportModeChange,
  onPrettyPrintChange,
  onExportFormatChange,
  onDownload,
}: ExportDialogProps) {
  const hasRepairs = summary.repairCount > 0;
  const formatOption =
    EXPORT_FORMAT_OPTIONS.find((o) => o.value === exportFormat) ??
    EXPORT_FORMAT_OPTIONS[0];
  const prettyApplies = exportFormat !== "csv";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="export-dialog" className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export your repaired track</DialogTitle>
          <DialogDescription>
            {hasRepairs
              ? "The download includes your committed repairs, marked so re-uploading keeps them distinguishable from the recording."
              : "No committed repairs yet — the export will be a structure-preserved copy of the original file."}
          </DialogDescription>
        </DialogHeader>

        {/* What will change */}
        <div className="grid gap-2" data-testid="export-changes">
          <h4 className="text-sm font-semibold">What goes into the file</h4>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                {hasRepairs ? (
                  <>
                    <strong className="text-foreground">
                      {summary.repairCount} repair{summary.repairCount === 1 ? "" : "s"}
                    </strong>{" "}
                    inserted —{" "}
                    {summary.insertedPoints} reconstructed point
                    {summary.insertedPoints === 1 ? "" : "s"},{" "}
                    {formatDistanceMeters(summary.addedDistanceM)} added
                    (per-repair resampling exactly as previewed).
                  </>
                ) : (
                  "Every recorded point, byte-identical to the upload — nothing inserted, nothing rewritten."
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                Original points are <strong className="text-foreground">never modified</strong>{" "}
                — values are re-emitted verbatim; repairs only insert.
              </span>
            </li>
            {hasRepairs && (
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  Reconstructed points carry{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">gpxr</code>{" "}
                  provenance markers; a repair note is added to the file
                  metadata.
                </span>
              </li>
            )}
            {summary.reimportedPoints > 0 && (
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  {summary.reimportedPoints} points already marked from a
                  previous repair keep their markers.
                </span>
              </li>
            )}
            {(summary.workingDeletedPoints > 0 ||
              summary.workingSortedSegments > 0 ||
              summary.workingSmoothedElevations > 0) && (
              <li className="flex items-start gap-2" data-testid="export-working-note">
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  Deep-validation fixes ride along:{" "}
                  {[
                    summary.workingDeletedPoints > 0
                      ? `${summary.workingDeletedPoints} point${summary.workingDeletedPoints === 1 ? "" : "s"} removed`
                      : null,
                    summary.workingSortedSegments > 0
                      ? `${summary.workingSortedSegments} segment${summary.workingSortedSegments === 1 ? "" : "s"} sorted by time`
                      : null,
                    summary.workingSmoothedElevations > 0
                      ? `${summary.workingSmoothedElevations} elevation${summary.workingSmoothedElevations === 1 ? "" : "s"} smoothed`
                      : null,
                  ]
                    .filter((part) => part !== null)
                    .join(", ")}
                  {" — the repair note and gpxr:modified markers disclose every change."}
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Final numbers */}
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold">Final numbers</h4>
          <dl className="grid gap-1.5 text-sm" data-testid="export-summary-stats">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Repairs included</dt>
              <dd className="tabular-nums">{summary.repairCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Distance added</dt>
              <dd className="flex items-center gap-1.5 tabular-nums">
                {formatDistanceMeters(summary.addedDistanceM)}
                <ProvenanceBadge kind={hasRepairs ? "estimated" : "recorded"} />
              </dd>
            </div>
            {summary.gapsWithoutDuration > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Repairs without a duration</dt>
                <dd className="tabular-nums">{summary.gapsWithoutDuration}</dd>
              </div>
            )}
            {summary.repairsWithElevation > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Repairs with estimated elevation</dt>
                <dd className="flex items-center gap-1.5 tabular-nums">
                  {summary.repairsWithElevation}
                  <ProvenanceBadge kind="estimated" />
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Honest caveats */}
        {(
          summary.openRepairCount > 0 ||
          summary.gapsWithoutDuration > 0 ||
          summary.discrepancyCount > 0 ||
          summary.staleElevationCount > 0 ||
          summary.willUpgradeTo11 ||
          (!summary.hasTimingData && summary.fileTiming.startMs === null && hasRepairs)
        ) && (
          <div className="grid gap-1.5 rounded-md border bg-muted/40 p-3 text-sm" data-testid="export-caveats">
            {summary.openRepairCount > 0 && (
              <p>
                {summary.openRepairCount} repair
                {summary.openRepairCount === 1 ? " is" : "s are"} still open
                in the editor — close the editor to include
                {summary.openRepairCount === 1 ? " it" : " them"}.
              </p>
            )}
            {summary.gapsWithoutDuration > 0 && (
              <p>
                {summary.gapsWithoutDuration} repair
                {summary.gapsWithoutDuration === 1 ? "" : "s"} export
                {summary.gapsWithoutDuration === 1 ? "s" : ""} without
                timestamps — no duration was entered and none is invented.
              </p>
            )}
            {summary.discrepancyCount > 0 && (
              <p>
                {summary.discrepancyCount} manual duration
                {summary.discrepancyCount === 1 ? "" : "s"} disagree
                {summary.discrepancyCount === 1 ? "s" : ""} with the
                recorded gap span — interior timestamps follow the manual
                value; recorded timestamps stay untouched.
              </p>
            )}
            {summary.staleElevationCount > 0 && (
              <p data-testid="export-stale-elevation-note">
                {summary.staleElevationCount} repair
                {summary.staleElevationCount === 1 ? "'s elevation is" : "s' elevations are"}{" "}
                from an older route version — those values are excluded
                (never exported against a moved route). Re-estimate in the
                editor to include
                {summary.staleElevationCount === 1 ? " it" : " them"}.
              </p>
            )}
            {summary.willUpgradeTo11 && (
              <p>
                This GPX 1.0 file will be written as GPX 1.1 — the
                provenance markers require the 1.1 extension mechanism.
                All recorded values are preserved verbatim.
              </p>
            )}
            {!summary.hasTimingData && summary.fileTiming.startMs === null && hasRepairs && (
              <p>
                This file has no timing data and no start time was entered —
                reconstructed points export without timestamps (valid GPX).
                Enter a start time in the timing card to spread them.
              </p>
            )}
          </div>
        )}

        {/* Format picker (§EE 14.4) */}
        <fieldset className="grid gap-2.5" data-testid="export-format-settings">
          <legend className="text-sm font-semibold">File format</legend>
          {EXPORT_FORMAT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="grid cursor-pointer gap-1 rounded-md border p-3 text-sm transition-colors has-[[input:checked]]:border-primary"
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="export-format"
                  value={option.value}
                  checked={exportFormat === option.value}
                  onChange={() => onExportFormatChange(option.value)}
                  data-testid={`export-format-${option.value}`}
                  className="accent-primary"
                />
                {option.label}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">
                {option.hint}
              </span>
            </label>
          ))}
        </fieldset>

        {/* GPX layout (only the GPX export has segment modes) */}
        {exportFormat === "gpx" && (
          <fieldset className="grid gap-2.5" data-testid="export-settings">
            <legend className="text-sm font-semibold">GPX layout</legend>
            {MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="grid cursor-pointer gap-1 rounded-md border p-3 text-sm transition-colors has-[[input:checked]]:border-primary"
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="export-mode"
                    value={option.value}
                    checked={exportMode === option.value}
                    onChange={() => onExportModeChange(option.value)}
                    data-testid={`export-mode-${option.value}`}
                    className="accent-primary"
                  />
                  {option.label}
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  {option.hint}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {prettyApplies && (
          <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm font-medium">
            Human-readable formatting
            <Switch
              checked={prettyPrint}
              onCheckedChange={onPrettyPrintChange}
              data-testid="export-pretty-print"
              aria-label="Pretty-print the exported file"
            />
          </label>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-testid="export-cancel-button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="export-download-button"
            onClick={() => {
              onDownload();
              onOpenChange(false);
            }}
          >
            Download {formatOption.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

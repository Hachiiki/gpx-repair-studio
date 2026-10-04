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
import { useI18n } from "@/hooks/use-i18n";
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
  labelKey: string;
  hintKey: string;
}[] = [
  {
    value: "structure-preserving",
    labelKey: "export.dialog.modeStructure",
    hintKey: "export.dialog.modeStructureHint",
  },
  {
    value: "merged",
    labelKey: "export.dialog.modeMerged",
    hintKey: "export.dialog.modeMergedHint",
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
  const { t } = useI18n();
  const hasRepairs = summary.repairCount > 0;
  const formatOption =
    EXPORT_FORMAT_OPTIONS.find((o) => o.value === exportFormat) ??
    EXPORT_FORMAT_OPTIONS[0];
  const prettyApplies = exportFormat !== "csv";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="export-dialog" className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("export.dialog.title")}</DialogTitle>
          <DialogDescription>
            {hasRepairs
              ? t("export.dialog.descriptionRepairs")
              : t("export.dialog.descriptionPlain")}
          </DialogDescription>
        </DialogHeader>

        {/* What will change */}
        <div className="grid gap-2" data-testid="export-changes">
          <h4 className="text-sm font-semibold">
            {t("export.dialog.whatGoesIn")}
          </h4>
          <ul className="grid gap-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                {hasRepairs ? (
                  <>
                    <strong className="text-foreground">
                      {t(
                        summary.repairCount === 1
                          ? "export.dialog.repairsOne"
                          : "export.dialog.repairsMany",
                        { count: summary.repairCount },
                      )}
                    </strong>{" "}
                    {t("export.dialog.inserted", {
                      points: t(
                        summary.insertedPoints === 1
                          ? "export.dialog.pointsOne"
                          : "export.dialog.pointsMany",
                        { count: summary.insertedPoints },
                      ),
                      distance: formatDistanceMeters(summary.addedDistanceM),
                    })}
                  </>
                ) : (
                  t("export.dialog.everyRecordedPoint")
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                {t("export.dialog.originalPointsPrefix")}{" "}
                <strong className="text-foreground">
                  {t("export.dialog.originalPointsStrong")}
                </strong>{" "}
                {t("export.dialog.originalPointsRest")}
              </span>
            </li>
            {hasRepairs && (
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  {t("export.dialog.reconstructedCarry")}{" "}
                  {/* gpxr is the marker's machine token — artifact vocabulary, never localized */}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{"gpxr"}</code>{" "}
                  {t("export.dialog.reconstructedRest")}
                </span>
              </li>
            )}
            {summary.reimportedPoints > 0 && (
              <li className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  {t("export.dialog.reimportedNote", {
                    count: summary.reimportedPoints,
                  })}
                </span>
              </li>
            )}
            {(summary.workingDeletedPoints > 0 ||
              summary.workingSortedSegments > 0 ||
              summary.workingSmoothedElevations > 0 ||
              summary.workingSplitSegments > 0 ||
              summary.workingDuplicatedSegments > 0 ||
              summary.workingReorderedSegments > 0) && (
              <li className="flex items-start gap-2" data-testid="export-working-note">
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  {t("export.dialog.workingPrefix")}{" "}
                  {[
                    summary.workingDeletedPoints > 0
                      ? t(
                          summary.workingDeletedPoints === 1
                            ? "export.dialog.workingPointsRemovedOne"
                            : "export.dialog.workingPointsRemovedMany",
                          { count: summary.workingDeletedPoints },
                        )
                      : null,
                    summary.workingSplitSegments > 0
                      ? t(
                          summary.workingSplitSegments === 1
                            ? "export.dialog.workingSegmentsSplitOne"
                            : "export.dialog.workingSegmentsSplitMany",
                          { count: summary.workingSplitSegments },
                        )
                      : null,
                    summary.workingDuplicatedSegments > 0
                      ? t(
                          summary.workingDuplicatedSegments === 1
                            ? "export.dialog.workingCopiesInsertedOne"
                            : "export.dialog.workingCopiesInsertedMany",
                          { count: summary.workingDuplicatedSegments },
                        )
                      : null,
                    summary.workingReorderedSegments > 0
                      ? t(
                          summary.workingReorderedSegments === 1
                            ? "export.dialog.workingManualReordersOne"
                            : "export.dialog.workingManualReordersMany",
                          { count: summary.workingReorderedSegments },
                        )
                      : null,
                    summary.workingSortedSegments > 0
                      ? t(
                          summary.workingSortedSegments === 1
                            ? "export.dialog.workingSegmentsSortedOne"
                            : "export.dialog.workingSegmentsSortedMany",
                          { count: summary.workingSortedSegments },
                        )
                      : null,
                    summary.workingSmoothedElevations > 0
                      ? t(
                          summary.workingSmoothedElevations === 1
                            ? "export.dialog.workingElevationsSmoothedOne"
                            : "export.dialog.workingElevationsSmoothedMany",
                          { count: summary.workingSmoothedElevations },
                        )
                      : null,
                  ]
                    .filter((part) => part !== null)
                    .join(", ")}
                  {t("export.dialog.workingSuffix")}
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Final numbers */}
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold">
            {t("export.dialog.finalNumbers")}
          </h4>
          <dl className="grid gap-1.5 text-sm" data-testid="export-summary-stats">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("export.dialog.repairsIncluded")}
              </dt>
              <dd className="tabular-nums">{summary.repairCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("export.dialog.distanceAdded")}
              </dt>
              <dd className="flex items-center gap-1.5 tabular-nums">
                {formatDistanceMeters(summary.addedDistanceM)}
                <ProvenanceBadge kind={hasRepairs ? "estimated" : "recorded"} />
              </dd>
            </div>
            {summary.gapsWithoutDuration > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("export.dialog.repairsWithoutDuration")}
                </dt>
                <dd className="tabular-nums">{summary.gapsWithoutDuration}</dd>
              </div>
            )}
            {summary.repairsWithElevation > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("export.dialog.repairsWithElevation")}
                </dt>
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
                {t(
                  summary.openRepairCount === 1
                    ? "export.dialog.caveatOpenOne"
                    : "export.dialog.caveatOpenMany",
                  { count: summary.openRepairCount },
                )}
              </p>
            )}
            {summary.gapsWithoutDuration > 0 && (
              <p>
                {t(
                  summary.gapsWithoutDuration === 1
                    ? "export.dialog.caveatNoDurationOne"
                    : "export.dialog.caveatNoDurationMany",
                  { count: summary.gapsWithoutDuration },
                )}
              </p>
            )}
            {summary.discrepancyCount > 0 && (
              <p>
                {t(
                  summary.discrepancyCount === 1
                    ? "export.dialog.caveatDiscrepancyOne"
                    : "export.dialog.caveatDiscrepancyMany",
                  { count: summary.discrepancyCount },
                )}
              </p>
            )}
            {summary.staleElevationCount > 0 && (
              <p data-testid="export-stale-elevation-note">
                {t(
                  summary.staleElevationCount === 1
                    ? "export.dialog.caveatStaleOne"
                    : "export.dialog.caveatStaleMany",
                  { count: summary.staleElevationCount },
                )}
              </p>
            )}
            {summary.willUpgradeTo11 && (
              <p>{t("export.dialog.caveatUpgrade")}</p>
            )}
            {!summary.hasTimingData && summary.fileTiming.startMs === null && hasRepairs && (
              <p>{t("export.dialog.caveatNoTiming")}</p>
            )}
          </div>
        )}

        {/* Format picker (§EE 14.4) */}
        <fieldset className="grid gap-2.5" data-testid="export-format-settings">
          <legend className="text-sm font-semibold">
            {t("export.dialog.fileFormat")}
          </legend>
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
                {t(option.hintKey)}
              </span>
            </label>
          ))}
        </fieldset>

        {/* GPX layout (only the GPX export has segment modes) */}
        {exportFormat === "gpx" && (
          <fieldset className="grid gap-2.5" data-testid="export-settings">
            <legend className="text-sm font-semibold">
              {t("export.dialog.gpxLayout")}
            </legend>
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
                  {t(option.labelKey)}
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  {t(option.hintKey)}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {prettyApplies && (
          <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm font-medium">
            {t("export.dialog.prettyPrint")}
            <Switch
              checked={prettyPrint}
              onCheckedChange={onPrettyPrintChange}
              data-testid="export-pretty-print"
              aria-label={t("export.dialog.prettyPrintAria")}
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
            {t("export.dialog.cancel")}
          </Button>
          <Button
            type="button"
            data-testid="export-download-button"
            onClick={() => {
              onDownload();
              onOpenChange(false);
            }}
          >
            {t("export.dialog.download", { format: formatOption.label })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

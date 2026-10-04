/**
 * MergeExportCard — the Merge studio's end of the workflow (Task 43).
 *
 * One download, honestly described: what the merged file contains
 * (every recorded point, verbatim), and what it deliberately leaves
 * behind (single-file metadata like author and copyright — N of them
 * cannot be combined without inventing an order that lies). The
 * contract gate mirrors the intake: the export needs the tool's two
 * files minimum.
 *
 * Pure presentation: props in, the download intent out.
 *
 * Task 43 — Merge tool.
 */

"use client";

import { Download } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MergeExportCardProps {
  /** The merge meets the tool's contract (≥ 2 parsed files). */
  canDownload: boolean;
  /** Parsed files in the current merge (the summary copy's counts). */
  fileCount: number;
  pointCount: number;
  /** Serialize + download; returns the handed file name. */
  onDownload: () => string | null;
}

export function MergeExportCard({
  canDownload,
  fileCount,
  pointCount,
  onDownload,
}: MergeExportCardProps) {
  const { t } = useI18n();

  return (
    <Card data-testid="merge-export-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("merge.export.title")}
        </h3>
        <CardDescription>
          {t(
            fileCount === 1
              ? "merge.export.introOne"
              : "merge.export.introMany",
            { points: pointCount.toLocaleString(), count: fileCount },
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          disabled={!canDownload}
          onClick={() => onDownload()}
          data-testid="merge-download"
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] border-[1.5px] px-4 text-[14.5px] font-bold tracking-tight transition-[translate,box-shadow] duration-150",
            canDownload
              ? "border-ink bg-signal text-ink shadow-key hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2"
              : "cursor-not-allowed border-ink/20 bg-muted text-muted-foreground",
          )}
        >
          <Download className="size-[18px]" aria-hidden="true" />
          {t("merge.export.download")}
        </button>
        {!canDownload && (
          <p className="text-[12.5px] text-muted-foreground">
            {t("merge.export.needTwo")}
          </p>
        )}
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("merge.export.honesty")}
        </p>
      </CardContent>
    </Card>
  );
}

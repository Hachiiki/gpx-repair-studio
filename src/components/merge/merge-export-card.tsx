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
  return (
    <Card data-testid="merge-export-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          Download the merged file
        </h3>
        <CardDescription>
          One track: all {pointCount.toLocaleString()} points from{" "}
          {fileCount} file{fileCount === 1 ? "" : "s"}, in the order
          above, under the name you chose.
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
          Download .gpx
        </button>
        {!canDownload && (
          <p className="text-[12.5px] text-muted-foreground">
            A merge needs at least two files — add one more above.
          </p>
        )}
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Every recorded point, elevation, timestamp, and waypoint is
          carried over verbatim. Single-file metadata (author, copyright,
          per-track descriptions) is not — several files' worth cannot
          be combined honestly.
        </p>
      </CardContent>
    </Card>
  );
}

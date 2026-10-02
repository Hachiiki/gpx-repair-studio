/**
 * MergeFilesCard — the Merge studio's arrangement card (Task 43).
 *
 * The list IS the merge order: every row is one source file, and the
 * row's controls are the arrangement edits the tool promises — move up
 * / down, focus on the map, remove. "Add files" appends more (parsed
 * the same local pipeline as the intake); "Sort by start time" orders
 * the parsed files by their first timestamp (undated files keep their
 * relative order at the end).
 *
 * Every edit re-derives the merged model in the session hook, so the
 * map, the statistics, and the export follow each change immediately —
 * this card owns no merged state of its own.
 *
 * Pure presentation: props in (the session's file rows + intents),
 * no stores.
 *
 * Task 43 — Merge tool.
 */

"use client";

import { useId } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  FileUp,
  Locate,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { MergeFileEntry } from "@/hooks/use-merge-session";
import { formatDistanceMeters } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export interface MergeFilesCardProps {
  /** All collected files, in merge order (any status). */
  files: readonly MergeFileEntry[];
  /** Files parsed so far (the sort aid's enable condition). */
  parsedCount: number;
  /** Any parsed file has a timestamp (the sort aid's usefulness). */
  anyTimed: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  onFocusFile: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: readonly File[]) => void;
  onSortByStartTime: () => void;
}

export function MergeFilesCard({
  files,
  parsedCount,
  anyTimed,
  onMove,
  onFocusFile,
  onRemove,
  onAddFiles,
  onSortByStartTime,
}: MergeFilesCardProps) {
  const inputId = useId();

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onAddFiles(Array.from(list));
  };

  return (
    <Card data-testid="merge-files-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          Files in this merge
        </h3>
        <CardDescription>
          They join in this order — top to bottom, one route. Rearrange,
          remove, or add more; the map and the export follow along.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol
          className="flex flex-col gap-1.5"
          data-testid="merge-files-list"
          aria-label="Merge order"
        >
          {files.map((file, index) => (
            <li
              key={file.id}
              data-testid={`merge-order-${file.id}`}
              className="flex items-start gap-2 rounded-[8px] border-[1.5px] border-ink/20 bg-card px-2.5 py-2"
            >
              {/* The merge position — the number the order is. */}
              <span
                className="mt-0.5 w-4 shrink-0 text-right font-mono text-[12px] font-semibold text-shade"
                aria-label={`Position ${index + 1}`}
              >
                {index + 1}.
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13.5px] font-semibold"
                  title={file.fileName}
                >
                  {file.fileName}
                </span>
                {file.status === "parsing" && (
                  <span className="block text-[12px] text-muted-foreground">
                    Reading…
                  </span>
                )}
                {file.status === "parsed" && file.summary && (
                  <span className="block text-[12px] text-muted-foreground">
                    {file.summary.pointCount} points ·{" "}
                    {formatDistanceMeters(file.distanceM ?? 0)}
                    {!file.summary.hasTimingData && " · no timestamps"}
                  </span>
                )}
                {file.status === "error" && file.error && (
                  <span className="block text-[12px] text-destructive">
                    {file.error.title}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label={`Move ${file.fileName} up`}
                  disabled={index === 0}
                  onClick={() => onMove(file.id, -1)}
                  className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${file.fileName} down`}
                  disabled={index === files.length - 1}
                  onClick={() => onMove(file.id, 1)}
                  className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Show ${file.fileName} on the map`}
                  disabled={file.status !== "parsed"}
                  onClick={() => onFocusFile(file.id)}
                  className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Locate className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${file.fileName} from the merge`}
                  onClick={() => onRemove(file.id)}
                  className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[7px] border-[1.5px] border-ink/25 bg-card px-3 text-[13px] font-semibold",
              "transition-colors hover:border-ink/45 focus-visible:outline-2",
            )}
          >
            <FileUp className="size-4" aria-hidden="true" />
            Add files
          </label>
          <input
            id={inputId}
            type="file"
            accept=".gpx,.tcx,.fit,.xml,application/gpx+xml,text/xml"
            multiple
            className="sr-only"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={parsedCount < 2 || !anyTimed}
            onClick={onSortByStartTime}
            data-testid="merge-sort-by-time"
            className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border-[1.5px] border-ink/25 bg-card px-3 text-[13px] font-semibold transition-colors hover:border-ink/45 focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40"
          >
            <Clock className="size-4" aria-hidden="true" />
            Sort by start time
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

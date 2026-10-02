/**
 * MergeIntake — the Merge tool's file intake (Task 43).
 *
 * Lives on the landing's merge tool page (it replaces the upload zone
 * there — this tool needs TWO OR MORE files, so the intake is a
 * multi-file drop zone plus the collected-files list). Each file is
 * parsed locally the moment it lands; one bad file never blocks the
 * rest — its row shows the typed failure and a remove button.
 *
 * The Combine action is the tool's contract gate: it needs at least two
 * parsed files, and it opens the studio (the arrangement view).
 *
 * Self-wired (the merge section's front end, like CreateStudio wires
 * itself): the section's store holds the collected files, and the
 * section's session hook owns the parse pipeline. Pure presentation
 * beyond that — every button dispatches a store intent.
 *
 * Task 43 — Merge tool. Client component.
 */

"use client";

import { useId, useState } from "react";
import { Combine, FileUp, ShieldCheck, Sparkles, X } from "lucide-react";
import { useMergeSession } from "@/hooks/use-merge-session";
import { formatDistanceMeters } from "@/lib/utils/format";
import { makeSampleFile } from "@/samples";
import { cn } from "@/lib/utils";

export function MergeIntake() {
  const session = useMergeSession();
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void session.addFiles(Array.from(files));
  };

  const canCombine = session.parsedCount >= 2;

  return (
    <div className="flex w-full flex-col gap-3" data-testid="merge-intake">
      {/*
       * The drop zone: the same visual language as the single-file
       * UploadZone (dashed 2px ink border, card fill, signal hover),
       * pluralized — this door takes many files at once.
       */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed bg-card p-8 text-center transition-[border-color,background-color] duration-150",
          dragging
            ? "border-primary bg-signal/[0.08]"
            : "border-ink/35 hover:border-signal hover:bg-signal/[0.04]",
        )}
        data-testid="merge-intake-zone"
      >
        <label
          htmlFor={inputId}
          className="group/upload flex cursor-pointer flex-col items-center gap-3.5"
        >
          <span className="grid size-[52px] place-items-center rounded-[14px] border-[1.5px] border-signal bg-signal/10 shadow-key">
            <FileUp className="size-[22px] text-signal" aria-hidden="true" />
          </span>
          <span className="space-y-1">
            <span className="block text-[17px] font-bold tracking-tight">
              Drop your GPX files here
            </span>
            <span className="block text-[13px] text-muted-foreground">
              two or more — or{" "}
              <span className="font-semibold text-ink underline underline-offset-[3px]">
                click to browse
              </span>
            </span>
          </span>
        </label>
        <input
          id={inputId}
          type="file"
          accept=".gpx,application/gpx+xml,text/xml"
          multiple
          className="sr-only"
          onChange={(event) => {
            handleFiles(event.target.files);
            // Reset so picking the same file again re-fires onChange.
            event.target.value = "";
          }}
        />
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Files are read locally in this tab — nothing is uploaded anywhere.
      </p>

      {/*
       * Phase 12 — "Try a sample pair": the bundled two-part commute,
       * added through the same addFiles pipeline as a real drop (one
       * button, both files — the tool needs two to demonstrate).
       */}
      <div className="flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
        <span>No files handy?</span>
        <button
          type="button"
          data-testid="merge-try-sample"
          onClick={() =>
            void session.addFiles([
              makeSampleFile("merge-a"),
              makeSampleFile("merge-b"),
            ])
          }
          className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-1 font-semibold text-signal-ink underline decoration-signal/40 underline-offset-[3px] transition-colors hover:bg-signal/[0.08] focus-visible:outline-2"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          Try a sample pair
        </button>
      </div>

      {/*
       * The collected files: one row per file, in merge order. The row
       * is quiet while parsing, informative when parsed (points,
       * segments, distance), and honest on failure (the typed error's
       * title + detail, with the file removable).
       */}
      {session.files.length > 0 && (
        <ul
          className="flex flex-col gap-1.5"
          data-testid="merge-intake-files"
          aria-label="Collected files"
        >
          {session.files.map((file) => (
            <li
              key={file.id}
              className="flex items-start gap-2.5 rounded-[8px] border-[1.5px] border-ink/20 bg-card px-3 py-2.5"
              data-testid={`merge-file-${file.id}`}
            >
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
                    {file.summary.segmentCount}{" "}
                    segment{file.summary.segmentCount === 1 ? "" : "s"} ·{" "}
                    {formatDistanceMeters(file.distanceM ?? 0)}
                    {file.summary.waypointCount > 0 &&
                      ` · ${file.summary.waypointCount} waypoint${
                        file.summary.waypointCount === 1 ? "" : "s"
                      }`}
                  </span>
                )}
                {file.status === "error" && file.error && (
                  <span className="block text-[12px] text-destructive">
                    {file.error.title} — {file.error.detail}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.fileName}`}
                onClick={() => session.removeFile(file.id)}
                className="shrink-0 rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
       * The contract gate: two parsed files minimum. The hint states
       * the rule while it blocks, then disappears the moment the
       * contract is met.
       */}
      <button
        type="button"
        disabled={!canCombine}
        onClick={() => session.combine()}
        data-testid="merge-combine"
        className={cn(
          "group inline-flex h-11 items-center justify-center gap-2 rounded-[9px] border-[1.5px] px-4 text-[14.5px] font-bold tracking-tight transition-[translate,box-shadow,background-color] duration-150",
          canCombine
            ? "border-ink bg-signal text-ink shadow-key hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2"
            : "cursor-not-allowed border-ink/20 bg-muted text-muted-foreground",
        )}
      >
        <Combine className="size-[18px]" aria-hidden="true" />
        Combine into one route
      </button>
      {!canCombine && (
        <p className="text-center text-[12.5px] text-muted-foreground">
          {session.parsedCount === 0
            ? "Add at least two GPX files to combine them."
            : "One more file — a merge needs at least two."}
        </p>
      )}
      {canCombine && (
        <p className="text-center text-[12.5px] text-muted-foreground">
          They join in the order above — you can rearrange everything on
          the next page.
        </p>
      )}
    </div>
  );
}

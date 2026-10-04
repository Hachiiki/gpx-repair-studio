/**
 * BatchIntake (Phase 18 — docs/MASTER_PLAN.md §EE 18.1) — the batch
 * tool page's intake: the multi-file drop zone (the merge intake's
 * plural door, the same visual language), the collected queue with
 * per-file status, and the honest cap refusal.
 *
 * The queue parses as files arrive (the hook's pump — one at a time,
 * the Phase 9 worker's contract); the "Work the queue" gate opens the
 * studio once at least one file parsed. Files that fail stay listed
 * with their typed error and a remove control — one bad file never
 * blocks the rest (the merge tool's rule).
 *
 * Pure presentation: the binding from use-batch-session in, intents
 * out — no domain logic here.
 */

"use client";

import { useId, useState, type DragEvent } from "react";
import { FileUp, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { MAX_BATCH_FILES } from "@/state/batch-store";
import type { BatchSessionBinding } from "@/hooks/use-batch-session";
import { cn } from "@/lib/utils";

export function BatchIntake({ session }: { session: BatchSessionBinding }) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  /** The last cap refusal, rendered until the next drop/pick. */
  const [refused, setRefused] = useState<string | null>(null);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const { refused: turnedAway } = session.addFiles(Array.from(fileList));
    if (turnedAway.length > 0) {
      setRefused(
        turnedAway.length === 1
          ? `"${turnedAway[0]!.name}" was not added — the queue holds at most ${MAX_BATCH_FILES} files.`
          : `${turnedAway.length} files were not added — the queue holds at most ${MAX_BATCH_FILES} files.`,
      );
    } else {
      setRefused(null);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  return (
    <div className="flex w-full flex-col gap-3" data-testid="batch-intake">
      {/*
       * The drop zone: the same visual language as the single-file
       * UploadZone and the merge intake (dashed 2px ink border, card
       * fill, signal hover), pluralized.
       */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed bg-card p-8 text-center transition-[border-color,background-color] duration-150",
          dragging
            ? "border-primary bg-signal/[0.08]"
            : "border-ink/35 hover:border-signal hover:bg-signal/[0.04]",
        )}
        data-testid="batch-intake-zone"
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
              Drop your GPX, TCX, or FIT files here
            </span>
            <span className="block text-[13px] text-muted-foreground">
              one or many — or{" "}
              <span className="font-semibold text-ink underline underline-offset-[3px]">
                click to browse
              </span>
            </span>
          </span>
        </label>
        <input
          id={inputId}
          type="file"
          accept=".gpx,.tcx,.fit,.xml,application/gpx+xml,text/xml"
          multiple
          className="sr-only"
          data-testid="batch-intake-input"
          onChange={(event) => {
            addFiles(event.target.files);
            // Reset so picking the same files again re-fires onChange.
            event.target.value = "";
          }}
        />
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Files are read locally in this tab — nothing is uploaded anywhere.
      </p>

      {refused !== null && (
        <p
          role="alert"
          data-testid="batch-intake-refused"
          className="rounded-[8px] border-[1.5px] border-signal bg-signal/[0.06] px-3 py-2 text-[12.5px] leading-relaxed text-ink"
        >
          {refused}
        </p>
      )}

      {/* The collected queue, in intake order. */}
      {session.items.length > 0 && (
        <ul
          className="flex flex-col gap-1.5"
          data-testid="batch-intake-files"
          aria-label="Collected files"
        >
          {session.items.map((item) => {
            const view = session.views.find((v) => v.item.id === item.id);
            const status: { tone: StatusTone; label: string } =
              item.status === "parsed"
                ? { tone: "success", label: "Parsed" }
                : item.status === "failed"
                  ? { tone: "danger", label: "Failed" }
                  : item.status === "parsing"
                    ? { tone: "info", label: "Reading" }
                    : { tone: "neutral", label: "Queued" };
            return (
              <li
                key={item.id}
                data-testid={`batch-file-${item.id}`}
                className="flex items-start gap-2.5 rounded-[8px] border-[1.5px] border-ink/20 bg-card px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13.5px] font-semibold"
                    title={item.fileName}
                  >
                    {item.fileName}
                  </span>
                  {item.status === "queued" && (
                    <span className="block text-[12px] text-muted-foreground">
                      Waiting…
                    </span>
                  )}
                  {item.status === "parsing" && (
                    <span className="block text-[12px] text-muted-foreground">
                      Reading…
                    </span>
                  )}
                  {item.status === "parsed" && view?.working && (
                    <span className="block text-[12px] text-muted-foreground">
                      {pointCountLabel(view.working)} · deep checks{" "}
                      {view.report?.totalCount ?? 0} finding
                      {(view.report?.totalCount ?? 0) === 1 ? "" : "s"}
                    </span>
                  )}
                  {item.status === "failed" && item.error && (
                    <span className="block text-[12px] leading-snug text-muted-foreground">
                      <span className="font-semibold text-ink">
                        {item.error.title}.
                      </span>{" "}
                      {item.error.detail}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 pt-0.5">
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <button
                    type="button"
                    data-testid={`batch-remove-${item.id}`}
                    aria-label={`Remove ${item.fileName} from the queue`}
                    className="rounded-[5px] p-1 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                    onClick={() => session.removeItem(item.id)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* The studio gate: one parsed file is enough to start working. */}
      <Button
        type="button"
        data-testid="batch-enter-studio"
        size="lg"
        className="mt-1 w-full"
        disabled={session.aggregate.parsed === 0}
        onClick={session.enterStudio}
      >
        Work the queue ({session.aggregate.parsed} parsed)
      </Button>
    </div>
  );
}

/** The honest point count of a working copy ("1,234 points"). */
function pointCountLabel(working: {
  segments: readonly { points: readonly unknown[] }[];
}): string {
  let total = 0;
  for (const segment of working.segments) total += segment.points.length;
  return `${total.toLocaleString()} point${total === 1 ? "" : "s"}`;
}

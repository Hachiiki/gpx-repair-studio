/**
 * UploadZone — GPX file intake (drag & drop + file picker).
 *
 * Phase 2 scope: accepts one GPX file and hands it to the session hook;
 * parsing/validation/detection happen there. Includes the privacy promise
 * (§M-3) directly at the point of intake.
 *
 * Pure presentation: props in (onFile intent out). No file reading, no
 * parsing here.
 */

"use client";

import { useId, useState } from "react";
import { FileUp, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UploadZoneProps {
  /** Called with the single selected/dropped file. */
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadZone({ onFile, disabled = false }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "rounded-xl border-2 border-dashed bg-card p-11 text-center transition-[border-color,background-color] duration-150",
        dragging
          ? "border-primary bg-signal/[0.08]"
          : "border-ink/35 hover:border-signal hover:bg-signal/[0.04]",
        disabled && "pointer-events-none opacity-50",
      )}
      data-testid="upload-zone"
    >
      <label
        htmlFor={inputId}
        className="group/upload flex cursor-pointer flex-col items-center gap-4"
      >
        <span className="grid size-[58px] place-items-center rounded-[14px] border-[1.5px] border-signal bg-signal/10 shadow-key">
          <FileUp className="size-6 text-signal" aria-hidden="true" />
        </span>
        <span className="space-y-1">
          <span className="block text-lg font-bold tracking-tight">
            Drop your GPX file here
          </span>
          <span className="block text-[13.5px] text-muted-foreground">
            or{" "}
            <span className="font-semibold text-ink underline underline-offset-[3px]">
              click to browse
            </span>
          </span>
        </span>
        <span className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-ink/55" aria-hidden="true" />
          Processed entirely in your browser — the file never leaves this
          device.
        </span>
      </label>
      <input
        id={inputId}
        type="file"
        accept=".gpx,.xml"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          // Allow re-selecting the same file after a failed load attempt.
          event.target.value = "";
        }}
      />
    </div>
  );
}

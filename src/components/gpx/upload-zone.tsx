/**
 * UploadZone — GPX file intake (drag & drop + file picker).
 *
 * Phase 2 scope: accepts one GPX file and hands it to the session hook;
 * parsing/validation/detection happen there. Includes the privacy promise
 * (§M-3) directly at the point of intake.
 *
 * Phase 12: the optional "Try a sample" link — one curated synthetic
 * recording per tool (see src/samples/index.ts), loaded through the
 * SAME onFile pipeline as an upload, for the user without a GPX handy.
 * It sits AFTER the label (a button inside the label would steal its
 * clicks) and renders only when the tool page provides one.
 *
 * Pure presentation: props in (onFile intent out). No file reading, no
 * parsing here.
 */

"use client";

import { useId, useState } from "react";
import { FileUp, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export interface UploadZoneProps {
  /** Called with the single selected/dropped file. */
  onFile: (file: File) => void;
  disabled?: boolean;
  /** Phase 12 — load the tool's bundled sample (the same onFile path). */
  onTrySample?: () => void;
  /** What the sample link says it loads (e.g. "a sample ride"). */
  sampleLabelKey?: string;
}

export function UploadZone({
  onFile,
  disabled = false,
  onTrySample,
  sampleLabelKey = "sample.ride",
}: UploadZoneProps) {
  const { t } = useI18n();
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
            {t("upload.title")}
          </span>
          <span className="block text-[13.5px] text-muted-foreground">
            {t("upload.or")}{" "}
            <span className="font-semibold text-ink underline underline-offset-[3px]">
              {t("upload.browse")}
            </span>
          </span>
        </span>
        <span className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-ink/55" aria-hidden="true" />
          {t("upload.privacyLine")}
        </span>
      </label>
      {onTrySample && !disabled && (
        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
          <span>{t("upload.noFileHandy")}</span>
          <button
            type="button"
            data-testid="try-sample"
            onClick={onTrySample}
            className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-1 font-semibold text-signal-ink underline decoration-signal/40 underline-offset-[3px] transition-colors hover:bg-signal/[0.08] focus-visible:outline-2"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t("upload.trySample", { label: t(sampleLabelKey) })}
          </button>
        </div>
      )}
      <input
        id={inputId}
        type="file"
        accept=".gpx,.tcx,.fit,.xml"
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

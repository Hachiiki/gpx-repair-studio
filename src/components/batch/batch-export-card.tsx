/**
 * BatchExportCard (Phase 18 — §EE 18.2) — the queue's end: the ZIP
 * download + the export settings it honors.
 *
 * The settings are the SAME persisted preferences the single-file
 * export dialog uses (structure/mode, pretty-print) — one preference,
 * both doors. The ZIP carries one repaired GPX per parsed file plus
 * MANIFEST.txt (what changed per file); the card says so plainly.
 */

"use client";

import { Download, FileArchive } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BatchSessionBinding, ExportMode } from "@/hooks/use-batch-session";

const MODE_OPTIONS: readonly { value: ExportMode; label: string }[] = [
  { value: "structure-preserving", label: "Structure-preserving" },
  { value: "merged", label: "Merged single segment" },
];

export function BatchExportCard({ session }: { session: BatchSessionBinding }) {
  const parsed = session.aggregate.parsed;
  return (
    <Card data-testid="batch-export-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <FileArchive className="size-4 shrink-0 text-signal" aria-hidden="true" />
          Export the batch
        </h3>
        <CardDescription>
          One ZIP: a repaired GPX per parsed file + a manifest of what
          changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <fieldset className="grid gap-1.5" aria-label="Export mode">
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2 transition-colors has-checked:border-signal has-checked:bg-signal/[0.05]"
            >
              <input
                type="radio"
                name="batch-export-mode"
                value={option.value}
                checked={session.exportMode === option.value}
                onChange={() => session.setExportMode(option.value)}
                className="size-3.5 accent-signal"
              />
              <span className="text-[13px] font-semibold">{option.label}</span>
            </label>
          ))}
          <label className="mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2 transition-colors has-checked:border-signal has-checked:bg-signal/[0.05]">
            <input
              type="checkbox"
              checked={session.prettyPrint}
              onChange={(event) =>
                session.setPrettyPrint(event.target.checked)
              }
              className="size-3.5 accent-signal"
              data-testid="batch-export-pretty"
            />
            <span className="text-[13px] font-semibold">
              Pretty-print the XML
            </span>
          </label>
        </fieldset>

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Files with no applied fixes export unchanged (byte-identical to
          the identity export). Duplicate names get a suffix — nothing is
          overwritten. Everything is zipped in this tab.
        </p>

        <Button
          type="button"
          size="lg"
          data-testid="batch-download-zip"
          disabled={parsed === 0}
          onClick={() => session.downloadZip()}
        >
          <Download className="size-4" aria-hidden="true" />
          Download the ZIP ({parsed} file{parsed === 1 ? "" : "s"})
        </Button>
        {session.aggregate.exported > 0 && (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Last export covered {session.aggregate.exported} file
            {session.aggregate.exported === 1 ? "" : "s"} — you can export
            again anytime (files with later fixes are simply re-zipped).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

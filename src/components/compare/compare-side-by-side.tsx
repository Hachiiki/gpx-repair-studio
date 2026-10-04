/**
 * CompareSideBySideDialog (Phase 19 — §EE 19.1): the side-by-side
 * panels of the compare view.
 *
 * Two static SVG snapshots — the original recording and the outcome —
 * rendered at ONE shared scale (the compare hook computes both against
 * the same bounds), so the shapes are directly comparable: a deleted
 * detour shortens on the right, a reconstructed gap fills in orange,
 * the untouched majority sits identical on both. No WebGL, no map
 * state — the dialog is cheap to open over the live workspace and
 * prints exactly as shown.
 *
 * Pure presentation of the hook-built SVG strings (dangerouslySet-
 * InnerHTML over our own generated markup — coordinates and two
 * hex colors, no user text beyond escaped labels).
 */

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CompareSideBySide } from "@/hooks/use-compare";

export interface CompareSideBySideDialogProps {
  open: boolean;
  panels: CompareSideBySide | null;
  onClose: () => void;
}

const PANEL_META = [
  {
    key: "original" as const,
    label: "Original — as recorded",
    description:
      "The immutable recording. Changed stretches are dashed orange.",
  },
  {
    key: "after" as const,
    label: "After — edits and repairs",
    description:
      "The working copy plus committed repairs. The ghost underneath is the original.",
  },
];

export function CompareSideBySideDialog({
  open,
  panels,
  onClose,
}: CompareSideBySideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="compare-side-by-side"
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <div className="border-b-[1.5px] border-ink px-5 pt-4">
          <DialogTitle className="text-left text-[17px] font-bold tracking-tight">
            Before / after, side by side
          </DialogTitle>
          <DialogDescription className="mt-0.5 pb-3 text-left text-[13px] text-muted-foreground">
            Both pictures share one scale — the same track shape, the
            same zoom. The left panel is the original recording; the
            right is what the export will contain.
          </DialogDescription>
        </div>
        <div className="max-h-[min(72vh,720px)] overflow-y-auto p-5">
          {panels === null ? (
            <p
              className="py-10 text-center text-sm text-muted-foreground"
              data-testid="compare-side-by-side-empty"
            >
              Nothing to compare yet — the panels build once a file is
              parsed.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {PANEL_META.map((panel) => (
                <figure
                  key={panel.key}
                  className="overflow-hidden rounded-[10px] border-[1.5px] border-ink/20"
                  data-testid={`compare-panel-${panel.key}`}
                >
                  <figcaption className="border-b-[1.5px] border-ink/10 bg-ink/[0.03] px-3 py-2">
                    <p className="text-[13px] font-bold leading-tight">
                      {panel.label}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                      {panel.description}
                    </p>
                  </figcaption>
                  <div
                    role="img"
                    aria-label={panel.label}
                    data-testid={`compare-panel-svg-${panel.key}`}
                    className="bg-card [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{
                      __html:
                        panel.key === "original"
                          ? panels.originalSvg
                          : panels.afterSvg,
                    }}
                  />
                </figure>
              ))}
            </div>
          )}
          {/* The encoding key — the legend's vocabulary, shared scale note. */}
          <ul
            className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground"
            data-testid="compare-side-by-side-legend"
          >
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-6 rounded-full bg-ink/70" aria-hidden="true" />
              Track (solid)
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="h-1 w-6 rounded-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg,#75706B 0 5px,transparent 5px 9px)",
                }}
                aria-hidden="true"
              />
              Original ghost
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="h-1 w-6 rounded-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg,#FC4C02 0 6px,transparent 6px 10px)",
                }}
                aria-hidden="true"
              />
              Changed / repaired
            </li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

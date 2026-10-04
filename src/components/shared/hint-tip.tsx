/**
 * HintTip — the delayed, rich tooltip for tool affordances (QoL pass).
 *
 * "Hover for longer → learn the use case": a ~450 ms deliberate dwell
 * (not an accidental brush) opens a small card with the tool's title, a
 * one-to-two-sentence use case, and an optional keyboard hint. The extra
 * dwell time keeps the pointer path clean while still teaching the tool.
 *
 * Pure presentation: children in, Radix tooltip out. Wrap the interactive
 * element itself (`asChild`) so keyboard focus users get the same hint.
 */

"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";

/** Hover dwell before a hint opens (ms) — deliberate, not accidental. */
const HINT_DELAY_MS = 450;

export interface HintTipProps {
  /** Short tool name, e.g. "Draw mode". */
  title: string;
  /** One-to-two-sentence use case shown under the title. */
  description?: string;
  /** Keyboard accelerator to surface, e.g. "D". */
  kbd?: string;
  side?: "top" | "right" | "bottom" | "left";
  /** Rendered inside the tooltip next to the kbd hint. */
  children: ReactNode;
}

export function HintTip({
  title,
  description,
  kbd,
  side = "bottom",
  children,
}: HintTipProps) {
  const { t } = useI18n();
  return (
    <Tooltip delayDuration={HINT_DELAY_MS}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={6}
        className="max-w-60 border-ink bg-inkplus p-3 text-left text-paper"
        data-testid="hint-tip"
      >
        <p className="text-xs font-semibold">{title}</p>
        {description && (
          <p className="mt-1 text-[11px] leading-snug text-paper/80">
            {description}
          </p>
        )}
        {kbd && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-paper/70">
            <kbd className="rounded-[3px] border-b-2 border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-paper">
              {kbd}
            </kbd>
            <span>{t("shared.hint.toSwitch")}</span>
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

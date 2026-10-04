/**
 * BatchPresetCard (Phase 18 — §EE 18.2) — the batch operations door:
 * the Phase 13 preset chips. Clicking one emits the intent upward; the
 * STUDIO owns the pending state and renders the per-file preview
 * dialog (BatchPresetDialog), so the queue's inline "fix with a
 * preset" link and the chips share one dialog with no hidden state.
 */

"use client";

import { History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { PresetId } from "@/types/domain";
import { useI18n } from "@/hooks/use-i18n";

export interface BatchPresetCardProps {
  /** The preset chips to render (the Phase 13 vocabulary). */
  presets: readonly {
    id: PresetId;
    name: string;
    description: string;
  }[];
  /** A chip was picked — the studio opens the preview. */
  onOpenPreset: (id: PresetId) => void;
}

export function BatchPresetCard({
  presets,
  onOpenPreset,
}: BatchPresetCardProps) {
  const { t } = useI18n();
  return (
    <Card data-testid="batch-preset-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <History className="size-4 shrink-0 text-signal" aria-hidden="true" />
          {t("batch.preset.title")}
        </h3>
        <CardDescription>
          {t("batch.preset.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`batch-preset-${preset.id}`}
            aria-label={t("batch.preset.chipAria", {
              name: preset.name, // canonical (stored; manifest-pinned)
              descriptionKey: `preset.${preset.id}.description`,
            })}
            className="grid gap-0.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2 text-left transition-colors hover:border-signal hover:bg-signal/[0.05] focus-visible:outline-2"
            onClick={() => onOpenPreset(preset.id)}
          >
            <span className="text-[13px] font-semibold">{t(`preset.${preset.id}.name`)}</span>
            <span className="text-[11.5px] leading-relaxed text-muted-foreground">
              {t(`preset.${preset.id}.description`)}
            </span>
          </button>
        ))}
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          {t("batch.preset.note")}
        </p>
      </CardContent>
    </Card>
  );
}

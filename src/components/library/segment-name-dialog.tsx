/**
 * SegmentNameDialog (Phase 25.2) — the authoring draft's last step:
 * name the segment whose anchors were just picked or drawn, then save
 * it to the segments store. Rendered by the shell (the manager dialog
 * is closed at this point — the map just hosted the pick/draw), fed
 * by the use-segments draft. Esc/overlay-close discards the draft.
 *
 * The form is its own component mounted only while a naming draft is
 * live, so a fresh draft always starts with a fresh input — the
 * repo's no-setState-in-effect discipline (state resets by unmount,
 * never by effect).
 */

"use client";

import { useId, useState } from "react";
import { Flag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import type { SegmentsBinding } from "@/hooks/use-segments";
import {
  formatDistanceForUnit,
  type PaceUnit,
} from "@/lib/utils/format";

export interface SegmentNameDialogProps {
  segments: SegmentsBinding;
  paceUnit: PaceUnit;
}

export function SegmentNameDialog({
  segments: binding,
  paceUnit,
}: SegmentNameDialogProps) {
  const draft = binding.draft;
  if (draft === null || draft.phase !== "naming") {
    // Nothing being named — the shell keeps this mounted for the page
    // life; the form below mounts per draft instead.
    return null;
  }
  return (
    <SegmentNameForm
      key={draft.start.lat + draft.start.lon}
      binding={binding}
      paceUnit={paceUnit}
      draft={draft}
    />
  );
}

interface SegmentNameFormProps {
  binding: SegmentsBinding;
  paceUnit: PaceUnit;
  draft: Extract<SegmentsBinding["draft"], { phase: "naming" }>;
}

function SegmentNameForm({ binding, paceUnit, draft }: SegmentNameFormProps) {
  const { t } = useI18n();
  const inputId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const done = await binding.saveDraft(name);
    if (!done) setSaving(false);
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) binding.cancelDraft();
      }}
    >
      <DialogContent data-testid="segment-name-dialog" className="sm:max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <Flag className="size-4 text-signal" aria-hidden="true" />
          {t("segments.nameTitle")}
        </DialogTitle>
        <DialogDescription className="text-[13px] leading-relaxed">
          {t("segments.nameDesc", {
            length: formatDistanceForUnit(draft.lengthM, paceUnit),
            source:
              draft.source === "stretch"
                ? t("segments.sourceStretch")
                : t("segments.sourceDrawn"),
          })}
        </DialogDescription>
        <div className="grid gap-2">
          <label htmlFor={inputId} className="sr-only">
            {t("segments.nameLabel")}
          </label>
          <input
            id={inputId}
            type="text"
            value={name}
            data-testid="segment-name-input"
            autoFocus
            placeholder={t("segments.namePlaceholder")}
            className="h-9 w-full rounded-[7px] border-[1.5px] border-ink/25 bg-transparent px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ink"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={binding.cancelDraft}>
              {t("segments.nameCancel")}
            </Button>
            <Button
              size="sm"
              data-testid="segment-name-save"
              disabled={name.trim().length === 0 || saving}
              onClick={() => void save()}
            >
              {t("segments.nameSave")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

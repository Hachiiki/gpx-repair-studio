/**
 * SessionFinishedBanner — the finished-on-export state's face (Task 75).
 *
 * Every dashboard's download marks its session finished; the banner says
 * so and offers the three exits the user asked for: SAVE the session to
 * the shelf (an inline name row — the same capture the header's Sessions
 * door writes), a FRESH WORKSPACE (the section reset onto its landing
 * tool page), and BACK TO HOME (reset + the tool cards). A dismiss keeps
 * the session open — an export is not a locked door. The workspace under
 * it stays fully functional (another export simply re-marks it).
 *
 * Pure presentation: the binding (from `useSessionFinish`) in, intents
 * out — no store reads, no capture logic (the §F rule).
 */

"use client";

import { useState } from "react";
import { Check, House, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import type { SessionFinishBinding } from "@/hooks/use-session-finish";

export interface SessionFinishedBannerProps {
  /** The finished-session controller (useSessionFinish's binding). */
  finish: SessionFinishBinding;
}

export function SessionFinishedBanner({ finish }: SessionFinishedBannerProps) {
  const { t } = useI18n();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  if (finish.finishedAt === null) return null;

  const openSave = () => {
    setName(finish.suggestedName);
    setSaveOpen(true);
  };

  const confirmSave = () => {
    void finish.save(name);
  };

  return (
    <div
      className="grid gap-2 rounded-md border-[1.5px] border-signal/50 bg-signal/[0.06] px-3 py-2.5"
      data-testid="session-finished-banner"
      role="status"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-signal/[0.15] text-signal"
          aria-hidden="true"
        >
          <Check className="size-3" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-snug">
            {t("shell.finished.title")}
          </p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {t("shell.finished.blurb")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
          aria-label={t("shell.finished.dismissA11y")}
          data-testid="session-finished-dismiss"
          onClick={() => {
            setSaveOpen(false);
            finish.dismiss();
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      {/* The three exits. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {finish.canSave && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-full border-[1.25px] border-ink/25 px-3 text-[12px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
            data-testid="session-finished-save"
            disabled={finish.saveState === "saving" || finish.saveState === "saved"}
            onClick={() => {
              if (finish.saveState !== "saved") openSave();
            }}
          >
            <Save className="size-3.5" aria-hidden="true" />
            {finish.saveState === "saved"
              ? t("shell.finished.saved")
              : t("shell.finished.saveButton")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 rounded-full border-[1.25px] border-ink/25 px-3 text-[12px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
          data-testid="session-finished-fresh"
          onClick={finish.fresh}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t("shell.finished.freshButton")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 rounded-full border-[1.25px] border-ink/25 px-3 text-[12px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
          data-testid="session-finished-home"
          onClick={finish.home}
        >
          <House className="size-3.5" aria-hidden="true" />
          {t("shell.finished.homeButton")}
        </Button>
      </div>

      {/* The inline name row (Save's second step). */}
      {finish.canSave && saveOpen && finish.saveState !== "saved" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            className="h-8 min-w-0 flex-1 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2 text-xs transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
            data-testid="session-finished-name"
            aria-label={t("shell.finished.saveA11y")}
            placeholder={finish.suggestedName}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                confirmSave();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            data-testid="session-finished-save-confirm"
            disabled={finish.saveState === "saving"}
            onClick={confirmSave}
          >
            <Check className="size-3.5" aria-hidden="true" />
            {t("shell.finished.saveConfirm")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
            data-testid="session-finished-save-cancel"
            onClick={() => setSaveOpen(false)}
          >
            <X className="size-3.5" aria-hidden="true" />
            {t("shell.finished.saveCancel")}
          </Button>
          {finish.saveState === "failed" && (
            <p className="w-full text-xs text-destructive" role="alert">
              {t("shell.finished.saveFailed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

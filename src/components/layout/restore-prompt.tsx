/**
 * RestorePrompt (Phase 10) — the landing page's session-recovery card.
 *
 * Appears at the top of the tool cards exactly when IndexedDB holds
 * restorable work (usually one session; the list covers the rare case of
 * work in several tools). One row per session: what it is, what would
 * come back, how long ago it was saved, and the two honest actions —
 * Restore (the session re-opens through the ordinary load path) or
 * Discard (the record is deleted, nothing else changes).
 *
 * The footer is the §M-3 disclosure in plain words: what is stored, that
 * it never leaves the device, and how to clear all of it — with a door
 * into the full "Privacy & Data" page (Phase 11's InfoDialog, opened
 * through the shell-owned pane state).
 *
 * Phase 10 — Session Recovery. Pure presentation: the controller prop
 * carries every behavior (hooks/use-session-recovery).
 */

"use client";

import type { ReactNode } from "react";
import {
  ArchiveRestore,
  History,
  Loader2,
  PencilRuler,
  RotateCcw,
  Trash2,
  Watch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
import { translateLabel } from "@/i18n/runtime";
import type { SessionRecoveryController } from "@/hooks/use-session-recovery";
import type { SessionSection } from "@/lib/storage/sessionStore";

const SECTION_META: Record<
  SessionSection,
  { kickerKey: string; icon: LucideIcon }
> = {
  repair: { kickerKey: "restore.kicker.repair", icon: Wrench },
  recovery: { kickerKey: "restore.kicker.recovery", icon: History },
  create: { kickerKey: "restore.kicker.create", icon: Watch },
  plan: { kickerKey: "restore.kicker.plan", icon: PencilRuler },
};

/**
 * Plain-language "saved X ago" — one/many key pairs per unit, with
 * {count} interpolation (Phase 21: the locale machinery is here now,
 * so the string rides the tours dictionary like everything else).
 */
function savedAgo(t: TranslatorArg, savedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60_000));
  if (minutes < 1) return t("restore.savedJustNow");
  if (minutes === 1) return t("restore.savedMinuteOne");
  if (minutes < 60) return t("restore.savedMinuteMany", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours === 1) return t("restore.savedHourOne");
  if (hours < 24) return t("restore.savedHourMany", { count: hours });
  const days = Math.round(hours / 24);
  return days === 1
    ? t("restore.savedDayOne")
    : t("restore.savedDayMany", { count: days });
}

export interface RestorePromptProps {
  /** The recovery controller (offers + actions). */
  recovery: SessionRecoveryController;
  /**
   * Phase 11 — open the full "Privacy & Data" page (the InfoDialog's
   * privacy pane). Optional: the prompt works without it (tests render
   * it bare), and the shell always provides it.
   */
  onOpenPrivacy?: () => void;
}

export function RestorePrompt({
  recovery,
  onOpenPrivacy,
}: RestorePromptProps): ReactNode {
  const { t } = useI18n();
  if (recovery.offers.length === 0) return null;
  return (
    <section
      data-testid="restore-prompt"
      aria-label={t("restore.ariaLabel")}
      className="rounded-[10px] border-[1.5px] border-ink bg-card text-left"
    >
      <div className="flex items-start gap-3 border-b-[1.5px] border-ink/15 p-4">
        <span className="inline-flex shrink-0 rounded-[10px] border-[1.5px] border-signal bg-signal/10 p-2">
          <ArchiveRestore
            className="size-[18px] text-signal"
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] font-bold tracking-tight">
            {t("restore.title")}
          </h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("restore.blurb")}
          </p>
        </div>
      </div>

      <ul role="list" className="divide-y-[1.5px] divide-ink/10">
        {recovery.offers.map((offer) => {
          const meta = SECTION_META[offer.section];
          const busy = recovery.restoring === offer.section;
          return (
            <li
              key={offer.section}
              data-testid={`restore-offer-${offer.section}`}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <meta.icon
                  className="mt-0.5 size-4 shrink-0 text-shade"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-shade">
                      {t(meta.kickerKey)}
                    </span>
                    <span
                      className="truncate text-[14.5px] font-semibold"
                      data-testid={`restore-label-${offer.section}`}
                    >
                      {translateLabel(t, offer.label)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {offer.detail.map((part) => translateLabel(t, part)).join(t("restore.desc.join"))} · {savedAgo(t, offer.savedAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                <Button
                  type="button"
                  size="sm"
                  data-testid={`restore-accept-${offer.section}`}
                  disabled={recovery.restoring !== null}
                  onClick={() => recovery.restore(offer.section)}
                >
                  {busy ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      {t("restore.restoring")}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" aria-hidden="true" />
                      {t("restore.restore")}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid={`restore-discard-${offer.section}`}
                  disabled={recovery.restoring !== null}
                  onClick={() => recovery.discard(offer.section)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("restore.discard")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {/*
       * The §M-3 disclosure (Phase 10's slice of it): what is stored,
       * where it stays, how to remove it — and, since Phase 11, the
       * door to the full "Privacy & Data" page.
       */}
      <div className="flex flex-col gap-2 border-t-[1.5px] border-ink/15 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[52ch] text-[12px] leading-relaxed text-muted-foreground">
          {t("restore.privacy")}
          {onOpenPrivacy && (
            <>
              {" "}
              <button
                type="button"
                data-testid="restore-open-privacy"
                onClick={onOpenPrivacy}
                className="rounded-[4px] font-semibold text-muted-foreground underline decoration-ink/25 underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2"
              >
                {t("restore.morePrivacy")}
              </button>
            </>
          )}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          data-testid="restore-clear-all"
          disabled={recovery.restoring !== null}
          onClick={() => recovery.clearAll()}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t("restore.clearAll")}
        </Button>
      </div>
    </section>
  );
}

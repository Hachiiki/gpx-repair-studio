"use client";

/**
 * RouterConsentDialog (§EE 17.2) — the road-snapping privacy gate.
 *
 * Nothing routes until this dialog is answered. It states, in plain
 * language: WHAT leaves (the points of the line you drew — never the
 * file, never recorded points), WHERE it goes (the public demo
 * servers, or YOUR own router when one is configured), HOW LONG the
 * permission lasts (this session only — a fresh page load asks
 * again), and how to take it back (the same dialog, any time, from
 * the footer chip).
 *
 * Two modes, one component:
 *   - grant (consent unknown/declined): "Enable road snapping" vs
 *     "Keep lines local";
 *   - manage (consent granted): the current state + "Turn off".
 *
 * Pure presentation: props in, intents out — the shell owns the
 * state (the ui-store's transient consent + open flag).
 *
 * Phase 17 — Road snapping, opt-in.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Milestone, ShieldCheck } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

export interface RouterConsentDialogProps {
  open: boolean;
  /** The session's current consent state. */
  consent: "unknown" | "granted" | "declined";
  /** The hosts drawn points would go to (plain label, e.g. "router.project-osrm.org"). */
  hostsLabel: string;
  /** True when the user has configured their own router (copy adjusts). */
  customRouter: boolean;
  /** Grant for this session (grant mode's primary). */
  onGrant: () => void;
  /** Decline / keep lines local (grant mode's secondary). */
  onDecline: () => void;
  /** Revoke an existing grant (manage mode). */
  onRevoke: () => void;
  /** Close without answering (never shown as "consent"). */
  onClose: () => void;
  /** Open the privacy pane (provider details + self-hosting). */
  onOpenPrivacy: () => void;
}

export function RouterConsentDialog({
  open,
  consent,
  hostsLabel,
  customRouter,
  onGrant,
  onDecline,
  onRevoke,
  onClose,
  onOpenPrivacy,
}: RouterConsentDialogProps) {
  const { t } = useI18n();
  const managing = consent === "granted";
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent data-testid="router-consent-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {managing ? (
              <ShieldCheck className="size-4 text-signal" aria-hidden="true" />
            ) : (
              <Milestone className="size-4 text-signal" aria-hidden="true" />
            )}
            {managing ? t("shared.consent.titleManaging") : t("shared.consent.titleGrant")}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              {managing ? (
                <p data-testid="router-consent-manage-note">
                  {t("shared.consent.managePrefix")}{" "}
                  <span className="font-mono text-[11.5px] text-foreground">
                    {hostsLabel}
                  </span>
                  {t("shared.consent.manageSuffix")}
                </p>
              ) : (
                <>
                  <p data-testid="router-consent-notice">
                    {t("shared.consent.noticeLead")}{" "}
                    <span className="font-semibold text-foreground">
                      {t("shared.consent.roads")}
                    </span>
                    {t("shared.consent.sepComma")}
                    <span className="font-semibold text-foreground">
                      {t("shared.consent.footpaths")}
                    </span>
                    {t("shared.consent.sepOr")}
                    <span className="font-semibold text-foreground">
                      {t("shared.consent.snapToRoad")}
                    </span>{" "}
                    {t("shared.consent.controlsGoTo")}{" "}
                    <span className="font-mono text-[11.5px] text-foreground">
                      {hostsLabel}
                    </span>{" "}
                    {t("shared.consent.toFindRoads")}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      {t("shared.consent.neverLine")}
                    </span>{" "}
                    {t("shared.consent.neverRest")}
                  </p>
                </>
              )}
              {customRouter && (
                <p className="rounded-md border border-ink/15 bg-ink/[0.03] px-3 py-2 text-[12.5px]">
                  {t("shared.consent.customPrefix")}{" "}
                  <span className="font-mono text-[11.5px]">{hostsLabel}</span>
                  {t("shared.consent.customSuffix")}
                </p>
              )}
              <p className="text-[12px]">
                {t("shared.consent.sessionScope")}{" "}
                <button
                  type="button"
                  className="font-semibold text-foreground underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
                  data-testid="router-consent-privacy-link"
                  onClick={onOpenPrivacy}
                >
                  {t("shared.consent.privacyLink")}
                </button>{" "}
                {t("shared.consent.privacyRest")}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          {managing ? (
            <>
              <Button
                type="button"
                variant="outline"
                data-testid="router-consent-done"
                onClick={onClose}
              >
                {t("shared.consent.done")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                data-testid="router-consent-revoke"
                onClick={onRevoke}
              >
                {t("shared.consent.turnOff")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                data-testid="router-consent-decline"
                onClick={onDecline}
              >
                {t("shared.consent.keepLocal")}
              </Button>
              <Button
                type="button"
                data-testid="router-consent-grant"
                onClick={onGrant}
              >
                {t("shared.consent.enable")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

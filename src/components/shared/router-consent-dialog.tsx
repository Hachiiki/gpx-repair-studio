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
            {managing ? "Road snapping is on" : "Turn on road snapping?"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              {managing ? (
                <p data-testid="router-consent-manage-note">
                  Road snapping is enabled for this session. The points of
                  every line you draw with Roads, Footpaths, or Snap to road
                  are being sent to{" "}
                  <span className="font-mono text-[11.5px] text-foreground">
                    {hostsLabel}
                  </span>
                  . Nothing else ever leaves — not your file, not your
                  recorded points. It turns off when you close this tab, or
                  right now:
                </p>
              ) : (
                <>
                  <p data-testid="router-consent-notice">
                    Road snapping sends the drawn line to a third-party
                    router: the points you place on a line with the{" "}
                    <span className="font-semibold text-foreground">
                      Roads
                    </span>
                    ,{" "}
                    <span className="font-semibold text-foreground">
                      Footpaths
                    </span>
                    , or{" "}
                    <span className="font-semibold text-foreground">
                      Snap to road
                    </span>{" "}
                    controls go to{" "}
                    <span className="font-mono text-[11.5px] text-foreground">
                      {hostsLabel}
                    </span>{" "}
                    to find the roads between them.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">
                      Never your GPX file, never your recorded points
                    </span>{" "}
                    — only what you yourself draw. Straight lines and the
                    Curve pen stay fully local either way, and you can turn
                    this off any time from the footer.
                  </p>
                </>
              )}
              {customRouter && (
                <p className="rounded-md border border-ink/15 bg-ink/[0.03] px-3 py-2 text-[12.5px]">
                  You have configured your own routing server — drawn points
                  go there, to{" "}
                  <span className="font-mono text-[11.5px]">{hostsLabel}</span>
                  , not to a public service.
                </p>
              )}
              <p className="text-[12px]">
                This permission lasts for this session only — a fresh page
                load asks again.{" "}
                <button
                  type="button"
                  className="font-semibold text-foreground underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
                  data-testid="router-consent-privacy-link"
                  onClick={onOpenPrivacy}
                >
                  Privacy &amp; data
                </button>{" "}
                has the full list and the self-hosting instructions.
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
                Done
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                data-testid="router-consent-revoke"
                onClick={onRevoke}
              >
                Turn off for this session
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
                Keep lines local
              </Button>
              <Button
                type="button"
                data-testid="router-consent-grant"
                onClick={onGrant}
              >
                Enable for this session
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

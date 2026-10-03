/**
 * SiteFooter (Phase 11) — the app footer.
 *
 * The same local-first line the footer always carried, plus the two
 * Phase 11 doors: "About" and "Privacy & data" open the InfoDialog
 * (the shell owns its state; intents out). Link-styled buttons, not
 * anchors — there is no route to go to, and the honest semantics of
 * "this opens a dialog" belong on a button.
 *
 * Phase 12 adds two controls: the theme toggle (System / Light / Dark
 * — the Field Plot segmented chip) and the "Shortcuts & help" door
 * (the same dialog the "?" key opens).
 *
 * Phase 17 (§EE 17.2) adds the consent chip: while road snapping is
 * enabled for the session, the footer SAYS SO — the hosts drawn
 * points go to, one click from taking it back. Visible in every app
 * state, exactly like the privacy line above it.
 *
 * Pure presentation; visible in every app state (idle, loading,
 * workspace) so the privacy disclosure is never more than one click
 * away — §M-3's "stated in the app" applies everywhere, not just the
 * landing.
 */

"use client";

import { Keyboard, Milestone, ShieldCheck } from "lucide-react";
import { SHELL_CONTAINER } from "@/components/layout/shell-container";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { InfoPane } from "@/components/layout/info-dialog";
import { cn } from "@/lib/utils";

export interface SiteFooterProps {
  /** Open the InfoDialog on a pane — the shell's state setter. */
  onOpenInfo: (pane: InfoPane) => void;
  /** Phase 12 — open the Shortcuts & help dialog. */
  onOpenHelp: () => void;
  /** Phase 17 — the session's road-snapping consent (chip shows while granted). */
  routerConsent: "unknown" | "granted" | "declined";
  /** Phase 17 — the hosts drawn points go to under the live config. */
  routerHostsLabel: string;
  /** Phase 17 — open the consent dialog (manage mode). */
  onOpenRouterConsent: () => void;
}

const LINK_CLASS =
  "rounded-[4px] font-semibold text-muted-foreground underline decoration-ink/25 underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2";

export function SiteFooter({
  onOpenInfo,
  onOpenHelp,
  routerConsent,
  routerHostsLabel,
  onOpenRouterConsent,
}: SiteFooterProps) {
  return (
    <footer
      data-print-hide
      data-testid="site-footer"
      className="mt-auto border-t-[1.5px] border-ink/15 bg-background"
    >
      <div
        className={cn(
          SHELL_CONTAINER,
          "flex flex-col items-center gap-2.5 py-4 text-[12.5px] text-muted-foreground sm:flex-row sm:justify-center sm:gap-3",
        )}
      >
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            All processing happens in your browser — the file never
            leaves this device.
          </span>
        </p>
        {/*
         * §EE 17.2 — the consent state, shown while active: the one
         * egress the user has personally switched on is named in the
         * same breath as the local-first line, one click from off.
         */}
        {routerConsent === "granted" && (
          <>
            <span
              className="hidden h-3.5 w-px bg-ink/20 sm:block"
              aria-hidden="true"
            />
            <button
              type="button"
              data-testid="footer-router-consent"
              onClick={onOpenRouterConsent}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-signal/40 bg-signal/[0.07] px-2 py-0.5 text-[11.5px] font-semibold text-ink transition-colors hover:bg-signal/[0.14] focus-visible:outline-2"
            >
              <Milestone className="size-3.5 shrink-0 text-signal" aria-hidden="true" />
              Road snapping on — drawn points go to{" "}
              <span className="font-mono text-[10.5px]">{routerHostsLabel}</span>
            </button>
          </>
        )}
        <span
          className="hidden h-3.5 w-px bg-ink/20 sm:block"
          aria-hidden="true"
        />
        <ThemeToggle />
        <span
          className="hidden h-3.5 w-px bg-ink/20 sm:block"
          aria-hidden="true"
        />
        <nav
          aria-label="About, help, and privacy"
          className="flex items-center gap-3"
        >
          <button
            type="button"
            data-testid="footer-about"
            onClick={() => onOpenInfo("about")}
            className={LINK_CLASS}
          >
            About
          </button>
          <button
            type="button"
            data-testid="footer-help"
            onClick={onOpenHelp}
            className={cn(LINK_CLASS, "inline-flex items-center gap-1")}
          >
            <Keyboard className="size-3.5" aria-hidden="true" />
            Shortcuts &amp; help
          </button>
          <button
            type="button"
            data-testid="footer-privacy"
            onClick={() => onOpenInfo("privacy")}
            className={LINK_CLASS}
          >
            Privacy &amp; data
          </button>
        </nav>
      </div>
    </footer>
  );
}

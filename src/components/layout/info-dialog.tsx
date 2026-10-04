/**
 * InfoDialog (Phase 11) — the host overlay for "About" and
 * "Privacy & Data".
 *
 * One dialog, two panes, a real tablist in the header (arrow keys
 * walk it, aria-selected/aria-controls wired) — switching panes keeps
 * the overlay open, so the footer's two links and the restore
 * prompt's privacy link all lead into the same surface with the
 * right pane preselected.
 *
 * Store-driven like every dialog in this app (plain buttons flip
 * state; the shell owns it), so the Dialog primitive's focus-return
 * handling applies. Pure presentation otherwise: pane + intents out.
 */

"use client";

import { useRef } from "react";
import { Info, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { AboutPane, PrivacyPane } from "@/components/layout/info-content";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/** Which pane is open — `null` while closed. */
export type InfoPane = "about" | "privacy";

/**
 * The panes — ids and icons are structural; the labels and titles
 * resolve through the translator at render time (Phase 21).
 */
const PANES: readonly {
  id: InfoPane;
  labelKey: string;
  icon: typeof Info;
  titleKey: string;
}[] = [
  {
    id: "about",
    labelKey: "info.tab.about",
    icon: Info,
    titleKey: "info.tab.aboutTitle",
  },
  {
    id: "privacy",
    labelKey: "info.tab.privacy",
    icon: ShieldCheck,
    titleKey: "info.tab.privacyTitle",
  },
];

export interface InfoDialogProps {
  /** The open pane, or null while closed. */
  pane: InfoPane | null;
  /** Switch panes while open. */
  onPaneChange: (pane: InfoPane) => void;
  /** Close (Esc, X, or a click on the backdrop). */
  onClose: () => void;
}

export function InfoDialog({ pane, onPaneChange, onClose }: InfoDialogProps) {
  const { t } = useI18n();
  const tablistRef = useRef<HTMLDivElement>(null);

  // Arrow-key tablist traversal (WAI-ARIA tabs pattern) — Left/Up
  // walks backward, Right/Down forward, Home/End jump to the ends.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const order: InfoPane[] = ["about", "privacy"];
    const index = pane === null ? 0 : order.indexOf(pane);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % order.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + order.length) % order.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = order.length - 1;
    }
    if (next === null) return;
    event.preventDefault();
    onPaneChange(order[next]);
    // Focus follows the selection (the pattern's "automatic
    // activation" — these tabs switch on move).
    const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>(
      "[role='tab']",
    );
    tabs?.[next]?.focus();
  };

  const open = pane !== null;
  const current = PANES.find((p) => p.id === pane) ?? PANES[0];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="info-dialog"
        className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        {/* Header: the tablist + close X (the primitive's). */}
        <div className="flex items-center justify-between gap-2 border-b-[1.5px] border-ink pl-5 pr-12 pt-4">
          <div
            ref={tablistRef}
            role="tablist"
            aria-label={t("info.tablistAria")}
            onKeyDown={onKeyDown}
            className="flex items-center gap-1"
          >
            {PANES.map((p) => {
              const selected = pane === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  id={`info-tab-${p.id}`}
                  aria-selected={selected}
                  aria-controls={`info-panel-${p.id}`}
                  tabIndex={selected ? 0 : -1}
                  data-testid={`info-tab-${p.id}`}
                  onClick={() => onPaneChange(p.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-t-[6px] border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] font-semibold transition-colors focus-visible:outline-2",
                    selected
                      ? "border-signal text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <p.icon className="size-3.5" aria-hidden="true" />
                  {t(p.labelKey)}
                </button>
              );
            })}
          </div>
          {/* The pane's title doubles as the DialogTitle (the accessible
              name); it lives visually inside the scroll area below. */}
          <DialogTitle className="sr-only">{t(current.titleKey)}</DialogTitle>
        </div>

        {/* The pane, in its own scroll region — long content scrolls,
            the tab header stays put. */}
        <div
          role="tabpanel"
          id={`info-panel-${current.id}`}
          aria-labelledby={`info-tab-${current.id}`}
          className="max-h-[min(70vh,640px)] overflow-y-auto p-5"
        >
          {pane === "privacy" ? <PrivacyPane /> : <AboutPane />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

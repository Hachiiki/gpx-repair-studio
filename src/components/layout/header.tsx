/**
 * AppHeader — the application header (§F layout; QoL pass: sticky).
 *
 * Shows the product identity, the local-first badge (privacy promise),
 * and — once a file is loaded — the active section's file name, the
 * section navigation (map / statistics anchors), and the "start over"
 * action (the only way back to the upload state; single entry point by
 * design, no duplicate actions).
 *
 * Sticky so the section nav and "New file" stay reachable while the
 * user scrolls the long map section.
 *
 * Task 26 revision: the header section switcher is GONE — the landing
 * page's three-tab mode toggle ("Repair a recording" / "Create a share
 * card" / "Recover a GPS gap") is the single front door, and the active
 * section is derived by the shell (whichever session holds a loading or
 * parsed file). The `section` prop remains purely conditional routing:
 * it picks which anchors render and hides the repair-only view actions
 * while the recovery section is active.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageUp, RotateCcw, Wrench } from "lucide-react";
import { SHELL_CONTAINER } from "@/components/layout/shell-container";
import { cn } from "@/lib/utils";
import type { SessionStatus, SessionView } from "@/state/session-store";
import type { AppSection } from "@/state/ui-store";

export interface AppHeaderProps {
  fileName: string | null;
  status: SessionStatus;
  onReset: () => void;
  /** The workspace a parsed file is open in (Task 20). Repair section only. */
  view?: SessionView;
  /** Switch workspace for the loaded file (parsed state only). Repair section only. */
  onSwitchView?: (view: SessionView) => void;
  /**
   * The active section (Task 26). Defaults to "repair". Routing only —
   * which anchors render and which repair-only actions are hidden; the
   * section itself is derived by the shell, never switched here.
   */
  section?: AppSection;
}

export function AppHeader({
  fileName,
  status,
  onReset,
  view = "repair",
  onSwitchView,
  section = "repair",
}: AppHeaderProps) {
  const showSession = status === "parsed" && fileName !== null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div
        className={cn(
          SHELL_CONTAINER,
          "flex items-center justify-between gap-4 py-3",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* Brand mark: the signal-orange square (public/logo.svg,
           * recolored for the Ink & Signal theme) — decorative; the
           * wordmark carries the accessible name. */}
          <img
            src="/logo.svg"
            alt=""
            aria-hidden="true"
            className="hidden size-7 rounded-md sm:block"
          />
          <h1 className="truncate font-display text-lg font-bold tracking-tight">
            GPX Repair Studio
          </h1>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Local-first
          </Badge>
          {showSession && (
            <span
              className="hidden min-w-0 truncate text-sm text-muted-foreground md:inline"
              title={fileName}
            >
              {fileName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {section === "repair" && showSession && view === "share" && onSwitchView && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="header-repair-link"
              onClick={() => onSwitchView("repair")}
            >
              <Wrench className="size-3.5" aria-hidden="true" />
              Repair map
            </Button>
          )}
          {section === "repair" && showSession && view === "repair" && onSwitchView && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="header-share-link"
              onClick={() => onSwitchView("share")}
            >
              <ImageUp className="size-3.5" aria-hidden="true" />
              Share card
            </Button>
          )}
          {section === "repair" && showSession && view === "repair" && (
            <nav
              className="hidden items-center gap-1 text-sm md:flex"
              aria-label="Workspace sections"
              data-testid="section-nav"
            >
              <a
                href="#repair"
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2"
              >
                Map &amp; tools
              </a>
              <a
                href="#details"
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2"
              >
                Statistics
              </a>
            </nav>
          )}
          {section === "recovery" && showSession && (
            <nav
              className="hidden items-center gap-1 text-sm md:flex"
              aria-label="Recovery sections"
              data-testid="recovery-section-nav"
            >
              <a
                href="#recovery"
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2"
              >
                Map &amp; tools
              </a>
              <a
                href="#recovery-details"
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2"
              >
                Preview &amp; stats
              </a>
            </nav>
          )}
          {showSession && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="gap-1.5"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              New file
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

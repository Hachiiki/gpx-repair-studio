/**
 * AppHeader — the application header (§F layout; QoL pass: sticky).
 *
 * Shows the product identity, the local-first badge (privacy promise),
 * the top-level section switcher (Task 26: Repair studio ↔ Gap
 * recovery), and — once a file is loaded — the active section's file
 * name, the section navigation (map / statistics anchors), and the
 * "start over" action (the only way back to the upload state; single
 * entry point by design, no duplicate actions).
 *
 * Sticky so the section nav and "New file" stay reachable while the
 * user scrolls the long map section.
 *
 * Task 26: `section` + `onSwitchSection` are additive. The repair
 * studio's rendering is unchanged — its buttons, anchors, and props
 * behave exactly as before; the switcher simply moves the user between
 * the two independent sections (each keeps its own session state).
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ImageUp,
  RotateCcw,
  Waypoints,
  Wrench,
} from "lucide-react";
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
  /** The active top-level section (Task 26). Defaults to "repair". */
  section?: AppSection;
  /** Switch the top-level section. Omitted → no switcher rendered. */
  onSwitchSection?: (section: AppSection) => void;
}

const SECTION_OPTIONS: readonly {
  value: AppSection;
  label: string;
  icon: typeof Wrench;
}[] = [
  {
    value: "repair",
    label: "Repair studio",
    icon: Wrench,
  },
  {
    value: "recovery",
    label: "Gap recovery",
    icon: Waypoints,
  },
];

export function AppHeader({
  fileName,
  status,
  onReset,
  view = "repair",
  onSwitchView,
  section = "repair",
  onSwitchSection,
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
          <h1 className="text-lg font-semibold tracking-tight">
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
          {/*
           * The top-level section switcher (Task 26): two independent
           * workflows, each with its own session. A segmented control in
           * the app's toggle language; the active section is pressed.
           */}
          {onSwitchSection && (
            <div
              className="flex overflow-hidden rounded-lg border bg-card p-0.5"
              role="radiogroup"
              aria-label="Workspace section"
              data-testid="section-switcher"
            >
              {SECTION_OPTIONS.map((option) => {
                const active = section === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={option.label}
                    title={option.label}
                    data-testid={`section-switch-${option.value}`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    onClick={() => onSwitchSection(option.value)}
                  >
                    <option.icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {/* Icon-only below sm: the header shares a 390 px row
                        with the brand and the session actions — labels
                        return at the sm breakpoint where the row has room. */}
                    <span className="hidden sm:inline">{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
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

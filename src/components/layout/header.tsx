/**
 * AppHeader — the application header (§F layout; QoL pass: sticky).
 *
 * Shows the product identity, the local-first badge (privacy promise),
 * and — once a file is loaded — the file name, the section navigation
 * (Repair map / Statistics — the two-screen workspace), and the "start
 * over" action (the only way back to the upload state; single entry
 * point by design, no duplicate actions).
 *
 * Sticky so the section nav and "New file" stay reachable while the
 * user scrolls the long map section.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { SHELL_CONTAINER } from "@/components/layout/shell-container";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/state/session-store";

export interface AppHeaderProps {
  fileName: string | null;
  status: SessionStatus;
  onReset: () => void;
}

export function AppHeader({ fileName, status, onReset }: AppHeaderProps) {
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
          {showSession && (
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

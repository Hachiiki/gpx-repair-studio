/**
 * AppHeader — the application header (§F layout).
 *
 * Shows the product identity, the local-first badge (privacy promise),
 * and — once a file is loaded — the file name plus the "start over"
 * action (the only way back to the upload state; single entry point by
 * design, no duplicate actions).
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import type { SessionStatus } from "@/state/session-store";

export interface AppHeaderProps {
  fileName: string | null;
  status: SessionStatus;
  onReset: () => void;
}

export function AppHeader({ fileName, status, onReset }: AppHeaderProps) {
  const showSession = status === "parsed" && fileName !== null;

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
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
    </header>
  );
}

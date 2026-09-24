/**
 * SessionErrorAlert — the actionable failure state of a load attempt
 * (Phase 2 acceptance: "invalid file shows precise errors").
 *
 * Renders the `SessionError` produced by the session hook from the typed
 * `GpxParseError` — never raw exception text.
 */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { CircleAlert } from "lucide-react";
import type { SessionError } from "@/state/session-store";

export function SessionErrorAlert({ error }: { error: SessionError }) {
  return (
    <Alert variant="destructive" data-testid="session-error">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription>
        <p>{error.detail}</p>
        {error.line !== undefined && (
          <p className="font-mono text-xs">
            at line {error.line}
            {error.column !== undefined ? `, column ${error.column}` : ""}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

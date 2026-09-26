/**
 * RecoveryIdleView — the Gap Recovery section's landing state (Task 26).
 *
 * The section's front door: a hero that names the workflow (recover a
 * missing GPS section from an activity whose clock kept running), the
 * reused UploadZone (intake is the same gesture everywhere in the app),
 * and a workflow trio that teaches exactly what this section does — kept
 * in step with shipped behavior only, like the repair studio's landing
 * copy. Doubles as the retry surface: a failed load surfaces its error
 * above the hero and the upload zone stays available.
 *
 * Pure presentation: props in, intents out — no session logic.
 */

import {
  Clock,
  PenLine,
  Download,
} from "lucide-react";
import { SessionErrorAlert } from "@/components/gpx/session-error-alert";
import { UploadZone } from "@/components/gpx/upload-zone";
import type { SessionError } from "@/state/session-store";

export interface RecoveryIdleViewProps {
  /** A failed load attempt, surfaced above the hero; retry stays possible. */
  error: SessionError | null;
  /** File intake intent, handed to the UploadZone. */
  onFile: (file: File) => void;
}

const RECOVERY_STEPS: readonly {
  icon: typeof Clock;
  title: string;
  description: string;
}[] = [
  {
    icon: Clock,
    title: "Detect the gap",
    description:
      "The app finds sections where your watch kept counting time but GPS coordinates went missing — the interval, its duration, and both anchor points.",
  },
  {
    icon: PenLine,
    title: "Draw the missing route",
    description:
      "Trace where you actually went on the map — clicks follow real roads, every point drags, and everything undoes. The original recording is never modified.",
  },
  {
    icon: Download,
    title: "Export the corrected file",
    description:
      "GPS points are generated along your drawing with timestamps fitted into the missing interval, the completed route is previewed with recalculated statistics, and the export marks every generated point as estimated.",
  },
];

export function RecoveryIdleView({ error, onFile }: RecoveryIdleViewProps) {
  return (
    <div className="flex w-full flex-1 flex-col py-8">
      <div className="hero-entrance mx-auto mt-auto flex w-full max-w-lg flex-col items-center gap-6">
        {error && <SessionErrorAlert error={error} />}
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Recover a missing GPS section
          </h2>
          <p className="text-balance text-muted-foreground">
            Upload an activity where the recording dropped out mid-workout —
            the clock kept running but the route has a hole. Draw the part
            that went missing and get a corrected GPX with the elapsed time
            untouched.
          </p>
        </div>
        <UploadZone onFile={onFile} />
      </div>

      <div className="mx-auto mb-auto mt-12 w-full max-w-4xl">
        <h2 className="text-center text-lg font-semibold tracking-tight">
          How it works
        </h2>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          The whole workflow runs in this tab — the activity never leaves
          this device.
        </p>
        <ol
          className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]"
          data-testid="recovery-workflow-steps"
        >
          {RECOVERY_STEPS.map((step) => (
            <li
              key={step.title}
              className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <span className="inline-flex rounded-full bg-muted p-2">
                <step.icon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <h3 className="mt-3 font-medium">{step.title}</h3>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

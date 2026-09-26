/**
 * ElevationControls — the draw editor's elevation section (Phase 6).
 *
 * The per-gap surface of elevation estimation: the opt-in button (which
 * opens the FR-6.5 disclosure dialog before anything is sent), the
 * fetch progress, the per-gap summary once data lands (min/max, gain/
 * loss — hysteresis numbers matching the stats table), and the two
 * honesty states the plan demands: partial results (M of N points
 * resolved) and stale results (the route changed after the fetch —
 * re-estimate or the old values are excluded from export).
 *
 * Pure presentation: the elevation binding flows in as props, intents
 * flow out (confirm fetch). The disclosure dialog's open state is local
 * transient UI — not store material.
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HintTip } from "@/components/shared/hint-tip";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { ElevationDisclosureDialog } from "@/components/reconstruction/elevation-disclosure-dialog";
import type { ElevationControlsBinding } from "@/hooks/use-elevation";
import { MountainSnow, RefreshCw, TriangleAlert } from "lucide-react";
import { formatElevationMeters } from "@/lib/utils/format";

const STATUS_LABEL: Record<ElevationControlsBinding["status"], string> = {
  "not-fetched": "Not estimated",
  fetching: "Estimating…",
  complete: "Estimated",
  partial: "Partial",
  failed: "Failed",
  stale: "Stale",
};

const STATUS_TONE: Record<
  ElevationControlsBinding["status"],
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  "not-fetched": "neutral",
  fetching: "info",
  complete: "success",
  partial: "warning",
  failed: "danger",
  stale: "warning",
};

export function ElevationControls({
  elevation,
}: {
  elevation: ElevationControlsBinding;
}) {
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const disclosure = elevation.disclosure;

  return (
    <div
      className="grid gap-1.5"
      data-testid="elevation-controls"
      role="group"
      aria-label="Elevation"
    >
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
        Elevation
        <StatusBadge
          tone={STATUS_TONE[elevation.status]}
          data-testid="elevation-status-badge"
        >
          {STATUS_LABEL[elevation.status]}
        </StatusBadge>
      </p>

      {/* Nothing drawn yet — the honest hint. */}
      {elevation.blockedReason && (
        <p
          className="text-[11px] leading-snug text-muted-foreground"
          data-testid="elevation-blocked-hint"
        >
          {elevation.blockedReason}
        </p>
      )}

      {/* Opt-in: disclosure first (FR-6.5), fetch only after confirm. */}
      {elevation.canFetch && elevation.status === "not-fetched" && disclosure && (
        <HintTip
          side="left"
          title="Estimated elevation"
          description={`Looks up terrain elevation for the points you drew (${elevation.providerName}, a public terrain database). Opt-in: a disclosure shows exactly what leaves your browser before anything is sent.`}
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            data-testid="elevation-estimate-button"
            onClick={() => setDisclosureOpen(true)}
          >
            <MountainSnow className="size-3.5" aria-hidden="true" />
            Estimate elevation
          </Button>
        </HintTip>
      )}

      {/* In flight: progress over the sent points. */}
      {elevation.status === "fetching" && (
        <p
          className="text-[11px] tabular-nums text-muted-foreground"
          data-testid="elevation-progress"
          role="status"
        >
          Fetching {elevation.providerName} terrain — {elevation.answered}/
          {elevation.sent} points
          {elevation.sent < elevation.total
            ? ` (sampled from ${elevation.total})`
            : ""}
          …
        </p>
      )}

      {/* Stale: the route changed since the fetch — offer the re-run. */}
      {elevation.status === "stale" && (
        <p
          className="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-600/30 bg-amber-600/5 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400"
          data-testid="elevation-stale-note"
          role="status"
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          The route changed since the estimate — the old values are
          excluded from statistics and export until you re-estimate.
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            data-testid="elevation-refetch-button"
            onClick={() => setDisclosureOpen(true)}
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Re-estimate
          </Button>
        </p>
      )}

      {/* Failure: honest message, retry offered, never blocking. */}
      {elevation.status === "failed" && elevation.error && (
        <div
          className="grid gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive"
          data-testid="elevation-failure"
          role="alert"
        >
          <p>{elevation.error}</p>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              data-testid="elevation-retry-button"
              onClick={() => setDisclosureOpen(true)}
            >
              <RefreshCw className="size-3" aria-hidden="true" />
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Result: per-gap summary (gain/loss = the stats table's math). */}
      {elevation.summary && (
        <div
          className="grid gap-0.5 text-[11px] tabular-nums text-muted-foreground"
          data-testid="elevation-gap-summary"
        >
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-foreground">
              ▲ {formatElevationMeters(elevation.summary.gainM)}
            </span>
            <span className="text-foreground">
              ▼ {formatElevationMeters(elevation.summary.lossM)}
            </span>
            <ProvenanceBadge kind="estimated" />
          </p>
          <p>
            {formatElevationMeters(elevation.summary.minEleM)} –{" "}
            {formatElevationMeters(elevation.summary.maxEleM)} ·{" "}
            {elevation.providerName}
          </p>
        </div>
      )}

      {/* Partial: some points resolved — say how many, keep the data. */}
      {elevation.status === "partial" && (
        <p
          className="text-[11px] text-amber-700 dark:text-amber-400"
          data-testid="elevation-partial-note"
          role="status"
        >
          {elevation.resolved.toLocaleString("en-US")} of{" "}
          {elevation.sent.toLocaleString("en-US")} terrain points resolved
          — the gaps are interpolated between the ones that were.
        </p>
      )}

      {/* Complete: offer a re-run for convenience (same disclosure). */}
      {elevation.status === "complete" && disclosure && (
        <p className="text-[11px] text-muted-foreground">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            data-testid="elevation-refetch-button"
            onClick={() => setDisclosureOpen(true)}
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Re-estimate
          </Button>
        </p>
      )}

      {disclosure && (
        <ElevationDisclosureDialog
          open={disclosureOpen}
          onOpenChange={setDisclosureOpen}
          sentPoints={disclosure.sentPoints}
          totalPoints={disclosure.totalPoints}
          requestCount={disclosure.requestCount}
          providerName={elevation.providerName}
          privacyNote={elevation.privacyNote}
          onConfirm={elevation.confirmFetch}
        />
      )}
    </div>
  );
}

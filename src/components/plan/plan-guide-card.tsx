/**
 * PlanGuideCard — the "plan a route" section's guide (the tools
 * column's first card).
 *
 * The planner's counterpart of the create section's guide card: the
 * one-place recap of what this scratchpad is (draw with the same pens
 * every editor has, read the live estimates, enter a time for the
 * pace), the one-shot geolocation aid for finding your city on a blank
 * world map, and the section's defining contract stated plainly — this
 * is a planning surface, nothing is exported or shared.
 *
 * Pure presentation: props in, one intent out (onClear — the "start a
 * fresh route" shortcut, mirroring the draw panels' clear intent).
 */

"use client";

import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Crosshair, Eraser, MapPinned } from "lucide-react";
import type { LocateStatus } from "@/hooks/use-plan-map";

/**
 * The geolocation aid's degraded notices (the shared states),
 * resolved through the translator inside the component.
 */
export interface PlanGuideCardProps {
  /** One-shot geolocation intent (the guide's "Find my position" aid). */
  onLocate: () => void;
  /** The geolocation aid's state. */
  locateStatus: LocateStatus;
  /** Points currently placed on the map (drives the clear affordance). */
  vertexCount: number;
  /** Clear the route and start fresh (disabled when nothing is drawn). */
  onClear: () => void;
}

export function PlanGuideCard({
  onLocate,
  locateStatus,
  vertexCount,
  onClear,
}: PlanGuideCardProps) {
  const { t } = useI18n();
  const locateNotices: Partial<Record<LocateStatus, string>> = {
    denied: t("plan.guide.locateDenied"),
    unavailable: t("plan.guide.locateUnavailable"),
  };
  const notice = locateNotices[locateStatus];

  return (
    <Card className="border-[1.5px] border-ink" data-testid="plan-guide-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <MapPinned className="size-4 text-signal" aria-hidden="true" />
          {t("plan.guide.title")}
        </h3>
        <CardDescription>
          {t("plan.guide.intro")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("plan.guide.contractLead")}{" "}
          <strong>{t("plan.guide.contractBold")}</strong>
          {t("plan.guide.contractTail")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            data-testid="plan-locate-button"
            onClick={onLocate}
            disabled={locateStatus === "locating"}
          >
            <Crosshair className="size-3.5" aria-hidden="true" />
            {locateStatus === "locating"
              ? t("plan.guide.locating")
              : t("plan.guide.findPosition")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            data-testid="plan-clear-button"
            onClick={onClear}
            disabled={vertexCount === 0}
            title={
              vertexCount === 0
                ? t("plan.guide.clearTitleEmpty")
                : t("plan.guide.clearTitle")
            }
          >
            <Eraser className="size-3.5" aria-hidden="true" />
            {t("plan.guide.clearRoute")}
          </Button>
        </div>
        {notice && (
          <p
            className="text-[11.5px] leading-snug text-muted-foreground"
            data-testid="plan-locate-notice"
            role="status"
          >
            {notice}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

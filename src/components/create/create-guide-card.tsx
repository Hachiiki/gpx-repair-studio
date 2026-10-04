/**
 * CreateGuideCard — the "create from activity stats" drawing phase's
 * orientation card: the recorded statistics recap (the numbers the route
 * reconciles against), how to draw, and the two create-specific aids —
 * the one-shot "Find my position" geolocation fly-to (a blank world map
 * needs one) and the way back to the statistics form.
 *
 * Pure presentation: props in, intents out.
 */

"use client";

import { ArrowLeft, LocateFixed, MapPin, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ConsistencyNote } from "@/components/create/consistency-note";
import { useI18n } from "@/hooks/use-i18n";
import { UNIT_WORDS } from "@/i18n/units";
import type { ActivityStats, ConsistencyNotice } from "@/hooks/use-create-session";
import type { LocateStatus } from "@/hooks/use-create-map";
import {
  formatDistanceForUnit,
  formatDurationMs,
  formatPaceMs,
  type PaceUnit,
} from "@/lib/utils/format";
import { PACE_METERS_PER_UNIT } from "@/lib/utils/format";

export interface CreateGuideCardProps {
  stats: ActivityStats;
  paceUnit: PaceUnit;
  /** The confirmed statistics' cross-check verdict (null = consistent). */
  consistency: ConsistencyNotice | null;
  /** The one-shot geolocation fly-to. */
  onLocate: () => void;
  locateStatus: LocateStatus;
  /** Return to the statistics form (values kept). */
  onBackToStats: () => void;
  /** Points drawn so far (the "what now" hint flips once drawing began). */
  vertexCount: number;
}

/**
 * The locate aid's degraded-state notices (idle has none). Resolved
 * through the translator at render time — the one-time module map
 * became per-locale copy in Phase 21.
 */
function locateNoticeFor(
  t: ReturnType<typeof useI18n>["t"],
  status: LocateStatus,
): string | null {
  if (status === "denied") return t("create.guide.locateDenied");
  if (status === "unavailable") return t("create.guide.locateUnavailable");
  return null;
}

export function CreateGuideCard({
  stats,
  paceUnit,
  consistency,
  onLocate,
  locateStatus,
  onBackToStats,
  vertexCount,
}: CreateGuideCardProps) {
  const { t, locale } = useI18n();
  const metersPerUnit = PACE_METERS_PER_UNIT[paceUnit];
  const pacePerUnitMs =
    (stats.paceMsPerKm / PACE_METERS_PER_UNIT.km) * metersPerUnit;
  const locateNotice = locateNoticeFor(t, locateStatus);

  return (
    <Card className="border-[1.5px] border-ink" data-testid="create-guide-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <MapPin className="size-4 text-signal" aria-hidden="true" />
          {t("create.guide.title")}
        </h3>
        <CardDescription>
          {t("create.guide.blurb")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3.5">
        {/* The recorded statistics this route reconciles against — the
            numbers the drawing aims at, always in view. */}
        <div
          className="grid gap-[3px] rounded-lg border border-ink/15 bg-ink/[0.03] px-2.5 py-2 text-xs text-muted-foreground"
          data-testid="create-stats-recap"
        >
          <p className="font-semibold text-ink">{t("create.guide.recapTitle")}</p>
          <p className="tabular-nums">
            <span className="font-semibold text-ink">
              {t("create.guide.recapDistance")}
            </span>{" "}
            {formatDistanceForUnit(stats.distanceM, paceUnit)} ·{" "}
            <span className="font-semibold text-ink">
              {t("create.guide.recapTime")}
            </span>{" "}
            {formatDurationMs(stats.durationMs)} ·{" "}
            <span className="font-semibold text-ink">
              {t("create.guide.recapPace")}
            </span>{" "}
            {formatPaceMs(pacePerUnitMs)}{" "}
            {paceUnit === "km" ? UNIT_WORDS[locale].perKm : UNIT_WORDS[locale].perMi}
          </p>
        </div>

        {consistency && consistency.level !== "consistent" && (
          <ConsistencyNote
            notice={consistency}
            enteredDurationMs={stats.durationMs}
          />
        )}

        {vertexCount === 0 ? (
          <p
            className="rounded-md border border-signal/40 bg-signal/[0.06] px-3 py-2 text-xs leading-relaxed text-ink"
            data-testid="create-draw-instructions"
            role="status"
          >
            {t("create.guide.instructionsLead")}{" "}
            <span className="font-semibold">{t("create.guide.locate")}</span>
            {t("create.guide.instructionsTail")}
          </p>
        ) : (
          <p
            className="rounded-md border border-signal/40 bg-signal/[0.06] px-3 py-2 text-xs leading-relaxed text-ink"
            role="status"
          >
            {t("create.guide.instructionsMore")}
          </p>
        )}

        <div className="grid gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full gap-1.5"
            data-testid="locate-button"
            onClick={onLocate}
            disabled={locateStatus === "locating"}
          >
            <LocateFixed className="size-3.5" aria-hidden="true" />
            {locateStatus === "locating"
              ? t("create.guide.locating")
              : t("create.guide.locate")}
          </Button>
          {locateNotice && locateStatus !== "locating" && (
            <p
              className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground"
              role="status"
              data-testid="locate-notice"
            >
              <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
              {locateNotice}
            </p>
          )}
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          {t("create.guide.privacyNote")}
        </p>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full gap-1.5 text-muted-foreground hover:text-foreground"
          data-testid="back-to-stats-button"
          onClick={onBackToStats}
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {t("create.guide.backToStats")}
        </Button>
      </CardContent>
    </Card>
  );
}

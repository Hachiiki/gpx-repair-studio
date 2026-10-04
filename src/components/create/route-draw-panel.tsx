/**
 * RouteDrawPanel — the "create from activity stats" route editor card
 * (Step 2).
 *
 * The create section's counterpart of the repair studio's
 * DrawEditorPanel: the same road-follow chips, live distance + vertex
 * cap, undo/redo bar, resample spacing, and the accessible vertex list —
 * minus the gap vocabulary (there is no gap), the snap toggle (nothing to
 * snap to), and the §J-1 time strategy (the duration comes from the
 * entered statistics, period). Instead it carries the live
 * drawn-vs-recorded distance comparison (the reconciliation's
 * pre-announcement) and the "Finish route" intent that ends the drawing
 * phase.
 *
 * Pure presentation: the {@link CreateDrawBinding} in, intents out.
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HintTip } from "@/components/shared/hint-tip";
import { UndoRedoBar } from "@/components/reconstruction/undo-redo-bar";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { Check, Crosshair, X } from "lucide-react";
import type { CreateDrawBinding } from "@/hooks/use-create-draw";
import type { ActivityStats } from "@/hooks/use-create-session";
import { RECONCILE_NOTICE_RATIO } from "@/hooks/use-create-session";
import { useI18n } from "@/hooks/use-i18n";
import { UNIT_WORDS } from "@/i18n/units";
import type { DrawVertex } from "@/types/domain";
import {
  formatDistanceForUnit,
  formatLatLon,
  type PaceUnit,
} from "@/lib/utils/format";

/**
 * Selectable resample spacings shown in the settings row (labels
 * resolved per locale through the translator — Phase 21).
 */
interface SpacingChoice {
  value: string;
  label: string;
}

/** Resolve the spacing options for the active locale. */
function getSpacingChoices(
  t: ReturnType<typeof useI18n>["t"],
  unitWord: string,
): readonly SpacingChoice[] {
  return [
    { value: "off", label: t("create.drawPanel.spacingOff") },
    {
      value: "10",
      label: t("create.drawPanel.spacingEvery", {
        meters: 10,
        unit: unitWord,
      }),
    },
    {
      value: "25",
      label: t("create.drawPanel.spacingEvery", {
        meters: 25,
        unit: unitWord,
      }),
    },
    {
      value: "50",
      label: t("create.drawPanel.spacingEvery", {
        meters: 50,
        unit: unitWord,
      }),
    },
  ];
}

/**
 * Pen choices (user pass 48 — curve is a PEN, not a path style): how
 * the Draw mode captures points. Labels resolved per locale.
 */
interface PenChoice {
  value: CreateDrawBinding["pen"];
  label: string;
  hint: string;
}

/** Resolve the pen choices for the active locale. */
function getPenChoices(t: ReturnType<typeof useI18n>["t"]): readonly PenChoice[] {
  return [
    {
      value: "default",
      label: t("create.drawPanel.penDefault"),
      hint: t("create.drawPanel.penDefaultHint"),
    },
    {
      value: "curve",
      label: t("create.drawPanel.penCurve"),
      hint: t("create.drawPanel.penCurveHint"),
    },
  ];
}

/**
 * Path-style choices (Tasks 46–47 — what the line does between your
 * points, remembered per line). User pass 48: Curves left the group —
 * it is the Curve pen's doing now, so the choices are Roads /
 * Footpaths / Straight. The test ids keep the historic `road-follow-*`
 * names for e2e compatibility. Labels resolved per locale.
 */
interface PathStyleChoice {
  value: Exclude<CreateDrawBinding["pathStyle"], "curve">;
  label: string;
  hint: string;
}

/** Resolve the path-style choices for the active locale. */
function getPathStyleChoices(
  t: ReturnType<typeof useI18n>["t"],
): readonly PathStyleChoice[] {
  return [
    {
      value: "car",
      label: t("create.drawPanel.roads"),
      hint: t("create.drawPanel.roadsHint"),
    },
    {
      value: "foot",
      label: t("create.drawPanel.footpaths"),
      hint: t("create.drawPanel.footpathsHint"),
    },
    {
      value: "off",
      label: t("create.drawPanel.straight"),
      hint: t("create.drawPanel.straightHint"),
    },
  ];
}

function VertexRow({
  vertex,
  index,
  onDelete,
}: {
  vertex: DrawVertex;
  index: number;
  onDelete: (vertexId: DrawVertex["id"]) => void;
}) {
  const { t } = useI18n();
  return (
    <li
      className="flex items-center gap-2 rounded-[6px] border border-ink/10 bg-card px-2 py-1.5 text-xs transition-colors hover:bg-ink/[0.04]"
      data-testid="create-vertex-row"
    >
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-ink/[0.06] text-[10px] font-bold text-shade">
        {index + 1}
      </span>
      <span className="font-mono text-[11px] text-ink/70">
        {formatLatLon(vertex.lat, vertex.lon)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
        aria-label={t("create.drawPanel.deletePoint", { index: index + 1 })}
        data-testid="create-delete-vertex-button"
        onClick={() => onDelete(vertex.id)}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </li>
  );
}

export interface RouteDrawPanelProps {
  draw: CreateDrawBinding;
  stats: ActivityStats;
  paceUnit: PaceUnit;
}

export function RouteDrawPanel({ draw, stats, paceUnit }: RouteDrawPanelProps) {
  const { t, locale } = useI18n();
  if (!draw.active) return null;

  // User pass 52: the pen only lives in Draw mode — Move drags points,
  // Pan navigates. Outside Draw the pen group renders inert.
  const penLive = draw.pointerMode === "draw";

  // The per-locale chip/option tables (Phase 21: the module constants
  // became translator-fed resolvers).
  const spacingChoices = getSpacingChoices(t, UNIT_WORDS[locale].m);
  const penChoices = getPenChoices(t);
  const pathStyleChoices = getPathStyleChoices(t);

  // The live drawn-vs-recorded comparison — the reconciliation's
  // pre-announcement (the review phase formalizes it). The same 2% ratio
  // the reconciliation uses, so "matches" live means "matches" at review.
  const drawnM = draw.distanceM ?? 0;
  const differenceM = drawnM - stats.distanceM;
  const comparison =
    draw.distanceM === null
      ? t("create.drawPanel.compareFirst")
      : drawnM === 0
        ? t("create.drawPanel.compareFirstLeg")
        : Math.abs(differenceM) / Math.max(stats.distanceM, 1) <=
            RECONCILE_NOTICE_RATIO
          ? t("create.drawPanel.compareMatches")
          : differenceM > 0
            ? t("create.drawPanel.compareLonger", {
                recorded: formatDistanceForUnit(stats.distanceM, paceUnit),
                difference: formatDistanceForUnit(
                  Math.abs(differenceM),
                  paceUnit,
                ),
              })
            : t("create.drawPanel.compareShorter", {
                recorded: formatDistanceForUnit(stats.distanceM, paceUnit),
                difference: formatDistanceForUnit(
                  Math.abs(differenceM),
                  paceUnit,
                ),
              });

  return (
    <Card className="border-[1.5px] border-ink" data-testid="route-draw-panel">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Crosshair className="size-4 text-signal" aria-hidden="true" />
          {t("create.drawPanel.title")}
        </h3>
        <CardDescription>
          {t("create.drawPanel.blurb")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Pen (user pass 48): HOW the Draw mode captures points.
            User pass 52: outside Draw mode the group is honestly INERT
            (chips dim and disable) — a chip that still looks "on" while
            the pointer is in Move or Pan reads as "drawing is active",
            and the pencil never drags, the dragger never draws. */}
        <div
          className="grid gap-2"
          data-testid="pen-mode-group"
          role="group"
          aria-label={t("create.drawPanel.penGroup")}
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            {t("create.drawPanel.penGroup")}
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {penChoices.map((choice) =>
              penLive ? (
                <HintTip
                  key={choice.value}
                  side="left"
                  title={choice.label}
                  description={choice.hint}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={
                      draw.pen === choice.value
                        ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper hover:bg-inkplus hover:text-paper"
                        : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                    }
                    aria-pressed={draw.pen === choice.value}
                    data-testid={`pen-mode-${choice.value}`}
                    onClick={() => draw.setPenMode(choice.value)}
                  >
                    {choice.label}
                  </Button>
                </HintTip>
              ) : (
                <span
                  key={choice.value}
                  className="inline-flex cursor-not-allowed"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled
                    className={
                      draw.pen === choice.value
                        ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper"
                        : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground"
                    }
                    aria-pressed={draw.pen === choice.value}
                    data-testid={`pen-mode-${choice.value}`}
                  >
                    {choice.label}
                  </Button>
                </span>
              ),
            )}
          </div>
          {penLive && draw.pen === "curve" && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="pen-curve-hint"
              role="status"
            >
              {t("create.drawPanel.curveHint")}
            </p>
          )}
          {!penLive && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="pen-inactive-note"
              role="status"
            >
              {t("create.drawPanel.penInactiveLead")}{" "}
              {draw.pointerMode === "move"
                ? t("create.drawPanel.pointerDrags")
                : t("create.drawPanel.pointerNavigates")}
              .
            </p>
          )}
        </div>

        {/* Path style: how the NEXT segment is drawn. Placed segments keep
            the style they were drawn with (per-segment modes). */}
        <div
          className="grid gap-2"
          data-testid="road-follow-group"
          role="group"
          aria-label={t("create.drawPanel.pathStyleGroup")}
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            {t("create.drawPanel.newPointsFollow")}
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("create.drawPanel.pathStyleNote")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pathStyleChoices.map((choice) => (
              <HintTip
                key={choice.value}
                side="left"
                title={choice.label}
                description={choice.hint}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={
                    draw.pathStyle === choice.value ||
                    // A curve-pen route is local like straight — the chip
                    // reads as its home; tapping it flattens the route.
                    (choice.value === "off" && draw.pathStyle === "curve")
                      ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper hover:bg-inkplus hover:text-paper"
                      : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                  }
                  aria-pressed={
                    draw.pathStyle === choice.value ||
                    (choice.value === "off" && draw.pathStyle === "curve")
                  }
                  data-testid={`road-follow-${choice.value}`}
                  onClick={() => draw.setPathStyle(choice.value)}
                >
                  {choice.label}
                </Button>
              </HintTip>
            ))}
          </div>
          {(draw.pathStyle === "car" ||
            draw.pathStyle === "foot" ||
            draw.routingPending ||
            draw.routingFailed) && (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid="road-follow-status"
              role="status"
            >
              {draw.routingPending
                ? t("create.drawPanel.findingRoad")
                : draw.routingFailed
                  ? t("create.drawPanel.roadUnavailable")
                  : draw.pointerMode === "move"
                    ? t("create.drawPanel.dragAdjust")
                    : t("create.drawPanel.switchToDrag")}
            </p>
          )}
          {
            /*
             * §EE 17.2 — the consent gate's face in the draw tools (the
             * repair editor's twin): straight lines draw meanwhile, and
             * the enable button opens the plain-notice dialog — never a
             * silent request.
             */
          }
          {draw.routingNeedsConsent && (
            <div
              className="grid gap-1.5 rounded-md border border-signal/40 bg-signal/[0.05] px-2.5 py-2"
              data-testid="road-consent-notice"
            >
              <p className="text-[11.5px] leading-snug text-ink">
                {t("create.drawPanel.consentNotice")}
              </p>
              <Button
                type="button"
                size="sm"
                className="h-7 w-fit text-[12px]"
                data-testid="road-consent-enable"
                onClick={draw.requestRoadConsent}
              >
                {t("create.drawPanel.consentEnable")}
              </Button>
            </div>
          )}
          {(draw.pathStyle === "car" || draw.pathStyle === "foot") &&
            draw.routerConsent === "granted" && (
              <p
                className="text-[11px] leading-snug text-muted-foreground"
                data-testid="road-consent-on-note"
              >
                {t("create.drawPanel.consentOnLead")}{" "}
                <button
                  type="button"
                  className="font-semibold text-foreground underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
                  onClick={draw.requestRoadConsent}
                >
                  {t("create.drawPanel.turnItOff")}
                </button>{" "}
                {t("create.drawPanel.consentOnTail")}
              </p>
            )}
        </div>

        {/* Live stats: drawn distance vs the recorded target. */}
        <div className="grid gap-1">
          <p className="flex flex-wrap items-baseline gap-2.5" data-testid="draw-distance">
            <span className="font-display text-[40px] font-bold leading-none tabular-nums">
              {draw.distanceM === null
                ? "—"
                : formatDistanceForUnit(drawnM, paceUnit)}
            </span>
            <ProvenanceBadge kind="estimated" />
          </p>
          <p
            className="text-[11.5px] leading-snug tabular-nums text-muted-foreground"
            data-testid="drawn-vs-recorded"
          >
            {comparison}
          </p>
          <p
            className="text-[11.5px] tabular-nums text-muted-foreground"
            data-testid="vertex-count"
          >
            {t("create.drawPanel.vertexCount", {
              count: draw.vertexCount,
              max: draw.maxVertices,
            })}
            {draw.atVertexCap ? t("create.drawPanel.vertexLimit") : ""}
          </p>
        </div>

        <UndoRedoBar
          canUndo={draw.canUndo}
          canRedo={draw.canRedo}
          undoCount={draw.undoCount}
          redoCount={draw.redoCount}
          canClear={draw.vertexCount > 0}
          onUndo={draw.undo}
          onRedo={draw.redo}
          onClear={draw.clearVertices}
        />

        {/* Settings row: the generated track's point spacing. */}
        <label
          className="grid gap-1 text-xs font-semibold"
          data-testid="spacing-select-label"
          title={t("create.drawPanel.spacingHint")}
        >
          {t("create.drawPanel.spacingLabel")}
          <select
            className="h-8 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2.5 text-xs font-normal transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
            data-testid="spacing-select"
            value={String(draw.resampleSpacing)}
            onChange={(event) => {
              const raw = event.target.value;
              draw.setResampleSpacing(raw === "off" ? "off" : Number(raw));
            }}
          >
            {spacingChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        {/* Vertex list: the accessible delete path. */}
        {draw.vertexCount > 0 && (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("create.drawPanel.drawnPointsNote")}
            </p>
            <ScrollArea className="max-h-40 -mx-2">
              <ul className="grid gap-0.5 px-2">
                {draw.vertices.map((vertex, index) => (
                  <VertexRow
                    key={vertex.id}
                    vertex={vertex}
                    index={index}
                    onDelete={draw.deleteVertex}
                  />
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <div className="border-t border-ink/10 pt-3">
          <Button
            type="button"
            size="sm"
            className="h-9 w-full gap-1.5"
            data-testid="finish-route-button"
            onClick={draw.finishRoute}
            disabled={!draw.canFinish}
            title={
              draw.canFinish
                ? t("create.drawPanel.finishTitle")
                : t("create.drawPanel.finishDisabledTitle")
            }
          >
            <Check className="size-4" aria-hidden="true" />
            {t("create.drawPanel.finish")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

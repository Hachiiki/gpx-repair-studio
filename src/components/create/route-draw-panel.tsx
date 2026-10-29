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

import { useRef, useState } from "react";
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
import {
  Check,
  ClipboardPaste,
  Copy,
  Crosshair,
  Gauge,
  Pencil,
  Repeat,
  X,
} from "lucide-react";
import type { CreateDrawBinding } from "@/hooks/use-create-draw";
import type { ActivityStats } from "@/hooks/use-create-session";
import { RECONCILE_NOTICE_RATIO } from "@/hooks/use-create-session";
import { useI18n } from "@/hooks/use-i18n";
import { UNIT_WORDS } from "@/i18n/units";
import type { DrawVertex } from "@/types/domain";
import {
  formatDistanceForUnit,
  formatLatLon,
  formatPaceMs,
  PACE_METERS_PER_UNIT,
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
  selected,
  onToggleSelect,
  onDelete,
}: {
  vertex: DrawVertex;
  index: number;
  /** Task 72 — the copy/paste selection state of this point. */
  selected: boolean;
  /** Toggle (or Shift+extend from the anchor row — the list idiom). */
  onToggleSelect: (vertexId: DrawVertex["id"], shiftKey: boolean) => void;
  onDelete: (vertexId: DrawVertex["id"]) => void;
}) {
  const { t } = useI18n();
  return (
    <li
      className={
        selected
          ? "flex items-center gap-2 rounded-[6px] border border-signal/50 bg-signal/[0.06] px-2 py-1.5 text-xs transition-colors hover:bg-signal/[0.09]"
          : "flex items-center gap-2 rounded-[6px] border border-ink/10 bg-card px-2 py-1.5 text-xs transition-colors hover:bg-ink/[0.04]"
      }
      data-testid="create-vertex-row"
      data-selected={selected}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={t("create.drawPanel.selectPoint", { index: index + 1 })}
        data-testid="create-vertex-select"
        className={
          selected
            ? "grid size-[15px] shrink-0 cursor-pointer place-items-center rounded-[3.5px] border-[1.25px] border-signal bg-signal text-paper transition-colors"
            : "grid size-[15px] shrink-0 cursor-pointer place-items-center rounded-[3.5px] border-[1.25px] border-ink/30 bg-card text-transparent transition-colors hover:border-ink/55"
        }
        onClick={(event) =>
          // Shift+click extends the range from the anchor row instead of
          // toggling one (the file-manager idiom). A role=checkbox button
          // is fully controlled: Space/Enter land here as plain toggles.
          onToggleSelect(vertex.id, event.shiftKey)
        }
      >
        <Check className="size-3" aria-hidden="true" />
      </button>
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

/**
 * The pace input's parsed result: ms per meter, or null when the
 * minutes/seconds pair is not usable yet (the stats form's validation
 * idiom, on one row: seconds 0–59, the pair not empty, total > 0).
 */
function parsePaceEntry(
  minutes: string,
  seconds: string,
  paceUnit: PaceUnit,
): number | null {
  if (minutes.trim() === "" && seconds.trim() === "") return null;
  const min = Number(minutes);
  const sec = Number(seconds);
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(sec) ||
    min < 0 ||
    sec < 0 ||
    sec >= 60
  ) {
    return null;
  }
  const totalSeconds = min * 60 + sec;
  if (totalSeconds <= 0) return null;
  return (totalSeconds * 1000) / PACE_METERS_PER_UNIT[paceUnit];
}

export function RouteDrawPanel({ draw, stats, paceUnit }: RouteDrawPanelProps) {
  const { t, locale } = useI18n();
  // Task 72 — the Shift+click range anchor (list idiom: plain click
  // toggles and re-anchors; Shift+click selects anchor…click inclusive).
  const selectionAnchorRef = useRef<DrawVertex["id"] | null>(null);
  const handleToggleSelect = (
    vertexId: DrawVertex["id"],
    shiftKey: boolean,
  ) => {
    const anchor = selectionAnchorRef.current;
    if (shiftKey && anchor !== null && anchor !== vertexId) {
      draw.selectVertexRange(anchor, vertexId);
    } else {
      draw.toggleVertexSelection(vertexId);
    }
    selectionAnchorRef.current = vertexId;
  };
  // Task 73 — the pace plan's entry state: the minutes/seconds pair and
  // which segment an Apply updates (null = plan the selection).
  const [paceMinutes, setPaceMinutes] = useState("");
  const [paceSeconds, setPaceSeconds] = useState("");
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [paceError, setPaceError] = useState(false);

  const metersPerUnit = PACE_METERS_PER_UNIT[paceUnit];
  const paceMsPerMeter = parsePaceEntry(paceMinutes, paceSeconds, paceUnit);

  const startEditSegment = (id: string) => {
    const segment = draw.paceSegments.find((s) => s.id === id);
    if (!segment) return;
    const paceSecondsTotal = Math.round(
      (segment.paceMsPerMeter * metersPerUnit) / 1000,
    );
    setPaceMinutes(String(Math.floor(paceSecondsTotal / 60)));
    setPaceSeconds(String(paceSecondsTotal % 60));
    setEditingSegmentId(id);
    setPaceError(false);
  };

  const cancelEditSegment = () => {
    setEditingSegmentId(null);
    setPaceMinutes("");
    setPaceSeconds("");
    setPaceError(false);
  };

  const onApplyPace = () => {
    if (paceMsPerMeter === null) {
      setPaceError(true);
      return;
    }
    if (editingSegmentId !== null) {
      draw.updatePaceSegment(editingSegmentId, paceMsPerMeter);
      cancelEditSegment();
      return;
    }
    const span = draw.selectionPaceSpan;
    if (!span) return;
    draw.applyPaceSegment(
      span.fromVertexId,
      span.toVertexId,
      paceMsPerMeter,
    );
    // The inputs keep their values — planning several stretches at
    // the same pace (interval reps) is one selection + one click each.
  };

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

        {/* Task 72 — repeat a loop: select points, copy, paste again
            and again; every paste appends at the end as ONE undo step
            and the live distance above grows with it. */}
        <div
          className="grid gap-1.5 rounded-md border border-ink/15 bg-ink/[0.02] px-2.5 py-2"
          data-testid="copy-paste-group"
          role="group"
          aria-label={t("create.drawPanel.copyPasteGroup")}
        >
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.01em]">
            <Repeat className="size-3.5 text-signal" aria-hidden="true" />
            {t("create.drawPanel.repeatTitle")}
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("create.drawPanel.repeatHint")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 text-[12px]"
              data-testid="create-copy-selection"
              disabled={!draw.canCopy}
              onClick={draw.copySelection}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {t("create.drawPanel.copyButton", {
                count: draw.selectedCount,
              })}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 text-[12px]"
              data-testid="create-paste-clipboard"
              disabled={!draw.canPaste}
              onClick={draw.pasteClipboard}
            >
              <ClipboardPaste className="size-3.5" aria-hidden="true" />
              {t("create.drawPanel.pasteButton", {
                count: draw.clipboardCount,
              })}
            </Button>
          </div>
          {draw.clipboardCount > 0 && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="create-clipboard-status"
              role="status"
            >
              {t("create.drawPanel.clipboardStatus", {
                count: draw.clipboardCount,
              })}
            </p>
          )}
        </div>

        {/* Task 73 — the pace plan: mark a stretch, set its pace; the
            unplanned rest keeps the activity average, hills breathe
            around both once elevation is estimated (review phase). */}
        <div
          className="grid gap-1.5 rounded-md border border-ink/15 bg-ink/[0.02] px-2.5 py-2"
          data-testid="pace-plan-group"
          role="group"
          aria-label={t("create.pace.group")}
        >
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.01em]">
            <Gauge className="size-3.5 text-signal" aria-hidden="true" />
            {t("create.pace.group")}
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("create.pace.hint")}
          </p>

          {/* The pace entry: minutes : seconds per unit, the stats
              form's idiom on one row. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="h-8 w-14 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2 text-xs tabular-nums transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
                data-testid="pace-minutes-input"
                aria-label={t("create.statsForm.paceMinutesA11y")}
                placeholder="5"
                value={paceMinutes}
                onChange={(event) => {
                  setPaceMinutes(event.target.value);
                  setPaceError(false);
                }}
              />
              <span className="text-[11px] font-semibold text-muted-foreground">:</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                step={1}
                className="h-8 w-14 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2 text-xs tabular-nums transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
                data-testid="pace-seconds-input"
                aria-label={t("create.statsForm.paceSecondsA11y")}
                placeholder="30"
                value={paceSeconds}
                onChange={(event) => {
                  setPaceSeconds(event.target.value);
                  setPaceError(false);
                }}
              />
              <span className="text-[11px] font-semibold text-muted-foreground">
                /{paceUnit === "km" ? UNIT_WORDS[locale].km : UNIT_WORDS[locale].mi}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-[12px]"
              data-testid="pace-apply-button"
              disabled={
                editingSegmentId === null &&
                (draw.selectionPaceSpan === null || paceMsPerMeter === null)
              }
              onClick={onApplyPace}
            >
              <Check className="size-3.5" aria-hidden="true" />
              {editingSegmentId !== null
                ? t("create.pace.updateButton")
                : t("create.pace.applyButton")}
            </Button>
            {editingSegmentId !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
                data-testid="pace-cancel-edit"
                onClick={cancelEditSegment}
              >
                <X className="size-3.5" aria-hidden="true" />
                {t("create.pace.cancelEdit")}
              </Button>
            )}
          </div>

          {paceError && (
            <p className="text-xs text-destructive" role="alert" data-testid="pace-error">
              {t("create.pace.error")}
            </p>
          )}

          {/* What the Apply will target: the contiguous selection run. */}
          {editingSegmentId === null && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="pace-selection-status"
              role="status"
            >
              {draw.selectionPaceSpan === null
                ? t("create.pace.needStretch")
                : t("create.pace.selectionReady", {
                    from: draw.selectionPaceSpan.fromIndex + 1,
                    to: draw.selectionPaceSpan.toIndex + 1,
                    distance: formatDistanceForUnit(
                      draw.selectionPaceSpan.distanceM,
                      paceUnit,
                    ),
                  })}
            </p>
          )}

          {/* The planned stretches, route order. */}
          {draw.paceSegments.length > 0 && (
            <ul className="grid gap-0.5" data-testid="pace-segment-list">
              {draw.paceSegments.map((segment) => {
                const indices = draw.paceSegmentIndices.get(segment.id);
                const distanceM = draw.paceSegmentDistances.get(segment.id);
                return (
                  <li
                    key={segment.id}
                    className="flex items-center gap-2 rounded-[6px] border border-ink/10 bg-card px-2 py-1.5 text-xs"
                    data-testid="pace-segment-row"
                    data-editing={editingSegmentId === segment.id}
                  >
                    <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-signal/[0.12] text-[10px] font-bold text-signal">
                      <Gauge className="size-3" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">
                      <span className="font-semibold">
                        {indices
                          ? t("create.pace.segmentSpan", {
                              from: indices[0] + 1,
                              to: indices[1] + 1,
                            })
                          : "—"}
                      </span>{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {distanceM !== undefined
                          ? formatDistanceForUnit(distanceM, paceUnit)
                          : ""}{" "}
                        ·{" "}
                        {formatPaceMs(segment.paceMsPerMeter * metersPerUnit)} /"
                        {paceUnit === "km" ? UNIT_WORDS[locale].km : UNIT_WORDS[locale].mi}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
                      aria-label={
                        indices
                          ? t("create.pace.editA11y", {
                              from: indices[0] + 1,
                              to: indices[1] + 1,
                            })
                          : t("create.pace.editA11y", { from: 0, to: 0 })
                      }
                      data-testid="pace-edit-segment"
                      onClick={() => startEditSegment(segment.id)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
                      aria-label={
                        indices
                          ? t("create.pace.deleteA11y", {
                              from: indices[0] + 1,
                              to: indices[1] + 1,
                            })
                          : t("create.pace.deleteA11y", { from: 0, to: 0 })
                      }
                      data-testid="pace-delete-segment"
                      onClick={() => {
                        if (editingSegmentId === segment.id) cancelEditSegment();
                        draw.removePaceSegment(segment.id);
                      }}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {draw.paceSegments.length > 0 && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="pace-coverage-status"
              role="status"
            >
              {t("create.pace.coverage", {
                count: draw.paceSegments.length,
                planned: formatDistanceForUnit(
                  [...draw.paceSegmentDistances.values()].reduce(
                    (sum, meters) => sum + meters,
                    0,
                  ),
                  paceUnit,
                ),
              })}
            </p>
          )}
        </div>

        {/* Vertex list: the accessible delete path + the selection. */}
        {draw.vertexCount > 0 && (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("create.drawPanel.drawnPointsNote")}
            </p>
            <div
              className="flex items-center gap-1.5"
              data-testid="create-selection-bar"
            >
              <p
                className="text-[11px] tabular-nums text-muted-foreground"
                data-testid="create-selection-count"
              >
                {t("create.drawPanel.selectionCount", {
                  count: draw.selectedCount,
                  total: draw.vertexCount,
                })}
              </p>
              <span className="ml-auto flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 rounded-full border-[1.25px] border-ink/25 px-2.5 text-[11.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                  data-testid="create-select-all"
                  disabled={draw.selectedCount === draw.vertexCount}
                  onClick={draw.selectAllVertices}
                >
                  {t("create.drawPanel.selectAll")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 rounded-full border-[1.25px] border-ink/25 px-2.5 text-[11.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                  data-testid="create-clear-selection"
                  disabled={draw.selectedCount === 0}
                  onClick={draw.clearSelection}
                >
                  {t("create.drawPanel.clearSelection")}
                </Button>
              </span>
            </div>
            <ScrollArea className="max-h-40 -mx-2">
              <ul className="grid gap-0.5 px-2">
                {draw.vertices.map((vertex, index) => (
                  <VertexRow
                    key={vertex.id}
                    vertex={vertex}
                    index={index}
                    selected={draw.selection.has(vertex.id)}
                    onToggleSelect={handleToggleSelect}
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

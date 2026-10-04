/**
 * SurgeryCard (Phase 16) — manual geometry control over the working
 * copy (§EE 16.1), the tools-column surface between finding problems
 * and repairing gaps.
 *
 * Four operations, one chip group: split a segment after a point,
 * delete an A–B range, duplicate a segment, and reorder segments
 * within their tracks. Point selection is BOTH pointer and keyboard:
 * a map pick (the controller's "point" mode — click any recorded
 * point) or typed point numbers with a live resolution line and a
 * Jump button. Every operation opens the FixPreviewDialog first —
 * the plan's own words — and lands in the shared changes log (the
 * deep-validation card renders it) as ONE undoable edit.
 *
 * Pure presentation: the `useSurgery` binding in, intents out — no
 * domain logic here (ESLint boundaries).
 */

"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Crosshair,
  MapPin,
  Scissors,
  SquareSplitHorizontal,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FixPreviewDialog,
  type PreviewPointInfo,
} from "@/components/gpx/fix-preview-dialog";
import type { SegmentRow } from "@/hooks/use-gpx-session";
import type { SurgeryBinding, SurgeryPick } from "@/hooks/use-surgery";
import { useI18n } from "@/hooks/use-i18n";
import { translateLabel } from "@/i18n/runtime";
import type { FixPlan, PointRef } from "@/types/domain";
import { formatDistanceMeters, formatLatLon } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Vocabulary (i18n KEYS, rendered via t())
// ---------------------------------------------------------------------------

type Section = "split" | "range" | "duplicate" | "reorder";

const SECTIONS: readonly {
  value: Section;
  labelKey: string;
  icon: typeof Scissors;
}[] = [
  {
    value: "split",
    labelKey: "surgery.section.split",
    icon: SquareSplitHorizontal,
  },
  {
    value: "range",
    labelKey: "surgery.section.range",
    icon: Trash2,
  },
  {
    value: "duplicate",
    labelKey: "surgery.section.duplicate",
    icon: Copy,
  },
  {
    value: "reorder",
    labelKey: "surgery.section.reorder",
    icon: ArrowDown,
  },
];

/** Parse a 1-based point number from a form field. */
function parsePointNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

const SEGMENT_SELECT_CLASS =
  "h-8 w-full rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2.5 text-xs font-normal transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none";

const NUMBER_INPUT_CLASS =
  "h-8 w-full rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2 text-xs font-normal tabular-nums transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none";

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export interface SurgeryCardProps {
  /** The surgery binding (pick loop, planners, apply). */
  surgery: SurgeryBinding;
  /** The working view's segment rows (point counts, distances). */
  rows: readonly SegmentRow[];
  /** Jump the map to a point (AppShell resolves + focuses). */
  onJumpToPoint: (ref: PointRef) => void;
  /** Resolve a point id for the preview dialog's textual list. */
  resolvePoint: (pointId: string) => PreviewPointInfo | null;
}

export function SurgeryCard({
  surgery,
  rows,
  onJumpToPoint,
  resolvePoint,
}: SurgeryCardProps) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("split");
  const [preview, setPreview] = useState<FixPlan | null>(null);

  // -- form state (strings — controlled inputs, parsed on use) ----------
  const [splitSeg, setSplitSeg] = useState("");
  const [splitNum, setSplitNum] = useState("");
  const [rangeSeg, setRangeSeg] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [pickError, setPickError] = useState<string | null>(null);
  /*
   * The reorder draft carries the rows-signature it was drafted
   * against; it stays live while that world is still the truth (an
   * apply, an undo, any working edit underneath invalidates it) — but
   * NOT while the user's own moves rearrange the draft (that is the
   * draft's job). DERIVED here, not synced by an effect.
   */
  const [reorder, setReorder] = useState<{
    base: string;
    draft: readonly SegmentRow[];
  } | null>(null);

  const rowsSignature = rows
    .map((row) => `${row.segmentId}:${row.pointCount}`)
    .join("|");
  const reorderDraft =
    reorder !== null && reorder.base === rowsSignature ? reorder.draft : null;

  /*
   * The EFFECTIVE segments: the current selection while it still
   * exists, else the first row (a new file, or the chosen segment was
   * removed by an undo). Derived, not synced — no effect needed.
   */
  const effectiveSplitSeg = rows.some((row) => row.segmentId === splitSeg)
    ? splitSeg
    : (rows[0]?.segmentId ?? "");
  const effectiveRangeSeg = rows.some((row) => row.segmentId === rangeSeg)
    ? rangeSeg
    : (rows[0]?.segmentId ?? "");

  // -- map picks fill the forms ------------------------------------------
  //
  // The "adjusting state when a prop changes" pattern (React docs,
  // You Might Not Need an Effect): the pick is applied to the form
  // state during render, guarded by the last APPLIED pick — no effect,
  // no cascade.
  const lastPick = surgery.lastPick;
  const [appliedPick, setAppliedPick] = useState<SurgeryPick | null>(null);
  if (lastPick !== null && lastPick !== appliedPick) {
    setAppliedPick(lastPick);
    setPickError(null);
    const located = surgery.locate(lastPick.pointId);
    if (located !== null) {
      if (lastPick.slot === "split") {
        setSplitSeg(located.segmentId);
        setSplitNum(String(located.number));
      } else if (lastPick.slot === "range-from") {
        setRangeSeg(located.segmentId);
        setRangeFrom(String(located.number));
      } else if (lastPick.slot === "range-to") {
        if (located.segmentId !== effectiveRangeSeg) {
          setPickError(
            t("surgery.pickRangeMismatch", {
              landed: located.segmentId,
              current: effectiveRangeSeg,
            }),
          );
        } else {
          setRangeTo(String(located.number));
        }
      }
    }
  }

  // -- split section -------------------------------------------------------
  const splitRow =
    rows.find((row) => row.segmentId === effectiveSplitSeg) ?? null;
  const splitCount = splitRow?.pointCount ?? 0;
  const splitParsed = parsePointNumber(splitNum);
  const splitTarget =
    splitParsed !== null && splitRow
      ? surgery.pointAt(effectiveSplitSeg, splitParsed)
      : null;
  let splitError: string | null = null;
  if (splitNum.trim().length > 0) {
    if (splitParsed === null) {
      splitError = t("surgery.splitInvalidNumber");
    } else if (splitCount < 2) {
      splitError = t("surgery.splitTooShort");
    } else if (splitParsed >= splitCount) {
      splitError = t("surgery.splitAtLast", {
        number: splitParsed,
        max: splitCount - 1,
      });
    }
  }

  // -- range section --------------------------------------------------------
  const rangeRow =
    rows.find((row) => row.segmentId === effectiveRangeSeg) ?? null;
  const rangeCount = rangeRow?.pointCount ?? 0;
  const rangeFromParsed = parsePointNumber(rangeFrom);
  const rangeToParsed = parsePointNumber(rangeTo);
  let rangeError: string | null = null;
  if (rangeFrom.trim().length > 0 && rangeFromParsed === null) {
    rangeError = t("surgery.rangeInvalidStart");
  } else if (rangeTo.trim().length > 0 && rangeToParsed === null) {
    rangeError = t("surgery.rangeInvalidEnd");
  } else if (
    rangeFromParsed !== null &&
    rangeFromParsed > rangeCount
  ) {
    rangeError = t(
      rangeCount === 1
        ? "surgery.rangeStartTooHighOne"
        : "surgery.rangeStartTooHighMany",
      { count: rangeCount, max: rangeCount },
    );
  } else if (rangeToParsed !== null && rangeToParsed > rangeCount) {
    rangeError = t(
      rangeCount === 1
        ? "surgery.rangeEndTooHighOne"
        : "surgery.rangeEndTooHighMany",
      { count: rangeCount, max: rangeCount },
    );
  }

  const splitReady =
    splitParsed !== null &&
    splitError === null &&
    splitCount >= 2 &&
    splitParsed < splitCount;
  const rangeReady =
    rangeFromParsed !== null &&
    rangeToParsed !== null &&
    rangeError === null;

  // -- intents ---------------------------------------------------------------
  const openSplitPreview = () => {
    if (!splitReady || splitParsed === null) return;
    const plan = surgery.planSplit(effectiveSplitSeg, splitParsed);
    if (plan) setPreview(plan);
  };
  const openRangePreview = () => {
    if (!rangeReady || rangeFromParsed === null || rangeToParsed === null) {
      return;
    }
    const plan = surgery.planRange(
      effectiveRangeSeg,
      rangeFromParsed,
      rangeToParsed,
    );
    if (plan) setPreview(plan);
  };
  const openDuplicatePreview = (segmentId: string) => {
    const plan = surgery.planDuplicate(segmentId);
    if (plan) setPreview(plan);
  };
  const openReorderPreview = () => {
    if (!reorderDraft) return;
    const plan = surgery.planOrder(reorderDraft.map((row) => row.segmentId));
    if (plan) setPreview(plan);
  };

  const moveDraft = (index: number, direction: -1 | 1) => {
    setReorder((current) => {
      if (!current) return current;
      const draft = current.draft;
      const target = index + direction;
      if (target < 0 || target >= draft.length) return current;
      // Tracks are never crossed — the boundary buttons disable, and
      // the guard keeps a fast double-click honest too.
      if (draft[index].trackIndex !== draft[target].trackIndex) {
        return current;
      }
      const next = [...draft];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, draft: next };
    });
  };

  const jumping = (segmentId: string, number1Based: number) => {
    const target = surgery.pointAt(segmentId, number1Based);
    if (!target) return;
    onJumpToPoint({
      segmentId: segmentId as PointRef["segmentId"],
      pointId: target.pointId as PointRef["pointId"],
    });
  };

  return (
    <Card data-testid="surgery-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Scissors className="size-4 text-signal" aria-hidden="true" />
          {t("surgery.title")}
        </h3>
        <CardDescription>
          {t("surgery.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* The operation chips (the pen-group pattern). */}
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("surgery.operationAria")}
          data-testid="surgery-section-group"
        >
          {SECTIONS.map((choice) => (
            <Button
              key={choice.value}
              type="button"
              size="sm"
              variant="ghost"
              className={
                section === choice.value
                  ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper hover:bg-inkplus hover:text-paper"
                  : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
              }
              aria-pressed={section === choice.value}
              data-testid={`surgery-tab-${choice.value}`}
              onClick={() => {
                setSection(choice.value);
                setPickError(null);
                surgery.cancelPick();
              }}
            >
              <choice.icon className="size-3.5" aria-hidden="true" />
              {t(choice.labelKey)}
            </Button>
          ))}
        </div>

        {/* The pick banner — one honest line while a click is awaited. */}
        {surgery.pickMode !== null && (
          <p
            className="rounded-md border border-signal/40 bg-signal/5 px-3 py-2 text-xs text-ink"
            data-testid="surgery-pick-status"
            role="status"
          >
            {t("surgery.pickBanner", {
              slot:
                surgery.pickMode === "split"
                  ? t("surgery.pickSlotSplit")
                  : surgery.pickMode === "range-from"
                    ? t("surgery.pickSlotRangeFrom")
                    : t("surgery.pickSlotRangeTo"),
            })}{" "}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={surgery.cancelPick}
            >
              {t("surgery.pickCancel")}
            </button>
            .
          </p>
        )}
        {pickError !== null && (
          <p
            className="text-[11.5px] font-medium text-signal-ink"
            data-testid="surgery-pick-error"
            role="alert"
          >
            {pickError}
          </p>
        )}

        {section === "split" && (
          <div className="grid gap-2" data-testid="surgery-split-form">
            <label className="grid gap-1 text-xs font-semibold">
              {t("surgery.segmentLabel")}
              <select
                className={SEGMENT_SELECT_CLASS}
                data-testid="surgery-split-segment"
                value={effectiveSplitSeg}
                onChange={(event) => {
                  setSplitSeg(event.target.value);
                  setSplitNum("");
                }}
              >
                {rows.map((row) => (
                  <option key={row.segmentId} value={row.segmentId}>
                    {row.segmentId} ·{" "}
                    {t("surgery.rowPoints", { count: row.pointCount })} ·{" "}
                    {formatDistanceMeters(row.distanceM)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1 text-xs font-semibold">
                {t("surgery.cutAfterLabel")}
                <input
                  type="text"
                  inputMode="numeric"
                  className={NUMBER_INPUT_CLASS}
                  data-testid="surgery-split-number"
                  aria-invalid={splitError !== null}
                  value={splitNum}
                  onChange={(event) => setSplitNum(event.target.value)}
                  placeholder={`1–${Math.max(splitCount - 1, 1)}`}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                data-testid="surgery-split-pick"
                disabled={surgery.pickMode !== null}
                onClick={() => surgery.beginPick("split")}
              >
                <MapPin className="size-3.5" aria-hidden="true" />
                {t("surgery.pickOnMap")}
              </Button>
            </div>
            {splitError !== null && (
              <p
                className="text-[11.5px] font-medium text-signal-ink"
                data-testid="surgery-split-error"
                role="alert"
              >
                {splitError}
              </p>
            )}
            {splitTarget && splitError === null && (
              <p
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-ink/15 bg-ink/[0.03] px-2.5 py-1.5 text-[11.5px] text-muted-foreground"
                data-testid="surgery-split-resolution"
              >
                <span className="font-mono text-[11px] text-ink">
                  {effectiveSplitSeg}:{splitTarget.pointId.slice(splitTarget.pointId.lastIndexOf(":") + 1)}
                </span>
                <span className="font-mono text-[10.5px]">
                  {formatLatLon(splitTarget.lat, splitTarget.lon)}
                </span>
                <button
                  type="button"
                  className="ml-auto font-semibold text-ink underline underline-offset-2"
                  onClick={() => jumping(effectiveSplitSeg, splitParsed as number)}
                >
                  {t("surgery.jump")}
                </button>
              </p>
            )}
            <Button
              type="button"
              size="sm"
              className="h-8"
              data-testid="surgery-split-apply"
              disabled={!splitReady}
              onClick={openSplitPreview}
            >
              <SquareSplitHorizontal className="size-3.5" aria-hidden="true" />
              {t("surgery.splitApply")}
            </Button>
          </div>
        )}

        {section === "range" && (
          <div className="grid gap-2" data-testid="surgery-range-form">
            <label className="grid gap-1 text-xs font-semibold">
              {t("surgery.segmentLabel")}
              <select
                className={SEGMENT_SELECT_CLASS}
                data-testid="surgery-range-segment"
                value={effectiveRangeSeg}
                onChange={(event) => {
                  setRangeSeg(event.target.value);
                  setRangeFrom("");
                  setRangeTo("");
                }}
              >
                {rows.map((row) => (
                  <option key={row.segmentId} value={row.segmentId}>
                    {row.segmentId} ·{" "}
                    {t("surgery.rowPoints", { count: row.pointCount })} ·{" "}
                    {formatDistanceMeters(row.distanceM)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-semibold">
                {t("surgery.fromPointLabel")}
                <input
                  type="text"
                  inputMode="numeric"
                  className={NUMBER_INPUT_CLASS}
                  data-testid="surgery-range-from"
                  aria-invalid={rangeError !== null}
                  value={rangeFrom}
                  onChange={(event) => setRangeFrom(event.target.value)}
                  placeholder="1"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                {t("surgery.toPointLabel")}
                <input
                  type="text"
                  inputMode="numeric"
                  className={NUMBER_INPUT_CLASS}
                  data-testid="surgery-range-to"
                  aria-invalid={rangeError !== null}
                  value={rangeTo}
                  onChange={(event) => setRangeTo(event.target.value)}
                  placeholder={String(Math.max(rangeCount, 1))}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                data-testid="surgery-range-pick-a"
                disabled={surgery.pickMode !== null}
                onClick={() => surgery.beginPick("range-from")}
              >
                <MapPin className="size-3.5" aria-hidden="true" />
                {t("surgery.pickStart")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                data-testid="surgery-range-pick-b"
                disabled={surgery.pickMode !== null || rangeFrom.trim().length === 0}
                onClick={() => surgery.beginPick("range-to")}
              >
                <MapPin className="size-3.5" aria-hidden="true" />
                {t("surgery.pickEnd")}
              </Button>
            </div>
            {rangeError !== null && (
              <p
                className="text-[11.5px] font-medium text-signal-ink"
                data-testid="surgery-range-error"
                role="alert"
              >
                {rangeError}
              </p>
            )}
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t("surgery.rangeNote")}
            </p>
            <Button
              type="button"
              size="sm"
              className="h-8"
              data-testid="surgery-range-apply"
              disabled={!rangeReady}
              onClick={openRangePreview}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {t("surgery.rangeApply")}
            </Button>
          </div>
        )}

        {section === "duplicate" && (
          <div className="grid gap-2" data-testid="surgery-duplicate-list">
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t("surgery.duplicateNote")}
            </p>
            <ScrollArea className="max-h-56 -mx-2">
              <ul className="grid gap-1 px-2">
                {rows.map((row) => (
                  <li
                    key={row.segmentId}
                    className="flex items-center gap-2 rounded-[6px] border border-ink/10 bg-card px-2 py-1.5 text-xs"
                    data-testid="surgery-duplicate-row"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] text-ink/70">
                        {row.segmentId}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {t("surgery.rowPoints", {
                          count: row.pointCount.toLocaleString(),
                        })} ·{" "}
                        {formatDistanceMeters(row.distanceM)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 px-2 text-[11.5px]"
                      data-testid={`surgery-duplicate-button-${row.segmentId}`}
                      disabled={row.pointCount === 0}
                      onClick={() => openDuplicatePreview(row.segmentId)}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                      {t("surgery.duplicateApply")}
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        {section === "reorder" && (
          <div className="grid gap-2" data-testid="surgery-reorder-section">
            {reorderDraft === null ? (
              <>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t("surgery.reorderNote")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  data-testid="surgery-reorder-start"
                  disabled={rows.length < 2}
                  onClick={() => setReorder({ base: rowsSignature, draft: rows })}
                >
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                  {t("surgery.reorderStart")}
                </Button>
              </>
            ) : (
              <>
                <ScrollArea className="max-h-56 -mx-2">
                  <ol className="grid gap-1 px-2">
                    {reorderDraft.map((row, index) => {
                      const prevTrack =
                        index > 0 ? reorderDraft[index - 1].trackIndex : null;
                      const nextTrack =
                        index + 1 < reorderDraft.length
                          ? reorderDraft[index + 1].trackIndex
                          : null;
                      return (
                        <li
                          key={row.segmentId}
                          className="flex items-center gap-2 rounded-[6px] border border-ink/10 bg-card px-2 py-1.5 text-xs"
                          data-testid="surgery-reorder-row"
                        >
                          <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-ink/[0.06] text-[10px] font-bold text-shade">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-[11px] text-ink/70">
                              {row.segmentId}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {row.trackName}
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="size-6 shrink-0 rounded-[4px] p-0"
                            aria-label={t("surgery.moveUpAria", {
                              segment: row.segmentId,
                            })}
                            data-testid={`surgery-reorder-up-${row.segmentId}`}
                            disabled={prevTrack !== row.trackIndex}
                            onClick={() => moveDraft(index, -1)}
                          >
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="size-6 shrink-0 rounded-[4px] p-0"
                            aria-label={t("surgery.moveDownAria", {
                              segment: row.segmentId,
                            })}
                            data-testid={`surgery-reorder-down-${row.segmentId}`}
                            disabled={nextTrack !== row.trackIndex}
                            onClick={() => moveDraft(index, 1)}
                          >
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                </ScrollArea>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-muted-foreground"
                    data-testid="surgery-reorder-cancel"
                    onClick={() => setReorder(null)}
                  >
                    {t("surgery.cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    data-testid="surgery-reorder-apply"
                    onClick={openReorderPreview}
                  >
                    <Crosshair className="size-3.5" aria-hidden="true" />
                    {t("surgery.applyOrder")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* The what-would-change gate — the plan's own words, the same
          dialog every fix uses. */}
      <FixPreviewDialog
        plans={preview !== null ? [preview] : null}
        title={preview ? translateLabel(t, preview.label) : ""}
        resolvePoint={resolvePoint}
        onConfirm={() => {
          if (preview !== null) surgery.applyPlan(preview);
          setPreview(null);
          // Applying leaves reorder mode too — the draft's world just
          // changed (and its rows went stale by construction).
          setReorder(null);
        }}
        onClose={() => setPreview(null)}
      />
    </Card>
  );
}

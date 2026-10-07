/**
 * PhotosCard (Phase 26 §26.1–26.4) — the tools column's photo
 * geotagging surface: intake (plain + the Chromium write-access
 * door), the camera-clock calibration (time zone + drift nudge, both
 * re-matching the preview live), the per-photo rows (matched with the
 * delta and coordinates, timestamp-less and out-of-window photos
 * listed with their reason, refused formats with the format named),
 * the map pins, and the exports — per-photo Save As, the batch ZIP
 * with its manifest, and the explicit in-place write.
 *
 * Pure presentation: the use-photos controller arrives as props.
 * Every rule the engines enforce is disclosed in copy the user can
 * read without leaving the card (§26.3's footer included).
 */

"use client";

import { useRef, useState } from "react";
import {
  Camera,
  Crosshair,
  Download,
  FileArchive,
  Info,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/hooks/use-i18n";
import {
  DRIFT_SLIDER_MAX_SEC,
  DRIFT_SLIDER_MIN_SEC,
  DRIFT_SLIDER_STEP_SEC,
  formatDriftSeconds,
  formatUtcOffset,
  timezoneOffsetOptions,
} from "@/hooks/use-photos";
import type { PhotoItem, PhotosBinding } from "@/hooks/use-photos";

export interface PhotosCardProps {
  photos: PhotosBinding;
}

export function PhotosCard({ photos: binding }: PhotosCardProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmingWrite, setConfirmingWrite] = useState<string | null>(null);

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // re-adding the same file re-fires
    if (files.length > 0) void binding.addFiles(files);
  };

  const row = (photo: PhotoItem) => {
    const match = binding.matchOf(photo.id);
    const refused = photo.kind.kind === "refused";
    const matched = match?.status === "matched";
    const canWrite = binding.canWriteInPlace(photo.id);
    return (
      <li
        key={photo.id}
        data-testid="photo-row"
        data-status={
          refused ? "refused" : match?.status ?? "no-exif"
        }
        className="grid gap-1.5 rounded-[10px] border-[1.25px] border-ink/15 px-2.5 py-2"
      >
        <div className="flex items-start gap-2.5">
          {photo.thumbnailUrl !== null ? (
            <img
              src={photo.thumbnailUrl}
              alt=""
              loading="lazy"
              className="size-10 shrink-0 rounded-[6px] border border-ink/15 object-cover"
            />
          ) : (
            <span
              className="grid size-10 shrink-0 place-items-center rounded-[6px] border border-ink/15 bg-muted/40"
              aria-hidden="true"
            >
              <Camera className="size-4 text-muted-foreground" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold">
              {photo.fileName}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {photo.exifTime !== null
                ? photo.exifTime
                : refused
                  ? t("photos.refusedTag")
                  : t("photos.statusNoTime")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label={t("photos.removeAria", { name: photo.fileName })}
            onClick={() => binding.removePhoto(photo.id)}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {refused ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {t(
              `photos.refused.${
                photo.kind.kind === "refused" ? photo.kind.format : "unknown"
              }`,
              { detail: photo.kind.kind === "refused" ? photo.kind.detail : "" },
            )}
          </p>
        ) : (
          <>
            {matched && match.status === "matched" && (
              <p
                data-testid="photo-match"
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]"
              >
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Crosshair className="size-3 text-signal" aria-hidden="true" />
                  {t("photos.statusMatched")}
                </span>
                <span className="font-mono tabular-nums">
                  {match.deltaMs === 0
                    ? ""
                    : `${match.deltaMs > 0 ? "+" : "\u2212"}${Math.round(
                        Math.abs(match.deltaMs) / 1000,
                      )} s · `}
                  {match.lat.toFixed(4)}, {match.lon.toFixed(4)}
                  {match.ele !== null
                    ? ` · ${Math.round(match.ele)} m`
                    : ""}
                </span>
                {match.onReconstructed && (
                  <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                    {t("photos.onReconstructed")}
                  </span>
                )}
              </p>
            )}
            {match?.status === "out-of-window" && (
              <p className="text-[11.5px] text-muted-foreground">
                {t("photos.statusOutside")}
                {Number.isFinite(match.nearestDeltaSec) && (
                  <>
                    {" "}
                    {t("photos.outsideBy", {
                      seconds: match.nearestDeltaSec,
                    })}
                  </>
                )}
              </p>
            )}
            {photo.hasGps && (
              <p className="text-[11px] text-muted-foreground">
                {t("photos.alreadyGeotagged")}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11.5px]"
                disabled={!matched}
                aria-label={t("photos.showOnMapAria", { name: photo.fileName })}
                onClick={() => binding.focusPhoto(photo.id)}
              >
                <Crosshair className="size-3" aria-hidden="true" />
                {t("photos.showOnMap")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11.5px]"
                disabled={!matched}
                aria-label={t("photos.saveCopyAria", { name: photo.fileName })}
                onClick={() => binding.saveCopy(photo.id)}
              >
                <Download className="size-3" aria-hidden="true" />
                {t("photos.saveCopy")}
              </Button>
              {canWrite && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11.5px]"
                  disabled={!matched || binding.writingId !== null}
                  aria-label={t("photos.writeInPlaceAria", {
                    name: photo.fileName,
                  })}
                  onClick={() => setConfirmingWrite(photo.id)}
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  {t("photos.writeInPlace")}
                </Button>
              )}
            </div>
            {confirmingWrite === photo.id && (
              <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-muted/50 px-2.5 py-2 text-[12px]">
                <span className="flex-1">
                  {t("photos.writeConfirm", { name: photo.fileName })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-[11.5px]"
                  onClick={() => setConfirmingWrite(null)}
                >
                  {t("photos.writeNo")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2.5 text-[11.5px]"
                  data-testid="photo-write-confirm"
                  onClick={() => {
                    void binding.writeInPlace(photo.id);
                    setConfirmingWrite(null);
                  }}
                >
                  {t("photos.writeYes")}
                </Button>
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  return (
    <section
      data-testid="photos-card"
      aria-label={t("photos.title")}
      className="grid gap-3"
    >
      <div>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Camera className="size-4 text-signal" aria-hidden="true" />
          {t("photos.title")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {t("photos.desc")}
        </p>
      </div>

      {!binding.hasTimedTrack && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("photos.needsTrack")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg"
          multiple
          className="sr-only"
          aria-label={t("photos.addAria")}
          onChange={onInputChange}
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-[12px]"
          data-testid="photos-add-button"
          disabled={!binding.hasTimedTrack}
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="size-3.5" aria-hidden="true" />
          {t("photos.add")}
        </Button>
        {binding.canOpenWithWriteAccess && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-[12px]"
            data-testid="photos-add-write-button"
            disabled={!binding.hasTimedTrack}
            title={t("photos.addWriteHint")}
            onClick={() => void binding.addFilesWithWriteAccess()}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {t("photos.addWrite")}
          </Button>
        )}
      </div>

      {binding.photos.length === 0 ? (
        binding.hasTimedTrack && (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t("photos.noPhotos")}
          </p>
        )
      ) : (
        <>
          {/* The calibration block (§26.1) — both controls re-match the
           * preview live; the tolerance line states the window. */}
          <div
            className="grid gap-2.5 rounded-[10px] border-[1.25px] border-ink/15 px-2.5 py-2.5"
            data-testid="photos-calibration"
          >
            <div className="grid gap-1">
              <label
                htmlFor="photos-tz"
                className="text-[11.5px] font-semibold text-muted-foreground"
              >
                {t("photos.tzLabel")}
              </label>
              <Select
                value={String(binding.tzOffsetMinutes)}
                onValueChange={(value) =>
                  binding.setTzOffset(Number(value))
                }
              >
                <SelectTrigger
                  id="photos-tz"
                  size="sm"
                  className="h-8 text-[12.5px]"
                  data-testid="photos-tz"
                  aria-label={t("photos.tzAria")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {timezoneOffsetOptions().map((minutes) => (
                    <SelectItem
                      key={minutes}
                      value={String(minutes)}
                      className="text-[12.5px]"
                    >
                      {formatUtcOffset(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor="photos-drift"
                  className="text-[11.5px] font-semibold text-muted-foreground"
                >
                  {t("photos.driftLabel")}
                </label>
                <span
                  data-testid="photos-drift-value"
                  className="font-mono text-[11.5px] tabular-nums"
                >
                  {t("photos.driftValue", {
                    value: formatDriftSeconds(binding.driftSeconds),
                  })}
                </span>
              </div>
              <Slider
                id="photos-drift"
                min={DRIFT_SLIDER_MIN_SEC}
                max={DRIFT_SLIDER_MAX_SEC}
                step={DRIFT_SLIDER_STEP_SEC}
                value={[binding.driftSeconds]}
                onValueChange={(value) => binding.setDrift(value[0] ?? 0)}
                aria-label={t("photos.driftAria")}
                thumbProps={{ "aria-label": t("photos.driftAria") }}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("photos.toleranceNote")}
            </p>
          </div>

          {/* The rules disclosure (each engine rule, readable in place). */}
          <details className="rounded-[10px] border-[1.25px] border-ink/15 px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold">
              <Info className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {t("photos.rulesTitle")}
            </summary>
            <ul className="mt-2 grid gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
              <li>{t("photos.ruleClock")}</li>
              <li>{t("photos.ruleMatrix")}</li>
              <li>{t("photos.ruleWindow")}</li>
              <li>{t("photos.ruleHonesty")}</li>
              <li>{t("photos.ruleWrite")}</li>
            </ul>
          </details>

          <p
            data-testid="photos-count"
            className="text-[12px] font-semibold"
            role="status"
          >
            {t("photos.matchedCount", {
              matched: binding.matchedCount,
              total: binding.matches.length,
            })}
          </p>

          <ul role="list" className="grid gap-2">
            {binding.photos.map((photo) => row(photo))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[12px]"
              data-testid="photos-zip-button"
              disabled={binding.matches.length === 0}
              onClick={binding.downloadZip}
            >
              <FileArchive className="size-3.5" aria-hidden="true" />
              {t("photos.zip")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[12px]"
              onClick={binding.clearAll}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {t("photos.clear")}
            </Button>
          </div>

          {/* §26.3 — the footer's promise, stated where the photos are. */}
          <p
            data-testid="photos-footer"
            className="rounded-[8px] bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
          >
            {t("photos.footer")}
          </p>
        </>
      )}
    </section>
  );
}

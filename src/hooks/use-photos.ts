/**
 * usePhotos (Phase 26 — docs/plans/v3/phase-26-photo-geotagging.md):
 * the photo-geotagging controller behind the tools column's card.
 *
 * Owns, in order of trust:
 *   - the INTAKE: files in, sniffed honestly (JPEG proceeds; anything
 *     else is listed with its format named and never written);
 *   - the CALIBRATION (§26.1): camera time zone + drift nudge, both
 *     session-local by design — a remembered nudge would be a lie the
 *     next time a different camera's photos arrive;
 *   - the MATCHES: one pure `matchPhotos` pass over the working view
 *     the export pipeline already merged (the one-merge rule — the
 *     pins, the rows, and the ZIP can never disagree about positions);
 *   - the PINS: matched positions pushed to the map imperatively (the
 *     map binding's setPhotoPins, the segments controller's own
 *     pattern for post-map controllers);
 *   - the EXPORTS (§26.2/§26.4): per-photo Save As, the batch ZIP with
 *     its manifest, and the explicit in-place write — the File System
 *     Access API door only, and only for photos that arrived through
 *     the write-access picker.
 *
 * Nothing persists. Photos live in memory for the session and are
 * gone when the card clears or the app closes — the privacy footer's
 * promise is structural, not a setting.
 *
 * Phase 26 — Photo geotagging. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import type { MergeResult } from "@/features/reconstruction/merge";
import {
  injectGps,
  parseExifDateTime,
  readExifSummary,
  sniffImageKind,
  type PhotoImageKind,
} from "@/features/photos/jpeg";
import {
  DEFAULT_MATCH_TOLERANCE_SEC,
  buildTimedTrack,
  matchPhotos,
  type PhotoMatch,
} from "@/features/photos/matching";
import {
  buildPhotoZipEntries,
  photoGeotaggedName,
  type PhotoZipItem,
} from "@/features/photos/zip";
import { photoPinsCollection, type PhotoPinPart } from "@/lib/map/geojson";
import { downloadBlobFile } from "@/lib/utils/download";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";
import type { MapBinding } from "@/hooks/use-map-controller";

// App-layer facade: components may not import feature internals (the
// §F ESLint boundary), so the photos vocabulary flows through here —
// the same re-export use-zones/use-segments practice.
export {
  DEFAULT_MATCH_TOLERANCE_SEC,
  DRIFT_SLIDER_MAX_SEC,
  DRIFT_SLIDER_MIN_SEC,
  DRIFT_SLIDER_STEP_SEC,
  formatDriftSeconds,
  formatUtcOffset,
  timezoneOffsetOptions,
} from "@/features/photos/matching";
export type {
  MatchConfig,
  PhotoMatch,
  TimedTrackPoint,
} from "@/features/photos/matching";
export type { PhotoImageKind, RefusedFormat } from "@/features/photos/jpeg";

/**
 * The structural slice of FileSystemFileHandle this feature needs
 * (kept local so non-Chromium TS libs and the test fakes fit the same
 * shape — the real API is structurally compatible).
 */
export interface PhotoWriteHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
  }>;
}

/** One photo in the session's working set. */
export interface PhotoItem {
  id: string;
  fileName: string;
  sizeBytes: number;
  /** The untouched original bytes. */
  bytes: Uint8Array;
  /** The sniff verdict (refused photos stay listed, never written). */
  kind: PhotoImageKind;
  /** DateTimeOriginal exactly as stored (null = none / not a JPEG). */
  exifTime: string | null;
  /** The parsed naive epoch ms (null = unparseable or absent). */
  naiveTimeMs: number | null;
  /** The JPEG already carries a GPS block (§26.3's replacement note). */
  hasGps: boolean;
  /** Present only through the write-access picker (§26.2). */
  handle: PhotoWriteHandle | null;
  /** Object URL for the thumbnail (null where URLs are unavailable). */
  thumbnailUrl: string | null;
}

/** What usePhotos needs from the shell. */
export interface UsePhotosOptions {
  /** The exporter's merge — the one merged working view (§ one-merge). */
  merge: MergeResult | null;
  /** The repair map's binding (pins in, focus intents out). */
  map: Pick<MapBinding, "setPhotoPins" | "focusPoint">;
  /** The session's file name (the ZIP's name derives from it). */
  sessionFileName: string | null;
}

/** The binding the PhotosCard renders. */
export interface PhotosBinding {
  /** Every added photo, in intake order (JPEGs and refusals alike). */
  photos: readonly PhotoItem[];
  /** The working view has timestamps to match against. */
  hasTimedTrack: boolean;
  /** The calibration (session-local, never persisted). */
  tzOffsetMinutes: number;
  driftSeconds: number;
  setTzOffset: (minutes: number) => void;
  setDrift: (seconds: number) => void;
  /** Matches aligned with `photos` (refused photos never appear). */
  matches: readonly PhotoMatch[];
  /** The match for one photo, by id (undefined = refused/not a JPEG). */
  matchOf: (id: string) => PhotoMatch | undefined;
  matchedCount: number;
  /** Matched positions as map pins (the hook pushes them itself). */
  focusPhoto: (id: string) => void;
  /** Intake doors. */
  addFiles: (files: File[]) => Promise<void>;
  canOpenWithWriteAccess: boolean;
  addFilesWithWriteAccess: () => Promise<void>;
  /** Per-photo intents. */
  removePhoto: (id: string) => void;
  clearAll: () => void;
  saveCopy: (id: string) => void;
  /** True when this photo arrived through the write-access picker. */
  canWriteInPlace: (id: string) => boolean;
  writeInPlace: (id: string) => Promise<void>;
  /** The id currently being written (the row's honest busy state). */
  writingId: string | null;
  /** The batch door (§26.4). */
  downloadZip: () => void;
}

/** Object URLs are browser-only; jsdom and friends get a graceful null. */
function makeThumbnail(file: Blob): string | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  return URL.createObjectURL(file);
}

let photoSeq = 0;
function nextPhotoId(): string {
  photoSeq += 1;
  return `photo-${Date.now().toString(36)}-${photoSeq}`;
}

export function usePhotos(options: UsePhotosOptions): PhotosBinding {
  const { t } = useI18n();
  const { merge, map, sessionFileName } = options;
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [tzOffsetMinutes, setTzOffset] = useState(() =>
    // The browser's own zone is the honest default: photos are usually
    // taken where the user is. Session-local — never persisted.
    -new Date().getTimezoneOffset(),
  );
  const [driftSeconds, setDrift] = useState(0);
  const [writingId, setWritingId] = useState<string | null>(null);
  /** Live object URLs for revocation on clear/unmount. */
  const objectUrlsRef = useRef<string[]>([]);

  // -- the track + matches (the one-merge rule) ---------------------------
  const track = useMemo(
    () => (merge !== null ? buildTimedTrack(merge) : []),
    [merge],
  );
  const jpegPhotos = useMemo(
    () => photos.filter((photo) => photo.kind.kind === "jpeg"),
    [photos],
  );
  const matches = useMemo(
    () =>
      matchPhotos(
        jpegPhotos.map((photo) => ({
          id: photo.id,
          naiveTimeMs: photo.naiveTimeMs,
        })),
        track,
        {
          timezoneOffsetMinutes: tzOffsetMinutes,
          driftSeconds,
          toleranceSec: DEFAULT_MATCH_TOLERANCE_SEC,
        },
      ),
    [jpegPhotos, track, tzOffsetMinutes, driftSeconds],
  );
  const matchById = useMemo(
    () => new Map(matches.map((match) => [match.id, match])),
    [matches],
  );
  const matchOf = useCallback(
    (id: string) => matchById.get(id),
    [matchById],
  );
  const matchedCount = useMemo(
    () => matches.filter((match) => match.status === "matched").length,
    [matches],
  );

  // -- the pins (pushed imperatively; absent = none, ever) ----------------
  const pins = useMemo<PhotoPinPart[]>(
    () =>
      matches.flatMap((match): PhotoPinPart[] =>
        match.status === "matched"
          ? [
              {
                photoId: match.id,
                fileName:
                  photos.find((photo) => photo.id === match.id)?.fileName ?? "",
                lon: match.lon,
                lat: match.lat,
              },
            ]
          : [],
      ),
    [matches, photos],
  );
  const setPhotoPins = map.setPhotoPins;
  useEffect(() => {
    setPhotoPins?.(pins.length > 0 ? photoPinsCollection(pins) : null);
  }, [pins, setPhotoPins]);
  // Leaving the workspace (or unmounting) must never leave orphan pins.
  useEffect(
    () => () => {
      setPhotoPins?.(null);
    },
    [setPhotoPins],
  );

  const focusPhoto = useCallback(
    (id: string) => {
      const match = matchById.get(id);
      if (match?.status === "matched") map.focusPoint?.(match.lat, match.lon);
    },
    [matchById, map],
  );

  // -- intake ---------------------------------------------------------------
  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const added: PhotoItem[] = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const kind = sniffImageKind(bytes);
        let exifTime: string | null = null;
        let naiveTimeMs: number | null = null;
        let hasGps = false;
        if (kind.kind === "jpeg") {
          const summary = readExifSummary(bytes);
          if (summary !== null) {
            exifTime = summary.dateTimeOriginal;
            naiveTimeMs =
              exifTime !== null ? parseExifDateTime(exifTime) : null;
            hasGps = summary.hasGps;
          }
        }
        const thumbnailUrl = makeThumbnail(file);
        if (thumbnailUrl !== null) objectUrlsRef.current.push(thumbnailUrl);
        added.push({
          id: nextPhotoId(),
          fileName: file.name,
          sizeBytes: bytes.length,
          bytes,
          kind,
          exifTime,
          naiveTimeMs,
          hasGps,
          handle: null,
          thumbnailUrl,
        });
      }
      setPhotos((prev) => [...prev, ...added]);
      // The notice counts what the pass just decided — computed over
      // the same track/config the preview will show.
      const fresh = matchPhotos(
        added
          .filter((photo) => photo.kind.kind === "jpeg")
          .map((photo) => ({ id: photo.id, naiveTimeMs: photo.naiveTimeMs })),
        track,
        {
          timezoneOffsetMinutes: tzOffsetMinutes,
          driftSeconds,
          toleranceSec: DEFAULT_MATCH_TOLERANCE_SEC,
        },
      ).filter((match) => match.status === "matched").length;
      announce(
        t("hook.photos.added", {
          count: added.length,
          matched: fresh,
        }),
      );
    },
    [t, track, tzOffsetMinutes, driftSeconds],
  );

  const canOpenWithWriteAccess =
    typeof window !== "undefined" &&
    typeof (window as unknown as { showOpenFilePicker?: unknown })
      .showOpenFilePicker === "function";

  const addFilesWithWriteAccess = useCallback(async () => {
    const picker = (
      window as unknown as {
        showOpenFilePicker?: (options?: {
          multiple?: boolean;
          modes?: ("read" | "readwrite")[];
        }) => Promise<PhotoWriteHandle[]>;
      }
    ).showOpenFilePicker;
    if (typeof picker !== "function") return;
    try {
      const handles = await picker({ multiple: true, modes: ["readwrite"] });
      const files = await Promise.all(handles.map((handle) => handle.getFile()));
      await addFiles(files);
      // Remember which photos own their handle (the in-place door) —
      // paired by file name, exactly one handle per added photo.
      const handleByName = new Map(
        handles.map((handle, index) => [files[index]!.name, handle]),
      );
      setPhotos((prev) =>
        prev.map((photo) =>
          handleByName.has(photo.fileName)
            ? { ...photo, handle: handleByName.get(photo.fileName)! }
            : photo,
        ),
      );
    } catch {
      // The user closed the picker — nothing happened, nothing to say.
    }
  }, [addFiles]);

  // -- per-photo intents ------------------------------------------------------
  const revokeThumbnail = (photo: PhotoItem): void => {
    if (
      photo.thumbnailUrl !== null &&
      typeof URL !== "undefined" &&
      typeof URL.revokeObjectURL === "function"
    ) {
      URL.revokeObjectURL(photo.thumbnailUrl);
    }
  };

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const gone = prev.find((photo) => photo.id === id);
      if (gone) revokeThumbnail(gone);
      return prev.filter((photo) => photo.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setPhotos((prev) => {
      for (const photo of prev) revokeThumbnail(photo);
      return [];
    });
    objectUrlsRef.current = [];
    announce(t("hook.photos.cleared"));
  }, [t]);

  const injectedFor = useCallback(
    (id: string): Uint8Array | null => {
      const photo = photos.find((entry) => entry.id === id);
      if (!photo || photo.kind.kind !== "jpeg") return null;
      const match = matchById.get(id);
      if (match?.status !== "matched") return null;
      return injectGps(photo.bytes, {
        lat: match.lat,
        lon: match.lon,
        ele: match.ele ?? undefined,
        timeMs: match.trackTimeMs,
      });
    },
    [photos, matchById],
  );

  const saveCopy = useCallback(
    (id: string) => {
      const photo = photos.find((entry) => entry.id === id);
      const injected = injectedFor(id);
      if (!photo || injected === null) return;
      downloadBlobFile(
        photoGeotaggedName(photo.fileName),
        new Blob([injected as BlobPart], { type: "image/jpeg" }),
      );
      announce(t("hook.photos.saved", { name: photo.fileName }));
    },
    [photos, injectedFor, t],
  );

  const canWriteInPlace = useCallback(
    (id: string) => photos.find((entry) => entry.id === id)?.handle != null,
    [photos],
  );

  const writeInPlace = useCallback(
    async (id: string) => {
      const photo = photos.find((entry) => entry.id === id);
      if (!photo?.handle) return;
      const injected = injectedFor(id);
      if (injected === null) return;
      setWritingId(id);
      try {
        const writable = await photo.handle.createWritable();
        await writable.write(injected);
        await writable.close();
        announce(t("hook.photos.written", { name: photo.fileName }));
      } catch {
        announce(t("hook.photos.writeFailed", { name: photo.fileName }));
      } finally {
        setWritingId(null);
      }
    },
    [photos, injectedFor, t],
  );

  // -- the batch door (§26.4) ----------------------------------------------------
  const downloadZip = useCallback(() => {
    const items: PhotoZipItem[] = jpegPhotos.map((photo) => ({
      fileName: photo.fileName,
      bytes: photo.bytes,
      injected: injectedFor(photo.id),
      match:
        matchById.get(photo.id) ??
        ({ id: photo.id, status: "no-timestamp" } as PhotoMatch),
      exifTime: photo.exifTime,
      timezoneOffsetMinutes: tzOffsetMinutes,
      driftSeconds,
    }));
    const { entries } = buildPhotoZipEntries(items);
    const zipped: Record<string, Uint8Array> = {};
    for (const entry of entries) zipped[entry.name] = entry.bytes;
    const bytes = zipSync(zipped, { level: 6 });
    const stem = (sessionFileName ?? "photos").replace(/\.[^.]+$/, "");
    downloadBlobFile(
      `${stem}.photos.zip`,
      new Blob([bytes as BlobPart], { type: "application/zip" }),
    );
    announce(t("hook.photos.zipped", { count: items.length }));
  }, [jpegPhotos, injectedFor, matchById, tzOffsetMinutes, driftSeconds, sessionFileName, t]);

  return {
    photos,
    hasTimedTrack: track.length > 0,
    tzOffsetMinutes,
    driftSeconds,
    setTzOffset,
    setDrift,
    matches,
    matchOf,
    matchedCount,
    focusPhoto,
    addFiles,
    canOpenWithWriteAccess,
    addFilesWithWriteAccess,
    removePhoto,
    clearAll,
    saveCopy,
    canWriteInPlace,
    writeInPlace,
    writingId,
    downloadZip,
  };
}

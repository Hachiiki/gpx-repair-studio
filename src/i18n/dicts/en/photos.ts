/**
 * The photos dictionary (Phase 26 — photo geotagging: intake,
 * calibration, the live match preview, the write-back doors). English
 * is the source of truth; every locale mirrors it key for key (the
 * i18n unit gate).
 */

export const photos = {
  // -- Card surface -------------------------------------------------------
  "photos.title": "Photo geotagging",
  "photos.desc":
    "Pin the photos you took to where the watch says you were. EXIF is written back on this device — nothing is uploaded, ever.",
  "photos.needsTrack":
    "Needs the loaded track's timestamps — load a timed file first, then add photos.",
  "photos.noPhotos": "No photos yet — add the JPEGs you took on this activity.",

  // -- Intake --------------------------------------------------------------
  "photos.add": "Add photos",
  "photos.addAria": "Add JPEG photos",
  "photos.addWrite": "Add with write access",
  "photos.addWriteHint":
    "Chromium only: opens the browser's file picker with write permission, enabling GPS write-back into the originals. Save As stays the default either way.",

  // -- Calibration (§26.1) -------------------------------------------------
  "photos.tzLabel": "Camera time zone",
  "photos.tzAria": "Camera time zone",
  "photos.driftLabel": "Camera clock nudge",
  "photos.driftAria": "Camera clock nudge, seconds",
  "photos.driftValue": "Nudge: {value}",
  "photos.toleranceNote":
    "Photos within ±120 s of the track match; the rest are listed with their distance, never snapped silently.",

  // -- The rules disclosure --------------------------------------------------
  "photos.rulesTitle": "How photos are matched",
  "photos.ruleClock":
    "EXIF timestamps are camera-local with no zone; the track is UTC. A photo matches at camera time − chosen zone + drift nudge.",
  "photos.ruleMatrix":
    "The offset matrix: every zone from UTC−12:00 to UTC+14:00 in 30-minute steps (the half-hour zones included), plus a ±5-minute drift nudge — both re-match the preview live as you change them.",
  "photos.ruleWindow":
    "A photo inside the window interpolates between the two nearest track points — more recorded points mean a finer position. Outside it, the photo is listed unmatched with the distance stated.",
  "photos.ruleHonesty":
    "A position estimated over a drawn-in repair stretch is flagged as such — the pin rides estimated geometry, and the manifest says so.",
  "photos.ruleWrite":
    "GPS is written into copies by default (Save As). Originals are touched only through the browser's File System Access API, with an explicit choice each time.",

  // -- Rows -------------------------------------------------------------------
  "photos.statusMatched": "Matched",
  "photos.statusNoTime": "No timestamp in EXIF",
  "photos.statusOutside": "Outside the track's time",
  "photos.outsideBy": "by {seconds} s",
  "photos.refusedTag": "Not a JPEG",
  "photos.refused.heic":
    "HEIC/HEIF — Apple's camera format. Convert to JPEG first; this tool writes JPEG only.",
  "photos.refused.raw":
    "Camera RAW ({detail}) — export a JPEG from your photo tool.",
  "photos.refused.fujifilm-raf":
    "Fujifilm RAF — export a JPEG from your photo tool.",
  "photos.refused.png":
    "PNG carries no EXIF GPS block in mainstream tools — export as JPEG.",
  "photos.refused.webp": "WebP EXIF is not written here — export as JPEG.",
  "photos.refused.unknown": "Not a recognized photo format.",
  "photos.alreadyGeotagged":
    "Already carries GPS — the new position will replace it.",
  "photos.onReconstructed": "drawn-in stretch",
  "photos.matchedCount": "{matched} of {total} matched",
  "photos.showOnMap": "Show on map",
  "photos.showOnMapAria": "Show {name} on the map",
  "photos.saveCopy": "Save tagged copy",
  "photos.saveCopyAria": "Save a tagged copy of {name}",
  "photos.removeAria": "Remove {name}",

  // -- Write-back (§26.2) ------------------------------------------------------
  "photos.writeInPlace": "Write into original",
  "photos.writeInPlaceAria": "Write GPS into the original {name}",
  "photos.writeConfirm":
    "Overwrite the original {name} on your device? A Save As copy is the safe default.",
  "photos.writeYes": "Overwrite original",
  "photos.writeNo": "Keep it safe",

  // -- Batch + footer (§26.4) ---------------------------------------------------
  "photos.zip": "Download tagged copies (ZIP)",
  "photos.clear": "Clear photos",
  "photos.footer":
    "Photos never leave this device — matching, EXIF writing, and the ZIP all happen in your browser.",
};

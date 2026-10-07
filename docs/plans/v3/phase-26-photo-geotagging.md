# Phase 26 — Photo Geotagging (Task 71)

> **Status: DONE — delivered 2026-10-07.** Implemented on the user's explicit instruction ("do phase 26") · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 25](phase-25-heatmap-personal-segments.md) · [Phase 27 →](phase-27-cue-sheets.md)

## Proposal (v3 roadmap)

**Objective:** the photos taken on the activity, pinned to where
you were — EXIF written back on-device, never uploaded anywhere.

- **26.1 Matching.** EXIF DateTimeOriginal against track time, an
  offset-calibration control (camera clocks drift — a live match
  preview with a nudge slider), explicit timezone handling with the
  offset matrix documented.
- **26.2 Write-back.** GPS IFD injection into JPEG bytes locally;
  pins previewed on the map; Save As by default, in-place edits
  only through the File System Access API with an explicit choice.
- **26.3 Honesty.** HEIC/RAW refused with the reason stated;
  timestamp-less photos listed as unmatched; the footer says
  photos never leave the device.
- **26.4 Batch.** Many photos, one pass, a ZIP out with a manifest —
  the [Phase 18](../v2/phase-18-batch-portable-sessions.md) pattern applied to images.

**Non-goals:** face or scene AI, XMP sidecars (candidate), video.
**Verification:** EXIF round-trip property tests (bytes in, tagged
bytes out, originals untouched by default), timezone matrix units,
e2e with synthetic JPEGs, VLM on the match preview.

## Delivery record (Task 71)

**Commit:** `phase(26)` — delivered 2026-10-07 on the user's
instruction, baseline 2147 unit tests (153 files) / 216 e2e (43
specs, two pre-existing skips), typecheck + eslint clean, static
export + PWA build PASS (70 precache URLs).

**26.1 Matching** — EXIF DateTimeOriginal (the Exif sub-IFD, IFD0
as a tolerated fallback) against the merged working view's timed
points — the SAME merge the export and statistics read (the
one-merge rule), projected by `buildTimedTrack` and matched by
`matchPhotos` (features/photos/matching.ts): binary-searched
bracket, time-linear interpolation between the two nearest points
(more points, finer positions), the ±120 s disclosed window with
endpoint pinning, and the reconstruction flag when the bracket rides
drawn-in geometry. The calibration is the card's live preview: a
zone select over every offset on Earth (−12:00 … +14:00 in
30-minute steps — the half-hour zones first-class) and a ±5-minute
drift nudge slider; both re-match the rows and the pins on every
change. The offset matrix (zone × drift, the clock model
`effective = naive − zone + drift`) is documented in the disclosure
and pinned by a 12-cell unit golden plus the interpolation, window,
and honesty goldens.

**26.2 Write-back** — `injectGps` (features/photos/jpeg.ts) writes
the GPS IFD into the JPEG bytes in pure TypeScript, on-device:
GPSVersionID/lat/lon refs and DMS rationals (seconds at 1/1,000,000
— past any receiver's honesty), altitude (+/− sea), and
GPSTimeStamp/GPSDateStamp carrying the fix's own UTC clock. The
strategy never moves existing bytes: no EXIF → a minimal APP1
inserted behind SOI/APP0; EXIF without GPS → the block appended and
the IFD0 pointer inserted in tag order with every offset at/after
the insertion rebased (sub-IFD pointers, value offsets, the IFD1
thumbnail chain); EXIF with GPS → append + repoint, the old block
orphaned in place. Save As is the default (fresh buffers — the
property tests pin the input bytes untouched); in-place writes
exist only through the File System Access API's write-access picker
and an explicit per-photo confirm. Matched positions preview as map
pins (a signal circle above every working layer) with the legend's
row and bridge observables for the e2e.

**26.3 Honesty** — only JPEG is written: HEIC/HEIF/AVIF, camera RAW
(CR2/TIFF-based/ORF/RW2/RAF), PNG, and WebP are refused with the
format named (magic-byte sniffing, no guessing); timestamp-less
photos are listed as exactly that; out-of-window photos state their
distance; an existing GPS block is disclosed as replaced; the
footer says photos never leave this device — and nothing persists:
no store, no cache, memory for the session only (the promise is
structural, not a setting).

**26.4 Batch** — `buildPhotoZipEntries` (features/photos/zip.ts):
many photos, one pass, a ZIP out with `MANIFEST.txt` — the Phase 18
pattern applied to images (fflate, name dedupe, nothing silently
overwritten). The manifest states the calibration, narrates every
photo (matched with delta + coordinates, or the honest reason it
rode along unchanged), counts the refusals out loud, and carries
the two promises (nothing uploaded, no original modified).
English-pinned, like every exported artifact.

**Verification** — 22 EXIF engine tests (the round-trip properties:
bytes in → tagged bytes out → GPS read back at EXIF precision,
originals untouched, both endiannesses, the maker-note/IFD1 offset
rebase proven by parsing the output bytes directly, seeded-random
fixes × the independent fixture writer — a second TIFF
implementation, so every round-trip crosses two writers); 23
matching + zip tests (the 12-cell offset matrix, interpolation and
window goldens, the no-timestamp/window honesty, the manifest's
narration and dedupe); 14 UI tests; 3 e2e (the live preview with
both calibration controls proving themselves — the zone select and
the slider's End key each re-match with new coordinates; the ZIP
downloaded, unzipped in Node, the GPS read back exactly; axe
zero-critical). The VLM sweep (both themes × two surfaces) had
every claim measured: the "filename clipped" claim DISPROVEN
(scrollWidth = clientWidth = 270, no hard clip — `truncate` armed
but not triggered), the "muted text fails AA" claim DISPROVEN
(6.7:1 light / 5.58:1 dark, both above 4.5), the 10 px
thumbnail-to-text gap recorded as the house `gap-2.5`, the distinct
write-access door recorded as deliberate, and both dark shots
measured 40/255 — the Phase 24 theme-key bug class stays fixed.

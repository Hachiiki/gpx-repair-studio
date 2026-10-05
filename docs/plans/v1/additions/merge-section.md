# The Merge Section (Task 43 — user-requested addition)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Landing cards](landing-tool-cards.md) · [Pointer modes →](pointer-modes-path-styles.md)

The fifth tool: **combine two or more GPX files into one route**, then
arrange and export it — per the user's request ("provide 2 or more gpx
files and then it will try to combine them into a one gpx route with
all the things and the user can like change everything in the gpx file
once it combined into one").

### T-1 Scope & contracts

- **The merge contract ("one route with all the things"):** every
  recorded point is carried VERBATIM — the same frozen point objects
  (same raw captures), only ids re-keyed to the merged document
  positions. Elevation, timestamps, waypoints, routes, and
  segment-anchored extras all come along; re-imported `gpxr` repair
  markers survive (re-keyed), so merging previous repairs keeps their
  provenance. The output is ONE `<trk>` (name = the user-chosen
  combined name) whose `<trkseg>`s are the source segments in the
  user's order.
- **Documented drops (honesty, not data loss):** per-file root extras
  and metadata extras (author, copyright, keywords — N of them cannot
  be combined without inventing an order that lies) and the sources'
  per-track extras/desc/type (the merge has exactly one track;
  re-anchoring several files' track-level extensions onto it would be
  fabrication). The creator attribute discloses the merge:
  `GPX Repair Studio (merged N files)`.
- **Version policy:** the merged document uses the FIRST source's GPX
  version/namespace; point children re-emit from raw captures
  regardless of source version, so mixed-version merges are safe.
- **The gate:** the tool requires ≥ 2 parsed files to open the studio
  (Combine) and to export (the download button states the rule while
  it blocks). One bad file never blocks the rest — failures are
  per-file rows with the typed error and a remove button.
- **"Change everything" (the arrangement edits):** reorder files
  (move up/down), sort by start time (stable; undated last), remove
  files, add more files, focus one file's extent on the map, and name
  the combined activity (metadata `<name>` AND the single track's
  `<name>`). Every edit re-derives the merged model — the map, the
  statistics, the validation report, and the export follow each
  change immediately (WYSIWYG).
- **The export is the identity exporter** over the merged model ([§H-7](../../../MASTER_PLAN.md#h-gpx-processing-architecture)
  invariant holds for merges: no recorded value is ever rewritten).
  Download name = the sanitized combined name (fallback
  `merged-route.gpx`).

### T-2 Architecture

- `features/gpx/mergeFiles.ts` (pure domain) — `mergeGpxFiles(sources,
  {name})` builds the merged `OriginalTrackData` (single track,
  re-keyed `t0s{k}:{i}` ids matching a fresh parse of the export,
  deep-frozen); `fileSummary(fileName, model)` computes the list rows'
  counts/timing bounds.
- `state/merge-store.ts` — the section's own store (like
  recovery/create): `phase: "intake" | "studio"`, `files` (the array
  IS the merge order), `combinedName`, id sequence never reused;
  `combine()` guards ≥ 2 parsed. The merged model is NEVER stored —
  always derived.
- `hooks/use-merge-session.ts` — `addMergeFiles(files)` (the parse
  pipeline: File#text → parseGpx → validateGpx → per-file
  setParsed/setFileError, sequential so entries land in selection
  order) and `useMergeSession()` (memoized merge + validate + stats +
  extent + reimport; `exportXml`/`download` serialize the CURRENT
  arrangement).
- `hooks/use-merge-map.ts` — own MapController (four sections, four
  isolated maps), route = `buildRouteView(mergedModel, [])` (splits at
  damage only; re-imported repairs render as reconstruction lines —
  the merged file renders exactly as its re-upload would), reframes
  on every new merge, `focusFile(id)` flies to one source's extent.
- `components/merge/` — `merge-intake.tsx` (the tool page's multi-file
  zone + collected list + the gate; self-wired like CreateStudio),
  `merge-studio.tsx` (composition root), `merge-files-card.tsx`,
  `merge-details-card.tsx`, `merge-export-card.tsx`.
- Reused unchanged: `MapCanvas`, `WorkspaceLayout` (gained optional
  copy props — repair keeps its defaults byte-identical),
  `GpxSummaryCard`, `ValidationReport`, `StatsPanel`, `RevealOnScroll`.
- Shell wiring: `AppSection`/`LandingMode` += `"merge"`; the section
  derives from `mergePhase === "studio"` (create/recovery chain
  unchanged); the header shows the combined name (or "N recordings
  merged"), a "Map & order / Statistics" nav, and "Start over"
  (reset clears to the intake). Landing: the fifth card (centered on
  its own row — the 2×N grid ends balanced), `HERO_COPY` /
  `WORKFLOW_STEPS` / `TOOL_FACTS` entries, and the tool page renders
  `MergeIntake` instead of the single-file `UploadZone`.
- `public/cards/merge.webp` — 896×512 illustration, Task 42's Field
  Plot art direction (raw + prompt under `scripts/qa/task43/`).

### T-3 Verification

Unit: 988 passing (+47 — merge-files domain 21: structure/order/ids/
verbatim reuse/waypoints+routes/extras/markers/drops/metadata/
downstream guarantees incl. byte-stable identity round-trip; store 11;
UI 14; landing +1). E2E: 71 passing (+4 — the fifth card + tool page
with a closed gate; one bad file fails alone and removable; the full
combine → arrange (move/sort) → download flow asserting the
downloaded .gpx's CONTENT: chosen name, single `<trk>`, "merged 3
files" creator, both files' coordinates, `<wpt>` carried; Start over
returns to the intake). Static export PASS (merge.webp shipped). Live
QA (Playwright-driven, desktop 1440×900 + mobile 375×667): 5 cards,
zero horizontal overflow on home and studio, zero console/page
errors. VLM critiques: illustration KEEP (first round), home / tool
page / studio / mobile studio all SHIP (the mobile flags — map
attribution tightness — are pre-existing map-widget patterns shared
by every section).

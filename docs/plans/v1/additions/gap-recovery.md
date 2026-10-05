# The Gap Recovery Section (Task 26 — user-requested addition)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Share card](share-card.md) · [Landing cards →](landing-tool-cards.md)

A third destination of the landing page, added after [Phase 7](../phase-07-merge-export.md) at the
user's request: **Gap Recovery** — a self-contained workflow for
recovering a missing GPS section from an existing activity whose
elapsed time continued while coordinates were missing. Explicitly an
ADDITION, not a redesign: the repair studio's processing, route
drawing, calculation, and export are untouched, and the new section
reuses the same pure machinery wherever possible.

> **Task 26 revision (user feedback):** the section originally shipped
> behind a header section switcher; the user clarified it should be a
> **third tab of the landing mode toggle** ("Repair a recording" /
> "Create a share card" / "Recover a GPS gap") — the same segmented
> control, not a separate top-navigation section. The switcher was
> removed; the entry point and everything below is as follows.
>
> **Task 28 revision (user feedback):** "even though there is not
> detection the user can still draw" — recovery is no longer gated on
> detection at all. The user draws the route they *know* they lost
> ("that they think they lost and it's not measured"), and the app
> itself calculates the drawn section's time from the uploaded file:
> the gap window when one was detected, otherwise a **pace estimate**
> (drawn distance ÷ the file's recorded average speed). This is the
> dividing line against the repair studio, where the user adds a route
> AND states the lost time manually.

### R-1 Scope & contracts

The user-facing flow, exactly as specified:

- **Upload an activity with a GPS tracking gap** — the landing page's
  "Recover a GPS gap" tab routes the upload into the section's own
  session (the same UploadZone gesture, `loadRecoveryFile`); the
  repair studio keeps whatever file it holds.
- **Detect the missing GPS time interval** — the same `detectGaps`
  engine (time-gap / speed-anomaly / segment-break, shared thresholds
  setting) lists each missing section with its interval boundaries,
  elapsed span, and straight-line diagnostics.
- **Draw the missing route on the map** — the same draw editor
  experience (clicks, road-follow car/foot/straight, snap magnet,
  drag/midpoint-insert/delete, undo/redo, vertex cap) over the
  activity's own map instance.
- **Draw even without detection (Task 28)** — an "Unmeasured sections"
  card offers the repair studio's pick-then-draw interaction, voiced
  for recovery: one click on a recorded point (mid-route → an insert
  span after it; route start/end → an open extension) or two clicks
  bounding a stretch to redraw. Insert/extend spans default to the
  **pace-estimated** time strategy — duration = drawn distance ÷ the
  file's recorded average speed (moving-time basis, synced into
  `fileTiming.recordedSpeedMps`); replace spans keep the
  window-derived default. The strategy is surfaced as a fourth source
  chip ("From your pace") that only exists when a file pace exists, so
  the repair studio's controls render exactly as before. A pace
  estimate that disagrees with a recorded window is flagged with the
  same Case-4 honesty contract as a disputed manual duration.
- **Generate points + timestamps** — the drawn path is densified and
  its points receive `Estimated` timestamps distributed inside the
  missing interval ([§J-1](../../../MASTER_PLAN.md#j-1-case-matrix) case matrix; distance-proportional default),
  so they seamlessly fit between the existing GPS points.
- **Integrate** — the merge inserts the interior between the untouched
  boundary anchors; original points are re-emitted verbatim by the
  identity exporter (repair only inserts — [§H](../../../MASTER_PLAN.md#h-gpx-processing-architecture)).
- **Elapsed time preserved — provably.** Originals (including both
  anchors' timestamps) are never rewritten, so first→last time, wall
  time, and every recorded statistic are byte-identical after export.
  The preview card pins this with an "unchanged" lock badge.
- **Recalculated statistics** — distance/pace/speed over the completed
  route (recorded + reconstructed) via the [§L-1](../../../MASTER_PLAN.md#l-1-definitions) joins, with Estimated /
  Mixed provenance badges; the StatsPanel (recorded / repaired /
  overall) is reused below the fold.
- **Visually distinct** — the map's existing language: recorded solid,
  missing span dashed, committed reconstruction emerald, draft through
  the draw session.
- **Preview before export** — the Completed route card (missing time
  covered, distance before→after, elapsed unchanged, average speed,
  points generated) plus the reused pre-export dialog summary.
- **Export as a new corrected GPX** — the reused ExportCard/dialog and
  `exportGpxRepaired`; every generated point carries a
  `gpxr:reconstructed` provenance marker, and re-uploading the export
  is recognized (marked stretches render and count as repaired, seams
  are not re-flagged as gaps).

### R-2 Architecture (isolation by design)

- `state/recovery-store.ts` — the section's own Zustand store: session
  slice (status/file/frozen model/gaps/error) + a mirror of the
  editor essentials (reconstructions, history, transient aids, road
  legs, file timing, section-local gap selection) **plus the Task-28
  manual-span machinery** (pick modes, insert/replace/extend spans
  with per-shape strategy defaults, per-span remove). It reuses the
  SAME pure drawModel commands. Unit tests pin the isolation
  contract: no recovery action ever touches
  `useSessionStore`/`useEditorStore`, and vice versa.
- `hooks/use-recovery-session.ts` — parse → validate → detect → store,
  plus the view-model joins (gap rows, segment rows, stats, extent).
  Reuses `describeParseError`.
- `hooks/use-recovery-map.ts` — its own `MapController` instance and
  its own selection state (NOT the repair studio's shared
  uiStore.selectedGapId, so the sections' hygiene effects cannot clear
  each other); route views via the shared pure `buildRouteView`, with
  user-drawn pair/extend spans joined as render refs exactly like the
  repair map's (detected rendering wins on a shared boundary).
- `hooks/use-recovery-draw.ts` — a mirror of `useDrawEditor`'s
  controller driving + road-follow resolution, bound to the recovery
  store, returning the SAME `DrawEditorBinding` interface so
  `DrawEditorPanel`, the map chrome, and the undo/redo bar are reused
  unchanged. Shares the page-level `RoadFollowRouter` (and its cache).
  Task 28: the mirror now carries the full manual-span join (point
  index, manual rows, open-ended chains, pick-session driving) and
  syncs the file's recorded speed into `fileTiming.recordedSpeedMps`.
- `hooks/use-recovery-elevation.ts` (Task 28) — a mirror of
  `useElevation` over the recovery store: the same DEM provider
  (shared instance + LRU cache), disclosure-first controls, and
  honest staleness/partial labeling for drawn sections' elevations.
  Section isolation: all elevation-store records are written under
  `recovery::`-prefixed keys (the two sections can hold the SAME file,
  so their gap ids can collide); the mirror never calls the store's
  `prune` (it keeps only the given ids and would wipe the repair
  studio's records) — removal is per-key `clear` over its own
  namespaced keys.
- `hooks/use-recovery-export.ts` — committed recoveries →
  `MergeRepairSite[]` → `mergeRepairs` → `exportGpxRepaired`;
  returns the same `GpxExportBinding` so the export card + dialog are
  reused.
- `components/recovery/*` — the section root (composition; no landing
  branch — the landing page's tab is the front door), two-section
  layout (recovery-labeled sibling of WorkspaceLayout), guide card
  (wizard progress), and completed-route preview card. Everything else
  in the tree is an existing component.
- Shell wiring (additive, revised): `ui-store`'s `landingMode` widens
  to `LandingMode = SessionView | "recovery"` (still the one persisted
  remembered intent — a stored "recovery" survives reloads, and the
  repair path narrows it so the session store's `SessionView` stays
  honest by construction); **no switcher state exists** — `AppShell`
  DERIVES the active section (recovery while its session is loading
  or parsed, repair otherwise) and routes the landing's upload intent
  and retry error by the selected tab; `AppHeader` renders no
  section switcher (its `section` prop is conditional routing only);
  `AppShell` mounts `RecoveryStudio` while the section is active, and
  `RecoveryStudio` has no landing branch (a failed load returns to
  the landing with the section's error above the hero for retry).
- Elevation estimation joined the section in Task 28 (drawn
  "unmeasured sections" get their elevations from the same DEM
  provider the repair studio uses, via the namespaced mirror hook);
  the stats panel's elevation rows and the profile chart render from
  the same merge basis.

### R-3 Verification

24 new unit tests (store lifecycle + isolation; the pure pipeline:
detection → draw → merge → export → re-parse with timestamp-in-interval,
verbatim-originals, elapsed-unchanged, marker, and no-re-flag
assertions; RTL acceptance including section isolation) and 3 new e2e
tests (full happy path with download assertions, export re-upload
round-trip, mobile viewport). Live verification ran the real flow
against the real OSRM road-follow service on the multi-gap demo file:
2 sections detected, a 26:01 gap recovered with a 3.87 km road-followed
route, 140 generated points exported with provenance markers, elapsed
time unchanged, average-speed math corrected (ms→s conversion bug
caught and fixed during live verification).

The Task 26 revision re-pinned the entry flow: the RTL suite covers
the three-tab toggle (no switcher, hero swap, compact/full label
pair), the tab-routed upload into the section's own session, the
reset-then-repair-tab handoff, and the tab-routed error/retry; the
e2e suite re-entered everything through the landing tab and added the
mobile 375 px no-overflow contract for the three-tab toggle.

Task 28 re-pinned the always-draw contract: unit tests cover the
pace-estimated plan matrix (duration math, anchoring per boundary
shape, the no-pace/no-path honesty reasons, the Case-4-style
discrepancy, distance-based distribution carrying the method), the
store's span machinery (per-shape strategy defaults, idempotent
reopen, remove, prune survival), the merge pipeline (insert and extend
spans with pace-estimated timestamps; no fabricated times without a
usable pace), the strategy controls' "From your pace" chip and PE
copy, and the RTL acceptance (a clean 6-point file with nothing
detected: pick → draw → commit → preview → export). The e2e suite
adds the same flow with real map picks and download assertions
(`timeMethod="pace-estimated"` markers, verbatim originals).

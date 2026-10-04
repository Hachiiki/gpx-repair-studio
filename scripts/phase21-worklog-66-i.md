# Phase 21 — Task 66-i: i18n extraction, hooks + state stores

Task ID: 66-i
Agent: general-purpose sub agent (Phase 21 extraction crew)
Task: Extract the copy fired from hooks and state stores into the
typed `hooks` dictionaries (docs/i18n-extraction-pattern.md protocol;
exemplar upload-zone.tsx + en/zh repair.ts). Scope: src/hooks/ (44
files) + src/state/ (12 files); owned dicts en/hooks.ts + zh-CN/hooks.ts
(export names `hooks` / `zhHooks` kept).

## What shipped

### Dictionaries (owned; bodies filled)

- `src/i18n/dicts/en/hooks.ts` — **94 keys** (`as const` kept), all
  values moved byte-identical from the hooks (verified mechanically,
  see below). Namespaces: `hook.parse.*` (19), `hook.elevation.*` (7),
  `hook.export.*` (3), `hook.batch.*` (11), `hook.surgery.*` (2),
  `hook.deepValidation.*` (3), `hook.roadSnap.*` (6),
  `hook.drawEditor.*` (2), `hook.repairAnnounce.*` (7),
  `hook.sessionRecovery.*` (4), `hook.restore.*` (4),
  `hook.savedSessions.*` (21), `hook.share.*` (6) — 94 total.
- `src/i18n/dicts/zh-CN/hooks.ts` — **94 keys**, full key + `{param}`
  parity (`Record<string, string>` retained; tightening is the
  coordinator's gate step).

### Mechanism (per the protocol)

- **React hook bodies** — announce()/error strings resolved through the
  hook's own `const { t } = useI18n();` (import from `@/hooks/use-i18n`),
  `t` added to the touched useCallback/useEffect/useMemo dep arrays.
- **Non-React module functions in hook files** — `describeParseError`,
  `loadGpxFile`, `addMergeFiles`, `loadRecoveryFile`,
  `restoreSessionFromRecord`, and the four `elevationFailureMessage`
  copies resolve through `translateNow()` from `@/i18n/runtime`
  (user-action time; tests stay English via the default locale).
  Signatures unchanged everywhere (tests import `addMergeFiles` etc.).
- **Plurals** — the two-count sentences split into phrase keys per the
  protocol's plural rule: `hook.batch.presetApplied` composes
  `{files}`/`{fixes}` from `fileCount.one/many` + `fixCount.one/many`;
  `hook.export.batchZipReady` composes `{files}` from
  `repairedFiles.one/many`; `hook.repairAnnounce.gapsOne/gapsMany` and
  `reconstructedOne/reconstructedMany` are direct one/many pairs.
- **`Track {n}` fallbacks** in the segment-row builders reuse the
  existing byte-identical `segmentList.trackFallback` key from the
  repair domain (no duplicate key): `buildSegmentRows` (private) now
  takes `t`; the exported `buildRecoverySegmentRows` gained a trailing
  `t: TranslatorArg` param (internal-only caller updated; no test
  imports it).

### Hooks touched (22 files)

- `use-gpx-session.ts` — describeParseError's 6 title/detail pairs
  (with `{fileName}`/`{message}`/`{found}`/`{reason}` interpolation +
  `noRootElement`/`noVersion` inline fallback keys), loadGpxFile's
  empty/read guards, Track fallback.
- `use-merge-session.ts` — addMergeFiles empty/read guards
  (`emptyDetailTrack` variant).
- `use-recovery-session.ts` — loadRecoveryFile guards + Track fallback
  (buildRecoverySegmentRows t param).
- `use-batch-session.ts` — pump catch read-guard, preset apply/undo/
  enter-studio/ZIP announcements (plural composition).
- `use-saved-sessions.ts` — 21 keys: save/export/rename/delete/open
  outcomes, all 8 portable-import messages, `Imported session` shelf
  name, the two `Export ready` announces.
- `use-road-snap.ts` — 6 announcements ({profile} param carries the
  feature-produced snapProfileLabel word; {meters} keeps the
  `.toLocaleString()` number in code).
- `use-surgery.ts` — pointPicked + applied ({label} = feature-produced
  FixPlan.label).
- `use-deep-validation.ts` — applied/undone + the multi-plan
  `{count} fixes ({labels})` summary.
- `use-draw-editor.ts` — the two typed-coordinate confirmations.
- `use-repair-announcements.ts` — gaps-detected (one/many + theFile/
  File fallbacks), loaded-no-gaps, reconstructed (one/many).
- `use-session-recovery.ts` — the four "Previous … restored." lines.
- `restore-session.ts` — the four "… session restored." lines
  (translateNow; module fn).
- `use-gpx-export.ts` / `use-recovery-export.ts` /
  `use-create-export.ts` — `Export ready — {fileName} downloaded.`
  (create-export's GPX `description` + trackName "Reconstructed
  activity" stay English: exported-artifact content).
- `use-stats-export.ts` — `Stats sheet ready — {fileName} downloaded.`
- `use-elevation.ts` / `use-recovery-elevation.ts` /
  `use-create-elevation.ts` / `use-plan-elevation.ts` — the shared
  5-reason failure mapper (translateNow) + the two blockedReason hint
  sentences (t).
- `use-create-share.ts` — the five "What the numbers mean" notes
  ({provider} = feature-produced providerName).
- `use-merge-share.ts` — the `Combined from {count} recordings…` note.

### Verified copy-free / untouched

- **All 12 state stores**: zero display copy — every `title`/`status`/
  `label` hit is a comment, an enum value, or a type; SessionError
  strings are produced by the hooks, not the stores.
- `use-toast.ts` (the toast MACHINE — no copy), `use-commands.ts`
  (coordinator's), `use-i18n.ts` (facade) — byte-untouched.
- Comment-only hits in use-online-status, use-onboarding-tour,
  use-media-query, use-mobile, use-theme, use-splits, use-tool-tours,
  road-router, the four map hooks, use-map-controller, the three draw
  hooks, use-compare (see below), use-create-session.

## Verification

- Scratch parity script (run, then deleted): en 94 / zh 94 keys, zero
  missing, zero extra, zero duplicate en keys, zero cross-file
  collisions against all 18 other en domain dicts, `{param}` parity on
  every key.
- Scratch byte-identity vitest (run, then deleted): describeParseError
  output object-equal for all 6 kinds (incl. the `<root>` / "no root
  element" and `"1.2"` / "no version" fallback branches), plus ~60
  interpolated template spot-checks against the original literals —
  all pass (em dashes " — ", ellipses, straight quotes in
  `Saved — "…"`, "(v{version})" parens preserved).
- Key-usage cross-check: every `hook.*` key referenced in src/hooks
  exists in the dict and every dict key is referenced (the 8
  ternary-selected plural keys confirmed by literal grep).
- ESLint: clean on all 24 touched files (incl. the two dicts).

### Tests (per-hook suites only; no full suite, no i18n-runtime gate, no global tsc)

34 files run, **all green except one pre-existing failure**:

    announcer, inspection-flow, merge-ui, merge-share, recovery-ui,
    scratch-batch-smoke (1 FAIL — pre-existing, see below),
    deep-validation-card, surgery-card, coord-entry, vertex-entry-list,
    draw-editor-panel, map-draw-view, elevation-ui, export-dialog,
    share-view, stats-dashboard, create-ui, plan-ui, compare-surfaces,
    restore-prompt, strava-real-files, recovery-pipeline,
    session-hydrate, surgery, surgery-working-copy, working-fixes,
    merge-elevation, create-elevation, road-follow, snap-engine,
    router-consent-dialog, command-palette, saved-sessions-storage,
    portable-session

`tests/scratch-batch-smoke.test.tsx > renders the aggregate line
byte-identically` fails on "fix with a preset" — verified IDENTICALLY
failing on git HEAD with the whole working tree stashed (138 modified
files from all agents), i.e. not caused by this task; it is the batch
components agent's aggregate-line territory (`batch.queue.*` keys).

## Left for the coordinator (NOT refactored, per protocol)

1. **features-produced labels interpolated as params** (labelKey
   refactor): `FixPlan.label` (surgery/deep-validation/batch undo
   `{label}`), `snapProfileLabel()` "roads"/"footpaths"
   (features/reconstruction/snapEngine.ts — the `hook.roadSnap.*`
   {profile} param), `preset.name` (features/validation/fixes.ts —
   `hook.batch.presetApplied` {preset}).
2. **`savedSessionSectionLabel()` / `SECTION_LABELS` in
   use-saved-sessions.ts** ("Repair", "Gap recovery", "Create from
   stats", "Plan a route") — dual use: rendered by the command
   palette's session rows AND the portable-export file-name base.
   Translating it would localize download file names; left English
   pending a labelKey + translateNow decision (66-g2 flagged it too).
3. **Provider copy** from the elevation features —
   `provider.name/attribution/privacyNote` (Open-Meteo disclosure
   strings) flow through the elevation hooks' controls binding
   untouched; features/elevation territory.
4. **use-compare.ts snapshot labels** — "Original recording", "After
   edits and repairs", "Track snapshot — after edits, original as
   ghost" are `label:` inputs to `buildTrackSnapshotSvg` (the
   printable/exported SVG sheet = artifact content, stays English by
   design; noting in case the coordinator wants them keyed).
5. **use-merge-share's derived notes** — `buildShareCardContent()`
   (features/share/cardContent.ts) produces the remaining share-view
   note sentences; lib/features labelKey territory.
6. **lib/map/mapController.ts announcements** — "Point deleted."
   fires from the controller (lib, not hooks); seen in
   use-draw-editor's map wiring but owned by the coordinator (also
   flagged by 66-g2 note 4).
7. **mapController status strings** — MapControllerStatus words
   ("initializing" etc.) are machine states rendered by the (already
   extracted) map components' status maps; untouched.

## Scope discipline

Edited ONLY the 22 copy-bearing hooks + the 2 owned dictionaries.
The other 20 hooks + all 12 state stores were read/verified copy-free
and left byte-untouched, as were use-commands.ts, use-i18n.ts,
use-toast.ts, src/lib/**, src/features/**, and every shared i18n file.
No test files were modified (no exported constant needed conversion —
`addMergeFiles`/`describeParseError`/`loadGpxFile` signatures are
unchanged). Nothing committed.

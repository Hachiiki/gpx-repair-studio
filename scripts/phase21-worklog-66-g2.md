# Phase 21 — Task 66-g2: i18n extraction, tours + remaining chrome

Task ID: 66-g2
Agent: general-purpose sub agent (Phase 21 extraction crew)
Task: Extract the tours domain and remaining chrome copy into the
typed dictionaries (docs/i18n-extraction-pattern.md protocol;
exemplar upload-zone.tsx + en/zh repair.ts). Nine layout files + the
two tours dictionary skeletons.

## What shipped

### Components extracted (5 of the 9 carry copy)

- `src/components/layout/tool-tour.tsx` — the biggest chunk. The
  module-level `TOOL_TOURS` literal became a KEY map
  (`TOOL_TOUR_COPY`: icons + `tour.<tool>.title/blurb/
  step<N>.kicker|title|body` + optional `.step<N>.action` keys,
  structure and step order untouched) resolved by the exported
  `getToolTours(t)` (the getLandingTools(t) pattern). Both components
  (`ToolTourDialog`, `ToolTourOffer`) now take `useI18n()` and resolve
  through the translator; the footer (Skip / Back / Next / Get
  started / sr-only "Step {current} of {count}") and the offer strip
  ("New: the {title} walkthrough." + "{count} steps, about a minute" +
  " — teaching samples included" + Start / Dismiss) ride `tour.*`
  keys. A LEGACY English-resolved `TOOL_TOURS` export is kept (see
  coordinator note 1).
- `src/components/layout/onboarding-tour.tsx` — `TOUR_STEPS` became
  `ONBOARDING_TOUR_COPY` (key map) + exported `getTourSteps(t)`;
  footer keys `onboarding.skip/back/next/getStarted/stepCount`.
- `src/components/layout/command-palette.tsx` — the component's OWN
  copy only: sr-only title/description, "Search commands…" placeholder,
  the empty state (curly quotes “undo”/“theme” preserved byte-exact),
  the "Recent sessions" and "Commands" group headings it renders
  itself, the footer keycap words (move/run/close — the " · "
  separators stay in JSX), and the "editor" scope chip. `PaletteItem`
  got its own `useI18n()`.
- `src/components/layout/restore-prompt.tsx` — section landmark
  aria-label, card title + blurb, the four SECTION_META kickers
  (`restore.kicker.*` key map), Restoring…/Restore/Discard, the §M-3
  privacy paragraph + "More about privacy and data" door,
  "Clear all saved sessions", and `savedAgo` converted to
  `savedAgo(t, savedAt)` with one/many key pairs per unit
  (savedJustNow, savedMinute/Hour/Day One/Many with `{count}`) per
  the plural rule; its "no locale machinery" comment updated.
- `src/components/layout/workspace-layout.tsx` — the shared layout's
  DEFAULT prop copy (the repair workspace's voice — the shell renders
  it without overrides): sectionLabel/toolsLabel/detailsTitle/
  detailsIntro, section 2's aria-label, "Back to the map".
  Destructuring moved into the body so the defaults can read `t`
  (props and types unchanged; merge/create/recovery/plan keep passing
  their own domain strings). useI18n without "use client" — the
  session-views.tsx precedent (all importers are client components).

### Components verified copy-free (nothing to extract)

- `announcer.tsx` — renders whatever the announcements bus carries;
  the component itself has zero strings (`announcer.*` namespace
  deliberately left empty — see coordinator note 4).
- `command-keycap.tsx` — children passthrough, no copy, no aria labels.
- `workspace-tools-column.tsx` — renders the `label` prop (the
  callers' copy, already extracted by their domains).
- `app-version.ts` — "1.0.0" is a version number pinned to
  package.json by tests/info-content.test.tsx, not translatable copy.

### Dictionaries (owned; bodies filled, export names kept)

- `src/i18n/dicts/en/tours.ts` — **163 keys** (`as const` kept):
  onboarding 17 (4 steps × kicker/title/body + 5 footer), tour 110
  (7 titles + 7 blurbs + 27 steps × kicker/title/body + 5 action
  labels + 5 footer + 5 offer), palette 10, restore 20, workspace 6.
- `src/i18n/dicts/zh-CN/tours.ts` — **163 keys**, full parity,
  `Record<string, string>` retained (tightening is the coordinator's
  gate step).

Verification (scratch script, run then deleted): en values
BYTE-IDENTICAL against the git-HEAD originals — 100 tool-tour + 12
onboarding field literals matched mechanically, plus the explicit
palette/restore/workspace/offer literal set; zh key parity +
`{param}` parity on every key; every key referenced by the five
components exists and every dictionary key is referenced; no
duplicate keys within either file and no cross-file collisions
(1671 keys across all en domain files, 0 duplicates). Special bytes
preserved: em dash " — ", middot " · " (kickers), ellipsis "…", curly
quotes in palette.empty, "&" in "Statistics & file details", the
leading space on `tour.offer.samples`.

## Tests

`ls tests/ | grep -iE "tour|palette|announcer|restore|workspace|command"`
→ 11 files, ALL run, nothing else, no full suite, no i18n-runtime
gate, no global tsc:

    npx vitest run tests/announcer.test.tsx tests/command-palette.test.tsx \
      tests/command-registry.test.ts tests/onboarding-tour.test.tsx \
      tests/restore-prompt.test.tsx tests/set-line-command.test.ts \
      tests/tool-tour-flags.test.ts tests/tool-tours.test.tsx \
      tests/tour-flag.test.ts tests/workspace-layout.test.tsx \
      tests/workspace-tools-column.test.tsx

Result: **11 files, 115/115 tests PASS** (the DialogContent
aria-describedby warnings in the tour tests are pre-existing noise;
help-content's HelpContent suite inside tool-tours.test.tsx proves
the legacy export keeps that un-extracted file compiling + rendering
English). ESLint clean on all 9 touched files.

### Tests modified (2, per the protocol's converted-constant rule)

- `tests/tool-tours.test.tsx` — `import { TOOL_TOURS } …` replaced by
  `getToolTours` + `enTranslator` with a module-level
  `const TOOL_TOURS = getToolTours(enTranslator)`; every assertion
  body unchanged (still English-anchored against the en dictionary).
- `tests/onboarding-tour.test.tsx` — same one-line pattern:
  `const TOUR_STEPS = getTourSteps(enTranslator);`.

## Left for the coordinator (NOT refactored, per protocol)

1. **help-content.tsx** (the help domain agent's file, not mine) still
   imports `TOOL_TOURS` and renders `TOUR_TOURS[id].title/.blurb`. I
   kept a documented LEGACY export
   `TOOL_TOURS = getToolTours(enTranslator)` in tool-tour.tsx so it
   compiles and renders byte-identical English mid-flight. When the
   help extraction lands, switch help-content to `getToolTours(t)`
   (the `tour.<tool>.title/.blurb` keys already exist) and DELETE the
   legacy export. (help-content's own copy — SHORTCUT_GROUPS' map
   rows, "Guided walkthroughs" blurb, "Where everything lives"
   paragraph — is that agent's scope.)
2. **features/commands/registry.ts** (coordinator's file, untouched):
   `COMMAND_GROUP_LABELS` ("Go to", "Sessions", "Editing", "View",
   "Help & tours") and every command's `label`/`keywords`/cheat-sheet
   `description` — the palette renders them verbatim through
   `commandGroupLabel()` / `command.def.label`; labelKey refactor
   territory.
3. **hooks/use-saved-sessions.ts**: `savedSessionSectionLabel()`
   ("Repair", "Gap recovery", "Create from stats", "Plan a route") —
   rendered by the palette's session rows AND reused to build export
   file names (dual use makes it a labelKey + translateNow candidate).
4. **Announcer messages** (~50 sentences, `announce(...)` call sites
   in hooks/use-repair-announcements, use-road-snap, use-draw-editor,
   use-surgery, use-deep-validation, use-gpx-export, use-recovery-
   export, use-create-export, use-stats-export, use-batch-session,
   restore-session, use-session-recovery, use-saved-sessions, and
   lib/map/mapController.ts's "Point deleted."). All fire at
   user-action time → `translateNow("key", params)` candidates for the
   hooks pass (the `hooks.*` dict skeleton exists for exactly this).
5. **restore-prompt's offer rows**: `offer.label` / `offer.detail`
   come from `describeSessionRecord()` in
   lib/storage/session-record.ts (pure module; e.g. "4 points drawn ·
   1 manual span") — labelKey refactor candidate. My restore.kicker.*
   keys cover only the section kickers the component itself owned.
6. **app-version.ts / command-keycap.tsx / workspace-tools-column.tsx**
   — verified copy-free (see above); no `announcer.*` keys exist by
   design.

## Scope discipline

Edited ONLY the 5 copy-bearing components + the 2 owned dictionaries
+ the 2 tests above. The other 4 assigned files were read, verified
copy-free, and left byte-untouched. Shared i18n files, registry.ts,
hooks, help-content.tsx, app-shell.tsx: untouched. Nothing committed.

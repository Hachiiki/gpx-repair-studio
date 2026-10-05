# Phase 21 — Internationalization (Task 66)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 20](phase-20-command-palette.md) · [Phase 22 →](phase-22-offline-pwa.md)

## Plan (v2 roadmap)

**Objective:** open the tool to non-English users.

- **21.1 String extraction:** all UI copy moves to typed
  dictionaries; a lint rule forbids new hard-coded strings.
- **21.2 Runtime:** lightweight typed lookup + parameter
  interpolation (no heavy i18n framework — dependency discipline);
  locale persisted, `?lang=` override for testing.
- **21.3 Locales:** English (source) + the initial set the user
  picks (decision point at phase start); number, unit, and date
  localization.
- **21.4 Pseudo-locale harness:** a long-string expansion locale
  for overflow QA (VLM pass under expansion).

**Non-goals:** RTL locales (revisit after the locale set is real),
machine translation of user data.
**Verification:** missing-key CI gate (unit), pseudo-locale VLM
sweep, e2e locale switch persistence.

## Delivery record (Task 66)

**Objective:** open the tool to non-English users.

**The locale set (the [§EE 21.3](#plan-v2-roadmap) decision point):** English (the
source language, the static export's prerender locale) + Simplified
Chinese (zh-CN) — the language of the requesting user and the audience
most likely to need a privacy-first, locally-running GPX tool in their
own language. A third "locale", `pseudo`, is not a language at all:
it is the [§EE 21.4](#plan-v2-roadmap) expansion harness, reachable only through
`?lang=pseudo`, never offered in the picker, never persisted.
Adding a real locale later is one dictionary file + one registry
entry — the architecture forecloses nothing.

**21.1 Extraction.** All UI copy now lives in typed dictionaries:
`src/i18n/dicts/en/<domain>.ts` (sixteen domains — common, layout,
toolpages, repair, reconstruction, recovery, create, merge, plan,
statistics, compare, share, batch, map, shared, help, tours, shell,
hooks, commands), merged in one index whose `MessageKey` union types
every `t()` call at compile time. English values moved VERBATIM —
byte-identical rendered text was the contract that kept the whole
existing test corpus green through the migration (~140 component/hook
files rewritten by a nine-agent extraction wave against a written
pattern protocol, `docs/i18n-extraction-pattern.md`). The lint half:
`no-restricted-syntax` selectors in `eslint.config.mjs` forbid JSX
text and text-bearing prop literals across components/hooks/state/app
(the dormant shadcn boilerplate in `ui/` is excluded, documented);
the rule shipped clean after fixing fourteen genuine stragglers it
caught (the last of a long tail the wave missed).

**21.2 Runtime.** No i18n framework — the whole runtime is ~150
lines: pure `translate(locale, key, params)` with `{param}`
interpolation and English fallback, a module-observable locale store
(theme-store pattern: `?lang=` override > the persisted raw key
`gpx-repair-studio.locale.v1` > English — never OS sniffing, never a
persisted pseudo), and `useI18n()` through `useSyncExternalStore`
whose getServerSnapshot returns English so hydration matches the
prerender exactly (React's designed post-hydration snapshot swap
settles the locale in place — no mismatch errors, at most one English
frame for a Chinese user, the same trade the theme made with
classes). The pre-paint script in `layout.tsx` stamps `<html lang>`
before React exists, so assistive tech hears the right language from
the first accessible paint. The footer carries the picker: the theme
toggle's twin segmented chip (EN / 中文 endonyms), with a switch toast.

**21.3 Locale-aware formatting.** `lib/utils/format.ts` follows the
active locale AT CALL TIME (unit words 公里/米/英里/公里/时, Intl
number grouping, zh-CN date-time forms; English output byte-identical,
pinned by tests). Exported artifacts are the exception BY DESIGN:
the share card's canvas text, the GPX notes, MANIFEST.txt, and
CSV/KML stats render through `artifactFormatters` — an artifact's
words must not depend on the machine it was made on.

**The labelKey pattern (the domain half).** Domain code never calls
translate; it emits KEYS. `FixPlan.label`/`summary`, surgery labels,
repair-summary rows, compare stat rows, session-record descriptors,
elevation privacy notes, router-URL rejection reasons, snap-profile
words, export-format hints, and sample summaries are all
`LocalLabel`s — `{ key, params }` resolved at RENDER (a mid-session
locale switch re-renders every stored label), while PLAIN STRINGS
from pre-21 sessions render verbatim forever (the session-record
validator accepts both; old work stays readable). The command
registry carries `labelKey` + per-command zh search aliases
(`cmd.kw.*`) merged with the English keywords — Chinese queries and
English power-user queries both find every command (e2e-proven).

**21.4 The pseudo harness.** A deterministic transform
(`src/i18n/pseudo.ts`): every word grows by a third of its own
length (ø fillers), the whole message wraps in ⟦ ⟧, `{param}`
placeholders pass through untouched. It exists to prove the layout
survives a ~33% copy growth before a real long-string locale ships.

**Verification:** 1867/1867 unit (the +42 i18n tests: the runtime's
interpolation/fallback/param-parity, the locale store's resolution
order + persistence + hydration snapshot, the pseudo transform, the
format contract en/zh, the localized registry — and THE GATES: every
locale carries exactly the English key set with exactly the English
`{param}` vocabulary per key, no empty values, no cross-domain
duplicate keys; compile-time too — every locale file satisfies the
source dictionary's key type). +8 e2e `phase21-i18n.spec.ts`
(toggle + persistence + round trip, ?lang= direct loads for zh and
pseudo, unknown-lang degradation, pre-paint lang stamping, bilingual
palette search, Chinese tool-page teaching, axe-clean zh) → 199
total; full regression re-run in nine chunks — one load flake
(phase17 consent chip, green standalone) and ONE REAL BUG found and
fixed (the long-press announcement referenced a key that had never
been added; the fallback rendered the raw key — exactly what the
fallback is for, and exactly why the test existed). Static export
PASS. Live QA `scripts/phase21-live-qa.mjs` 28/28 (both locales ×
dark + mobile, zero console/page errors, the pseudo harness with
real expansion and zero horizontal overflow). VLM: six critiques
under the expansion harness and on the zh surfaces (light/dark/
mobile); all ten measurable claims DISPROVEN by
`scripts/phase21-vlm-measure.mjs` — pseudo rows perfectly even
(344×3 + 325×3, spreads 0), zero clipped blurbs, no overflow, the
"overlapping icon" lives inside the artwork itself, and the accused
dark-mode contrast measures 5.03:1 (AA passes; the model guessed
#888, reality is lighter).

**Decisions recorded here:**
- Brand names never localize: the wordmark stays "GPX Repair Studio"
  in zh (dict-held so the contract stays uniform); the locale picker
  shows endonyms ("English" / "简体中文") in every language.
- Exported artifacts stay English (GPX notes, MANIFEST.txt, CSV/KML,
  the share card — Montserrat has no CJK glyphs and the card's visual
  identity is not a Phase 21 concern; `artifactFormatters` pins them).
- `presetName` and file-name bases stay canonical English in storage
  and manifests; UI labels translate through keys — the two can never
  drift apart silently.
- The elevation provider's ATTRIBUTION stays canonical (a credit
  line is the provider's own statement); its PRIVACY NOTE localizes
  (the user deserves the disclosure in their language).
- Two latent copy bugs fixed during extraction, both test-pinned
  before: the landing subline said "Six tools" with seven tiles on
  screen ([Phase 18](phase-18-batch-portable-sessions.md)'s seventh door never updated the hero), and the
  reorder-surgery label had an inverted plural ("1 moves / 2 move");
  the en dictionary carries the corrected forms, the pinned tests
  updated with them.
- Non-goals held: no RTL locales, no machine translation of user
  data. Per-locale prerendered routes (killing the one-frame English
  settle for zh) are recorded as a [Phase 22](phase-22-offline-pwa.md)+ candidate.

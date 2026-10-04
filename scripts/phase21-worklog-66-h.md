# Phase 21 — Task 66-h: i18n extraction, the app shell's own copy

Task ID: 66-h
Agent: general-purpose sub agent (Phase 21 extraction crew)
Task: Extract the composition root's own copy (src/components/layout/
app-shell.tsx, 1091 lines) into the shell dictionaries
(docs/i18n-extraction-pattern.md protocol; exemplar upload-zone.tsx +
en/zh repair.ts). Owned dicts: src/i18n/dicts/en/shell.ts +
src/i18n/dicts/zh-CN/shell.ts (skeletons filled, export names
`shell` / `zhShell` kept).

## What shipped

### app-shell.tsx — the shell fires NO toasts itself

The task brief anticipated `shell.toast.*` keys (autosave, restore,
session saved/exported). Read the whole file: the shell never calls
`toast(...)` directly — every one of those toasts is fired inside the
hooks it wires (use-session-recovery, use-saved-sessions, …), which is
the hooks agent's scope (translateNow candidates). The dialogs it
renders (SessionsManagerDialog, HelpDialog, InfoDialog,
RouterConsentDialog, tours, palette) are already extracted; their props
from the shell are state/callbacks/objects only. So the shell's own
copy is small and precise — **7 keys**, all under `shell.*`:

| Key | en value (byte-identical) | Where |
|---|---|---|
| `shell.skipToContent` | `Skip to content` | the sr-only skip link |
| `shell.header.createFileName` | `Activity from stats` | AppHeader `fileName` fallback (create section) |
| `shell.header.mergedRecordings` | `{count} recordings merged` | AppHeader `fileName` fallback (merge, no combined name) |
| `shell.header.planFileName` | `Route plan` | AppHeader `fileName` fallback (plan section) |
| `shell.header.batchFallback` | `Batch queue` | AppHeader `fileName` fallback (batch, empty queue) |
| `shell.header.batchFiles` | `{count} files` | batch header label (multi-file queue) |
| `shell.elevation.gainLoss` | `{gain} m up, {loss} m down` | ElevationProfileChart `gainLossSummary` (feeds the svg aria-label; `Math.round` values passed as params) |

Wiring: `import { useI18n } from "@/hooks/use-i18n";` added after the
react import; `const { t } = useI18n();` is the first line of the
AppShell body. No testid, className, structure, or behavior change.

### One judgment call: `t` inside a zustand selector

`batchFileName`'s label (`` `${s.items.length} files` ``) lives inside
the inline `useBatchStore((s) => …)` selector. Rather than restructure
the subscription into count + name slices, `t("shell.header.batchFiles",
{ count: s.items.length })` runs inside the selector: it still returns
a primitive (no useSyncExternalStore snapshot-identity hazard), and a
locale change re-renders the shell, whose new `t` re-runs the selector
with the fresh dictionary. Noted with a 3-line comment at the site.
If the coordinator prefers the two-subscription shape, it is a
mechanical follow-up.

### Verified copy-free (left untouched)

- `src/components/layout/shell-container.ts` — pure Tailwind class
  constant (`SHELL_CONTAINER`), zero copy. Skipped per the brief.
- Everything else the shell renders/ passes that LOOKS like copy but
  is data or another file's scope — see the coordinator list.

### Dictionaries (owned; bodies filled, export names kept)

- `src/i18n/dicts/en/shell.ts` — **7 keys**, `as const` kept.
- `src/i18n/dicts/zh-CN/shell.ts` — **7 keys**, full key + `{param}`
  parity, `Record<string, string>` retained (tightening is the
  coordinator's gate step).

zh vocabulary aligned with the already-shipped domains: "Route plan" →
`路线规划` (= tours' `restore.kicker.plan`), "Batch queue" → `批量队列`
(= batch's `batch.studio.title`), `{count} files` → `{count} 个文件`
(= batch's measure words), recordings → 记录, gain/loss → 爬升/下降
(statistics' elevation vocabulary), full-width comma inside the zh
sentence for gainLoss.

## Verification

- Byte-identity: all 8 source fragments confirmed verbatim in git
  HEAD; all 7 en values interpolate to the exact original rendered
  strings (e.g. `{count} recordings merged` + `{count: 3}` →
  `3 recordings merged` = HEAD's `` `${mergeParsedCount} recordings
  merged` `` with mergeParsedCount 3; `120 m up, 45 m down` matches the
  Math.round template). zh: 7/7 key parity, 7/7 `{param}` parity.
- No remaining display copy: literal scan of the edited file leaves
  only enum/switch values (`"parsed"`, `"studio"`, …), sample ids
  (`"repair-ride"`), i18n keys, and `href="#main-content"`.

## Tests

`ls tests/ | grep -iE "shell|app-shell"` → no direct shell test files.
The brief's suggested `tests/session-recovery-ui.test.tsx` does not
exist; the files that actually render the full AppShell are
recovery-ui + inspection-flow, so those joined the suggested smoke:

    npx vitest run tests/session-views.test.tsx tests/recovery-ui.test.tsx tests/inspection-flow.test.tsx

Result: **3 files, 38/38 tests PASS** — including inspection-flow's
`getByRole("link", { name: "Skip to content" })`, which proves
`shell.skipToContent` resolves through the en dictionary byte-identical
(a missing key would render the raw key and fail). e2e smoke is not
mine; not run. No full suite, no i18n-runtime gate, no global tsc, no
commit.

## Left for the coordinator (NOT refactored, per protocol)

1. **Hook-produced strings the shell merely passes through** — left as
   received, per the brief:
   - `routerHosts` (`useRouterHostsLabel()` →
     `routerHostsLabel()` in features/reconstruction/routerConfig.ts,
     pure module): hostname list joined with " · " — data-ish, but the
     footer chip and consent dialog render it verbatim.
   - `session.error` / `recoveryError` (hook-produced error titles).
   - `mergeCombinedName` (merge store, set from the merge intake).
2. **Same-string twins of my header keys in OTHER scopes** (kept
   English, labelKey territory):
   - lib/storage/session-record.ts `describeSessionRecord()` labels —
     `label: "Activity from stats"`, `"Route plan"` (pinned by
     tests/session-record.test.ts:460,474). Saved-session labels need
     a key or translateNow pass; my `shell.header.*` keys cover only
     the live header.
   - hooks/use-saved-sessions.ts `savedSessionSectionLabel()` —
     already on the g2 worklog's list ("Plan a route" et al.).
3. **features/reconstruction/routerConfig.ts**
   `validateCustomRouterUrlInput()` returns English `reason` sentences
   ("The URL must start with https:// …") — pure-module display
   sentences consumed by the (already-extracted) consent dialog.
   STOP-and-report per the protocol; adjacent to my pass-through note
   in 1.
4. **app-shell's batchFileName selector** uses `t` inside the zustand
   selector (see judgment call above) — flagging in case the
   coordinator wants the store-shape alternative instead.
5. **`shell.toast.*` namespace is empty by design** — the shell fires
   no toasts itself; all shell-fired toast copy the brief mentions
   (autosave, restore, session saved/exported) lives in the hooks
   (use-session-recovery, use-saved-sessions, …) → the hooks agent's
   translateNow pass.

## Scope discipline

Edited ONLY src/components/layout/app-shell.tsx + the 2 owned
dictionary files. shell-container.ts read and left byte-untouched
(no copy). The pre-existing `sampleLabelKey`/`resetLabelKey`
conversions visible in the working diff were already in the tree
before this task (the "already done" pattern work); I changed nothing
else. Shared i18n files, hooks, stores, tool-tour.tsx's legacy
`TOOL_TOURS`: untouched. Nothing committed.

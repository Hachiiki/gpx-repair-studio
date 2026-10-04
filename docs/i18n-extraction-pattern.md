# Phase 21 — i18n extraction pattern (the agent protocol)

This document is the SINGLE SOURCE for how UI copy moves into typed
dictionaries in Phase 21 (docs/MASTER_PLAN.md §EE 21). Follow it
exactly. The reference exemplar is `src/components/gpx/upload-zone.tsx`
(extracted) + `src/i18n/dicts/en/repair.ts` (its keys) +
`src/i18n/dicts/zh-CN/repair.ts` (its translation).

## Context (read first)

The app is becoming locale-aware. English (source) + Simplified
Chinese ship; a `pseudo` expansion locale exists for overflow QA.

- `src/i18n/runtime.ts` — pure `translate(locale, key, params)`, `{param}` interpolation, English fallback.
- `src/i18n/locale.ts` — the locale observable (persisted `gpx-repair-studio.locale.v1`; `?lang=` override).
- `src/hooks/use-i18n.ts` — `const { t, locale, setLocale } = useI18n();` the ONLY way components translate.
- `src/i18n/dicts/en/<domain>.ts` — your domain's English dictionary (YOU own this file).
- `src/i18n/dicts/zh-CN/<domain>.ts` — your domain's Chinese dictionary (YOU own this file).
- `src/i18n/dicts/en/index.ts` and `zh-CN/index.ts` — ALREADY wired for every domain. DO NOT EDIT THEM.

## The extraction loop (per component file)

1. READ the whole file.
2. For every piece of user-visible copy, choose a key, add it to
   `src/i18n/dicts/en/<your-domain>.ts` with the value copied
   BYTE-IDENTICAL (same words, same punctuation, same em/en dashes).
3. Replace the string in the component with `t("your.key")` (or
   `t("your.key", { param: value })`).
4. Add `const { t } = useI18n();` as the first line of the component
   body (after prop destructuring). Import it:
   `import { useI18n } from "@/hooks/use-i18n";`
5. Translate every new key into `src/i18n/dicts/zh-CN/<your-domain>.ts`
   (glossary + register below).
6. Run the file's tests. Fix what you broke. En rendered text must be
   UNCHANGED — that is why en values are byte-identical.

### What to extract

- JSX text nodes: `<span>Hello</span>` → `<span>{t("x.hello")}</span>`
- Text-bearing props: `title=`, `label=`, `placeholder=`, `alt=`,
  `aria-label=`, `description=`, `summary=`, `message=`,
  `placeholder=`, `heading=`, `tooltip=`, `caption=`
- Toast copy in hooks/components: `toast({ title: "Saved", ... })` →
  `toast({ title: t("x.saved"), ... })`
- Announcements: `announce("Route drawn")` → `announce(t("x.routeDrawn"))`
  (import `translateNow` from `@/i18n/runtime` instead when inside a
  non-React module: `translateNow("x.routeDrawn")`).
- Module-level copy CONSTANTS: convert to a function
  `getX(t)` resolving keys, or move the constant inside the component.
  Export the function if tests or other components used the constant
  (pattern: `getLandingTools(t)` in landing-cards.tsx,
  `getWorkflowSteps/getHeroCopy/getToolFacts(t, mode)` in
  session-views.tsx).
- Pluralized template strings (`point${n === 1 ? "" : "s"}`): use TWO
  keys (`x.one` / `x.many`) picked by the same condition, with
  `{count}` as a param.

### What NOT to extract (leave untouched)

- `data-testid`, `className`, `id`, `htmlFor`, `href`, `key`, `role`,
  `value` when it is an enum/switch value (e.g. `value="repair"` on a
  RadioGroup item — machine values, not copy).
- Code identifiers, URLs, file names, numbers, units computed by
  `lib/utils/format.ts` (already locale-aware).
- Comments. Console logs. Error identifiers (e.g. `code: "E_PARSE"`).
- Copy that is EXPORTED ARTIFACT content (GPX `<note>`/desc sentences,
  MANIFEST.txt lines, CSV headers, the share-card canvas text) — those
  stay English by design.
- The wordmark "GPX Repair Studio" and locale endonyms.
- If a prop carries DISPLAY COPY across files (e.g. `sampleLabel`),
  convert the prop to carry a KEY instead (`sampleLabelKey`) and render
  `t(sampleLabelKey)` at the consumption site. Update both sides +
  tests. (The `sampleLabel` → `sampleLabelKey` conversion is already
  done — use it as the pattern.)

### Interpolation rules

- Template `…${fileName}…` → dictionary value `…{fileName}…`, call
  `t("x.key", { fileName })`.
- String concatenation with words: `"Reading " + name` →
  `t("x.reading", { name })`.
- SENTENCES SPLIT BY MARKUP: `<p>Some <b>bold</b> text</p>` → three
  keys (`x.some`, `x.bold`, `x.text`) or key + param if the markup
  wraps a param value. NEVER put HTML in dictionary values.

### Key naming

`<domain>.<surface>.<purpose>` — short, semantic, lowercase camelCase
segments, dot-separated. Examples that already ship: `upload.title`,
`landing.repair.blurb`, `toolpage.merge.step2.description`,
`header.backToReview`, `loading.parsing`. Within your domain keep the
first segment consistent (`gapList.*`, `surgery.*`, `export.*`…).

### The t() source of truth

Components MUST use `useI18n()`. Only hooks may use `useI18n()` too
(they are React). Pure non-React modules (features/, lib/) NEVER call
translate — instead they emit KEYS (+params) that components render.
If you meet a domain function producing display sentences, STOP and
report it in the worklog instead of refactoring it — those are the
coordinator's (labelKey refactor).

## Chinese translation (zh-CN)

Register: 工具性、克制、诚实 — plain, calm, no marketing tone.
Vocabulary — THE glossary (use it verbatim):

| English | Chinese |
|---|---|
| gap | 缺口 |
| route | 路线 |
| track | 轨迹 |
| segment | 段 |
| point | 点 |
| elevation | 海拔 |
| pace | 配速 |
| split(s) | 分段 |
| moving time | 移动时间 |
| elapsed time | 总耗时 |
| waypoint | 途经点 |
| timestamp | 时间戳 |
| recorded | 已记录 |
| reconstructed | 重建 |
| estimated | 估算 |
| working copy | 工作副本 |
| repair | 修复 |
| recovery / recover | 找回 |
| merge | 合并 |
| plan | 规划 |
| batch | 批量 |
| share card | 分享卡片 |
| export | 导出 |
| undo | 撤销 |
| redo | 重做 |
| sample | 示例 |
| session | 会话 |
| preset | 预设 |
| snap / road snapping | 道路吸附 |
| Curve pen | 曲线笔 |
| Draw/Move/Pan mode | 绘制/移动/平移模式 |
| upload | 上传 |
| download | 下载 |
| browser | 浏览器 |
| device | 设备 |
| privacy | 隐私 |

Rules: keep `{param}` placeholders EXACTLY as in English (same names,
same braces). Punctuation: use Chinese full-width ，。：；？！ where the
English used , . : ; ? ! INSIDE Chinese sentences — but keep product
terms (GPX, PNG, ZIP, KML, MANIFEST.txt, Strava, OSRM) and half-width
symbols in mixed contexts natural. The em dash usage " — " stays
" — " (half-width with spaces). Numbers/units stay Arabic digits.
Sentence-final 。 only for full sentences; UI labels have no final
punctuation.

## Testing protocol (per domain)

- Find your domain's tests: `ls tests/ | grep -i <keyword>` and any
  `src/**/*.test.tsx` siblings.
- Run ONLY your tests: `npx vitest run tests/<file>...`
- Do NOT run the full suite (other agents are mid-flight).
- Do NOT run or edit `tests/i18n-runtime.test.ts` (the global gate;
  it fails until ALL domains land — the coordinator handles it).
- Do NOT run `npx tsc --noEmit` globally (other agents' files are
  mid-flight; it lies to you). Type-check ONLY your files compile by
  running your tests — vitest compiles what it imports.
- If a test asserts copy you moved, keep the en value byte-identical
  and the test keeps passing. If a test imports a constant you
  converted to a function, update the test to call the function with
  the en translator: `import { enTranslator } from "@/hooks/use-i18n";`
  then `getTheThings(enTranslator)`.

## Hard rules

1. NEVER edit shared files: `src/i18n/dicts/en/index.ts`,
   `src/i18n/dicts/zh-CN/index.ts`, `src/i18n/runtime.ts`,
   `src/i18n/locale.ts`, `src/i18n/types.ts`, `src/hooks/use-i18n.ts`,
   `src/components/layout/landing-cards.tsx`,
   `src/components/layout/session-views.tsx`,
   `src/components/layout/header.tsx`,
   `src/components/layout/site-footer.tsx`,
   `src/components/layout/theme-toggle.tsx`,
   `src/components/gpx/upload-zone.tsx` (all DONE).
2. NEVER change behavior, structure, classNames, or testids.
3. en values BYTE-IDENTICAL (byte-for-byte the same rendered text).
4. Append to your dict files; never reorder existing entries.
5. Keep the `as const` on en domain objects.
6. If you find copy you cannot classify (artifact? domain sentence?),
  leave it and note it in the worklog.
7. Commit NOTHING. The coordinator commits.

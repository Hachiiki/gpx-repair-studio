# Phase 31 — Locales & RTL (Task 76)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 30](phase-30-tcx-fit-export.md) · [Phase 32 →](phase-32-repair-forensics.md)

## Proposal (v3 roadmap)

**Objective:** the recorded [Phase 22](../v2/phase-22-offline-pwa.md)+ candidate — more languages,
and the first right-to-left one.

- **31.1 Four locales.** ja, de, fr, es — full-surface typed
  dictionaries under the [Phase 21](../v2/phase-21-internationalization.md) discipline (no bare strings, the
  lint rule already enforces it), a pseudo-length sweep before each
  ships.
- **31.2 RTL.** ar or he first: a logical-property sweep, mirrored
  charts and editors, a pseudo-RTL harness mirroring the
  pseudo-length one.
- **31.3 The chip.** The EN/中文 footer chip becomes a locale sheet;
  persistence behavior unchanged.

**Non-goals:** machine translation of user data; exported artifacts
stay canonical English.
**Verification:** missing-key gates per locale, the pseudo-RTL VLM
sweep, e2e switch persistence across all locales, palette search
per locale.

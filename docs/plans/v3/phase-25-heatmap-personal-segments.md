# Phase 25 — Heatmap & Personal Segments (Task 70)

> **Status: DONE — delivered 2026-10-07.** Implemented on the user's explicit instruction ("do phase 25") · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 24](phase-24-activity-library-records.md) · [Phase 26 →](phase-26-photo-geotagging.md)

## Proposal (v3 roadmap)

**Objective:** your own history on the map — where you have been,
and how fast you have covered the stretches you repeat.

- **25.1 Heatmap layer.** Density rendering of every library track,
  worker-computed, a map-toolbar toggle, theme-aware ramp; large
  libraries decimate the way the 250k profile taught.
- **25.2 Segments.** Define one by selecting a stretch of any track
  or drawing it; the matcher finds your efforts across the library
  and keeps a PR table with dates. Matching follows Strava's
  documented semantics ([§RR](strava-interop-research.md)): an effort is timed from the nearest
  recorded points crossing the segment's start and end, on elapsed
  time, with a drift tolerance — more points mean finer timing.
- **25.3 The honesty rule.** Segment efforts count recorded data
  only — a stretch repaired by drawing is flagged and never a PR
  ([Phase 24](phase-24-activity-library-records.md)'s rule, restated where it bites hardest).
- **25.4 The repair dividend, disclosed.** On Strava, a mid-segment
  data gap breaks matching (their documented "Gap Threshold") — the
  gap-repair tool restores segment eligibility, and the segment
  view says so: repaired tracks match again; drawn stretches still
  never set PRs here.

**Non-goals:** leaderboards, network matching, importing others'
segments.
**Verification:** matcher goldens (overlap, dedup, tolerance
boundaries), heatmap perf budget, e2e segment create → match → PR,
VLM on both themes.

## Delivery record (Task 70)

**Commit:** `phase(25)` — delivered 2026-10-07 on the user's
instruction, baseline 2088 unit tests (149 files) / 213 e2e (42
specs, two pre-existing skips), typecheck + eslint clean, static
export + PWA build PASS (70 precache URLs).

**25.1 Heatmap** — the map toolbar's toggle renders every saved
session's track as a MapLibre kernel-density wash under the working
layers (one MultiPoint feature per session — the shelf is N features,
not N-hundred-thousand points). The strips are derived ONCE by the
lazy backfill (features/library/backfill.ts — the same parse → merge
the index runs, one walk richer) and persisted in the sessions DB's
new `heatmap` store (v4), cascade-deleted with the session exactly
like the index; the toggle reads what the backfill paid for. The
Phase 9 decimation discipline applies at derivation: power-of-two
strides over a 2048-point-per-session ceiling, endpoints pinned — a
250k-point file decimates in <200 ms (the perf-budget golden).
Theme-aware ramps (light: indigo→teal→amber→red on cream; dark:
indigo→violet→fuchsia→signal-orange→yellow) live in the shared
palette so the legend's gradient swatch and the layer cannot drift.

**25.2 Segments** — the fourth library tab. Two authoring doors on
the repair map: *pick a stretch* (the controller's pair-pick session
over the working view's usable points, the one-pick-mode rule
honored) and *draw one freehand* (an anchor-less draw session, the
plan editor's own discipline — the hook pushes its vertex list to
the controller, never re-starting the session per edit). The naming
dialog closes the flow; the segment stores start/end anchors, its
along-track reference length (computed over USABLE points — the
teleport-inflated length the first draft computed would have made
the matcher's own window reject the picked stretch; the e2e caught
it), and its source. The matcher runs Strava's documented semantics
(§RR): crossings within the disclosed 40 m drift tolerance, timed
from each run's nearest recorded point, on elapsed time, directional,
never across track boundaries, with a sanity window (≥ half the
segment's length, ≤ ~2.5× + 250 m) and fastest-non-overlapping dedup
so every kept effort is a distinct passage. Efforts persist inside
the segment row under a shelf fingerprint (the (id, updatedAt) set +
matcher version); a drifted fingerprint recomputes, never guesses —
and a re-run is one button.

**25.3 The honesty rule** — an effort touching a drawn-in point —
at either crossing or anywhere between — is flagged in the engine
(`source === "reconstructed"`, prefix-sum check) and never a PR: the
table sorts clean-first, the PR badge reads the best clean effort,
and a segment with only flagged efforts says so instead of ranking
them.

**25.4 The repair dividend, disclosed** — the walk continues past
data gaps (Strava's documented Gap Threshold breaks matching there;
ours does not), so repaired stretches still yield efforts — flagged
ones. The rules disclosure states all of it in place: elapsed time,
the tolerance verbatim, the honesty rule, and the gap note.

**Privacy** — the `heatmap` store (derived, per-session cascade) and
the `segments` store (user data, cleared with the shelf or deleted
one by one; its efforts block is derived shadow) are disclosed in
the privacy pane beside the library indexes, DB named verbatim.

**Verification** — 16 matcher goldens (equator-line convention:
crossings, the tolerance boundary both sides, run-representative
timing, direction, two-lap non-overlap, fastest-survives dedup, the
reconstruction flag + PR exclusion, the noise-floor window, track
boundaries, fingerprint stability/drift), 7 strips goldens (identity
under the ceiling, stride over, pinned endpoints, the 250k perf
budget, the read ceiling, the collection builder), 8 storage tests
(round-trips, the cascade, the segments' independent lifetime, the
validators), 12 UI tests, the pinned privacy disclosure; 3 e2e
(heatmap toggle → bridge observables + legend, segment create →
match → PR with the fixture's time gaps paying 11:03 in full — the
clock-does-not-stop rule proving itself — plus the draw door's
honest empty table, axe zero-critical). The VLM sweep (both themes ×
two surfaces) had every claim measured: the text-truncation claims
DISPROVEN (scrollWidth = clientWidth), the fat-finger gap measured
at 8px and widened to 12px, and the dark-heatmap "rendered light"
claim CONFIRMED — which caught a REAL pre-existing bug: the sweep
scripts wrote the theme key as JSON while the store reads a raw
string, so every "dark" screenshot since Phase 24 was light. Fixed
in both sweep scripts; the re-shot dark surfaces measure 80/255 vs
the light 238/255.

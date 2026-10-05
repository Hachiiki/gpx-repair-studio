# Phase 14 — Formats: In & Out (Task 59)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 13](phase-13-deep-validation-presets.md) · [Phase 15 →](phase-15-stats-dashboard.md)

## Plan (v2 roadmap)

**Objective:** meet users where their devices are.

- **14.1 Ingest auto-detect:** GPX / TCX / FIT by magic bytes +
  extension, routed through the [Phase 9](../v1/phase-09-performance-large-files.md) worker parse pipeline.
- **14.2 TCX import:** extend the DOMParser facade
  (Activities→Courses→TrackPoints; hr/cad read as optional
  passthrough, not editable).
- **14.3 FIT import:** binary decoder. In-phase decision: a vetted
  dependency (`fit-file-parser` or equivalent — license, bundle
  size, worker compatibility checked) vs a minimal hand-rolled
  Record/Lap decoder; decision and rationale recorded in [§HH](#delivery-record-task-59).
- **14.4 Export:** KML (LineString + stats as ExtendedData), GeoJSON
  (FeatureCollection with per-track stat properties), CSV
  (trackpoints). The existing export menu gains a format picker;
  every format carries the provenance labels.

**Non-goals:** FIT/TCX writing, editing hr/cad fields.
**Verification:** fixture round-trips per format (binary FIT
fixtures hash-checked), golden export files, e2e import→repair→
export in each format, VLM on the export picker. Shipped — see [§HH](#delivery-record-task-59).

## Delivery record (Task 59)

**Story.** Every intake now speaks three languages: GPX (byte-faithful
as always), TCX, and binary FIT — auto-detected from magic bytes — and
every export offers four: GPX (full fidelity with `gpxr` markers), KML,
GeoJSON, and CSV, all carrying the provenance labels. hr/cad/watts
recorded by the device ride along as read-only passthrough, and the
whole thing stays 100 % client-side.

**What shipped.**

- **Sniffer** (`features/formats/sniff.ts`): one decision point for
  every intake. FIT magic (bytes 8..11, header 12/14) wins; XML roots
  are read past BOM/whitespace/comments/DOCTYPE (UTF-8 + UTF-16); the
  extension only steers, never overrides. Track-named XML with an
  unexpected root is routed to its parser so the error names the actual
  root ("Expected a `<gpx>` root element but found `<html>`").
- **TCX import** (`parse-tcx.ts`, via the shared `xml-walk.ts` helpers
  extracted from the GPX parser): Activity → track (Id/Notes/Sport),
  every `<Track>` → one segment, Course → track + CoursePoints →
  waypoints. Laps never cut geometry (they are time splits; the note
  says so). Position-less trackpoints (indoor/pause) are skipped and
  disclosed. hr/cad/watts → read-only `metrics` + a synthesized
  `gpxtpx:TrackPointExtension` raw child so GPX re-export emits them
  the standard way.
- **FIT reader** (`fit/reader.ts`, pure DataView): header + both CRCs,
  definition/data messages both endiannesses, compressed-timestamp
  headers (incl. the 32 s wrap), developer fields skipped, all base
  types with their invalid markers. Repair-tool semantics: a CRC
  mismatch decodes anyway with a warning; a truncated tail stops at the
  last good message; no positioned record at all → typed
  `malformed-fitness-file`.
- **FIT mapping** (`parse-fit.ts`): session → track (sport label,
  multisport partitioned by start times), records → ONE segment per
  session, courses → track + course-point waypoints, pause records
  skipped + disclosed, reader warnings surfaced as issues.
- **The pipeline** (protocol v2 + worker + client): the request carries
  the sniffed format + decoded text (XML) or bytes (FIT); the worker
  routes to the right parser, then the SAME validate → gaps → stream
  code runs. The three intake hooks switched `file.text()` →
  `file.arrayBuffer()`; the [Phase 10](../v1/phase-10-session-recovery.md) session restore upgrades for free
  (it replays the stored bytes).
- **Exporters** (`export-kml.ts` / `export-geojson.ts` / `export-csv.ts`
  over the SAME working copy + merge the GPX export writes): KML one
  placemark per track, one LineString per run, stats + provenance as
  ExtendedData; GeoJSON RFC 7946 FeatureCollection with per-track
  properties; CSV one row per trackpoint with the provenance column
  (recorded / estimated / modified) and optional hr/cad/watts columns.
  The pre-export dialog gained the format picker (GPX layout modes and
  pretty-print appear only where they apply; the download button names
  the format); the choice persists like every other export setting.

**The FIT decoder decision (the plan's in-phase gate).** Hand-rolled,
no dependency. `fit-file-parser@6.1.2` was vetted: MIT, maintained, but
~567 KB of ESM (a 439 KB profile table), ships an encoder we can never
use (FIT writing is a non-goal), and depends on the Browserify
`buffer` polyfill. A reading decoder is small because FIT is
definition-driven; only a ~40-entry field-number table is profile
knowledge (numbers verified against the package's generated profile,
then discarded). This matches the project's internal-module philosophy
(internal Vincenty, internal tokenizer XmlIo, custom draw layer) and
keeps the worker chunk lean.

**Honesty rules.** Converted points get *synthesized* raw captures:
`String(number)` coordinates (shortest round-trip representation —
FIT semicircles resolve to ~0.9 cm and no digits are invented), schema-
ordered ele/time children, and the `gpxtpx` extension for metrics. A
GPX re-parse of a converted export keeps the metrics as verbatim raw
extras (`parseGpx` deliberately does not populate `metrics` — that is
import-time passthrough, and the GPX parser stays byte-faithful). CSV
timestamps normalize to UTC (same instant, canonical spelling). KML/GeoJSON/CSV
disclose provenance the way each format can (ExtendedData / properties /
a column) with a note sentence that says exactly that.

**Verification.** 1477 unit tests (+85: sniff matrix, TCX goldens incl.
worker-tokenizer parity for every fixture, FIT hash-pinned fixtures ×
decoded goldens incl. the compressed wrap + truncation recovery, the
three exporters' goldens incl. the modified/estimated/recorded
provenance mix and the TCX metrics columns, protocol-v2 client
routing, the picker UI). 145 e2e (140 regression re-run in 9 chunks +
5 new: TCX import → deep-validation fix → export in every format, FIT
import → GPX + CSV with metrics, truncated-FIT recovery disclosure,
unknown-format typed error, intake accept contract). Typecheck +
eslint clean; static export PASS. Live QA: both themes + mobile, TCX +
FIT intake, all four downloads, 30/30 checks, zero console/page
errors. VLM SHIP on the picker (light 9/10, dark 9/10) and the TCX
workspace; two claims ("download button unreachable on mobile",
"missing stats dashboard") DISPROVEN by measurement (scripts/phase14-vlm-probe.mjs:
the dialog scrolls and the button enters the viewport after one
scroll; the summary card, stats panel, and map are all present and
visible — the known viewport-crop artifact from Tasks 56/[Phase 13](phase-13-deep-validation-presets.md)).

**Decisions & deviations.** GpxParseError kept its name (renaming the
parse-error vocabulary of every store/UI for cosmetics buys nothing)
and gained the intake kinds: `unsupported-format`,
`not-a-tcx-document`, `malformed-fitness-file`. The `conversion-note`
ValidationIssueKind carries the import disclosures. The picker landed
in the shared pre-export dialog (repair + recovery); the merge/create/
plan tools keep their GPX-only surfaces this phase — they have no
working-copy/merge narrative to disclose in other formats, and Phase
18's batch surface will revisit. Distance is never imported from
TCX/FIT recorded totals — always recomputed from geometry.

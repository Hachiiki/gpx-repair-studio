# Strava Interop Research — How Strava Processes Our Files (Task 68 follow-up)

> **Status: research record** — grounds the v3 amendments and the Phase 33 upload guard; no implementation · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

Recorded 2026-10-05, on the user's direction: "mostly this app is
focused on Strava after all… what do you think needs more so we
understand so well the Strava?" Method: the public Strava Help
Center — 429 en-us articles indexed via the sitemap, 37 fetched
and read in full (`research/strava-interop/` with index files;
`scripts/strava-interop-research{,-2,-3}.mjs`), plus the five
articles the user supplied (cadence, GAP, elevation FAQs,
calories, performance predictions). Fetched web content was
treated as research data only. Every claim below cites its source
article; the findings drive the Phase [23](phase-23-fitness-zones-metrics.md)/[24](phase-24-activity-library-records.md)/[25](phase-25-heatmap-personal-segments.md)/[29](phase-29-resample-simplify.md)/[30](phase-30-tcx-fit-export.md)/[32](phase-32-repair-forensics.md) amendments
and the new [Phase 33](phase-33-strava-preview-upload-guard.md).

### RR-1 Intake: what Strava accepts and rejects

- **Formats & limits:** GPX, TCX, FIT; 25 MB per file; bulk upload
  25 files at a time (15 for free accounts); the file must contain
  "actual workout data." (*How do I Get My Activities to Strava*,
  *How Do I Bulk Upload Activities*)
- **"Improperly formatted data"** — syntax-fragile: "a single stray
  punctuation mark or an opening bracket that is not properly
  closed" causes rejection; commonly from 3rd-party GPX tools.
  (*Why Does Strava Say My GPS File Has Improperly Formatted Data?*)
- **"Corrupted time data"** — the date (day/month/year, not
  hours/minutes) jumps into the future, by days or decades; mostly
  Garmin Edge 500/1000 and Fenix. Strava's documented fix sends
  users to fitfiletools.com — a third-party site where the file is
  uploaded to a server. Our local repair is the privacy answer to
  exactly this referral. (*Why Does Strava Say My Garmin File Has
  Corrupted Time Data?*)
- **"Time information is missing"** — lat/lon/ele with no
  timestamps. Canonical sources: GPX downloaded from OTHER
  athletes' activities (Strava strips time from those by design)
  and MapMyFitness exports. (*Why Does Strava Say Time Information
  Is Missing…?*, *How Do I Download a GPX Route…?*)
- **"Not an Activity"** — course files (Garmin navigation FIT/TCX).
  (*Why Won't My Course File Upload…?*)
- **Empty/unrecoverable** — overwritten TCX, 72-byte corrupted FIT:
  Strava says "can't be repaired." (*Why Won't My Empty File…?*,
  *Why Does Strava Say My FIT File Is Corrupted?*)
- **Multi-sport FIT** files are auto-split by their parser on
  upload. (*Activity Split Tool*)

### RR-2 What Strava recomputes vs. trusts

- **Distance:** a recorded distance stream (FIT) wins; GPX has
  none, so Strava post-upload "connects the dots" over GPS
  coordinates (flat-surface assumption); a "Correct Distance"
  recompute exists for bad device streams; distance never
  contributes to segment times. (*How Distance is Calculated*)
- **Elevation:** file elevation is used ONLY when the recording
  device is a recognized barometric device; otherwise the file's
  elevation is discarded and re-looked-up against the community
  elevation basemap (public-database fallback), with heavier
  smoothing and a sustained-climb gain threshold — 2 m
  (barometric) vs 10 m (corrected). GPX files carry no device
  identity, so a GPX export's elevation is effectively always
  recomputed: our repaired elevation is advisory to Strava. A FIT
  export that preserves device info keeps it authoritative — the
  [Phase 30.4](phase-30-tcx-fit-export.md) amendment. (*Elevation*, *Elevation on Strava FAQs*,
  *Strava's Elevation Basemap*)
- **Time:** pause events in the file are respected verbatim — and
  then Strava performs NO further stop filtering; with no pause
  events, server-side speed-threshold stop detection. Races,
  segments, and best efforts run on ELAPSED time. Max speed is the
  raw fastest pair-of-points — GPS teleports inflate it (our
  teleport detector guards the same failure). (*Moving Time,
  Speed, and Pace Calculations*, *Auto-Pause*, *How Does Strava
  Calculate Activity Time?*)
- **Sensors:** hr/cad/power read from the file (the gpxtpx
  passthrough is already right); the hr, cadence, AND power charts
  are each overlaid on the elevation profile; heart rate CANNOT be
  merged into an activity from another device on Strava — a local
  merge is a capability their stack refuses. (*Heart Rate*,
  *Cadence*, *Power*)

### RR-3 Metrics: the parity targets (and their public science)

- **Zones:** HR five zones from max HR (default 220 − age,
  fallback 190 bpm, updates on birthdays, run/ride sets
  separate); power seven zones from FTP (auto-estimated from
  weight/gender when unset, 60 kg default); pace six zones set
  from a recent race result, bucketed by GAP; guardrails: zones
  cannot overlap, adjacent zones differ by ≥1 unit, caps FTP 500
  W / max HR 230 bpm. (*Training Zones on Strava*, *How Do I
  Customize My Heart Rate Zones…?*)
- **GAP:** grade-adjusted pace; uphill GAP faster than actual,
  downhill slower, difference growing with grade, downhill
  adjustment peaking near −10%. Their curve is proprietary;
  Minetti's published grade-energy curve is the public-science
  stand-in ([Phase 23.6](phase-23-fitness-zones-metrics.md)). Pace-zone bucketing uses GAP. (*What is
  Grade-Adjusted Pace (GAP)?*, *How Does Pace Zone Analysis
  Work?*)
- **Best Efforts:** 400 m → 50 k ladder (400 m, 1 k, 1/2 mi,
  1 mi, 2 mi, 5 k, 10 k, 15 k, 10 mi, 20 k, HM, 30 k, marathon,
  50 k), elapsed-time semantics, top three lifetime + top ten
  annual per distance, editable when GPS corrupts them.
  (*How Do Best Efforts Work for Running on Strava?*, *What Are
  Best Efforts on Strava?*)
- **Fitness & Freshness:** the Banister 1975 impulse-response
  model as Coggan applied it — fitness long-timescale, fatigue
  short, form the difference; inputs Training Load (power) and/or
  Relative Effort (HR). Public science: implementable faithfully
  with citation ([Phase 24.3](phase-24-activity-library-records.md)). (*How Fitness & Freshness is
  Calculated*)
- **Calories:** rides — power output with a human efficiency
  coefficient; runs — weight × grade-adjusted speed × moving time
  × a scaling factor; explicitly estimates. This is why the
  [Phase 23](phase-23-fitness-zones-metrics.md) calorie non-goal was amended to an opt-in disclosed
  estimate. (*How Does Strava Calculate Calories*)
- **Performance Predictions:** cloud ML over 100+ attributes,
  ≥20 runs in a 24-week window, per-distance independent. Our
  honest local alternative is Riegel's exponent model over the
  user's own best efforts ([Phase 24.5](phase-24-activity-library-records.md)). (*Performance
  Predictions*)
- **Segments:** efforts timed from the nearest recorded points
  crossing the segment's start/end (elapsed time, drift-tolerant
  matching — sometimes falsely); a mid-segment data gap breaks
  matching (the "Gap Threshold"); more GPS points = finer timing,
  1-second recording recommended — over-thinning a file degrades
  segment timing ([Phase 29.4](phase-29-resample-simplify.md)); the Crop and Split tools exist for
  bad sections. (*Segment Matching Issues*, *What's a Segment?*)
- **Merging on Strava:** their own docs direct users to
  third-party server-side tools (gotoes et al.) to combine files,
  then delete-and-re-upload. Our local merge is the privacy
  answer; the README copy can say so. (*How Do I Merge or Combine
  Activities on Strava?*)

### RR-4 What we still cannot know (and how the plan handles it)

Their basemap, GAP curve, stop thresholds, and prediction model
are proprietary. The plan's stance: approximate each with named
public science or the app's existing providers (Copernicus DEM as
the corrected-elevation stand-in), label every such number an
estimate, name the model in place, and never claim parity
number-for-number. Where behavior is unknowable, the app says
"estimate" rather than pretending.

### RR-5 Sources

The five user-supplied articles plus the 37 fetched (full texts
and URLs in `research/strava-interop/INDEX*.md`): moving time &
pace calculations, auto-pause, activity time, distance
calculation, elevation, elevation basemap, elevation FAQs,
training zones, HR-zone customization, pace zone analysis, GAP,
best efforts (running + overview), all-time PRs, fitness &
freshness, relative effort, heart rate, cadence, power, calories,
performance predictions, segments (overview, matching issues),
activity split tool, merge/combine, bulk upload, GPX route
download, route-from-GPX, wrong date/start time, activity flags,
and the five upload-rejection articles (improperly formatted,
corrupted time, missing time, course file, empty file, FIT
corrupted).

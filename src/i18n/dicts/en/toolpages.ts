/**
 * English dictionary — tool detail pages (Phase 21).
 *
 * The tool page's teaching copy: the hero (heading + description),
 * the "How it works" trio, the fact strip (input / output / best
 * for), and the parse-progress readout. Moved verbatim from
 * session-views.tsx — the contract "the copy is a contract, not a
 * roadmap" carries over word for word.
 */

/** The tool ids, in the tiles' order (plain data — the dict stays pure). */
const MODES = [
  "repair",
  "share",
  "recovery",
  "create",
  "merge",
  "plan",
  "batch",
] as const;

export { MODES as TOOLPAGE_MODES };

/** The key templates every tool's copy lives under. */
export const TOOLPAGE_KEY_SHAPES = {
  heroHeading: (mode: string) => `toolpage.${mode}.hero.heading`,
  heroDescription: (mode: string) => `toolpage.${mode}.hero.description`,
  stepTitle: (mode: string, step: number) => `toolpage.${mode}.step${step}.title`,
  stepDescription: (mode: string, step: number) =>
    `toolpage.${mode}.step${step}.description`,
  factInput: (mode: string) => `toolpage.${mode}.fact.input`,
  factOutput: (mode: string) => `toolpage.${mode}.fact.output`,
  factBestFor: (mode: string) => `toolpage.${mode}.fact.bestFor`,
} as const;

export const toolpages = {
  "toolpage.backToCards": "All tools",
  "toolpage.howItWorks": "How it works",
  "toolpage.howItWorksSub":
    "The whole workflow runs in this tab — nothing to install, no account.",
  "toolpage.factInput": "Input",
  "toolpage.factOutput": "Output",
  "toolpage.factBestFor": "Best for",

  /*
   * The parse-progress readout (Phase 9 worker phases + fallback).
   */
  "loading.parsing": "Parsing {file}…",
  "loading.yourFile": "your file",
  "loading.aria": "Parsing {file}",
  "loading.local": "Everything happens locally in your browser.",
  "loading.progressA11y": "Parse progress",
  "loading.phase.parse": "Parsing",
  "loading.phase.validate": "Validating",
  "loading.phase.gaps": "Detecting gaps",
  "loading.phase.transfer": "Preparing view",
  "loading.phase.working": "Working",

  /*
   * repair — the core workflow.
   */
  "toolpage.repair.hero.heading": "Repair incomplete GPS recordings",
  "toolpage.repair.hero.description":
    "Upload a GPX activity with gaps or damage, inspect exactly what was recorded, then draw the missing route yourself — with a clear line between recorded and reconstructed data.",
  "toolpage.repair.step1.title": "Inspect",
  "toolpage.repair.step1.description":
    "See every segment, gap, and anomaly with recorded-only statistics — nothing is invented.",
  "toolpage.repair.step2.title": "Repair",
  "toolpage.repair.step2.description":
    "Draw the missing route on the map — clicks follow real roads, drag a curve freehand with the Curve pen, every point adjusts in Move mode, everything undoes.",
  "toolpage.repair.step3.title": "Honest by default",
  "toolpage.repair.step3.description":
    "Download the repaired GPX with every reconstructed point marked — the original recording is never modified, and repairs stay labelled even after re-uploading.",
  "toolpage.repair.fact.input":
    "Any GPX 1.0 or 1.1 activity file — exported from any watch, phone, or platform.",
  "toolpage.repair.fact.output":
    "The same file with your repairs added — every reconstructed point marked, the original recording untouched.",
  "toolpage.repair.fact.bestFor":
    "Recordings with missing sections or suspicious stretches you want to see and fix yourself.",

  /*
   * share.
   */
  "toolpage.share.hero.heading": "Create a share card from your GPX",
  "toolpage.share.hero.description":
    "Upload an activity and download a Strava-style share graphic — your route with the distance, pace, and time this file records. Need to fix it first? The repair workspace is one click away after upload.",
  "toolpage.share.step1.title": "Upload any GPX",
  "toolpage.share.step1.description":
    "Drop an activity file — it is read locally in this tab, and nothing is uploaded anywhere.",
  "toolpage.share.step2.title": "See the card",
  "toolpage.share.step2.description":
    "Your route renders on a transparent 9:16 canvas with the distance, pace, and time the file actually records.",
  "toolpage.share.step3.title": "Download as PNG",
  "toolpage.share.step3.description":
    "Export a 1080×1920 image (2160×3840 optional) — white on transparent, ready for stories and posts.",
  "toolpage.share.fact.input": "Any GPX activity file — gaps and all, no fixes needed.",
  "toolpage.share.fact.output":
    "A 1080×1920 transparent PNG (2160×3840 at 2×) — route, distance, pace, and time exactly as recorded.",
  "toolpage.share.fact.bestFor":
    "Turning a finished activity into a story-ready graphic for Strava, group chats, or anywhere else.",

  /*
   * recovery.
   */
  "toolpage.recovery.hero.heading": "Recover a missing GPS section",
  "toolpage.recovery.hero.description":
    "Upload an activity where the recording dropped out mid-workout — the clock kept running but the route has a hole. Draw the part that went missing and get a corrected GPX with the elapsed time untouched.",
  "toolpage.recovery.step1.title": "Detect the gap",
  "toolpage.recovery.step1.description":
    "The app finds sections where your watch kept counting time but GPS coordinates went missing — the interval, its duration, and both anchor points.",
  "toolpage.recovery.step2.title": "Draw the missing route",
  "toolpage.recovery.step2.description":
    "Trace where you actually went on the map — clicks follow real roads, the Curve pen draws freehand curves, and everything undoes. The original recording is never modified.",
  "toolpage.recovery.step3.title": "Export the corrected file",
  "toolpage.recovery.step3.description":
    "GPS points are generated along your drawing with timestamps fitted into the missing interval, the completed route is previewed with recalculated statistics, and the export marks every generated point as estimated.",
  "toolpage.recovery.fact.input":
    "A GPX with timestamps, where the clock kept running through a GPS dropout.",
  "toolpage.recovery.fact.output":
    "A corrected .gpx — points generated along your drawing, timestamps fitted into the missing interval, elapsed time untouched.",
  "toolpage.recovery.fact.bestFor":
    "Mid-activity signal loss — tunnels, downtown canyons, forest trails: the hole in an otherwise good recording.",

  /*
   * create.
   */
  "toolpage.create.hero.heading": "Create an activity from its stats",
  "toolpage.create.hero.description":
    "Your watch recorded the distance, pace, and time — but no map. Enter those statistics, draw the route you took, and download a GPX ready for Strava and every other platform.",
  "toolpage.create.step1.title": "Enter your statistics",
  "toolpage.create.step1.description":
    "The distance, average pace, total time, and start your watch recorded — no GPX needed. The app checks they agree (time ≈ distance × pace) and never overwrites your numbers.",
  "toolpage.create.step2.title": "Draw the route",
  "toolpage.create.step2.description":
    "Trace where you went on the map — clicks follow real roads, the Curve pen draws freehand curves, and everything undoes. This is the whole activity, drawn from scratch.",
  "toolpage.create.step3.title": "Export the GPX",
  "toolpage.create.step3.description":
    "The route is scaled to your recorded distance, your recorded time is spread along it as timestamps, and the file imports into Strava and other GPX platforms.",
  "toolpage.create.fact.input":
    "No file at all — just the distance, average pace, total time, and start time your watch recorded.",
  "toolpage.create.fact.output":
    "A .gpx scaled to your recorded distance, your time spread along the route as timestamps — imports into Strava and every GPX platform.",
  "toolpage.create.fact.bestFor":
    "Treadmill runs and GPS-less days: the numbers exist, the map does not — until you draw it.",

  /*
   * merge.
   */
  "toolpage.merge.hero.heading": "Combine GPX files into one route",
  "toolpage.merge.hero.description":
    "Upload two or more activities — or several takes of the same one — and merge them into a single GPX. Everything recorded comes along: points, elevation, timestamps, and waypoints. Then arrange the order, name the result, and download one file.",
  "toolpage.merge.step1.title": "Add your files",
  "toolpage.merge.step1.description":
    "Drop two or more GPX files — each is read locally in this tab and inspected before it joins the merge. One bad file never blocks the rest.",
  "toolpage.merge.step2.title": "Arrange the merge",
  "toolpage.merge.step2.description":
    "Set the order the routes join in — or sort by start time — remove any file, and name the combined activity. The map and the statistics follow every change.",
  "toolpage.merge.step3.title": "Download one GPX",
  "toolpage.merge.step3.description":
    "One track with every recorded point from every file — elevation, timestamps, and waypoints carried over verbatim, nothing rewritten.",
  "toolpage.merge.fact.input":
    "Two or more GPX 1.0 or 1.1 activity files — mixed sources welcome (watch, phone, platform exports).",
  "toolpage.merge.fact.output":
    "One .gpx with a single track — every point, waypoint, and route from every file, in your chosen order, under your chosen name.",
  "toolpage.merge.fact.bestFor":
    "Multi-take recordings, activities a platform split into pieces, or building one route from several days' rides and runs.",

  /*
   * plan.
   */
  "toolpage.plan.hero.heading": "Plan a route, read its numbers",
  "toolpage.plan.hero.description":
    "Sketch a route on the map — along real roads, footpaths, or freehand — and watch the distance, the terrain, and the pace take shape. Enter a time and see what it demands. This is a planning scratchpad: nothing is exported, nothing is shared.",
  "toolpage.plan.step1.title": "Draw your route",
  "toolpage.plan.step1.description":
    "Sketch where you might go — clicks follow real roads, the Curve pen draws freehand curves, Move mode adjusts any point, everything undoes. No file needed.",
  "toolpage.plan.step2.title": "Read the estimates",
  "toolpage.plan.step2.description":
    "The distance updates live as the line takes shape, terrain elevation is one opt-in lookup away, and the straight-line comparison shows how winding your plan is.",
  "toolpage.plan.step3.title": "Pace from your time",
  "toolpage.plan.step3.description":
    "Enter a goal time and see the pace and speed it implies, with even splits along the route. This is a scratchpad — nothing is exported and nothing is shared.",
  "toolpage.plan.fact.input":
    "No file at all — just the map. Draw the route you are considering, with the same pens every editor has.",
  "toolpage.plan.fact.output":
    "On-screen estimates only — distance, elevation, the straight-line comparison, and a pace from a time you enter. No export, no share: the plan stays on this page.",
  "toolpage.plan.fact.bestFor":
    "Planning tomorrow's run or ride, measuring a commute, comparing route options before recording one for real.",

  /*
   * batch.
   */
  "toolpage.batch.hero.heading": "Clean up many files in one pass",
  "toolpage.batch.hero.description":
    "Queue a folder's worth of recordings, see per file what the deep checks find, run one fix preset across the whole queue — previewed per file before anything is applied — and download a ZIP with a manifest of every change.",
  "toolpage.batch.step1.title": "Queue your files",
  "toolpage.batch.step1.description":
    "Drop one or many recordings — each parses locally and reports its points, its findings, and its failures. One bad file never blocks the rest.",
  "toolpage.batch.step2.title": "Preview, then apply",
  "toolpage.batch.step2.description":
    "Pick a fix preset and see, per file, exactly what it would change — the same plan words the single-file preview shows — before anything is applied. Every fix undoes.",
  "toolpage.batch.step3.title": "Download the ZIP",
  "toolpage.batch.step3.description":
    "One archive with a repaired GPX per file and a manifest stating what changed in each. The originals are never modified — files the fixes cannot help export unchanged.",
  "toolpage.batch.fact.input":
    "One or many GPX, TCX, or FIT files (up to 50) — a folder's worth of exports, mixed sources welcome.",
  "toolpage.batch.fact.output":
    "One ZIP: a repaired GPX per file plus MANIFEST.txt stating exactly what changed in each — files the fixes cannot help export unchanged.",
  "toolpage.batch.fact.bestFor":
    "Post-migration cleanups, fleet-of-files drift and duplicate sweeps, and anyone who would rather fix twenty recordings in one sitting than one at a time.",
} as const;

export type ToolpagesDict = typeof toolpages;

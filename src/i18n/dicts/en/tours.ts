/**
 * English dictionary — onboarding tour + seven tool tours (Phase 21).
 *
 * Extracted from the tours domain's components. Keys are namespaced
 * `onboarding.*` (the first-run tour), `tour.*` (the per-tool
 * walkthroughs + their offer strip), `palette.*` (the Ctrl/Cmd+K
 * command palette), `restore.*` (the session-recovery prompt), and
 * `workspace.*` (the shared two-section workspace's default labels).
 * English values are the app's existing copy, moved VERBATIM — the
 * dictionary is the contract every locale checks against.
 */

export const tours = {
  /**
   * The first-run onboarding tour (onboarding-tour.tsx) — four steps
   * over the landing's tool cards, then the shared footer rhythm.
   */
  "onboarding.step1.kicker": "Privacy first",
  "onboarding.step1.title": "Your files stay on this device",
  "onboarding.step1.body":
    "Uploading, parsing, gap detection, drawing, statistics, and export all happen in this browser tab. There is no account, and no copy of anything you open here exists anywhere else. The only network requests are map tiles — plus the road-follow and elevation lookups you explicitly trigger.",
  "onboarding.step2.kicker": "The workbench",
  "onboarding.step2.title": "Pick a tool",
  "onboarding.step2.body":
    "Six cards, six jobs: repair a recording, create a share card, recover a GPS gap, create an activity from its stats, combine recordings, or plan a route. Each opens its own workspace — with the same map, the same pens, and its own file.",
  "onboarding.step3.kicker": "Drawing",
  "onboarding.step3.title": "Draw, then refine",
  "onboarding.step3.body":
    "The Default pen places points that follow real roads or footpaths; the Curve pen draws freehand. Switch to Move (M) to drag any point into place — and everything undoes, step by step.",
  "onboarding.step4.kicker": "The guarantees",
  "onboarding.step4.title": "Nothing is lost, nothing is invented",
  "onboarding.step4.body":
    "Statistics always separate recorded data from your reconstructions, and exports carry those markers into Strava and every other platform. Unfinished work is autosaved on this device and offered back the next time you return.",
  "onboarding.skip": "Skip",
  "onboarding.back": "Back",
  "onboarding.next": "Next",
  "onboarding.getStarted": "Get started",
  "onboarding.stepCount": "Step {current} of {count}",

  /**
   * The per-tool guided walkthroughs (tool-tour.tsx, Phase 19) —
   * seven tours, 3–4 steps each. `tour.<tool>.title`/`blurb` feed the
   * help dialog's replay list and the offer strip; the steps carry
   * kicker/title/body and (five tours) a sample-loading ACTION label.
   */
  "tour.repair.title": "Repair a recording",
  "tour.repair.blurb":
    "Find the defects, fix them with previews, see exactly what changed.",
  "tour.repair.step1.kicker": "Repair · Step 1",
  "tour.repair.step1.title": "Start with a recording",
  "tour.repair.step1.body":
    "Drop a GPX, TCX, or FIT file onto the upload zone — or load the bundled sample ride, which carries two GPS gaps and a handful of deep defects to practice on. Everything parses in this tab; the file on disk is never touched.",
  "tour.repair.step1.action": "Load the sample ride",
  "tour.repair.step2.kicker": "Repair · Step 2",
  "tour.repair.step2.title": "Find the problems",
  "tour.repair.step2.body":
    "The deep-validation card walks the recording for teleports, duplicate points, reversed timestamps, elevation spikes, GPS drift, and missing altitude. Every finding previews its fix before you confirm anything — and confirmed fixes land on a working copy you can undo.",
  "tour.repair.step3.kicker": "Repair · Step 3",
  "tour.repair.step3.title": "See what changed",
  "tour.repair.step3.body":
    "The Before/after card overlays the original as a dashed ghost under your working copy and highlights every touched stretch in orange; side-by-side shows both pictures at one scale, and the delta table counts the differences. The repair summary prints as a sheet for your records.",
  "tour.repair.step4.kicker": "Repair · Step 4",
  "tour.repair.step4.title": "Export with provenance",
  "tour.repair.step4.body":
    "Review & export writes the repaired file with gpxr markers that disclose every change — Strava and every other platform keeps them, so nothing pretends to be recorded data. The original stays on your disk exactly as it was.",

  "tour.share.title": "Share card",
  "tour.share.blurb": "Turn a clean run into a picture worth posting.",
  "tour.share.step1.kicker": "Share card · Step 1",
  "tour.share.step1.title": "A picture of your activity",
  "tour.share.step1.body":
    "Upload the recording you want to show off — a clean continuous run works best — or load the bundled steady-run sample. The card renders from the same parsed data as every other tool, in this tab.",
  "tour.share.step1.action": "Load the sample run",
  "tour.share.step2.kicker": "Share card · Step 2",
  "tour.share.step2.title": "Make it yours",
  "tour.share.step2.body":
    "Themes, artwork, units, and the route's framing live on the card itself — click around and watch it re-render live. The numbers carry their provenance just like the statistics panel.",
  "tour.share.step3.kicker": "Share card · Step 3",
  "tour.share.step3.title": "PNG, rendered locally",
  "tour.share.step3.body":
    "Download the card as an image when it looks right. It was drawn entirely in your browser — no server ever saw the file.",

  "tour.recovery.title": "Gap recovery",
  "tour.recovery.blurb":
    "Redraw the stretch your GPS dropped, with honest timestamps.",
  "tour.recovery.step1.kicker": "Recovery · Step 1",
  "tour.recovery.step1.title": "A recording with a hole",
  "tour.recovery.step1.body":
    "Upload a file whose GPS dropped for a stretch — it needs timestamps on both sides of the hole so the missing interval can be detected. The bundled sample ride has exactly that; load it to follow along.",
  "tour.recovery.step1.action": "Load the sample ride",
  "tour.recovery.step2.kicker": "Recovery · Step 2",
  "tour.recovery.step2.title": "Draw the missing route",
  "tour.recovery.step2.body":
    "Open the gap and draw: the Default pen places points that follow real roads or footpaths, the Curve pen draws freehand, and Move (M) drags any point afterward. Everything undoes, step by step.",
  "tour.recovery.step3.kicker": "Recovery · Step 3",
  "tour.recovery.step3.title": "Time is estimated — and labeled",
  "tour.recovery.step3.body":
    "The recovered stretch's timestamps are interpolated, and the app says so everywhere: the pace rows, the statistics panel, and the export's markers. Nothing invented is presented as recorded.",
  "tour.recovery.step4.kicker": "Recovery · Step 4",
  "tour.recovery.step4.title": "Export the whole activity",
  "tour.recovery.step4.body":
    "The export writes recorded data and your recovered stretch in one file, with gpxr markers disclosing which is which.",

  "tour.create.title": "Create from stats",
  "tour.create.blurb": "Turn numbers from another app into a drawn route.",
  "tour.create.step1.kicker": "Create · Step 1",
  "tour.create.step1.title": "From your numbers",
  "tour.create.step1.body":
    "Type the distance, duration, and elevation your watch recorded somewhere else. The form prefills example numbers if you just want to see how it works — nothing is uploaded anywhere.",
  "tour.create.step2.kicker": "Create · Step 2",
  "tour.create.step2.title": "Draw the route",
  "tour.create.step2.body":
    "Draw the route you actually took: click by click with road-following, or freehand with the Curve pen. The live distance readout keeps score against your target.",
  "tour.create.step3.kicker": "Create · Step 3",
  "tour.create.step3.title": "Refine until it fits",
  "tour.create.step3.body":
    "Move points, undo anything, and watch the numbers reconcile. When the drawn route matches the real activity, it is done — no guessing hidden anywhere.",
  "tour.create.step4.kicker": "Create · Step 4",
  "tour.create.step4.title": "Share it if you like",
  "tour.create.step4.body":
    "The review track can become a share card, exactly like an uploaded activity. Your original numbers stay in the session if you come back to adjust.",

  "tour.merge.title": "Merge recordings",
  "tour.merge.blurb":
    "Combine two or more recordings into one honest route.",
  "tour.merge.step1.kicker": "Merge · Step 1",
  "tour.merge.step1.title": "Two or more recordings",
  "tour.merge.step1.body":
    "Add the files in the order you rode or ran them — a commute split in two, a watch that died mid-ride, an activity broken by a pause. The bundled sample pair is a two-part commute you can load with one click.",
  "tour.merge.step1.action": "Load the sample pair",
  "tour.merge.step2.kicker": "Merge · Step 2",
  "tour.merge.step2.title": "Arrange the chain",
  "tour.merge.step2.body":
    "Drag the files into order or sort by start time. The chained preview shows how the pieces connect, end to start, with the joins disclosed.",
  "tour.merge.step3.kicker": "Merge · Step 3",
  "tour.merge.step3.title": "One route, honestly",
  "tour.merge.step3.body":
    "The combined route reconciles the overlaps and carries the merged statistics — with each file's own numbers still one click away.",
  "tour.merge.step4.kicker": "Merge · Step 4",
  "tour.merge.step4.title": "Export the combined file",
  "tour.merge.step4.body":
    "One GPX out, provenance preserved: the export notes where the pieces came from.",

  "tour.plan.title": "Plan a route",
  "tour.plan.blurb":
    "A draw-and-measure scratchpad for the route you're thinking about.",
  "tour.plan.step1.kicker": "Plan · Step 1",
  "tour.plan.step1.title": "A scratchpad, not a session",
  "tour.plan.step1.body":
    "No file needed — start planning and the map is yours. Draw the route you're thinking about, from scratch or around a place you know.",
  "tour.plan.step2.kicker": "Plan · Step 2",
  "tour.plan.step2.title": "Draw and measure",
  "tour.plan.step2.body":
    "The same pens as everywhere else: click-by-click with road-following, freehand curves, and draggable points. The distance readout updates with every change.",
  "tour.plan.step3.kicker": "Plan · Step 3",
  "tour.plan.step3.title": "Check your work",
  "tour.plan.step3.body":
    "The plan's numbers — distance, the route's shape, the elevation profile when you ask for it — stay live while you refine. Undo everything, step by step.",
  "tour.plan.step4.kicker": "Plan · Step 4",
  "tour.plan.step4.title": "When it's right",
  "tour.plan.step4.body":
    "Plans stay on this device — there is no export here by design, just a clear route to draw into your usual planning app once it feels right. Unfinished plans are autosaved and offered back next visit.",

  "tour.batch.title": "Batch cleanup",
  "tour.batch.blurb":
    "One preset across a folder of files, one ZIP out, sessions to keep.",
  "tour.batch.step1.kicker": "Batch · Step 1",
  "tour.batch.step1.title": "Many files, one pass",
  "tour.batch.step1.body":
    "Queue up to fifty files at once — the whole season's exports, the folder from your old watch. Each parses one at a time with its own status; nothing is uploaded anywhere. Load two sample files to see the flow.",
  "tour.batch.step1.action": "Load two sample files",
  "tour.batch.step2.kicker": "Batch · Step 2",
  "tour.batch.step2.title": "One preset, per-file previews",
  "tour.batch.step2.body":
    "Pick a preset and every file previews exactly what it would change — point by point, file by file. Confirm applies it across the queue, and any file's last fix undoes on its own.",
  "tour.batch.step3.kicker": "Batch · Step 3",
  "tour.batch.step3.title": "One ZIP out",
  "tour.batch.step3.body":
    "Download everything at once: one repaired GPX per file plus a MANIFEST.txt that states, for each file, exactly what changed and what did not. Files with no issues export unchanged.",
  "tour.batch.step4.kicker": "Batch · Step 4",
  "tour.batch.step4.title": "Come back anytime",
  "tour.batch.step4.body":
    "The queue can be saved as a named session — exported as a .gpxrepair.json file that carries the originals and every fix, and reopened here on any device.",

  /** The walkthrough dialog's footer (Skip · dots · Back · Next). */
  "tour.skip": "Skip",
  "tour.back": "Back",
  "tour.next": "Next",
  "tour.getStarted": "Get started",
  "tour.stepCount": "Step {current} of {count}",

  /** The dismissible first-visit strip above a tool's workspace. */
  "tour.offer.new": "New: the {title} walkthrough.",
  "tour.offer.meta": "{count} steps, about a minute",
  "tour.offer.samples": " — teaching samples included",
  "tour.offer.start": "Start",
  "tour.offer.dismiss": "Dismiss",

  /**
   * The command palette (command-palette.tsx, Phase 20) — the
   * component's OWN copy only. The command labels and the registry's
   * group headings (features/commands/registry.ts) are the
   * coordinator's labelKey work; the session section labels come from
   * hooks/use-saved-sessions.
   */
  "palette.title": "Command palette",
  "palette.description":
    "Search every action in the app. Arrow keys move, Enter runs, Escape closes.",
  "palette.placeholder": "Search commands…",
  "palette.empty": "Nothing matches — try a tool name, “undo”, or “theme”.",
  "palette.recentSessions": "Recent sessions",
  "palette.commands": "Commands",
  "palette.footerMove": "move",
  "palette.footerRun": "run",
  "palette.footerClose": "close",
  "palette.editor": "editor",

  /**
   * The session-recovery prompt (restore-prompt.tsx, Phase 10) — the
   * landing's restorable-work card and its §M-3 disclosure footer.
   * The per-offer label/detail lines are produced by
   * lib/storage/session-record.ts (the coordinator's labelKey work).
   */
  "restore.ariaLabel": "Unsaved sessions on this device",
  "restore.title": "Unfinished work on this device",
  "restore.blurb":
    "A browser reload or closed tab would lose it. Restore to pick up exactly where you left off.",
  "restore.kicker.repair": "Repair",
  "restore.kicker.recovery": "Gap recovery",
  "restore.kicker.create": "Create from stats",
  "restore.kicker.plan": "Route plan",
  "restore.restoring": "Restoring…",
  "restore.restore": "Restore",
  "restore.discard": "Discard",
  "restore.clearAll": "Clear all saved sessions",
  "restore.privacy":
    "Saved sessions — your file and the edits you drew — stay in this browser's storage on this device. They are never uploaded, and restoring re-opens them exactly as they were.",
  "restore.morePrivacy": "More about privacy and data",
  "restore.savedJustNow": "saved just now",
  "restore.savedMinuteOne": "saved 1 minute ago",
  "restore.savedMinuteMany": "saved {count} minutes ago",
  "restore.savedHourOne": "saved 1 hour ago",
  "restore.savedHourMany": "saved {count} hours ago",
  "restore.savedDayOne": "saved 1 day ago",
  "restore.savedDayMany": "saved {count} days ago",

  /**
   * The shared two-section workspace (workspace-layout.tsx) — the
   * DEFAULT labels that voice the repair workspace (the shell renders
   * it without overrides); merge/create/recovery/plan pass their own
   * domain strings. `detailsAria` is section 2's landmark label.
   */
  "workspace.sectionLabel": "Repair map and tools",
  "workspace.toolsLabel": "Repair tools",
  "workspace.detailsTitle": "Statistics & file details",
  "workspace.detailsIntro":
    "Everything the app knows about the original recording — honest numbers with their provenance, never fabricated.",
  "workspace.detailsAria": "Statistics and file details",
  "workspace.backToMap": "Back to the map",

  "restore.desc.drawn.one": "1 point drawn",
  "restore.desc.drawn.many": "{count} points drawn",
  "restore.desc.manualSpans.one": "1 manual span",
  "restore.desc.manualSpans.many": "{count} manual spans",
  "restore.desc.skippedGaps.one": "1 skipped gap",
  "restore.desc.skippedGaps.many": "{count} skipped gaps",
  "restore.desc.fixes.points.one": "1 fix ({points} points)",
  "restore.desc.fixes.points.many": "{count} fixes ({points} points)",
  "restore.desc.fixes.plain.one": "1 fix",
  "restore.desc.fixes.plain.many": "{count} fixes",
  "restore.desc.createLabel": "Activity from stats",
  "restore.desc.createKm": "{km} km entered",
  "restore.desc.planLabel": "Route plan",
  "restore.desc.join": " · ",
} as const;

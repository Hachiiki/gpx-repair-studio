/**
 * English dictionary — recovery tool surfaces (Phase 21).
 *
 * Extracted from the recovery domain's components. Keys are namespaced
 * `recovery.*`. English values are the app's existing copy, moved
 * VERBATIM — the dictionary is the contract every locale checks
 * against.
 */

export const recovery = {
  /*
   * RecoveryGuideCard (recovery-guide-card.tsx) — the wizard progress
   * strip: detected / recovered / what remains.
   */
  /** Card heading. */
  "recovery.guide.title": "Gap recovery",
  /** Description — nothing detected and nothing drawn yet. */
  "recovery.guide.status.empty":
    "No missing sections detected — you can still draw the route you lost below.",
  /** Description — nothing detected, but sections were drawn. */
  "recovery.guide.status.onlyDrawn":
    "Nothing was detected — your drawn sections carry the recovery.",
  /** Description — every detected section has a recovered route. */
  "recovery.guide.status.allRecovered":
    "Every detected section has a recovered route.",
  /** Description — a draw editor is currently open. */
  "recovery.guide.status.drawing":
    "Drawing — click the map to add the missing route.",
  /** Description — sections remain, none being drawn. */
  "recovery.guide.status.invite":
    "Open a section below and draw where you actually went.",
  /** Step 1 label (the count follows after the em dash). */
  "recovery.guide.step.detect": "Detect missing sections —",
  /** Step 1 count chip. */
  "recovery.guide.step.found": "{count} found",
  /** Step 2 label (the count follows after the em dash). */
  "recovery.guide.step.draw": "Draw the missing route —",
  /** Step 2 count chip — sections detected. */
  "recovery.guide.step.recovered": "{recovered} of {detected} recovered",
  /** Step 2 count chip — nothing detected, sections drawn. */
  "recovery.guide.step.drawn": "{count} drawn",
  /** Step 3 anchor (scrolls to the details section). */
  "recovery.guide.step.preview": "Preview the completed route & export",

  /*
   * RecoveryPreviewCard (recovery-preview-card.tsx) — the
   * completed-route preview shown before exporting.
   */
  /** Card heading. */
  "recovery.preview.title": "Completed route",
  /** Description — a detected section recovered (singular). */
  "recovery.preview.desc.recoveredOne":
    "{count} of {total} missing section recovered — preview before you export.",
  /** Description — detected sections recovered (plural). */
  "recovery.preview.desc.recoveredMany":
    "{count} of {total} missing sections recovered — preview before you export.",
  /** Description — an unmeasured section drawn (singular). */
  "recovery.preview.desc.drawnOne":
    "{count} unmeasured section drawn — time estimated from your file's pace.",
  /** Description — unmeasured sections drawn (plural). */
  "recovery.preview.desc.drawnMany":
    "{count} unmeasured sections drawn — time estimated from your file's pace.",
  /** Description — nothing committed yet. */
  "recovery.preview.desc.empty":
    "Draw a missing section to see the completed route here — detection or not, drawing is always available.",
  /** Row label — the reconstructed time. */
  "recovery.preview.recoveredTime": "Recovered time",
  /** Row hint — where the recovered time comes from. */
  "recovery.preview.recoveredTimeHint":
    "From the sections' recorded boundary intervals — or, for unmeasured sections, estimated from your file's average pace.",
  /** Row label — the distance. */
  "recovery.preview.distance": "Distance",
  /** Row hint — recorded → completed. */
  "recovery.preview.distanceHint":
    "Recorded legs (gaps excluded) → recorded plus the drawn sections.",
  /** Row label — the elapsed time. */
  "recovery.preview.elapsedTime": "Elapsed time",
  /** Row hint — why the elapsed time cannot change. */
  "recovery.preview.elapsedTimeHint":
    "First to last recorded timestamp — the original recording is never rewritten, so this cannot change.",
  /** Row label — the completed average speed. */
  "recovery.preview.avgSpeed": "Average speed, completed",
  /** Row hint — how the completed speed is computed. */
  "recovery.preview.avgSpeedHint":
    "Completed distance over the recorded elapsed time plus any estimated time the file's clock never counted — the geometry is drawn, the clock is real.",
  /** Row label — inserted points. */
  "recovery.preview.pointsGenerated": "Points generated",
  /** Row hint — what the generated points carry. */
  "recovery.preview.pointsGeneratedHint":
    "Inserted along your drawing inside the missing interval — exported with estimated timestamps and provenance markers.",
  /** Tooltip — a recovered section still lacks a duration. */
  "recovery.preview.needsDurationHint":
    "A recovered section still needs a duration (or timestamps) before this is honest.",
  /** The elapsed-time lock badge. */
  "recovery.preview.unchanged": "unchanged",
  /** Footnote — generated points are marked in the export. */
  "recovery.preview.estimatedNote":
    "Generated points are estimated data, not original GPS fixes — the export marks every one of them, and platforms that re-read the file will see the markers.",
  /** Empty state — nothing is applied until export. */
  "recovery.preview.emptyNote":
    "Nothing is applied to the file until you export — and even then the export is a new file: the original stays exactly as recorded, with your recovered sections inserted between its untouched points.",

  /*
   * RecoveryStudio (recovery-studio.tsx) — the recovery-voiced copy
   * for the reused ManualRepairsCard (the always-available front door
   * for unmeasured sections).
   */
  /** Card title override. */
  "recovery.manual.title": "Unmeasured sections",
  /** Card description override. */
  "recovery.manual.description":
    "Draw the route you lost — the app estimates its time from your pace in this file.",
  /** Anchor action label override. */
  "recovery.manual.anchorLabel": "Draw an unmeasured section",
  /** Anchor action hint override. */
  "recovery.manual.anchorHint":
    "One click anywhere on the map — the section attaches to your recorded route's nearest end and your clicks draw the lost route outward from there, following the roads between them. Use it for any stretch the watch never measured, even when nothing was detected.",
  /** Pair action label override. */
  "recovery.manual.pairLabel": "Redraw a stretch",
  /** Pair action hint override. */
  "recovery.manual.pairHint":
    "Click two points on the recorded route — the stretch between them is what you replace. Use it when the watch drew a straight line over the road you actually took; the time comes from the file.",
  /** Empty-list copy override. */
  "recovery.manual.empty":
    "Nothing drawn yet. Start anywhere on the route — a tunnel the watch cut straight through, a section it never measured — even when no gap was detected.",
  /** Anchor pick-mode instructions override. */
  "recovery.manual.anchorInstructions":
    "Click anywhere on the map near where the lost section goes — it anchors to your recorded route's nearest end and every click after that draws outward from it. Esc cancels.",
  /** Pair pick-mode instructions override. */
  "recovery.manual.pairInstructions":
    "Click two points on the recorded route — the stretch between them is what you replace. Pan and zoom stay available; Esc cancels.",

  /*
   * RecoveryWorkspace (recovery-workspace.tsx) — the two-section
   * layout's landmark labels and headings.
   */
  /** Section 1 landmark label. */
  "recovery.workspace.mapA11y": "Recovery map and tools",
  /** Tools column label. */
  "recovery.workspace.toolsLabel": "Recovery tools",
  /** Scroll cue to the second section. */
  "recovery.workspace.scrollCue": "Preview & statistics",
  /** Section 2 landmark label. */
  "recovery.workspace.detailsA11y":
    "Completed route preview and statistics",
  /** Section 2 heading. */
  "recovery.workspace.detailsTitle":
    "Completed route — preview & statistics",
  /** Section 2 blurb. */
  "recovery.workspace.detailsBlurb":
    "The original recording plus your recovered sections — the elapsed time is untouched, and every generated point stays labeled as estimated.",
  /** Back link to the map. */
  "recovery.workspace.backToMap": "Back to the map",
} as const;

export type RecoveryDict = typeof recovery;

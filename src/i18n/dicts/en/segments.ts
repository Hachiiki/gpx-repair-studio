/**
 * The segments dictionary (Phase 25 — personal segments: authoring
 * doors, effort tables, the rules disclosure). English is the source
 * of truth; every locale mirrors it key for key (the i18n unit gate).
 */

export const segments = {
  // -- Tab + surface ----------------------------------------------------
  "segments.title": "Personal segments",
  "segments.desc":
    "Stretches you repeat, timed against yourself. Define one on the map; every saved session that covers it becomes an effort, computed on this device.",

  // -- Authoring doors --------------------------------------------------
  "segments.newStretch": "From the loaded track",
  "segments.newDraw": "Draw on the map",
  "segments.authorNeedsTrack":
    "Both doors need the repair map — load a file first, then come back.",
  "segments.sourceStretch": "picked from a track",
  "segments.sourceDrawn": "drawn by hand",

  // -- The name dialog --------------------------------------------------
  "segments.nameTitle": "Name this segment",
  "segments.nameDesc":
    "{length}, {source}. The matcher looks for this start and end across your saved sessions.",
  "segments.nameLabel": "Segment name",
  "segments.namePlaceholder": "Morning climb, river loop…",
  "segments.nameSave": "Save segment",
  "segments.nameCancel": "Discard",

  // -- The effort table -------------------------------------------------
  "segments.noEfforts":
    "No saved session covers this segment yet — efforts appear when one does.",
  "segments.effortTime": "Time",
  "segments.effortSession": "Session",
  "segments.effortDate": "Date",
  "segments.flaggedOnly": "Only flagged efforts — no PR",
  "segments.flaggedTag": "includes drawn-in repair",
  "segments.flaggedReason":
    "Part of this effort rides reconstructed points — it is shown for context and never counts as a record.",
  "segments.asOf": "Efforts computed {date} — re-run after new saves.",
  "segments.matching": "Matching {done}/{total} sessions…",
  "segments.rematch": "Re-run matching",

  // -- The rules disclosure ----------------------------------------------
  "segments.rulesTitle": "How efforts are matched",
  "segments.ruleElapsed":
    "Elapsed time — the clock does not stop. A segment effort is timed from the crossing of its start to the crossing of its end.",
  "segments.ruleTolerance":
    "A crossing is any pass within {meters} m of an anchor — GPS drift between rides is expected; a parallel street will not match.",
  "segments.ruleHonesty":
    "Recorded data only: an effort that touches a drawn-in stretch — at either end or anywhere between — is flagged and never a personal record.",
  "segments.ruleRepair":
    "On Strava, a data gap inside a segment breaks matching. Repairing the gap here restores eligibility — but repaired stretches stay flagged, exactly as above.",
  "segments.none":
    "No segments yet — pick a stretch of a loaded track, or draw one on the map.",

  // -- Delete -----------------------------------------------------------
  "segments.deleteAria": "Delete segment {name}",
  "segments.deleteConfirm": "Delete “{name}”? Its effort history goes with it.",
  "segments.deleteYes": "Delete",
  "segments.deleteNo": "Keep it",
} as const;

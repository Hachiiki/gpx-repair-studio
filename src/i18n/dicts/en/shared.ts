/**
 * English dictionary — shared cards (sessions manager, restore prompt, reveal, etc.) (Phase 21).
 *
 * Extracted from the shared domain's components. Keys are namespaced
 * `shared.*`. English values are the app's existing copy, moved
 * VERBATIM — the dictionary is the contract every locale checks
 * against.
 */

export const shared = {
  /**
   * gap-vocabulary.tsx — the gap kind / severity / status words shared
   * by the gap list, the map's highlight chip, and the draw panel.
   */
  "shared.gapVocab.kindTimeGap": "Time gap",
  "shared.gapVocab.kindSpeedAnomaly": "Speed anomaly",
  "shared.gapVocab.kindSegmentBreak": "Segment break",
  "shared.gapVocab.kindManual": "Manual repair",
  "shared.gapVocab.kindManualInsert": "Added route",
  "shared.gapVocab.severitySevere": "severe",
  "shared.gapVocab.severitySuspect": "suspect",
  "shared.gapVocab.severityInfo": "info",
  "shared.gapVocab.statusNew": "Not repaired",
  "shared.gapVocab.statusInProgress": "Editing",
  "shared.gapVocab.statusReconstructed": "Reconstructed",
  "shared.gapVocab.statusSkipped": "Skipped",

  /** hint-tip.tsx — the delayed use-case tooltip. */
  "shared.hint.toSwitch": "to switch",

  /** pace-unit-toggle.tsx — the km/mi segmented control. */
  "shared.paceUnit.groupAria": "Pace unit",

  /** router-consent-dialog.tsx — the road-snapping privacy gate. */
  "shared.consent.titleManaging": "Road snapping is on",
  "shared.consent.titleGrant": "Turn on road snapping?",
  "shared.consent.managePrefix":
    "Road snapping is enabled for this session. The points of every line you draw with Roads, Footpaths, or Snap to road are being sent to",
  "shared.consent.manageSuffix":
    ". Nothing else ever leaves — not your file, not your recorded points. It turns off when you close this tab, or right now:",
  "shared.consent.noticeLead":
    "Road snapping sends the drawn line to a third-party router: the points you place on a line with the",
  "shared.consent.roads": "Roads",
  "shared.consent.footpaths": "Footpaths",
  "shared.consent.snapToRoad": "Snap to road",
  "shared.consent.sepComma": ", ",
  "shared.consent.sepOr": ", or ",
  "shared.consent.controlsGoTo": "controls go to",
  "shared.consent.toFindRoads": "to find the roads between them.",
  "shared.consent.neverLine":
    "Never your GPX file, never your recorded points",
  "shared.consent.neverRest":
    "— only what you yourself draw. Straight lines and the Curve pen stay fully local either way, and you can turn this off any time from the footer.",
  "shared.consent.customPrefix":
    "You have configured your own routing server — drawn points go there, to",
  "shared.consent.customSuffix": ", not to a public service.",
  "shared.consent.sessionScope":
    "This permission lasts for this session only — a fresh page load asks again.",
  "shared.consent.privacyLink": "Privacy & data",
  "shared.consent.privacyRest": "has the full list and the self-hosting instructions.",
  "shared.consent.done": "Done",
  "shared.consent.turnOff": "Turn off for this session",
  "shared.consent.keepLocal": "Keep lines local",
  "shared.consent.enable": "Enable for this session",

  /** sessions-manager.tsx — the named-session shelf (save/open/rename/delete/import). */
  "shared.sessions.title": "Your sessions",
  "shared.sessions.description":
    "Sessions live in this browser only — no accounts, nothing sent anywhere. A session file (.gpxrepair.json) carries the whole thing: the original recording, every fix, every drawn repair.",
  "shared.sessions.saveSectionAria": "Save the current session",
  "shared.sessions.saveHeading": "Save what you are working on",
  "shared.sessions.nameLabel": "Session name",
  "shared.sessions.savePlaceholder": "Name this {section} session…",
  "shared.sessions.savePlaceholderEmpty":
    "Nothing to save yet — draw or fix something first",
  "shared.sessions.saveButton": "Save session",
  "shared.sessions.exportCurrent": "Export file",
  "shared.sessions.importedNotice": "Imported — \"{name}\" is on the shelf.",
  "shared.sessions.shelfSectionAria": "Saved sessions",
  "shared.sessions.shelfHeading": "On this device",
  "shared.sessions.unavailable":
    "Session storage is unavailable (blocked or private mode) — save and export still work, but nothing persists here.",
  "shared.sessions.empty":
    "No saved sessions yet. Save one above, or import a session file below.",
  "shared.sessions.filesSectionAria": "Session files",
  "shared.sessions.filesHeading": "Session files",
  "shared.sessions.importButton": "Import to the shelf",
  "shared.sessions.openFileButton": "Open a session file",
  "shared.sessions.openFileNote":
    "\"Open a session file\" loads it straight into the app — the current session is replaced, exactly like uploading a new file.",
  "shared.sessions.renameLabel": "New name for {name}",
  "shared.sessions.renameCommit": "Rename",
  "shared.sessions.renameCancel": "Cancel",
  "shared.sessions.renameAria": "Rename {name}",
  "shared.sessions.exportAria": "Export {name} as a session file",
  "shared.sessions.deleteAria": "Delete {name}",
  "shared.sessions.updated": "Updated {date}",
  "shared.sessions.deleteConfirm": "Delete this session?",
  "shared.sessions.deleteButton": "Delete",
  "shared.sessions.keepButton": "Keep",
  "shared.sessions.openButton": "Open this session",
} as const;

/**
 * English dictionary — layout domain (Phase 21).
 *
 * Copy for the app chrome: landing, session views, header/footer,
 * help & info dialogs, tours, the command palette, onboarding, the
 * announcer, and the app shell. Tool surfaces live in their own
 * domain files; only chrome keys are namespaced `layout.*` —
 * sub-namespaced by surface (landing.*, footer.*, help.*, …).
 */

export const layout = {
  /*
   * Landing cards (landing-cards.tsx) — the seven tiles and the hero.
   * The subline says SEVEN (Phase 18 added the batch tile; the copy
   * still said "six" — fixed during extraction, recorded in §OO).
   */
  "landing.heading": "What would you like to do?",
  "landing.subline":
    "Seven tools, one workbench — pick one to see how it works and start. Everything runs in this browser, and your files never leave this device.",
  "landing.startTour": "New here? Take the tour",
  "landing.continueSession": "Continue a saved session — or open a session file",
  "landing.tileA11y": "{title} — open this tool",
  "landing.open": "Open",

  "landing.repair.kicker": "Repair",
  "landing.repair.title": "Repair a recording",
  "landing.repair.blurb":
    "Inspect a GPX with gaps or damage, then draw the missing route yourself.",
  "landing.repair.imageAlt":
    "Illustration of a map route with a missing section being redrawn in orange",
  "landing.share.kicker": "Share",
  "landing.share.title": "Create a share card",
  "landing.share.blurb":
    "Turn any activity into a Strava-style share graphic — a transparent PNG.",
  "landing.share.imageAlt":
    "Illustration of a phone displaying a share card with a route and stats",
  "landing.recovery.kicker": "Recovery",
  "landing.recovery.title": "Recover a GPS gap",
  "landing.recovery.blurb":
    "The clock kept running while GPS dropped out — draw what went missing.",
  "landing.recovery.imageAlt":
    "Illustration of a GPS watch and a route with a dotted missing segment between two pins",
  "landing.create.kicker": "Create",
  "landing.create.title": "Create from stats",
  "landing.create.blurb":
    "Your watch recorded the numbers but no map — enter them, draw the route.",
  "landing.create.imageAlt":
    "Illustration of a sports watch beside a pencil drawing a brand-new route",
  "landing.merge.kicker": "Merge",
  "landing.merge.title": "Combine recordings",
  "landing.merge.blurb":
    "Two or more GPX files become one route — every point preserved.",
  "landing.merge.imageAlt":
    "Illustration of two separate map routes converging into one continuous line",
  "landing.plan.kicker": "Plan",
  "landing.plan.title": "Plan a route",
  "landing.plan.blurb":
    "Sketch a route on the map and read its distance, elevation, and pace.",
  "landing.plan.imageAlt":
    "Illustration of a winding route being measured with ruler ticks and a drafting compass",
  "landing.batch.kicker": "Batch",
  "landing.batch.title": "Clean up many files",
  "landing.batch.blurb":
    "Queue dozens of recordings, run one fix preset across them, export a ZIP.",
  "landing.batch.imageAlt":
    "Illustration of a stack of file cards with route lines, one being stamped with a checkmark",

  /*
   * App header (header.tsx). The wordmark is the product's own name —
   * it stays identical in every locale (brand names do not localize);
   * it lives in the dictionary so the lint rule's contract is uniform.
   */
  "header.wordmark": "GPX Repair Studio",
  "header.badgeLocalFirst": "Local-first",
  "header.shareCard": "Share card",
  "header.backToReview": "Back to review",
  "header.backToArrangement": "Back to arrangement",
  "header.repairMap": "Repair map",
  "header.navWorkspace": "Workspace sections",
  "header.mapTools": "Map & tools",
  "header.statistics": "Statistics",
  "header.navRecovery": "Recovery sections",
  "header.previewStats": "Preview & stats",
  "header.navMerge": "Merge sections",
  "header.mapOrder": "Map & order",
  "header.sessions": "Sessions",
  "header.newFile": "New file",
  "header.startOver": "Start over",

  /*
   * Site footer (site-footer.tsx) — the privacy line, the consent
   * chip, and the nav doors. The consent chip's host name rides in a
   * mono span, so only the words around it are dictionary copy.
   */
  "footer.privacyLine":
    "All processing happens in your browser — the file never leaves this device.",
  "footer.routerConsentPrefix": "Road snapping on — drawn points go to",
  "footer.navA11y": "About, help, and privacy",
  "footer.about": "About",
  "footer.help": "Shortcuts & help",
  "footer.privacy": "Privacy & data",

  /*
   * Theme toggle (theme-toggle.tsx) — the segmented chip's labels.
   */
  "theme.groupA11y": "Color theme",
  "theme.system": "Follow the system theme",
  "theme.light": "Light theme",
  "theme.dark": "Dark theme",

  /*
   * Language toggle (language-toggle.tsx, Phase 21) — the segmented
   * chip beside the theme toggle. Option GLYPHS are the locales'
   * endonyms ("EN" / "中文") and live in types.ts LOCALE_OPTIONS;
   * these keys are the toggle's own chrome and the switch toast.
   */
  "language.groupA11y": "Language",
  "language.optionA11y": "Use {locale}",
} as const;

export type LayoutDict = typeof layout;

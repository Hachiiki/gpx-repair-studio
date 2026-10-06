/**
 * The library dictionary (Phase 24 — the training library: cards,
 * records, trends, Riegel predictions). English is the source of
 * truth; every locale mirrors it key for key (the i18n unit gate).
 */

export const library = {
  // -- Tabs ------------------------------------------------------------
  "library.tab.sessions": "Sessions",
  "library.tab.records": "Records",
  "library.tab.trends": "Trends",
  "library.tab.sessionsAria": "Sessions shelf",
  "library.tab.recordsAria": "Personal records",
  "library.tab.trendsAria": "Training trends",

  // -- The library cards (24.1) ----------------------------------------
  "library.card.distance": "Distance",
  "library.card.time": "Moving time",
  "library.card.pace": "Pace",
  "library.card.gain": "Gain",
  "library.card.avgHr": "Avg HR",
  "library.card.planned": "Planned route — not a recording, so it never joins the training library.",
  "library.card.pending": "Indexing…",
  "library.card.failed": "Couldn't re-read this file — its numbers stay off the library.",
  "library.card.repaired": "includes {distance} of drawn-in repair",
  "library.card.activityDate": "Activity date",
  "library.sort.label": "Sort",
  "library.sort.recent": "Most recent",
  "library.sort.oldest": "Oldest first",
  "library.sort.name": "Name",
  "library.sort.distance": "Longest distance",
  "library.sort.duration": "Longest moving time",
  "library.filter.label": "Filter by name",
  "library.filter.placeholder": "Filter sessions…",
  "library.selectAria": "Select {name}",
  "library.selectAll": "Select all",
  "library.selectAllAria": "Select every visible session",
  "library.bulk.count": "{count} selected",
  "library.bulk.delete": "Delete selected",
  "library.bulk.deleteConfirm": "Delete {count} sessions? This cannot be undone.",
  "library.bulk.deleteYes": "Delete",
  "library.bulk.deleteNo": "Keep them",
  "library.bulk.export": "Export selected",
  "library.indexing": "Indexing {count} sessions…",
  "library.csv.button": "Export CSV",
  "library.csv.ready": "Library CSV ready ({count} sessions).",
  "library.csv.empty": "Nothing indexed yet — save a session first.",

  // -- Records (24.2) ----------------------------------------------------
  "records.title": "Personal records",
  "records.desc":
    "Computed on-device from your saved sessions. Farthest, longest, and most gain read recorded data only; best efforts follow the elapsed-time rule.",
  "records.farthest": "Farthest",
  "records.longest": "Longest",
  "records.mostGain": "Most gain",
  "records.none":
    "No indexed sessions yet — save a file-backed session and reopen the library.",
  "records.untimedNote":
    "{count} sessions carry no timestamps and cannot set time records.",
  "records.ladderTitle": "Best efforts",
  "records.colDistance": "Distance",
  "records.colBest": "Best",
  "records.colWhen": "When",
  "records.colSession": "Session",
  "records.effort.interpolated": "interpolated markers",
  "records.effort.rank": "#{rank}",
  "records.rules":
    "Elapsed time — the clock does not stop, so GPS dropouts count. Efforts over reconstructed stretches are excluded: a record set on a drawn-in gap is not a record. Top three lifetime efforts per distance; interpolated markers are flagged.",

  // The ladder's Strava-vocabulary names.
  "records.dist.400m": "400 m",
  "records.dist.1k": "1 km",
  "records.dist.halfmi": "½ mi",
  "records.dist.1mi": "1 mi",
  "records.dist.2mi": "2 mi",
  "records.dist.5k": "5 km",
  "records.dist.10k": "10 km",
  "records.dist.15k": "15 km",
  "records.dist.10mi": "10 mi",
  "records.dist.20k": "20 km",
  "records.dist.hm": "Half marathon",
  "records.dist.30k": "30 km",
  "records.dist.marathon": "Marathon",
  "records.dist.50k": "50 km",

  // -- Riegel predictions (24.5) -----------------------------------------
  "riegel.title": "Race-time predictions",
  "riegel.desc":
    "Opt-in, and honest about what it is: Riegel's classic exponent model over your best efforts, computed locally. No cohort, no upload.",
  "riegel.enable": "Show predictions",
  "riegel.seedLabel": "From your best effort at",
  "riegel.colDistance": "Distance",
  "riegel.colPredicted": "Predicted",
  "riegel.formula": "t₂ = t₁ · (d₂ / d₁)^1.06 — Riegel's exponent model.",
  "riegel.caveat":
    "A curve, not a coach: the formula knows nothing about terrain, weather, or how you trained, and says so. Longer predictions drift further from the seed.",
  "riegel.noSeed": "No best effort to predict from yet.",

  // -- Trends (24.3) ------------------------------------------------------
  "trends.title": "Training trends",
  "trends.desc":
    "Weekly and monthly volume, and the fitness-fatigue line — computed on-device from dated sessions only.",
  "trends.volume.title": "Volume",
  "trends.volume.window": "The {count} most recent {period}, at most {max} shown.",
  "trends.volume.windowOne": "The most recent {period}, at most {max} shown.",
  "trends.noun.week": "week",
  "trends.noun.weeks": "weeks",
  "trends.noun.month": "month",
  "trends.noun.months": "months",
  "trends.granularity.week": "Weekly",
  "trends.granularity.month": "Monthly",
  "trends.metric.distance": "Distance",
  "trends.metric.time": "Time",
  "trends.empty":
    "No dated sessions yet — a session needs timestamps to sit on the calendar.",
  "trends.readout.volume":
    "{label}: {distance}, {time}, {activities} activities",
  "trends.readout.fitness":
    "{date}: fitness {ctl}, fatigue {atl}, form {form}",
  "trends.table.show": "Show the table",
  "trends.table.hide": "Hide the table",
  "trends.table.note":
    "The same series as text — {count} {period} buckets.",
  "trends.col.period": "Period",
  "trends.col.distance": "Distance",
  "trends.col.time": "Moving time",
  "trends.col.activities": "Activities",
  "trends.col.day": "Day",
  "trends.col.ctl": "Fitness",
  "trends.col.atl": "Fatigue",
  "trends.col.form": "Form",
  "trends.fitness.title": "Fitness & fatigue",
  "trends.fitness.desc":
    "The Banister (1975) impulse-response model as Coggan applied it: fitness is a 42-day rolling average of daily moving time, fatigue a 7-day one, form the difference.",
  "trends.fitness.gated":
    "The fitness line needs more history to mean anything — at least {days} days and {sessions} sessions. You have {spanDays} days and {sessionCount}.",
  "trends.fitness.legend.fitness": "Fitness (42-day)",
  "trends.fitness.legend.fatigue": "Fatigue (7-day)",
  "trends.fitness.legend.form": "Form (difference)",
  "trends.fitness.notAdvice": "A volume model, not training advice.",
  "trends.fitness.untimed":
    "{count} sessions carry no timestamps and sit out the model.",
  "trends.fitness.empty":
    "The model starts from zero load at your first activity — it knows nothing before your library does.",
  "trends.aria.volume":
    "Weekly volume bar chart, {count} buckets, distance from {min} to {max}",
  "trends.aria.fitness":
    "Fitness and fatigue lines over {days} days, fitness from 0 to {max}",
  "trends.aria.cursor": " Cursor: {readout}.",
} as const;

export type LibraryDict = typeof library;

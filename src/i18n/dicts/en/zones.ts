/**
 * English dictionary — fitness zones & metrics (Phase 23).
 *
 * Extracted from the Phase 23 components:
 *   - zones-card.tsx        → `zones.*`
 *   - metrics-chart.tsx     → `metrics.*`
 *   - zone-settings.tsx     → `zoneSettings.*`
 *
 * The honesty vocabulary reuses the statistics domain's keys
 * (`stats.noTiming`, `profile.tableNote`, …) wherever the meaning is
 * the same — one wording per fact, the Phase 21 rule.
 */

export const zones = {
  /** ZonesCard (zones-card.tsx). */
  "zones.title": "Zones & metrics",
  "zones.desc":
    "Time in each zone over the route as it would export. The zone shapes mirror the documented Strava set; the boundary numbers are ours and named in place.",
  "zones.tab.hr": "Heart rate",
  "zones.tab.power": "Power",
  "zones.tab.pace": "Pace",
  "zones.tab.cadence": "Cadence",

  /** The honesty reasons (§L-2 applies to zones exactly as to pace). */
  "zones.noMetrics.hr": "No heart rate in this file — zones stay empty rather than guessed.",
  "zones.noMetrics.power": "No power in this file — zones stay empty rather than guessed.",
  "zones.needTiming": "Time in zone needs timestamps — this file has none.",
  "zones.pace.raceUnset":
    "Set a recent race result to open the pace zones — they derive from it.",
  "zones.cadence.noData": "No cadence in this file.",

  /** The zone tables. */
  "zones.colZone": "Zone",
  "zones.colRange": "Range",
  "zones.colTime": "Time",
  "zones.colShare": "Share",
  "zones.range.openFloor": "under {value}",
  "zones.range.between": "{from}–{to}",
  "zones.range.openCeil": "{value} and above",
  "zones.range.paceFaster": "faster than {value}",

  /** Zone names — the documented Strava vocabulary (§RR-3). */
  "zones.name.hr.1": "Endurance",
  "zones.name.hr.2": "Moderate",
  "zones.name.hr.3": "Tempo",
  "zones.name.hr.4": "Threshold",
  "zones.name.hr.5": "Anaerobic",
  "zones.name.power.1": "Recovery",
  "zones.name.power.2": "Endurance",
  "zones.name.power.3": "Tempo",
  "zones.name.power.4": "Threshold",
  "zones.name.power.5": "VO₂ Max",
  "zones.name.power.6": "Anaerobic",
  "zones.name.power.7": "Neuromuscular",
  "zones.name.pace.1": "Recovery",
  "zones.name.pace.2": "Endurance",
  "zones.name.pace.3": "Tempo",
  "zones.name.pace.4": "Threshold",
  "zones.name.pace.5": "VO₂ Max",
  "zones.name.pace.6": "Anaerobic",

  /** The reconciliation + no-data notes. */
  "zones.reconcile":
    "Zones plus no-data time sum to the {time} of moving time on the route.",
  "zones.noDataNote":
    "{time} of that moving time carries no {metric} — reconstructed stretches record none — counted, never guessed into a zone.",
  "zones.metric.hr": "heart rate",
  "zones.metric.power": "power",
  "zones.metric.cadence": "cadence",
  "zones.metric.pace": "usable pace",
  "zones.cadence.desc":
    "Time in fixed 10-unit cadence ranges. A file cannot say rpm from spm, so the ranges stay unit-agnostic.",
  "zones.pace.gapNote":
    "Pace zones bucket by grade-adjusted pace — a hill's effort reads at its flat equivalent.",

  /** GAP (Phase 23.6). */
  "zones.gap.title": "Grade-adjusted pace",
  "zones.gap.value": "GAP {gap} vs {actual} actual",
  "zones.gap.note":
    "Our model: the Minetti grade-energy curve (Strava's is proprietary). Legs without elevation count at the flat cost and are tallied.",
  "zones.gap.noElevation":
    "GAP needs elevation — this file's points carry none, so there is no honest grade to adjust by.",

  /** The opt-in calorie estimate (the Phase 23 amendment). */
  "zones.calories.title": "Energy (estimate)",
  "zones.calories.power":
    "{kcal} kcal — power-based: {watts} W average over {time}, at a 24% human efficiency.",
  "zones.calories.metabolic":
    "{kcal} kcal — running-model estimate: {weight} kg on the Minetti cost curve over {distance}.",
  "zones.calories.note":
    "Opt-in and disclosed: an estimate from named models, never a measurement.",

  /** The per-split zone breakdown. */
  "zones.perSplit.show": "Show per-split zone breakdown",
  "zones.perSplit.hide": "Hide per-split zone breakdown",
  "zones.perSplit.note":
    "Time in zone for every split — the same distance attribution the splits table uses.",
  "zones.perSplit.noData": "no data",

  /** The race presets (the settings picker + the pace tab). */
  "zones.race.1mi": "1 mile",
  "zones.race.5k": "5 km",
  "zones.race.10k": "10 km",
  "zones.race.half": "Half marathon",
  "zones.race.30k": "30 km",
  "zones.race.marathon": "Marathon",

  /** MetricsChart (metrics-chart.tsx). */
  "metrics.title": "Heart rate, cadence & power",
  "metrics.desc":
    "Over distance, drawn over the elevation profile — the display series lightly smoothed (window {window}); holes where the file records nothing.",
  "metrics.series.hr": "Heart rate",
  "metrics.series.cad": "Cadence",
  "metrics.series.power": "Power",
  "metrics.readout.at": "at {distance} — {value} {unit} (elevation {ele})",
  "metrics.readout.noEle": "at {distance} — {value} {unit} (no elevation)",
  "metrics.readout.noValue": "at {distance} — no {metric} recorded",
  "metrics.ariaLabel":
    "{metric} over distance, {min} to {max}, drawn over the elevation profile. Focus this chart and use the arrow keys to read values.{cursor}",
  "metrics.colAvg": "Average",
  "metrics.legend.ele": "Elevation (backdrop)",
  "metrics.legend.metric": "{metric}",
  "metrics.showTable": "Show metric table",
  "metrics.hideTable": "Hide metric table",

  /** ZoneSettings (zone-settings.tsx). */
  "zoneSettings.openButton": "Zones & metrics settings",
  "zoneSettings.note":
    "Everything here is a local setting — nothing uploads, nothing exports.",
  "zoneSettings.hr.title": "Heart-rate zones",
  "zoneSettings.hr.maxLabel": "Max heart rate",
  "zoneSettings.hr.maxHint":
    "Default 190 bpm (the documented fallback); 220 − age is yours to enter. Cap 230. Editing it re-derives the boundaries.",
  "zoneSettings.hr.boundariesLabel": "Zone boundaries (bpm)",
  "zoneSettings.hr.boundariesHint":
    "Floors of zones 2–5, default 60/70/80/90% of max. No overlaps; adjacent zones differ by at least 1.",
  "zoneSettings.power.title": "Power zones",
  "zoneSettings.power.ftpLabel": "FTP",
  "zoneSettings.power.ftpHint":
    "Seven zones derive at Coggan's percentages — 55/75/90/100/120/150% of FTP. Default 200 W, cap 500 W.",
  "zoneSettings.pace.title": "Pace zones",
  "zoneSettings.pace.raceLabel": "Recent race",
  "zoneSettings.pace.raceHint":
    "Six zones derive from one race result — Riegel-normalized to a one-hour pace, our multipliers, bucketed by GAP.",
  "zoneSettings.stop.title": "Stopped-time threshold",
  "zoneSettings.stop.label": "Stop speed",
  "zoneSettings.stop.hint":
    "Time slower than this reads as stopped. Default 0.5 m/s, unchanged until you change it; the card discloses the live value.",
  "zoneSettings.calories.title": "Calorie estimate",
  "zoneSettings.calories.enableLabel": "Show the estimate",
  "zoneSettings.calories.enableHint":
    "Opt-in. Files with power: watts at a 24% human efficiency. Everything else: the running model. Labeled an estimate everywhere it appears.",
  "zoneSettings.calories.weightLabel": "Weight",
  "zoneSettings.calories.weightHint":
    "kg — stored in this browser's settings only, never exported.",
  "zoneSettings.calories.weightNeeded": "Set a weight to open the running-model estimate.",
  "zoneSettings.reset": "Reset to the defaults",
  "zoneSettings.error.out-of-range": "Out of range — check the hint.",
  "zoneSettings.error.not-ascending": "Boundaries must increase.",
  "zoneSettings.error.adjacent-gap": "Adjacent zones differ by less than 1.",

  /** SplitsCard's GAP column (Phase 23.6). */
  "splits.colGap": "GAP",
  "splits.gapTitle":
    "Grade-adjusted pace — flat-equivalent from the Minetti curve, our model",
} as const;

export type ZonesDict = typeof zones;

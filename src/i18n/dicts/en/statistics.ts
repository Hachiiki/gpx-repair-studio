/**
 * English dictionary — stats panel, splits, elevation profile (Phase 21).
 *
 * Extracted from the statistics domain's components:
 *   - stats-panel.tsx, provenance-badge.tsx, time-in-motion-card.tsx,
 *     stats-print-header.tsx        → `stats.*`
 *   - splits-card.tsx               → `splits.*`
 *   - elevation-profile-chart.tsx   → `profile.*`
 *
 * English values are the app's existing copy, moved VERBATIM — the
 * dictionary is the contract every locale checks against. The
 * provenance vocabulary (Recorded / Estimated / Mixed and the lowercase
 * inline variants) is sacred: one set of keys, used everywhere.
 */

export const statistics = {
  /** ProvenanceBadge (provenance-badge.tsx) — the §L-2 vocabulary. */
  "stats.provenance.recorded": "Recorded",
  "stats.provenance.estimated": "Estimated",
  "stats.provenance.mixed": "Mixed",
  /** The lowercase inline variants (split bar titles, chart readouts). */
  "stats.provenanceWord.recorded": "recorded",
  "stats.provenanceWord.estimated": "estimated",
  "stats.provenanceWord.mixed": "mixed",

  /** StatsPanel (stats-panel.tsx). */
  "stats.title": "Statistics",
  "stats.desc.working":
    "Recomputed from the working copy — confirmed fixes included, the original file untouched.",
  "stats.desc.repairs":
    "Original recording plus committed repairs — every estimated value is labeled with its source.",
  "stats.desc.original": "Original recording only — repairs are not included yet.",
  "stats.statsCsv": "Stats CSV",
  "stats.print": "Print",

  /** The working-copy disclosure (§EE 13.2). */
  "stats.working.label": "Modified:",
  "stats.working.pointsRemoved.one": "{count} point removed",
  "stats.working.pointsRemoved.many": "{count} points removed",
  "stats.working.segmentsSplit.one": "{count} segment split",
  "stats.working.segmentsSplit.many": "{count} segments split",
  "stats.working.copiesInserted.one": "{count} copy inserted",
  "stats.working.copiesInserted.many": "{count} copies inserted",
  "stats.working.manualReorders.one": "{count} manual reorder",
  "stats.working.manualReorders.many": "{count} manual reorders",
  "stats.working.segmentsSorted.one": "{count} segment sorted by time",
  "stats.working.segmentsSorted.many": "{count} segments sorted by time",
  "stats.working.elevationsSmoothed.one": "{count} elevation smoothed",
  "stats.working.elevationsSmoothed.many": "{count} elevations smoothed",
  "stats.working.suffix":
    "the numbers here reflect the working copy, not the raw file.",

  /** The outcome banner (user pass 35). */
  "stats.outcome.original": "Original",
  "stats.outcome.repaired": "+ Repaired",
  "stats.outcome.outcome": "Outcome",
  "stats.outcome.moving": "{duration} moving",
  "stats.outcome.durationPending": "duration pending",
  "stats.outcome.estTime": "+{duration} (est.)",

  /** The stats table's scaffolding. */
  "stats.metric": "Metric",
  "stats.value": "Value",
  "stats.source": "Source",
  "stats.group.distance": "Distance",
  "stats.group.time": "Time",
  "stats.group.pace": "Pace",
  "stats.group.elevation": "Elevation",

  /** Row labels — distance. */
  "stats.recordedDistance": "Recorded distance",
  "stats.repairedDistance": "Repaired distance",
  "stats.totalWithRepairs": "Total with repairs",
  "stats.totalDistance": "Total distance",

  /** Row labels — time. */
  "stats.recordedMovingTime": "Recorded moving time",
  "stats.wallTime": "Wall time",
  "stats.repairTime": "Repair time",
  "stats.movingInclRepairs": "Moving time incl. repairs",
  "stats.totalDurationEntered": "Total duration (entered)",

  /** The unsupported-statistic em dash's reasons. */
  "stats.noTiming": "No timing data in this file",
  "stats.notMonotonic": "Timestamps are not monotonic",
  "stats.needDurations": "Repairs still need durations",
  "stats.enterDuration": "Enter a total duration",
  "stats.noRecordedEle": "No recorded elevation in this file",
  "stats.insufficientEle":
    "Insufficient elevation data — only {percent}% of points carry elevation",

  /** The §L-1 pace rows. */
  "stats.paceRecorded": "Pace (recorded)",
  "stats.paceRepairs": "Pace (repairs)",
  "stats.paceOverall": "Overall pace",
  "stats.notComputableTitle": "Not computable",
  "stats.notComputable": "not computable",

  /** The §L-1 elevation rows. */
  "stats.eleGainLoss": "Elevation gain / loss",
  "stats.eleGainRecorded": "Elevation gain (recorded)",
  "stats.eleGainRepairs": "Elevation gain (repairs)",
  "stats.eleGainTotal": "Elevation gain (total)",
  "stats.eleLossRecorded": "Elevation loss (recorded)",
  "stats.eleLossRepairs": "Elevation loss (repairs)",
  "stats.eleLossTotal": "Elevation loss (total)",
  "stats.eleGain": "Elevation gain",
  "stats.eleLoss": "Elevation loss",

  /** The notes under the table. */
  "stats.note.insufficient":
    "Insufficient elevation data — only {percent}% of points carry elevation, so gain and loss are withheld rather than estimated.",
  "stats.note.thresholdRepairs":
    "Gain/loss use a {threshold} m noise threshold (changes smaller than that are treated as GPS/DEM noise); repaired stretches are estimated from {sources} terrain.",
  "stats.note.thresholdOriginal":
    "Gain/loss use a {threshold} m noise threshold (changes smaller than that are treated as GPS/DEM noise); original elevation only — repairs without an estimate contribute nothing.",
  "stats.note.eleService": "the elevation service",
  "stats.note.repairsWithoutEle.one":
    "{count} repair without an elevation estimate — open the repair and use “Estimate elevation” to include it.",
  "stats.note.repairsWithoutEle.many":
    "{count} repairs without an elevation estimate — open the repair and use “Estimate elevation” to include it.",
  "stats.note.reimport":
    "{count} points in this file were reconstructed by a previous repair — they count as repaired distance, not recorded, and the map draws them as repairs.",
  "stats.note.noTiming":
    "No timing data in this file — time and pace statistics are unavailable unless a duration is entered (per repair, or a total for the whole activity).",
  "stats.note.repairDuration.one":
    "{count} repair still needs a duration — its time is not counted yet (open the repair's editor to add one).",
  "stats.note.repairDuration.many":
    "{count} repairs still need a duration — its time is not counted yet (open the repair's editor to add one).",
  "stats.note.discrepancy.one":
    "{count} manual duration disagrees with the recorded gap span — timestamps follow the manual value; recorded timestamps are never changed.",
  "stats.note.discrepancy.many":
    "{count} manual durations disagree with the recorded gap span — timestamps follow the manual value; recorded timestamps are never changed.",
  "stats.note.gapSpan.one":
    "Wall time includes {duration} across {count} gap span (excluded from moving time).",
  "stats.note.gapSpan.many":
    "Wall time includes {duration} across {count} gap spans (excluded from moving time).",
  "stats.note.reversedLegs.one":
    "{count} reversed timestamp leg — counted as zero duration.",
  "stats.note.reversedLegs.many":
    "{count} reversed timestamp legs — counted as zero duration.",
  "stats.note.untimedLegs.one":
    "{count} leg without usable timestamps — excluded from moving time.",
  "stats.note.untimedLegs.many":
    "{count} legs without usable timestamps — excluded from moving time.",
  "stats.note.excludedLegs.one":
    "{count} distance leg excluded — damaged coordinates (invalid: {invalid}, out-of-range: {outOfRange}, zero-coordinate: {zero}).",
  "stats.note.excludedLegs.many":
    "{count} distance legs excluded — damaged coordinates (invalid: {invalid}, out-of-range: {outOfRange}, zero-coordinate: {zero}).",

  /** The per-split honesty flags (splits card + time-in-motion card). */
  "stats.flags.gapLeg.one": "{count} gap leg",
  "stats.flags.gapLeg.many": "{count} gap legs",
  "stats.flags.untimedLeg.one": "{count} untimed leg",
  "stats.flags.untimedLeg.many": "{count} untimed legs",
  "stats.flags.reversedLeg.one": "{count} reversed leg",
  "stats.flags.reversedLeg.many": "{count} reversed legs",

  /** TimeInMotionCard (time-in-motion-card.tsx). */
  "stats.motion.title": "Time in motion",
  "stats.motion.desc":
    "A stop is time with an implied speed under {speed} m/s — recorded gaps are excluded (the device stopped writing, not necessarily moving). Computed on the route as it would export.",
  "stats.motion.inMotion": "In motion",
  "stats.motion.inMotionOf": "of {wall} wall time",
  "stats.motion.stopped": "Stopped",
  "stats.motion.stopsSummary.one": "{count} stop · longest {longest}",
  "stats.motion.stopsSummary.many": "{count} stops · longest {longest}",
  "stats.motion.noStops": "no stops detected",
  "stats.motion.colTimeBucket": "Time bucket",
  "stats.motion.movingTime": "Moving time",
  "stats.motion.excludesGap.one": "excludes {count} gap leg ({gapTime})",
  "stats.motion.excludesGap.many": "excludes {count} gap legs ({gapTime})",
  "stats.motion.stoppedTime": "Stopped time",
  "stats.motion.bookkeepingTail": "— counted, never guessed into the buckets above.",
  "stats.motion.hideStops": "Hide stop list",
  "stats.motion.listStops.one": "List {count} stop",
  "stats.motion.listStops.many": "List {count} stops",
  "stats.motion.colIndex": "#",
  "stats.motion.colStarted": "Started",
  "stats.motion.colAt": "At",
  "stats.motion.colDuration": "Duration",

  /** StatsPrintHeader (stats-print-header.tsx); the wordmark stays. */
  "stats.print.sheet": "Activity statistics sheet",
  "stats.print.privacyLine":
    "Computed locally in the browser — no data left this device.",

  /** SplitsCard (splits-card.tsx). */
  "splits.title": "Splits & pace",
  "splits.kilometer": "kilometer",
  "splits.mile": "mile",
  "splits.desc":
    "Every {unit} of the route as it would export — working copy plus committed repairs. Splits crossing reconstructed stretches are flagged; the unit follows the pace toggle above.",
  "splits.ariaPaceChart":
    "Average pace per {unit} — slower splits draw taller bars; signal-orange bars include reconstructed (estimated) stretches.",
  "splits.noTiming":
    "No timing data in this file — the splits below show distance and elevation only.",
  "splits.hideTable": "Hide split table",
  "splits.showTable": "Show split table",
  "splits.capNote":
    "Showing {shown} of {total} splits — the stats CSV carries every one.",
  "splits.colSplit": "Split",
  "splits.colDistance": "Distance",
  "splits.colTime": "Time",
  "splits.colAvgPace": "Avg pace",
  "splits.colGain": "Gain",
  "splits.partialTimeTitle":
    "Partial time — these legs contributed distance but no time",
  "splits.est": "est",
  "splits.showMore": "Show {count} more splits",
  "splits.total": "Total",
  "splits.totalRow.one":
    "{count} split of 1 {unit} — gains use the {threshold} m hysteresis deadband, attributed where each climb completes.",
  "splits.totalRow.many":
    "{count} splits of 1 {unit} — gains use the {threshold} m hysteresis deadband, attributed where each climb completes.",
  "splits.denseNote": "{count} bars — hover readouts off at this density",
  "splits.barTitle": "Split {index} — {pace} ({provenance})",
  "splits.barNoTime": "no time",

  /** ElevationProfileChart (elevation-profile-chart.tsx). */
  "profile.title": "Elevation profile",
  "profile.desc":
    "{min} to {max} over {distance} — recorded stretches solid, reconstructed stretches estimated.",
  "profile.readoutHint": "hover, or focus + arrow keys, to read values",
  "profile.readout.noEle": "at {distance} — no elevation recorded",
  "profile.readout.at": "at {distance} — {elevation} ({kind})",
  "profile.kindRecorded": "recorded",
  "profile.kindReconstructed": "reconstructed, estimated",
  "profile.ariaLabel":
    "Elevation profile from {min} to {max} over {distance}{gainLoss}. Reconstructed stretches are estimated. Focus this chart and use the arrow keys to read values.{cursor}",
  "profile.ariaCursor": "Cursor: {readout}",
  "profile.legendReconstructed": "Reconstructed (estimated)",
  "profile.hideTable": "Hide profile table",
  "profile.showTable": "Show profile table",
  "profile.tableNote":
    "The same display series the chart draws (lightly smoothed for reading) — {count} distance intervals.",
  "profile.colInterval": "Distance interval",
  "profile.colStart": "Start",
  "profile.colEnd": "End",
  "profile.colMin": "Min",
  "profile.colMax": "Max",
} as const;

export type StatisticsDict = typeof statistics;

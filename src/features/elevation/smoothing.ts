/**
 * Elevation smoothing — display smoothing + noise-robust gain/loss
 * (docs/MASTER_PLAN.md §K-2, Phase 6).
 *
 * Two independent routines:
 *
 *   - `movingAverage` — a light window-5 smoother applied to the
 *     PROFILE CHART ONLY (§K-2: "a light moving average is applied for
 *     profile display only"). It never touches stored samples, exported
 *     `<ele>` values, or statistics.
 *
 *   - `hysteresisGainLoss` — the classic deadband integrator used for
 *     gain/loss on BOTH original and reconstructed elevation (§L-1):
 *     accumulate a change only when the net excursion from the last
 *     committed elevation exceeds the threshold (default 2.0 m — SRTM
 *     30 m noise is well under it, GPS barometer drift is not).
 *     Sub-threshold wandering contributes exactly zero, which is the
 *     property that makes gain/loss honest on noisy recordings.
 *
 * Phase 6 — Elevation. Pure TypeScript.
 */

/** Default hysteresis threshold, meters (§K-2; configurable in tests). */
export const DEFAULT_HYSTERESIS_THRESHOLD_M = 2.0;

/** Default display-smoothing window, in points (§K-2: "window ≈ 5"). */
export const DEFAULT_PROFILE_SMOOTHING_WINDOW = 5;

/**
 * Moving average over a sparse series (undefined entries are holes, not
 * zeros). Each output averages the defined values inside a centered
 * window of the ORIGINAL series; undefined stays undefined. With no
 * defined neighbor the point is a hole. The window is clamped to the
 * series length; window <= 1 (or "off") is the identity.
 */
export function movingAverage(
  values: readonly (number | undefined)[],
  window: number = DEFAULT_PROFILE_SMOOTHING_WINDOW,
): (number | undefined)[] {
  if (window <= 1 || values.length === 0) return [...values];
  const half = Math.floor(window / 2);
  const out: (number | undefined)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === undefined) {
      out.push(undefined);
      continue;
    }
    let sum = 0;
    let count = 0;
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    for (let j = from; j <= to; j += 1) {
      const value = values[j];
      if (value !== undefined) {
        sum += value;
        count += 1;
      }
    }
    out.push(count > 0 ? sum / count : undefined);
  }
  return out;
}

/**
 * Hysteresis gain/loss — deadband integrator (§K-2/§L-1).
 *
 * Walk the (dense) elevation series; keep a `reference` = the elevation
 * of the last committed point. A step is committed only when the net
 * change from `reference` reaches ±threshold, adding the FULL net change
 * to gain/loss and moving `reference`. Anything smaller is treated as
 * noise and contributes nothing. Undefined entries are skipped (they
 * are missing data, not flat terrain); the integrator continues from the
 * last defined reference across the hole — the honest reading of a gap
 * in the profile.
 */
export function hysteresisGainLoss(
  elevations: readonly (number | undefined)[],
  thresholdM: number = DEFAULT_HYSTERESIS_THRESHOLD_M,
): { gainM: number; lossM: number } {
  let gainM = 0;
  let lossM = 0;
  let reference: number | null = null;
  for (const value of elevations) {
    if (value === undefined || !Number.isFinite(value)) continue;
    if (reference === null) {
      reference = value;
      continue;
    }
    const delta = value - reference;
    if (delta >= thresholdM) {
      gainM += delta;
      reference = value;
    } else if (delta <= -thresholdM) {
      lossM += -delta;
      reference = value;
    }
    // |delta| < threshold: noise band — neither committed nor forgotten;
    // the excursion keeps accumulating against the same reference.
  }
  return { gainM, lossM };
}

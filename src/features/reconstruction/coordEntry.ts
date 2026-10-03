/**
 * Coordinate entry validation (docs/MASTER_PLAN.md §EE 16.2/16.3) —
 * the sanity gate every typed lat/lng passes on its way into a drawn
 * line.
 *
 * The honesty rules (the same voice as the rest of the app):
 *   - **grammar** — decimal degrees only (`52.5206`, `-13.4055`).
 *     Anything else — degrees/minutes/seconds, scientific notation,
 *     trailing units, empty text — is refused with an error that says
 *     what was expected, never a silent guess.
 *   - **bounds** — latitude belongs to [-90, 90], longitude to
 *     [-180, 180]; the error names the bound it broke.
 *   - **precision** — more than 7 decimals is ROUNDED to 7 (about a
 *     centimeter — the export precision) and the caller is told, so
 *     the form can disclose the rounding instead of hiding it.
 *
 * Phase 16 — Track surgery & input freedom. Pure TypeScript.
 */

/** A coordinate that passed every check. */
export interface CoordParseOk {
  ok: true;
  /** The parsed (possibly rounded) value. */
  value: number;
  /** True when >7 decimals were rounded to 7. */
  rounded: boolean;
}

/** A coordinate that failed — the honest error, ready to render. */
export interface CoordParseError {
  ok: false;
  error: string;
}

export type CoordParseResult = CoordParseOk | CoordParseError;

/** The decimal-degrees grammar (no exponent, no separators, no units). */
const DECIMAL_PATTERN = /^[+-]?\d+(\.\d+)?$/;

/** Export precision — ~1 cm; more decimals are rounded, disclosed. */
export const MAX_COORD_DECIMALS = 7;

function parseDecimal(
  text: string,
  bound: number,
  axis: "latitude" | "longitude",
): CoordParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Enter a number — decimal degrees, e.g. 52.5206." };
  }
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error:
        "Decimal degrees only — digits with an optional sign and decimal point " +
        "(e.g. 52.5206 or -13.4055). Convert minutes/seconds before typing.",
    };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    // Unreachable for the grammar, but the guard keeps the contract.
    return { ok: false, error: "That number is not finite." };
  }
  if (Math.abs(value) > bound) {
    return {
      ok: false,
      error: `${axis === "latitude" ? "Latitude" : "Longitude"} must be between -${bound} and ${bound} — you entered ${trimmed}.`,
    };
  }
  const dot = trimmed.indexOf(".");
  const decimals = dot === -1 ? 0 : trimmed.length - dot - 1;
  if (decimals > MAX_COORD_DECIMALS) {
    const rounded = Number(value.toFixed(MAX_COORD_DECIMALS));
    return { ok: true, value: rounded, rounded: true };
  }
  return { ok: true, value, rounded: false };
}

/** Parse and sanity-check a typed latitude (decimal degrees). */
export function parseLatitude(text: string): CoordParseResult {
  return parseDecimal(text, 90, "latitude");
}

/** Parse and sanity-check a typed longitude (decimal degrees). */
export function parseLongitude(text: string): CoordParseResult {
  return parseDecimal(text, 180, "longitude");
}

/**
 * Would nudging from `lat` by `dLat` stay inside the bounds? Pure
 * predicate for the nudge handlers (each keypress is checked, so a
 * long run of arrow keys can never walk a point off the world).
 */
export function nudgeInBounds(lat: number, lon: number, dLat: number, dLon: number): boolean {
  const nextLat = lat + dLat;
  const nextLon = lon + dLon;
  return (
    Number.isFinite(nextLat) &&
    Number.isFinite(nextLon) &&
    Math.abs(nextLat) <= 90 &&
    Math.abs(nextLon) <= 180
  );
}

/**
 * Meters → degrees for nudging. The local approximation: one degree
 * of latitude is ~111,320 m everywhere; longitude shrinks with the
 * cosine of the latitude. Good to well under a meter of the geodesic
 * truth at nudge scales (1–1000 m).
 */
export const METERS_PER_DEGREE_LATITUDE = 111_320;

/** The nudge step choices the draw panel offers (meters). */
export const NUDGE_STEP_CHOICES = [1, 10, 100] as const;

export type NudgeStepM = (typeof NUDGE_STEP_CHOICES)[number];

/** Convert a nudge (meters, +north/+east) to a degree delta at `lat`. */
export function nudgeDelta(
  lat: number,
  stepM: number,
  dNorth: number,
  dEast: number,
): { dLat: number; dLon: number } {
  const dLat = (stepM * dNorth) / METERS_PER_DEGREE_LATITUDE;
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 1e-9);
  const dLon = (stepM * dEast) / (METERS_PER_DEGREE_LATITUDE * cos);
  return { dLat, dLon };
}

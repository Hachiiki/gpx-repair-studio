/**
 * Deep freeze — dev/test-build immutability assertion
 * (docs/MASTER_PLAN.md §C-4: "original data structurally immutable
 * (deep-frozen at parse boundary in dev builds)").
 *
 * Used at both model boundaries: after `parseGpx` produces the original
 * model, and after `validateGpx` produces the flag-enriched copy. In
 * production builds the readonly types carry the guarantee instead —
 * freezing a 100 000-point model has a real (if small) cost, so it is
 * reserved for environments where it catches bugs.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript; no imports, no side effects
 * beyond freezing the given value.
 */

/** Recursively freeze a plain object graph (arrays included). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

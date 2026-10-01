/**
 * APP_VERSION — the single source of the version string shown in the
 * About pane (Phase 11). Kept in step with package.json by a test
 * (tests/info-content.test.tsx reads package.json and asserts
 * equality), so a release bump that forgets the About pane fails the
 * suite instead of shipping a stale version.
 */

export const APP_VERSION = "1.0.0";

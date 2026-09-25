/**
 * The shell's horizontal measure (AppShell reorganization pass).
 *
 * One authoritative definition of the page gutters and maximum content
 * width, shared by the header, the main column, and the footer — the
 * same measure composed three times is three copies waiting to drift
 * apart (misaligned gutters between header and content are a classic
 * regression), so it is defined once per the "one implementation per
 * concept" rule. Compose with element-specific utilities via `cn`.
 *
 * Class string, not a component: the three call sites are different
 * elements (header bar / main landmark / footer strip) that only share
 * the measure; Tailwind v4's automatic source detection picks the
 * classes out of this literal.
 */

export const SHELL_CONTAINER = "mx-auto w-full max-w-[92rem] px-4 sm:px-6";

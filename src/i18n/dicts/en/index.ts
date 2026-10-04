/**
 * The English source dictionary (Phase 21 — §EE 21.1).
 *
 * Domain files merge into ONE flat map; keys are dot-namespaced by
 * domain so collisions are structurally impossible when the namespace
 * discipline holds (the i18n unit gate also walks every domain file
 * for cross-file duplicate keys — a spread merge would otherwise
 * drop a duplicate silently).
 *
 * `MessageKey` is THE compile-time universe: t() calls in components
 * autocomplete and type-check against it, and every locale file
 * `satisfies Record<MessageKey, string>` — a missing translation is
 * a TYPE error before it is a test failure.
 */

import { common } from "./common";
import { layout } from "./layout";
import { toolpages } from "./toolpages";
import { repair } from "./repair";
import { commands } from "./commands";
import { reconstruction } from "./reconstruction";
import { recovery } from "./recovery";
import { create } from "./create";
import { merge } from "./merge";
import { plan } from "./plan";
import { statistics } from "./statistics";
import { compare } from "./compare";
import { batch } from "./batch";
import { share } from "./share";
import { map } from "./map";
import { shared } from "./shared";
import { help } from "./help";
import { tours } from "./tours";
import { shell } from "./shell";
import { hooks } from "./hooks";

/**
 * Every domain dictionary, in merge order. Exported for the i18n
 * unit gate (duplicate-key detection across files).
 */
export const enDomainDicts = [
  common,
  layout,
  toolpages,
  repair,
  commands,
  reconstruction,
  recovery,
  create,
  merge,
  plan,
  statistics,
  compare,
  batch,
  share,
  map,
  shared,
  help,
  tours,
  shell,
  hooks,
] as const;

/** The merged English dictionary — the source of truth. */
export const en: Record<string, string> = Object.assign(
  {},
  ...enDomainDicts,
);

/** Union distributer: keys of a union of dict types. */
type KeysOf<T> = T extends unknown ? keyof T : never;

/** Every key the app may translate (compile-time union). */
export type MessageKey = KeysOf<(typeof enDomainDicts)[number]>;

/**
 * Message files under `intelligo sync`: the registry's keys an app's
 * copy lacks, the merge that keeps the app's values, and the other
 * locales checked against the app's English copy.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Dotted paths of every leaf in `registry` that `app` lacks. */
export function missingMessageKeys(
  registry: Json,
  app: Json,
  prefix = ""
): string[] {
  return Object.entries(registry).flatMap(([key, value]) => {
    const at = prefix ? `${prefix}.${key}` : key;
    if (!(key in app)) return [at];
    const mine = app[key];
    return isObject(value) && isObject(mine)
      ? missingMessageKeys(value, mine, at)
      : [];
  });
}

/**
 * The registry's messages with the app's copy laid over them: every key
 * the registry has is present, every value the app set wins, and keys
 * only the app has (its own nav entries, product copy) are kept.
 */
export function mergeMessages(registry: Json, app: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(registry)) {
    const mine = app[key];
    out[key] =
      key in app
        ? isObject(value) && isObject(mine)
          ? mergeMessages(value, mine)
          : mine
        : value;
  }
  for (const [key, value] of Object.entries(app)) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

export const isMessages = (target: string) =>
  target.startsWith("messages/") && target.endsWith(".json");

/** The locale the registry ships messages in. */
const SOURCE_LOCALE = "en";

/**
 * The app's locales, from `locales: [...]` in i18n/routing.ts — the
 * source locale alone when there is no such file or list.
 */
export function appLocales(appRoot: string): string[] {
  const file = path.join(appRoot, "i18n", "routing.ts");
  if (!existsSync(file)) return [SOURCE_LOCALE];
  const list = /\blocales\s*:\s*\[([^\]]*)\]/.exec(readFileSync(file, "utf8"));
  const locales = [...(list?.[1] ?? "").matchAll(/["'`]([^"'`]+)["'`]/g)].map(
    (m) => m[1]!
  );
  return locales.length > 0 ? locales : [SOURCE_LOCALE];
}

export type LocaleEntry = {
  item: string;
  path: string;
  state: "current" | "locale-behind";
  missingKeys?: string[];
};

/**
 * Every other locale's copy of the namespaces the registry ships,
 * against the app's English file on disk — the merged copy, product
 * keys included, which is what the other locales translate. A missing
 * file lacks every key.
 */
export function localeEntries(
  appRoot: string,
  files: readonly { item: string; target: string }[]
): LocaleEntry[] {
  const others = appLocales(appRoot).filter((l) => l !== SOURCE_LOCALE);
  if (others.length === 0) return [];
  const prefix = `messages/${SOURCE_LOCALE}/`;
  const entries: LocaleEntry[] = [];
  for (const { item, target } of files) {
    if (!target.startsWith(prefix) || !target.endsWith(".json")) continue;
    const english = path.join(appRoot, target);
    if (!existsSync(english)) continue;
    const source = JSON.parse(readFileSync(english, "utf8")) as Json;
    for (const locale of others) {
      const rel = `messages/${locale}/${target.slice(prefix.length)}`;
      const abs = path.join(appRoot, rel);
      const missingKeys = missingMessageKeys(
        source,
        existsSync(abs) ? (JSON.parse(readFileSync(abs, "utf8")) as Json) : {}
      );
      entries.push(
        missingKeys.length > 0
          ? { item, path: rel, state: "locale-behind", missingKeys }
          : { item, path: rel, state: "current" }
      );
    }
  }
  return entries;
}

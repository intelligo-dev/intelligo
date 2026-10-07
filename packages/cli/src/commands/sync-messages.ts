/**
 * Message files under `intelligo sync`: the registry's keys an app's
 * copy lacks, the merge that keeps the app's values, and the other
 * locales checked against the app's English copy.
 *
 * A sync records a short hash of every value the registry shipped
 * (`registry.messages` in the manifest). Against it a key is either
 * untouched — still the shipped text, so a new release's text replaces
 * it and a key the registry dropped goes — or the app's own wording,
 * which is kept and reported when the registry's changed under it.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Dotted key → a short hash of the value the registry shipped. */
export type MessageHashes = Record<string, string>;

const valueHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

/** A hash of every leaf, by dotted key, for the manifest. */
export function messageHashes(messages: Json, prefix = ""): MessageHashes {
  const out: MessageHashes = {};
  for (const [key, value] of Object.entries(messages)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) Object.assign(out, messageHashes(value, at));
    else out[at] = valueHash(value);
  }
  return out;
}

/**
 * Whether the app's value at `at` is still what the registry shipped
 * last time. Without a record, nothing is known to be untouched.
 */
const untouched = (value: unknown, at: string, shipped?: MessageHashes) =>
  shipped?.[at] !== undefined && shipped[at] === valueHash(value);

/**
 * The registry's messages with the app's copy laid over them: every key
 * the registry has is present, every value the app wrote wins, and keys
 * only the app has (its own nav entries, product copy) are kept. With
 * `shipped`, what the registry shipped last time, a value the app never
 * changed takes the registry's new text, and a key the registry dropped
 * goes unless the app changed it.
 */
export function mergeMessages(
  registry: Json,
  app: Json,
  shipped?: MessageHashes,
  prefix = ""
): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(registry)) {
    const at = prefix ? `${prefix}.${key}` : key;
    const mine = app[key];
    if (!(key in app)) out[key] = value;
    else if (isObject(value) && isObject(mine))
      out[key] = mergeMessages(value, mine, shipped, at);
    else out[key] = untouched(mine, at, shipped) ? value : mine;
  }
  for (const [key, value] of Object.entries(app)) {
    if (key in out) continue;
    const at = prefix ? `${prefix}.${key}` : key;
    const kept = isObject(value) ? dropUntouched(value, at, shipped) : value;
    if (
      isObject(value)
        ? Object.keys(kept as Json).length > 0
        : !untouched(value, at, shipped)
    )
      out[key] = kept;
  }
  return out;
}

/** An app-only subtree without the leaves the registry shipped and dropped. */
function dropUntouched(
  app: Json,
  prefix: string,
  shipped?: MessageHashes
): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(app)) {
    const at = `${prefix}.${key}`;
    if (isObject(value)) {
      const kept = dropUntouched(value, at, shipped);
      if (Object.keys(kept).length > 0) out[key] = kept;
    } else if (!untouched(value, at, shipped)) {
      out[key] = value;
    }
  }
  return out;
}

/** ICU argument names a message uses: `{name}`, `{count, plural, …}`. */
export function messageArguments(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/\{\s*([A-Za-z_][\w]*)\s*[,}]/g)].map((m) => m[1]!)
  );
}

export type MessageDrift = {
  /** Keys the registry has and the app's copy lacks; sync adds them. */
  missing: string[];
  /** Untouched values the registry rewrote, or dropped; sync updates them. */
  stale: string[];
  /** The app's own wording of a key whose registry text changed, or went. */
  changed: string[];
  /** The app's wording uses an argument the registry's no longer passes. */
  arguments: string[];
};

/** How an app's message file stands against the registry's. */
export function messageDrift(
  registry: Json,
  app: Json,
  shipped?: MessageHashes
): MessageDrift {
  const drift: MessageDrift = {
    missing: missingMessageKeys(registry, app),
    stale: [],
    changed: [],
    arguments: [],
  };
  const now = messageHashes(registry);
  const mine = leaves(app);
  const theirs = leaves(registry);
  for (const [at, value] of mine) {
    const shippedHash = shipped?.[at];
    const registryValue = theirs.get(at);
    if (registryValue === undefined) {
      if (shippedHash === undefined) continue; // the app's own key
      (untouched(value, at, shipped) ? drift.stale : drift.changed).push(at);
      continue;
    }
    if (shippedHash !== undefined && now[at] !== shippedHash) {
      if (untouched(value, at, shipped)) {
        drift.stale.push(at);
        continue;
      }
      drift.changed.push(at);
    }
    if (typeof value === "string" && typeof registryValue === "string") {
      const passed = messageArguments(registryValue);
      if ([...messageArguments(value)].some((name) => !passed.has(name))) {
        drift.arguments.push(at);
      }
    }
  }
  return drift;
}

function leaves(messages: Json, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(messages)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) for (const e of leaves(value, at)) out.set(...e);
    else out.set(at, value);
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

/** A shipped message file's state, most urgent first. */
export function messageEntry(
  item: string,
  target: string,
  registry: Json,
  app: Json,
  shipped?: MessageHashes
): {
  item: string;
  path: string;
  state:
    "current" | "messages-behind" | "messages-changed" | "messages-arguments";
  missingKeys?: string[];
} {
  const drift = messageDrift(registry, app, shipped);
  const at = { item, path: target };
  if (drift.arguments.length > 0) {
    return { ...at, state: "messages-arguments", missingKeys: drift.arguments };
  }
  const behind = [...drift.missing, ...drift.stale];
  if (behind.length > 0) {
    return { ...at, state: "messages-behind", missingKeys: behind };
  }
  if (drift.changed.length > 0) {
    return { ...at, state: "messages-changed", missingKeys: drift.changed };
  }
  return { ...at, state: "current" };
}

/** Put the kept seams back, and merge kept messages over the registry's. */
export function restoreKept(
  appRoot: string,
  kept: ReadonlyMap<string, string>,
  shipped: ReadonlyMap<string, string>,
  shippedBefore: Record<string, MessageHashes>
): void {
  for (const [target, content] of kept) {
    const abs = path.join(appRoot, target);
    mkdirSync(path.dirname(abs), { recursive: true });
    if (isMessages(target) && shipped.has(target)) {
      const merged = mergeMessages(
        JSON.parse(shipped.get(target)!) as Json,
        JSON.parse(content) as Json,
        shippedBefore[target]
      );
      writeFileSync(abs, `${JSON.stringify(merged, null, 2)}\n`);
    } else {
      writeFileSync(abs, content);
    }
  }
}

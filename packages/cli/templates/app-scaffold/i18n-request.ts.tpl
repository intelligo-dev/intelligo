import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { getRequestConfig } from "next-intl/server";

import {
  getRequestHeaders,
  resolveTimeZone,
} from "@intelligo-dev/core/request-context";

import { routing } from "./routing";

/**
 * The reader's own time zone, from the cookie the app shell writes.
 *
 * Every date and time on the page formats against this, so a reader in
 * +08:00 sees the day they actually had rather than UTC's. Anything the
 * runtime does not recognise — and a first request, which has no cookie
 * yet — falls back to UTC.
 */
async function requestTimeZone(): Promise<string> {
  try {
    const cookie = (await getRequestHeaders()).get("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)tz=([^;]*)/);
    return resolveTimeZone(match?.[1] ? decodeURIComponent(match[1]) : null);
  } catch {
    // No request context bound (a build-time render, a script).
    return "UTC";
  }
}

const MESSAGES_ROOT = path.join(process.cwd(), "messages");

/**
 * Registry items ship one message file per item —
 * `messages/<locale>/<item>.json` — instead of one giant per-locale
 * file. The file name (minus `.json`) becomes the namespace a
 * component reads with `useTranslations("<item>")`, so installing an
 * item is just dropping its message file in; nothing here needs to
 * change and no component is edited.
 */
function readLocale(locale: string): Record<string, unknown> {
  const localeDir = path.join(MESSAGES_ROOT, locale);

  let files: string[];
  try {
    files = readdirSync(localeDir).filter((file) => file.endsWith(".json"));
  } catch {
    return {};
  }

  return files.reduce<Record<string, unknown>>((messages, file) => {
    const namespace = path.basename(file, ".json");
    messages[namespace] = JSON.parse(
      readFileSync(path.join(localeDir, file), "utf8")
    );
    return messages;
  }, {});
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeMessages(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const under = merged[key];
    merged[key] =
      isObject(under) && isObject(value) ? mergeMessages(under, value) : value;
  }
  return merged;
}

/** The language registry items ship their messages in. */
const SOURCE_LOCALE = "en";

/**
 * A locale's messages over the default locale's, over English: a key the
 * locale has not translated yet renders in the default language, and one
 * a new registry release added — which arrives in English only — renders
 * in English, instead of throwing. `intelligo sync --check` lists what is
 * still untranslated.
 */
function loadMessages(locale: string): Record<string, unknown> {
  const chain = [...new Set([SOURCE_LOCALE, routing.defaultLocale, locale])];
  return chain.reduce<Record<string, unknown>>(
    (messages, next) => mergeMessages(messages, readLocale(next)),
    {}
  );
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (
    !locale ||
    !routing.locales.includes(locale as (typeof routing.locales)[number])
  ) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: loadMessages(locale),
    timeZone: await requestTimeZone(),
  };
});

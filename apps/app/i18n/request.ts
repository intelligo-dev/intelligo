import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

const MESSAGES_ROOT = path.join(process.cwd(), "messages");

/**
 * Registry items ship one message file per item —
 * `messages/<locale>/<item>.json` — instead of one giant per-locale
 * file. The file name (minus `.json`) becomes the namespace a
 * component reads with `useTranslations("<item>")`, so installing an
 * item is just dropping its message file in; nothing here needs to
 * change and no component is edited (ADR-0010).
 */
function loadMessages(locale: string): Record<string, unknown> {
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
  };
});

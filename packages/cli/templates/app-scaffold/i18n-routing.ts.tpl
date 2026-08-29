import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  // Locale prefix only appears in the URL when it isn't the default
  // locale (e.g. /dashboard, not /en/dashboard) — a single-locale
  // deployment needs nothing beyond this config and the shipped
  // English messages to work.
  localePrefix: "as-needed",
});

export const { locales, defaultLocale } = routing;

import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  // Locale prefix only appears in the URL when it isn't the default
  // locale (e.g. /dashboard, not /en/dashboard) — matches the ADR-0010
  // standard: a single-locale deployment needs nothing beyond this
  // config and the shipped English messages.
  localePrefix: "as-needed",
});

export const { locales, defaultLocale } = routing;

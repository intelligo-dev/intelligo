/**
 * Stand-in for the consumer's `i18n/routing.ts`. Two locales, so the
 * language-switcher item has something to switch between (it renders
 * nothing in a single-locale deployment); no `next-intl/routing` here.
 */
export const routing = {
  locales: ["en", "mn"],
  defaultLocale: "en",
  localePrefix: "as-needed",
} as const;

export const { locales, defaultLocale } = routing;

import Stripe from "stripe";

/**
 * Stripe client, created lazily on first use so the app can boot
 * without STRIPE_SECRET_KEY in local dev; billing features degrade
 * gracefully when Stripe isn't configured.
 */

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Add it to .env.local for billing features."
      );
    }
    _stripe = new Stripe(key, {
      apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}

/** The languages Stripe Checkout and the customer portal render in. */
const STRIPE_HOSTED_LOCALES: ReadonlySet<string> = new Set([
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en-GB",
  "es",
  "es-419",
  "et",
  "fi",
  "fil",
  "fr",
  "fr-CA",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "lt",
  "lv",
  "ms",
  "mt",
  "nb",
  "nl",
  "pl",
  "pt",
  "pt-BR",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "th",
  "tr",
  "vi",
  "zh",
  "zh-HK",
  "zh-TW",
]);

/**
 * The `locale` for a Stripe-hosted page: the app's locale when Stripe
 * renders it, its base language when only that is supported (`de-AT` →
 * `de`), and `"auto"` — the browser's language — for everything else.
 * Stripe rejects a locale outside its list, so nothing is passed
 * through unchecked.
 */
export function toStripeLocale(locale: string | null | undefined): string {
  if (!locale) return "auto";
  const [language = "", ...rest] = locale.replace(/_/g, "-").split("-");
  const region = rest.at(-1);
  const tag = region
    ? `${language.toLowerCase()}-${region.length === 2 ? region.toUpperCase() : region}`
    : language.toLowerCase();
  if (STRIPE_HOSTED_LOCALES.has(tag)) return tag;
  if (STRIPE_HOSTED_LOCALES.has(language.toLowerCase())) {
    return language.toLowerCase();
  }
  return "auto";
}

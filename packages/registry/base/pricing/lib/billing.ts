import "server-only";

/**
 * Billing binding — the composition-root wiring for the pricing,
 * checkout, and billing-settings registry items (billing-settings
 * installs the `pricing` item first and imports this file rather than
 * shipping its own copy — see billing-settings' description).
 *
 * The plan catalogue `getPlans`/`getPlan` read is the one your
 * composition root registered for the slug it passed to
 * `setDefaultProductSlug` (`@intelligo-dev/billing`) — the same slug
 * `feature-gate.tsx` reads, so there is no second copy to keep in step.
 *
 * `CREDIT_BUNDLES` is the one-time credit packaging this deployment
 * sells. Bundle packaging is product config, not framework or
 * `@intelligo-dev/billing` policy — the checkout service takes a bundle as
 * a parameter (`createCreditCheckout`) rather than owning a bundle
 * registry, exactly like the plan catalogue is registered rather than
 * hardcoded. Edit the list to match what you actually sell, or remove
 * credit purchases entirely by deleting `CreditBundles` and the
 * `createCreditPurchaseSession` action if this deployment is
 * subscription-only.
 *
 * No user-facing copy lives in this file (`getPlans`/`getPlan` return
 * `PlanConfig` data, not rendered strings) — nothing here is routed
 * through `messages/en.json`.
 */

import { getPlanBySlug, type PlanConfig } from "@intelligo-dev/billing";
import {
  getDefaultProductSlug,
  getProductPlans,
} from "@intelligo-dev/billing/plans";

export {
  CREDIT_BUNDLES,
  getCreditBundle,
} from "./billing-config";

/** The registered plan catalogue for this deployment's product. */
export function getPlans(): Partial<Record<string, PlanConfig>> {
  return getProductPlans(getDefaultProductSlug()) ?? {};
}

export function getPlan(slug: string): PlanConfig | null {
  return getPlanBySlug(slug, getDefaultProductSlug());
}

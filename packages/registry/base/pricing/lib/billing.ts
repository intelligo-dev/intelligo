import "server-only";

/**
 * Server-side billing binding for the pricing, checkout and
 * billing-settings items. `getPlans`/`getPlan` read the catalogue your
 * composition root registered for the slug passed to
 * `setDefaultProductSlug`.
 *
 * To sell subscriptions only, delete `CreditBundles` and the
 * `createCreditPurchaseSession` action.
 */

import { getPlanBySlug, type PlanConfig } from "@intelligo-dev/billing";
import {
  getDefaultProductSlug,
  getProductPlans,
} from "@intelligo-dev/billing/plans";

export { CREDIT_BUNDLES, getCreditBundle } from "./billing-config";

/** The registered plan catalogue for this deployment's product. */
export function getPlans(): Partial<Record<string, PlanConfig>> {
  return getProductPlans(getDefaultProductSlug()) ?? {};
}

export function getPlan(slug: string): PlanConfig | null {
  return getPlanBySlug(slug, getDefaultProductSlug());
}

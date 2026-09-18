/**
 * Plan limit helpers for quota enforcement. Reads through the plan
 * registry; the product comes from the composition root via
 * setDefaultProductSlug().
 */

import { zero, type CurrencyCode, type Money } from "@intelligo-dev/core/money";

import { getDefaultProductSlug, getPlanConfigs } from "./plans";

function limit(
  planSlug: string | null | undefined,
  productSlug: string,
  key: string
): number {
  const configs = getPlanConfigs(productSlug);
  const value =
    (planSlug ? configs[planSlug]?.limits[key] : undefined) ??
    configs.free?.limits[key];
  return typeof value === "number" ? value : 0;
}

/**
 * What a plan grants each period, in the deployment's billing currency.
 *
 * Zero when the product registered nothing, when the plan is unknown,
 * or when the catalogue names a currency the settings row does not —
 * inventing a conversion would be a currency mismatch. No allowance
 * means the request falls through to purchased credits or is refused:
 * the safe direction, since a non-zero default hands out free allowance
 * on a misconfigured deploy.
 */
export function getPlanMonthlyAllowance(
  planSlug: string | null | undefined,
  currency: CurrencyCode,
  productSlug: string = getDefaultProductSlug()
): Money {
  const configs = getPlanConfigs(productSlug);
  const declared =
    (planSlug ? configs[planSlug]?.monthlyAllowance : undefined) ??
    configs.free?.monthlyAllowance;
  return declared && declared.currency === currency ? declared : zero(currency);
}

/**
 * Message-count limit, read by the usage dashboard. Enforcement uses
 * the allowance above.
 */
export function getPlanMessageLimit(
  planSlug: string | null | undefined,
  productSlug: string = getDefaultProductSlug()
): number {
  return limit(planSlug, productSlug, "chatMessages");
}

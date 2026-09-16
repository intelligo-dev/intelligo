/**
 * Plan limit helpers for quota enforcement.
 *
 * Reads through the plan registry rather than a compiled-in catalogue:
 * plan data is domain IP owned by the vertical (ADR-0006). The product
 * comes from the composition root via setDefaultProductSlug() — an
 * `?? "<product>"` fallback here is how the first product's slug kept
 * reappearing in a package that should not know the name.
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
 * A catalogue declares `monthlyAllowance`, which states the amount and
 * the currency together. It replaced `limits.monthlyCreditMnt`, a bare
 * number that was always whole units of whatever the deployment
 * happened to bill in.
 *
 * Zero when the product registered nothing, when the plan is unknown,
 * or when the catalogue names a currency the settings row does not.
 * That last case is a half-finished switch rather than an exchange
 * rate, and inventing a conversion is what ADR-0015 forbids. No
 * allowance means the request falls through to purchased credits or is
 * refused — the safe direction, since a non-zero default hands out free
 * allowance on a misconfigured deploy.
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
  return declared && declared.currency === currency
    ? declared
    : zero(currency);
}

/**
 * Legacy message-count limit, still read by the usage dashboard.
 * Superseded by the MNT allowance above for enforcement.
 */
export function getPlanMessageLimit(
  planSlug: string | null | undefined,
  productSlug: string = getDefaultProductSlug()
): number {
  return limit(planSlug, productSlug, "chatMessages");
}

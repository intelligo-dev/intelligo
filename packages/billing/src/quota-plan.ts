/**
 * Plan limit helpers for quota enforcement.
 *
 * Reads through the plan registry rather than a compiled-in catalogue:
 * plan data is domain IP owned by the vertical (ADR-0006). The product
 * comes from the composition root via setDefaultProductSlug() — an
 * `?? "<product>"` fallback here is how the first product's slug kept
 * reappearing in a package that should not know the name.
 */

import { money, type CurrencyCode, type Money } from "@intelligo-dev/core/money";

import { getDefaultProductSlug, getPlanConfigs } from "./plans";

/** Micros are millionths of one major unit. */
const MICROS_PER_UNIT = 1_000_000;

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
 * Monthly MNT credit allowance for a plan.
 *
 * Returns 0 when the product registered nothing or the plan is
 * unknown. No allowance means the request falls through to purchased
 * credits or is refused, which is the safe direction — a non-zero
 * default would hand out free allowance on a misconfigured deploy.
 */
export function getPlanMonthlyCreditMnt(
  planSlug: string | null | undefined,
  productSlug: string = getDefaultProductSlug()
): number {
  return limit(planSlug, productSlug, "monthlyCreditMnt");
}

/**
 * What a plan grants each period, in the deployment's billing currency.
 *
 * A catalogue that declares `monthlyAllowance` says the amount and the
 * currency together. An older one declares `limits.monthlyCreditMnt`, a
 * bare number that was always whole units of whatever the deployment
 * billed in — read that way here, so both catalogues enforce the same.
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
  if (declared) return declared;
  return money(
    getPlanMonthlyCreditMnt(planSlug, productSlug) * MICROS_PER_UNIT,
    currency
  );
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

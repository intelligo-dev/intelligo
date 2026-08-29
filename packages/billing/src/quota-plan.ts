/**
 * Plan limit helpers for quota enforcement.
 *
 * Reads through the plan registry rather than a compiled-in catalogue:
 * plan data is domain IP owned by the vertical (ADR-0006). The product
 * comes from the composition root via setDefaultProductSlug() — an
 * `?? "support"` fallback here is how the vertical's vocabulary kept
 * reappearing in a package that should not know the name.
 */

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
 * Legacy message-count limit, still read by the usage dashboard.
 * Superseded by the MNT allowance above for enforcement.
 */
export function getPlanMessageLimit(
  planSlug: string | null | undefined,
  productSlug: string = getDefaultProductSlug()
): number {
  return limit(planSlug, productSlug, "chatMessages");
}

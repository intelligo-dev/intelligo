/**
 * Plan configuration shapes — generic across products.
 *
 * This file holds SHAPES ONLY. Prices, marketing copy, and
 * product-specific limits are domain IP and live in the vertical that
 * owns them (ADR-0006); they reach the billing engine through
 * plan-registry.ts, which the composition root populates.
 *
 * Until Phase 3 this file also carried the Support catalogue — ₮29,900
 * price points, Mongolian feature copy, and a `LegacyCareerPlanLimits`
 * interface naming `assessments`, `reportType`, `careerComparison`.
 * That was a second, silently diverging source of truth (this copy had
 * `monthlyCreditMnt`, which drives the actual quota; the support copy
 * did not) sitting inside a package destined to be published.
 */

/**
 * Per-plan limits. Two fields are named because the credit engine
 * itself reads them; everything else is whatever the vertical defines.
 */
export type PlanLimits = {
  /** Monthly MNT credit allowance. -1 = unlimited. */
  monthlyCreditMnt?: number;
  /** Whether unused credits roll over into the next period. */
  rolloverEnabled?: boolean;
} & Record<string, number | boolean | string | undefined>;

export interface PlanConfig {
  name: string;
  slug: string;
  description: string;
  descriptionMn: string;
  /**
   * Price for a single, non-recurring purchase, in the product's own
   * currency (see `CURRENCY` in a consumer's `lib/billing-config.ts`).
   * 0 for free. Also the fallback the pricing page renders when a plan
   * declares no interval prices.
   */
  priceOneTime: number;
  /** Recurring price per month, when this plan is sold by subscription. */
  priceMonthly?: number;
  /** Recurring price per year, when this plan is sold by subscription. */
  priceYearly?: number;
  targetAudience: string;
  aiModelLabel: string; // "Суурь AI" / "Ухаалаг AI" / "Хамгийн ухаалаг AI"
  limits: PlanLimits;
  features: string[];
  featuresMn: string[];
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
}

/**
 * Plan slugs the billing engine understands. The *data* behind them —
 * prices, copy, per-plan limits — belongs to whichever vertical
 * registers it, not to this package (ADR-0006).
 */
export type PlanSlug = "free" | "standard" | "pro";

// Re-exports from the plan-registry so other billing modules can
// import everything from "./plans" without knowing the registry
// exists. The registry is populated by product packages at bootstrap.
export {
  registerProductPlans,
  registerProductFeatures,
  getProductFeatures,
  setDefaultProductSlug,
  BillingNotConfiguredError,
  getDefaultProductSlug,
  registerUpgradeMessages,
  registerActionLabels,
  registerActionLimitKeys,
  getActionLimitKey,
  getProductPlans,
  getUpgradeMessage,
  getActionLabel,
  registerTrialConfig,
  getTrialConfig,
  clearTrialConfig,
  NO_TRIAL,
  registerTeamMemberLimits,
  getTeamMemberLimit,
  clearTeamMemberLimits,
  registerRateLimits,
  getRateLimit,
  clearRateLimits,
  DEFAULT_REQUESTS_PER_MINUTE,
} from "./plan-registry";
export type {
  TrialConfig,
  TeamMemberLimitMap,
  RateLimitMap,
} from "./plan-registry";

import { getProductPlans } from "./plan-registry";

/**
 * Resolve a product's plan configs through the registry.
 *
 * Returns {} when the product has registered nothing. There is no
 * built-in fallback catalogue any more — a silent fallback is how the
 * two copies came to diverge, and a caller reading {} fails visibly
 * instead of quietly billing against stale numbers. The composition
 * root registers before the first request.
 */
export function getPlanConfigs(
  productSlug: string
): Record<string, PlanConfig> {
  return getProductPlans(productSlug) ?? {};
}

/** Get one plan's configuration within a product. */
export function getPlanBySlug(
  slug: string,
  productSlug: string
): PlanConfig | null {
  return getPlanConfigs(productSlug)[slug] ?? null;
}

/**
 * Format a price in Mongolian tugrik.
 *
 * @deprecated Currency and locale are deployment concerns, not package
 * ones: this hardcodes both the symbol and the Mongolian word for
 * "free". Installed pages format money through next-intl against
 * `CURRENCY` in the consumer's `lib/billing-config.ts` instead. Kept
 * for the pre-registry surfaces (admin, marketing) that still call it.
 */
export function formatPrice(amount: number): string {
  if (amount === 0) return "Үнэгүй";
  return `₮${amount.toLocaleString()}`;
}

/**
 * Check if a limit is unlimited (-1)
 */
export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

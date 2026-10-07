/**
 * Plan configuration shapes — generic across products.
 *
 * Shapes only. Prices, marketing copy and product-specific limits live
 * in the vertical that owns them and reach the billing engine through
 * plan-registry.ts, which the composition root populates.
 */

import type { Money } from "@intelligo-dev/core/money";

/**
 * Per-plan limits, keyed by whatever the vertical defines. The engine
 * names none of them: feature quotas read a numeric limit by its action
 * slug (or the key `registerActionLimitKeys` maps it to), `-1` meaning
 * unlimited, and nothing else is interpreted here.
 */
export type PlanLimits = Record<string, number | boolean | string | undefined>;

export interface PlanConfig {
  name: string;
  slug: string;
  description: string;
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
  aiModelLabel: string; // How this plan names its model tier, in the product's own words
  /**
   * What this plan grants each period, in the deployment's billing
   * currency.
   */
  monthlyAllowance?: Money;
  limits: PlanLimits;
  features: string[];
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
}

/**
 * A plan catalogue whose slugs are a type: each plan's `slug` must equal
 * its key, and `forPlans` checks every map that names a plan against
 * them, so `chat: ["free", "por"]` fails to compile instead of denying
 * the feature at runtime.
 *
 *     export const PLANS = definePlans({ free: { slug: "free", … }, pro: { … } });
 *     const plans = forPlans(PLANS);
 *     export const FEATURES = plans.features({ chat: ["free", "pro"] });
 *     export const TEAM_MEMBER_LIMITS = plans.values({ free: 3, pro: 25 });
 */
export function definePlans<const P extends Record<string, PlanConfig>>(
  plans: P & { [K in keyof P]: { slug: K } }
): P {
  return plans;
}

/** The slugs of a catalogue `definePlans` returned. */
export type PlanSlugOf<P> = Extract<keyof P, string>;

/** Maps keyed by, or listing, the plans of one catalogue. */
export function forPlans<P extends Record<string, PlanConfig>>(_plans: P) {
  return {
    /** Feature name → the plans that grant it. */
    features: <const F extends Record<string, readonly PlanSlugOf<P>[]>>(
      features: F
    ): F => features,
    /** A value per plan — seats, a rate limit; a plan left out takes the default. */
    values: <V>(values: { [K in PlanSlugOf<P>]?: V }): Record<string, V> =>
      values as Record<string, V>,
  };
}

/**
 * Plan slugs the billing engine understands. The *data* behind them —
 * prices, copy, per-plan limits — belongs to whichever vertical
 * registers it, not to this package.
 */
export type PlanSlug = string;

// Re-exports from the plan-registry so other billing modules can
// import everything from "./plans".
export {
  registerProductPlans,
  registerProductFeatures,
  getProductFeatures,
  setDefaultProductSlug,
  BillingNotConfiguredError,
  getDefaultProductSlug,
  registerUpgradeMessages,
  clearUpgradeMessages,
  registerActionLabels,
  clearActionLabels,
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
 * fallback catalogue: a caller reading {} fails visibly instead of
 * quietly billing against stale numbers.
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
 * Check if a limit is unlimited (-1)
 */
export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

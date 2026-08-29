/**
 * Plan Configuration — re-exports from @intelligo/billing-core.
 *
 * All plan types, constants, and pure helpers now live in
 * @intelligo/billing-core (CE package). This file re-exports
 * them so existing `from "@intelligo/billing/plans"` imports
 * continue working unchanged.
 */

export {
  getPlanBySlug,
  registerProductFeatures,
  getProductFeatures,
  setDefaultProductSlug,
  getDefaultProductSlug,
  getPlanConfigs,
  formatPrice,
  isUnlimited,
  registerProductPlans,
  registerUpgradeMessages,
  registerActionLabels,
  registerActionLimitKeys,
  getActionLimitKey,
  getProductPlans,
  getUpgradeMessage,
  getActionLabel,
  registerTrialConfig,
  getTrialConfig,
  NO_TRIAL,
  registerTeamMemberLimits,
  getTeamMemberLimit,
  registerRateLimits,
  getRateLimit,
  DEFAULT_REQUESTS_PER_MINUTE,
} from "@intelligo/billing-core/plans";

export type {
  PlanSlug,
  PlanConfig,
  PlanLimits,
  TrialConfig,
  TeamMemberLimitMap,
  RateLimitMap,
} from "@intelligo/billing-core/plans";

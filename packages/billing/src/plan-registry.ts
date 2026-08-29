/**
 * Plan Registry — re-exports from @intelligo-dev/billing-core.
 *
 * The plan registry now lives in billing-core (CE). This file
 * re-exports everything so internal billing imports and external
 * consumers are unaffected.
 */

export {
  registerProductPlans,
  registerProductFeatures,
  getProductFeatures,
  clearProductFeatures,
  setDefaultProductSlug,
  getDefaultProductSlug,
  clearDefaultProductSlug,
  getProductPlans,
  getRegisteredProductSlugs,
  clearProductPlans,
  registerUpgradeMessages,
  registerActionLimitKeys,
  getActionLimitKey,
  clearActionLimitKeys,
  getUpgradeMessage,
  registerActionLabels,
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
} from "@intelligo-dev/billing-core/plan-registry";

export type {
  ProductPlanMap,
  UpgradeMessageMap,
  ActionLabelMap,
  TrialConfig,
  TeamMemberLimitMap,
  RateLimitMap,
} from "@intelligo-dev/billing-core/plan-registry";

export type { ProductFeatureMatrix } from "@intelligo-dev/billing-core/plan-registry";

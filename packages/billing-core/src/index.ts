/**
 * @intelligo-dev/billing-core — CE (Community Edition) billing primitives.
 *
 * Plan types, plan registry, quota types, payment provider interface,
 * and pure helper functions. No Stripe, no enforcement, no DB queries.
 *
 * EE billing (@intelligo-dev/billing) re-exports everything from here
 * and adds enforcement, Stripe webhooks, trial system, referrals.
 */

// Plan types and configuration
export {
  getPlanBySlug,
  getPlanConfigs,
  formatPrice,
  isUnlimited,
} from "./plans";
export type { PlanSlug, PlanConfig, PlanLimits } from "./plans";

// Plan registry
export {
  registerProductPlans,
  registerUpgradeMessages,
  registerActionLabels,
  registerActionLimitKeys,
  getActionLimitKey,
  getProductPlans,
  getUpgradeMessage,
  getActionLabel,
  getRegisteredProductSlugs,
  clearProductPlans,
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
  ProductPlanMap,
  UpgradeMessageMap,
  ActionLabelMap,
  ActionLimitKeyMap,
  TrialConfig,
  TeamMemberLimitMap,
  RateLimitMap,
} from "./plan-registry";

// Quota types (no enforcement)
export { GRACE_OVERAGE_PERCENTAGE } from "./quota-types";
export type {
  QuotaCheckResult,
  RecordUsageParams,
  SettlementOutcome,
  UsageSummary,
} from "./quota-types";

// Payment provider interface (abstract, no Stripe)
export {
  getPaymentProvider,
  registerPaymentProvider,
  registeredPaymentModes,
  clearPaymentProviders,
  mockCompletePayment,
  getMockPayment,
  mockPaymentProvider,
} from "./payment";
export type {
  PaymentProvider,
  PaymentStatus,
  CreatePaymentResult,
  PaymentCheckResult,
} from "./payment";

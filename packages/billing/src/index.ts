/**
 * Billing Module
 *
 * Exports Stripe client, plan configuration, webhook handlers, and billing utilities.
 */

export { getStripe } from "./stripe";
export { getPlanBySlug, formatPrice, isUnlimited } from "./plans";
export type { PlanSlug, PlanConfig, PlanLimits } from "./plans";

// Plan registry (Wave 4 decoupling)
export {
  registerProductPlans,
  registerUpgradeMessages,
  registerActionLabels,
} from "./plan-registry";
export {
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "./webhook-handlers";

// Billing query helpers (Phase 11-03)
export {
  getWorkspaceSubscription,
  getWorkspaceCreditBalance,
  getWorkspaceBilling,
  ensureFreeSubscription,
  getOrCreateStripeCustomer,
  checkPlanLimit,
  getWorkspacePlanLimits,
} from "./queries";
export type { QueryPlanLimits } from "./queries";

// Billing settings (FX rate + margin, cached 60s)
export {
  getBillingSettings,
  invalidateBillingSettingsCache,
  ensureBillingSettingsRow,
} from "./billing-settings";
export type { ResolvedBillingSettings } from "./billing-settings";

// Quota enforcement engine (Phase 12-01)
export {
  checkQuota,
  estimateQuota,
  reserveQuota,
  recordTokenUsage,
  resetMonthlyQuota,
  getUsageSummary,
  getQuotaThresholds,
  cleanupExpiredReservations,
  releaseReservation,
  RESERVATION_TTL_MS,
} from "./quota";
export type {
  QuotaCheckResult,
  QuotaRefusalCode,
  QuotaEstimate,
  QuotaAdmission,
  RecordUsageParams,
  SettlementOutcome,
  UsageSummary,
} from "./quota";

// Trial credits system (Phase 12-02)
export {
  provisionTrialCredits,
  getTrialStatus,
  deductTrialCredits,
  hasActiveTrialMnt,
  convertTrialToPaid,
  checkTrialAbuse,
  hasActiveTrial,
  processTrialExpirations,
  getTrialConfig,
  NO_TRIAL,
} from "./trial";
export type { TrialStatus, TrialConfig } from "./trial";

// Notification triggers (Phase 12-04)
export { checkNotificationTriggers } from "./notifications";
export type { QuotaNotification } from "./notifications";

// Rate limiting (Phase 12-03)
export {
  checkRateLimit,
  cleanupRateLimitEntries,
  DEFAULT_REQUESTS_PER_MINUTE,
} from "./rate-limit";
export type { RateLimitResult } from "./rate-limit";

// Billing email triggers (Phase 14-05)
export {
  handleSubscriptionConfirmedEmail,
  handlePaymentFailedEmail,
} from "./email-triggers";

// Feature checking engine (Phase 15-01)
export {
  hasFeature,
  requireFeature,
  checkTeamMemberLimit,
  getWorkspacePlan,
  invalidateFeatureCache,
} from "./features";
export type { FeatureKey } from "./features";

// Generation quota (Phase 54)
export {
  checkGenerationQuota,
  recordGeneration,
  getGenerationUsage,
} from "./generation-quota";
export type { GenerationQuotaResult } from "./generation-quota";

// Feature-based quota enforcement (chat/assessment/report limits)
export {
  checkFeatureQuota,
  recordFeatureUsage,
  getUserQuotaStats,
} from "./feature-quota";
export type { QuotaAction, FeatureQuotaResult } from "./feature-quota";

// Referral system — "3 найзаа урь → Standard үнэгүй"
export {
  getOrCreateReferralCode,
  recordReferralSignup,
  hasEarnedReferralUpgrade,
  getReferralStats,
  grantReferralUpgrade,
} from "./referral";

// Payment providers — QPay / SocialPay / Mock
export {
  getPaymentProvider,
  mockCompletePayment,
  getMockPayment,
} from "./payment";
export type {
  PaymentProvider,
  PaymentStatus,
  CreatePaymentResult,
  PaymentCheckResult,
} from "./payment";

// Checkout & billing overview service (pricing/checkout/billing-settings
// registry items) — Stripe checkout/portal session creation and the
// role-shaped billing read. Transports call requireWorkspace/requireRole
// first and pass resolved ids/role in; see checkout.ts's module doc.
export {
  BillingServiceError,
  isBillingServiceError,
  createSubscriptionCheckout,
  createCreditCheckout,
  createBillingPortal,
  getCheckoutSession,
  getBillingOverview,
  creditBundleSchema,
} from "./checkout";
export type {
  BillingServiceErrorCode,
  CheckoutSessionResult,
  CreateSubscriptionCheckoutInput,
  CreditBundle,
  CreateCreditCheckoutInput,
  CreateBillingPortalInput,
  CheckoutSessionStatus,
  CheckoutSessionSummary,
  GetCheckoutSessionInput,
  BillingRole,
  BillingOverviewMember,
  BillingOverviewAdmin,
  BillingOverviewOwner,
  BillingOverview,
  GetBillingOverviewInput,
} from "./checkout";

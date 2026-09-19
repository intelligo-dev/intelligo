/**
 * @intelligo-dev/billing: Stripe client, plan configuration, webhook
 * handlers, quota and credit engines, and billing utilities.
 */

export { getStripe } from "./stripe";
export {
  createStripeWebhookHandler,
  dispatchStripeEvent,
} from "./webhook-route";
export type { StripeWebhookOptions } from "./webhook-route";
export { getPlanBySlug, isUnlimited } from "./plans";
export type { PlanSlug, PlanConfig, PlanLimits } from "./plans";

// Plan registry. The full surface — every register*/clear* pair, the
// trial and rate-limit maps — is `@intelligo-dev/billing/plan-registry`;
// `/plans` and `/payment` are the other two subpaths that import
// neither Stripe nor server-only.
export {
  registerProductPlans,
  registerUpgradeMessages,
  registerActionLabels,
  getRegisteredProductSlugs,
  BillingNotConfiguredError,
} from "./plan-registry";
export {
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "./webhook-handlers";

// Billing query helpers
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

// The plans table, written from the registered catalogue
export { ensurePlanRows } from "./plan-rows";

// Quota enforcement engine
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
  findSettlementByRequestId,
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

// Trial credits
export {
  provisionTrialCredits,
  getTrialStatus,
  deductTrialCredits,
  convertTrialToPaid,
  checkTrialAbuse,
  hasActiveTrial,
  processTrialExpirations,
  getTrialConfig,
  NO_TRIAL,
} from "./trial";
export type { TrialStatus, TrialConfig } from "./trial";

// Notification triggers
export { checkNotificationTriggers } from "./notifications";
export type { QuotaNotification } from "./notifications";

// Rate limiting
export {
  checkRateLimit,
  cleanupRateLimitEntries,
  DEFAULT_REQUESTS_PER_MINUTE,
} from "./rate-limit";
export type { RateLimitResult } from "./rate-limit";

// Billing email triggers
export {
  handleSubscriptionConfirmedEmail,
  handlePaymentFailedEmail,
} from "./email-triggers";

// Feature checking
export {
  hasFeature,
  requireFeature,
  checkTeamMemberLimit,
  getWorkspacePlan,
  invalidateFeatureCache,
} from "./features";
export type { FeatureKey } from "./features";

// Feature-based quota enforcement, keyed by the product's own actions
export {
  checkFeatureQuota,
  recordFeatureUsage,
  getUserQuotaStats,
} from "./feature-quota";
export type { QuotaAction, FeatureQuotaResult } from "./feature-quota";

// Payment providers — the contract, the registry, and the mock
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

// Checkout & billing overview service. Transports call
// requireWorkspace/requireRole first and pass resolved ids/role in.
export {
  BillingServiceError,
  isBillingServiceError,
  createSubscriptionCheckout,
  createCreditCheckout,
  createBillingPortal,
  cancelWorkspaceSubscription,
  getCheckoutSession,
  creditBundleSchema,
} from "./checkout";
export { getBillingOverview } from "./billing-overview";
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
} from "./checkout";
export type {
  BillingRole,
  BillingOverviewMember,
  BillingOverviewAdmin,
  BillingOverviewOwner,
  BillingOverview,
  GetBillingOverviewInput,
} from "./billing-overview";

// Changing the billing settings after first boot, the rate-limit bucket
// a caller gets by default, and the UTC billing period
export {
  updateBillingSettings,
  BillingSettingsError,
} from "./billing-settings";
export type {
  BillingSettingsUpdate,
  BillingSettingsErrorCode,
} from "./billing-settings";
export { DEFAULT_RATE_LIMIT_ENDPOINT } from "./rate-limit";
export {
  getCurrentPeriodStart,
  getCurrentPeriodEnd,
  getCurrentPeriodKey,
} from "./quota-usage";

// Entitlement by subscription status, the typed feature refusal, the
// trial's plan, the delayed-payment webhook handlers and the
// version-tolerant Stripe readers they share.
export { subscriptionEntitles } from "./queries";
export {
  FeatureNotAvailableError,
  isFeatureNotAvailableError,
} from "./features";
export { getTrialPlanSlug, DEFAULT_TRIAL_PLAN_SLUG } from "./plan-registry";
export {
  handleCheckoutAsyncPaymentSucceeded,
  handleCheckoutAsyncPaymentFailed,
  subscriptionPeriod,
  invoiceSubscriptionId,
  planIdForPrice,
} from "./webhook-handlers";
export { toStripeLocale } from "./stripe";

/**
 * Product plan registry.
 *
 * A product calls `registerProductPlans()` from its composition root,
 * and the billing engine reads plans through here. There is no fallback
 * catalogue: a product that registers nothing gets no plans, and
 * `intelligo doctor` says so.
 *
 * No DB read here on purpose: this is the in-process registry that
 * gates feature-quota.ts and the dashboard. The `plans` table in
 * Postgres is the persistent representation that Stripe webhooks and
 * admin UI write to; that's a separate code path.
 */

import {
  createRegistry,
  createRegistryRef,
} from "@intelligo-dev/core/registry";

import type { Money } from "@intelligo-dev/core/money";
import type { PlanConfig } from "./plans";

export type ProductPlanMap = Record<string, PlanConfig>;

const productPlans = createRegistry<ProductPlanMap>("billing/plans");

export function registerProductPlans(
  productSlug: string,
  plans: ProductPlanMap
): void {
  productPlans.set(productSlug, plans);
}

export function getProductPlans(
  productSlug: string
): ProductPlanMap | undefined {
  return productPlans.get(productSlug);
}

export function getRegisteredProductSlugs(): string[] {
  return Array.from(productPlans.keys());
}

export function clearProductPlans(): void {
  productPlans.clear();
}

// ---------------------------------------------------------------------------
// Upgrade messages registry
// ---------------------------------------------------------------------------

/**
 * Per-product, per-plan, per-action upgrade copy. Each product provides
 * its own strings in its own language.
 */
export type UpgradeMessageMap = Record<string, Record<string, string>>;

const productUpgradeMessages = createRegistry<UpgradeMessageMap>(
  "billing/upgrade-messages"
);

export function registerUpgradeMessages(
  productSlug: string,
  messages: UpgradeMessageMap
): void {
  productUpgradeMessages.set(productSlug, messages);
}

export function getUpgradeMessage(
  productSlug: string,
  planSlug: string,
  action: string
): string | undefined {
  return productUpgradeMessages.get(productSlug)?.[planSlug]?.[action];
}

// ---------------------------------------------------------------------------
// Action labels — how a product names its own action slugs in its UI
// ---------------------------------------------------------------------------

export type ActionLabelMap = Record<string, string>;
const productActionLabels = createRegistry<ActionLabelMap>(
  "billing/action-labels"
);

export function registerActionLabels(
  productSlug: string,
  labels: ActionLabelMap
): void {
  productActionLabels.set(productSlug, labels);
}

export function getActionLabel(
  productSlug: string,
  action: string
): string | undefined {
  return productActionLabels.get(productSlug)?.[action];
}

// ---------------------------------------------------------------------------
// Feature matrix registry
// ---------------------------------------------------------------------------

/** Feature name → the plan slugs that grant it. */
export type ProductFeatureMatrix = Record<string, readonly string[]>;

const productFeatures =
  createRegistry<ProductFeatureMatrix>("billing/features");

/**
 * Register which plans grant which features. Feature names are product
 * vocabulary, so the matrix belongs to the vertical, like the plan
 * catalogue.
 */
export function registerProductFeatures(
  productSlug: string,
  matrix: ProductFeatureMatrix
): void {
  productFeatures.set(productSlug, matrix);
}

export function getProductFeatures(
  productSlug: string
): ProductFeatureMatrix | undefined {
  return productFeatures.get(productSlug);
}

export function clearProductFeatures(): void {
  productFeatures.clear();
}

// ---------------------------------------------------------------------------
// Default product
// ---------------------------------------------------------------------------

const defaultProduct = createRegistryRef<string | undefined>(
  "billing/default-product",
  process.env.INTELLIGO_BILLING_PRODUCT
);

/**
 * Tell the billing engine which product's catalogue it bills against.
 * Called by the composition root. There is deliberately no built-in
 * default.
 */
export function setDefaultProductSlug(slug: string): void {
  defaultProduct.set(slug);
}

/**
 * Thrown when billing is asked to decide anything before a product has
 * been configured. Typed so admission can turn it into a refusal
 * (`billing_not_configured`) instead of a 500.
 */
export class BillingNotConfiguredError extends Error {
  readonly code = "billing_not_configured";
  constructor() {
    super(
      "No billing product configured. Call setDefaultProductSlug() from " +
        "the composition root, or set INTELLIGO_BILLING_PRODUCT."
    );
    this.name = "BillingNotConfiguredError";
  }
}

/**
 * @throws {BillingNotConfiguredError} when no product has been
 * configured — a loud failure at the call site beats silently billing
 * against an empty catalogue.
 */
export function getDefaultProductSlug(): string {
  const slug = defaultProduct.get();
  if (!slug) throw new BillingNotConfiguredError();
  return slug;
}

/** Test helper: forget the configured product. */
export function clearDefaultProductSlug(): void {
  defaultProduct.set(undefined);
}

/**
 * The configured product, or nothing.
 *
 * `getDefaultProductSlug()` throws so that billing against an empty
 * catalogue fails loudly. The three lookups below want the opposite:
 * each has a safe unconfigured answer (no trial, one seat, the
 * conservative request ceiling), and throwing would mean an
 * unconfigured deployment cannot rate-limit a request rather than
 * rate-limiting it conservatively.
 */
function currentProductSlug(): string | undefined {
  return defaultProduct.get();
}

// ---------------------------------------------------------------------------
// Action → limit key mapping
// ---------------------------------------------------------------------------

/** Action slug → the field in `PlanConfig.limits` that caps it. */
export type ActionLimitKeyMap = Record<string, string>;

const productActionLimitKeys = createRegistry<ActionLimitKeyMap>(
  "billing/action-limit-keys"
);

/**
 * Declare which plan-limit field caps which action, for the cases
 * where the two names differ (`chat` capped by `chatMessages`).
 *
 * Most products should name the limit after the action and skip this
 * entirely — `getActionLimitKey` falls through to the action slug.
 */
export function registerActionLimitKeys(
  productSlug: string,
  keys: ActionLimitKeyMap
): void {
  productActionLimitKeys.set(productSlug, keys);
}

/** The limit field for an action — the action slug itself by default. */
export function getActionLimitKey(productSlug: string, action: string): string {
  return productActionLimitKeys.get(productSlug)?.[action] ?? action;
}

export function clearActionLimitKeys(): void {
  productActionLimitKeys.clear();
}

// ---------------------------------------------------------------------------
// Trial grant
// ---------------------------------------------------------------------------

/**
 * What a new workspace gets before it pays anything: the vertical's
 * offer, registered by the product rather than engine policy.
 */
export type TrialConfig = {
  /** Token grant, for display. */
  initialCredits: number;
  /**
   * The grant that actually funds execution, in the deployment's
   * billing currency. `null` when a product registers no trial.
   */
  grant: Money | null;
  durationDays: number;
  /** Share remaining at which the UI starts warning. 0–1. */
  warningThreshold: number;
  reminderDaysBeforeExpiry: number;
  /**
   * The plan a workspace is on while its trial runs: a slug from the
   * product's own catalogue. `DEFAULT_TRIAL_PLAN_SLUG` when omitted.
   */
  planSlug?: string;
};

/** The plan a trial grants when the product's `TrialConfig` names none. */
export const DEFAULT_TRIAL_PLAN_SLUG = "pro";

/**
 * No trial.
 *
 * The default when a product registered none, and deliberately not a
 * generous one: a framework that invents a free grant for a
 * deployment that never asked for one is giving away someone else's
 * money. `grantTrialCredits` checks `durationDays` and does nothing
 * at zero.
 */
export const NO_TRIAL: TrialConfig = {
  initialCredits: 0,
  // No grant rather than a zero one: a zero amount would still have to
  // name a currency, and a deployment that offers no trial has none to
  // name.
  grant: null,
  durationDays: 0,
  warningThreshold: 0.2,
  reminderDaysBeforeExpiry: 0,
};

const productTrialConfig = createRegistry<TrialConfig>("billing/trial");

export function registerTrialConfig(
  productSlug: string,
  config: TrialConfig
): void {
  productTrialConfig.set(productSlug, config);
}

/** The product's trial terms, or no trial at all. */
export function getTrialConfig(productSlug?: string): TrialConfig {
  const slug = productSlug ?? currentProductSlug();
  // Stryker disable next-line ConditionalExpression: equivalent — the lookup below answers NO_TRIAL for an undefined slug too; the guard says so without making the reader prove it.
  if (!slug) return NO_TRIAL;
  return productTrialConfig.get(slug) ?? NO_TRIAL;
}

/** The plan slug a workspace resolves to during an active trial. */
export function getTrialPlanSlug(productSlug?: string): string {
  return getTrialConfig(productSlug).planSlug ?? DEFAULT_TRIAL_PLAN_SLUG;
}

export function clearTrialConfig(): void {
  productTrialConfig.clear();
}

// ---------------------------------------------------------------------------
// Team member limits
// ---------------------------------------------------------------------------

/** Plan slug → seats. `-1` is unlimited. */
export type TeamMemberLimitMap = Record<string, number>;

const productTeamLimits = createRegistry<TeamMemberLimitMap>(
  "billing/team-limits"
);

/** How many people a plan may have in one workspace. */
export function registerTeamMemberLimits(
  productSlug: string,
  limits: TeamMemberLimitMap
): void {
  productTeamLimits.set(productSlug, limits);
}

/**
 * Seats for a plan. One when the product registered nothing — the
 * closed default, since the alternative is a framework silently
 * handing out seats a deployment never sold.
 */
export function getTeamMemberLimit(
  productSlug: string | undefined,
  planSlug: string
): number {
  const slug = productSlug ?? currentProductSlug();
  // Stryker disable next-line ConditionalExpression: equivalent — the lookup below falls through to the same seat count for an undefined slug.
  if (!slug) return 1;
  return productTeamLimits.get(slug)?.[planSlug] ?? 1;
}

export function clearTeamMemberLimits(): void {
  productTeamLimits.clear();
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/** Plan slug → requests per minute. */
export type RateLimitMap = Record<string, number>;

/**
 * What an unregistered plan gets.
 *
 * Unlike the trial and the seat count, this one cannot fail closed to
 * zero — that would refuse every request in a deployment that simply
 * had not registered a table. A conservative floor protects the
 * database either way, and a product that wants more says so.
 */
export const DEFAULT_REQUESTS_PER_MINUTE = 10;

const productRateLimits = createRegistry<RateLimitMap>("billing/rate-limits");

/** Per-plan request ceilings. */
export function registerRateLimits(
  productSlug: string,
  limits: RateLimitMap
): void {
  productRateLimits.set(productSlug, limits);
}

export function getRateLimit(
  productSlug: string | undefined,
  planSlug: string
): number {
  const slug = productSlug ?? currentProductSlug();
  // Stryker disable next-line ConditionalExpression: equivalent — the lookup below falls through to the same ceiling for an undefined slug.
  if (!slug) return DEFAULT_REQUESTS_PER_MINUTE;
  return productRateLimits.get(slug)?.[planSlug] ?? DEFAULT_REQUESTS_PER_MINUTE;
}

export function clearRateLimits(): void {
  productRateLimits.clear();
}

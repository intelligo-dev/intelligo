/**
 * Product plan registry.
 *
 * Wave 4 of the architecture decoupling extracts the actual plan data
 * (Free / Standard / Pro) out of @intelligo-dev/billing and into the
 * vertical product packages that own them. The registry here is the
 * runtime hand-off point: a product calls `registerProductPlans()`
 * during server bootstrap, and the billing engine reads through the
 * registry instead of through a hardcoded constant.
 *
 * For backwards compatibility the registry has a fallback for the
 * "support" product slug — until every caller has wired bootstrap, the
 * legacy PLAN_CONFIGS export in plans.ts remains populated by the
 * fallback set so application pages that import it directly keep
 * working. Once Wave 5 lands the chat handler import chain (which
 * always goes through the vertical package) the fallback can be
 * removed.
 *
 * No DB read here on purpose: this is the in-process registry that
 * gates feature-quota.ts and the dashboard. The `plans` table in
 * Postgres is the persistent representation that Stripe webhooks and
 * admin UI write to; that's a separate code path.
 */

import type { PlanConfig } from "./plans";

export type ProductPlanMap = Record<string, PlanConfig>;

const productPlans = new Map<string, ProductPlanMap>();

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
 * Per-product, per-plan, per-action upgrade copy. Support provides
 * Mongolian support strings; future products provide their own. The
 * doc's Phase B target is to move these into a translation layer
 * keyed by product+action — the registry here is the intermediate
 * step: copy still lives in product code, but the billing engine no
 * longer hardcodes support-specific strings.
 */
export type UpgradeMessageMap = Record<string, Record<string, string>>;

const productUpgradeMessages = new Map<string, UpgradeMessageMap>();

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
// Action labels — used by the "X мессеж үлдлээ" warning template
// ---------------------------------------------------------------------------

export type ActionLabelMap = Record<string, string>;
const productActionLabels = new Map<string, ActionLabelMap>();

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

const productFeatures = new Map<string, ProductFeatureMatrix>();

/**
 * Register which plans grant which features.
 *
 * Feature names are product vocabulary — `detailed_assessment`,
 * `scholarship_international` — so the matrix belongs to the vertical,
 * exactly like the plan catalogue. It lived in @intelligo-dev/billing as a
 * hardcoded constant until Phase 3, which put the whole Support feature
 * list inside a package headed for publication (ADR-0006).
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

let defaultProductSlug: string | undefined =
  process.env.INTELLIGO_BILLING_PRODUCT;

/**
 * Tell the billing engine which product's catalogue it bills against.
 * Called by the composition root (ADR-0005).
 *
 * There is deliberately no built-in default: `?? "support"` inside the
 * engine is how the vertical's vocabulary kept reappearing in a
 * package that is supposed to know nothing about it.
 */
export function setDefaultProductSlug(slug: string): void {
  defaultProductSlug = slug;
}

/**
 * @throws when no product has been configured — a loud failure at the
 * call site beats silently billing against an empty catalogue.
 */
export function getDefaultProductSlug(): string {
  if (!defaultProductSlug) {
    throw new Error(
      "No billing product configured. Call setDefaultProductSlug() from " +
        "the composition root, or set INTELLIGO_BILLING_PRODUCT."
    );
  }
  return defaultProductSlug;
}

/** Test helper: forget the configured product. */
export function clearDefaultProductSlug(): void {
  defaultProductSlug = undefined;
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
  return defaultProductSlug;
}

// ---------------------------------------------------------------------------
// Action → limit key mapping
// ---------------------------------------------------------------------------

/** Action slug → the field in `PlanConfig.limits` that caps it. */
export type ActionLimitKeyMap = Record<string, string>;

const productActionLimitKeys = new Map<string, ActionLimitKeyMap>();

/**
 * Declare which plan-limit field caps which action, for the cases
 * where the two names differ.
 *
 * Most products should name the limit after the action and skip this
 * entirely — `getActionLimitKey` falls through to the action slug.
 * Support needs it because its limits predate the action slugs
 * (`chat` is capped by `chatMessages`), and that remap was hardcoded
 * in @intelligo-dev/billing: three support slugs sitting in the quota
 * engine of a package that is supposed to know nothing about the
 * vertical (ADR-0006).
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
 * What a new workspace gets before it pays anything.
 *
 * This was `TRIAL_CONFIG` in @intelligo-dev/billing — "100,000 tokens,
 * 5,000₮, 14 days" hardcoded in a package headed for publication
 * (ADR-0006). Those three numbers are the vertical's first-impression
 * offer, written on its pricing page; they are not engine policy, and
 * a second product on the same framework will not want them.
 */
export type TrialConfig = {
  /** Token grant, for display. */
  initialCredits: number;
  /** The grant that actually funds execution, in minor currency units. */
  initialCreditsMnt: number;
  durationDays: number;
  /** Share remaining at which the UI starts warning. 0–1. */
  warningThreshold: number;
  reminderDaysBeforeExpiry: number;
};

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
  initialCreditsMnt: 0,
  durationDays: 0,
  warningThreshold: 0.2,
  reminderDaysBeforeExpiry: 0,
};

const productTrialConfig = new Map<string, TrialConfig>();

export function registerTrialConfig(
  productSlug: string,
  config: TrialConfig
): void {
  productTrialConfig.set(productSlug, config);
}

/** The product's trial terms, or no trial at all. */
export function getTrialConfig(productSlug?: string): TrialConfig {
  const slug = productSlug ?? currentProductSlug();
  if (!slug) return NO_TRIAL;
  return productTrialConfig.get(slug) ?? NO_TRIAL;
}

export function clearTrialConfig(): void {
  productTrialConfig.clear();
}

// ---------------------------------------------------------------------------
// Team member limits
// ---------------------------------------------------------------------------

/** Plan slug → seats. `-1` is unlimited. */
export type TeamMemberLimitMap = Record<string, number>;

const productTeamLimits = new Map<string, TeamMemberLimitMap>();

/**
 * How many people a plan may have in one workspace.
 *
 * Hardcoded as `TEAM_MEMBER_LIMITS = { free: 1, standard: 1, pro: 1 }`
 * in @intelligo-dev/billing until now — per-plan packaging in the engine,
 * and self-contradicting at that, since a plan sold as a team plan
 * capped at one seat.
 */
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
 * What an unregistered plan gets: the same allowance the old
 * hardcoded table gave `free`.
 *
 * Unlike the trial and the seat count, this one cannot fail closed to
 * zero — that would refuse every request in a deployment that simply
 * had not registered a table. A conservative floor protects the
 * database either way, and a product that wants more says so.
 */
export const DEFAULT_REQUESTS_PER_MINUTE = 10;

const productRateLimits = new Map<string, RateLimitMap>();

/**
 * Per-plan request ceilings.
 *
 * Was `RATE_LIMITS = { free: 10, pro: 60, enterprise: 300 }` in
 * @intelligo-dev/billing. Two of those three names are Support's plans and
 * the third, `enterprise`, was not a plan at all — `PlanSlug` is
 * `free | standard | pro`, so the 300/min tier was unreachable and
 * `standard` silently fell through to the free ceiling.
 */
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
  if (!slug) return DEFAULT_REQUESTS_PER_MINUTE;
  return productRateLimits.get(slug)?.[planSlug] ?? DEFAULT_REQUESTS_PER_MINUTE;
}

export function clearRateLimits(): void {
  productRateLimits.clear();
}

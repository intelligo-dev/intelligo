/**
 * Putting a workspace on a plan as a product decision — a referral
 * reward, a partner deal, a support grant — rather than as the result
 * of a payment.
 *
 * The subscription row is the billing engine's; a product that updated
 * `subscriptions.plan_id` itself would skip the feature cache and every
 * rule this module keeps. Stripe state is left alone: a workspace with a
 * live Stripe subscription is moved back by its next webhook, which is
 * the paying plan winning, as it should.
 */

import { eq } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { plans, subscriptions } from "@intelligo-dev/core/db/schema";
import { createLogger } from "@intelligo-dev/core/logger";

import { BillingServiceError } from "./checkout";
import { invalidateFeatureCache } from "./features";

const log = createLogger("PlanGrant");

export type GrantPlanInput = {
  workspaceId: string;
  /** A plan row `ensurePlanRows()` wrote from the catalogue. */
  planSlug: string;
  /** Why, in the product's words; logged with the grant. */
  reason: string;
  /** Who decided it; null for the system (a reward rule). */
  actorId?: string | null;
};

export type GrantPlanResult = {
  planId: string;
  /** The plan the workspace was on, or null when it had no subscription. */
  previousPlanId: string | null;
};

/** The database, or a transaction the grant should commit with. */
export type PlanGrantExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Put `workspaceId` on `planSlug`, creating its subscription row if it
 * has none. The grant is active immediately and has no period end.
 *
 * @throws {BillingServiceError} `invalid_plan` when no row has the slug.
 */
export async function grantPlan(input: GrantPlanInput): Promise<GrantPlanResult> {
  const result = await writePlanGrant(db, input);
  invalidateFeatureCache(input.workspaceId);
  return result;
}

/**
 * The rows `grantPlan` writes, on `executor`. A caller that passes a
 * transaction invalidates the feature cache itself once it commits:
 * invalidating before the commit lets a concurrent read cache the old
 * plan again.
 *
 * @throws {BillingServiceError} `invalid_plan` when no row has the slug.
 */
export async function writePlanGrant(
  executor: PlanGrantExecutor,
  input: GrantPlanInput
): Promise<GrantPlanResult> {
  const [plan] = await executor
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.slug, input.planSlug))
    .limit(1);
  if (!plan) {
    throw new BillingServiceError(
      "invalid_plan",
      `No plan row has the slug "${input.planSlug}" — call ensurePlanRows() from the composition root.`
    );
  }

  const [existing] = await executor
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, input.workspaceId))
    .limit(1);

  const now = new Date();
  await executor
    .insert(subscriptions)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      planId: plan.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: { planId: plan.id, status: "active", updatedAt: now },
    });

  log.info("Plan granted", {
    workspaceId: input.workspaceId,
    planId: plan.id,
    previousPlanId: existing?.planId ?? null,
    reason: input.reason,
    actorId: input.actorId ?? null,
  });

  return { planId: plan.id, previousPlanId: existing?.planId ?? null };
}

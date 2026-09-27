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

import { and, eq, isNull, lt, ne } from "drizzle-orm";

import { recordAuditEvent } from "@intelligo-dev/audit";
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
  /**
   * When the grant lapses and `processExpiredPlanGrants` returns the
   * workspace to the free plan. Omitted (with `days`), the grant has no
   * end.
   */
  endsAt?: Date | null;
  /**
   * The grant's length, from now — or, when the workspace already holds
   * an unexpired grant of the same plan, from that grant's end, so a
   * second month bought before the first ran out adds a month.
   */
  days?: number;
};

export type GrantPlanResult = {
  planId: string;
  /** The plan the workspace was on, or null when it had no subscription. */
  previousPlanId: string | null;
  /** When the grant lapses; null when it has no end, or Stripe bills the workspace. */
  endsAt: Date | null;
};

/** The database, or a transaction the grant should commit with. */
export type PlanGrantExecutor =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Put `workspaceId` on `planSlug`, creating its subscription row if it
 * has none. The grant is active immediately; with `endsAt` or `days` it
 * lapses then, otherwise it has no end.
 *
 * On a workspace billed through Stripe the period is Stripe's: the plan
 * moves, the end is not recorded, and the next webhook decides.
 *
 * @throws {BillingServiceError} `invalid_plan` when no row has the slug.
 */
export async function grantPlan(
  input: GrantPlanInput
): Promise<GrantPlanResult> {
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

  if (input.endsAt && input.days !== undefined) {
    throw new BillingServiceError(
      "invalid_plan",
      "A plan grant takes endsAt or days, not both."
    );
  }

  const [existing] = await executor
    .select({
      planId: subscriptions.planId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, input.workspaceId))
    .limit(1);

  const now = new Date();
  let endsAt = input.endsAt ?? null;
  if (input.days !== undefined) {
    const running =
      existing?.planId === plan.id &&
      !existing.stripeSubscriptionId &&
      existing.currentPeriodEnd &&
      existing.currentPeriodEnd > now
        ? existing.currentPeriodEnd
        : now;
    endsAt = new Date(running.getTime() + input.days * 24 * 60 * 60 * 1000);
  }

  const stripeBilled = Boolean(existing?.stripeSubscriptionId);
  if (stripeBilled && endsAt) {
    log.warn("Plan granted on a Stripe-billed workspace; its end is Stripe's", {
      workspaceId: input.workspaceId,
      planId: plan.id,
    });
  }
  const period = stripeBilled
    ? {}
    : {
        currentPeriodStart: endsAt ? now : null,
        currentPeriodEnd: endsAt,
      };

  await executor
    .insert(subscriptions)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      planId: plan.id,
      status: "active",
      ...period,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: { planId: plan.id, status: "active", ...period, updatedAt: now },
    });

  log.info("Plan granted", {
    workspaceId: input.workspaceId,
    planId: plan.id,
    previousPlanId: existing?.planId ?? null,
    reason: input.reason,
    actorId: input.actorId ?? null,
    endsAt: stripeBilled ? null : endsAt,
  });

  return {
    planId: plan.id,
    previousPlanId: existing?.planId ?? null,
    endsAt: stripeBilled ? null : endsAt,
  };
}

/**
 * Return every workspace whose granted plan has lapsed to the free plan.
 * Run from the maintenance route, beside trial expiry.
 *
 * A lapsed grant is a subscription with no Stripe subscription, not
 * already on the free plan, whose `current_period_end` has passed. Each
 * is moved only if it has still lapsed when written, so a grant renewed
 * meanwhile stays; each move is audited as `billing.plan_grant.expired`.
 */
export async function processExpiredPlanGrants(): Promise<{
  expired: number;
  errors: string[];
}> {
  const [free] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.slug, "free"))
    .limit(1);
  if (!free) {
    return {
      expired: 0,
      errors: ['No "free" plan row to return lapsed grants to.'],
    };
  }

  const now = new Date();
  const lapsed = await db
    .select({
      id: subscriptions.id,
      workspaceId: subscriptions.workspaceId,
      planId: subscriptions.planId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(
      and(
        isNull(subscriptions.stripeSubscriptionId),
        ne(subscriptions.planId, free.id),
        lt(subscriptions.currentPeriodEnd, now)
      )
    );

  let expired = 0;
  const errors: string[] = [];
  for (const row of lapsed) {
    try {
      const moved = await db
        .update(subscriptions)
        .set({
          planId: free.id,
          status: "active",
          currentPeriodStart: null,
          currentPeriodEnd: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(subscriptions.id, row.id),
            isNull(subscriptions.stripeSubscriptionId),
            lt(subscriptions.currentPeriodEnd, now)
          )
        )
        .returning({ id: subscriptions.id });
      if (moved.length === 0) continue;

      invalidateFeatureCache(row.workspaceId);
      expired++;
      await recordAuditEvent({
        workspaceId: row.workspaceId,
        actorId: null,
        actorKind: "system",
        action: "billing.plan_grant.expired",
        resourceKind: "subscription",
        resourceId: row.id,
        metadata: {
          planId: row.planId,
          endedAt: row.currentPeriodEnd!.toISOString(),
        },
      });
    } catch (error) {
      const message = `Failed to expire the plan grant of workspace ${row.workspaceId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      log.error(message);
    }
  }

  if (expired > 0) log.info("Plan grants expired", { expired });
  return { expired, errors };
}

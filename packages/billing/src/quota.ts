/**
 * Quota Enforcement Engine
 *
 * Core quota enforcement module that checks token limits before AI requests
 * and records consumption atomically after completion.
 *
 * Functions:
 * - checkQuota: Validate subscription/credit limits before AI request
 * - recordTokenUsage: Atomically record usage + increment counter + deduct credits
 * - resetMonthlyQuota: Create fresh period entry on subscription renewal
 * - getUsageSummary: Breakdown by model, agent, and daily for dashboard
 * - getQuotaThresholds: 80%/100% threshold flags for notification triggers
 *
 * Race condition safety:
 * - All writes use SQL-level atomic operations (ON CONFLICT DO UPDATE with sql``)
 * - Credit deduction uses SQL arithmetic (not JS read-modify-write)
 * - Transaction wraps insert + upsert + deduction for all-or-nothing semantics
 *
 * Pattern: Server-side only, used by AI route handlers and server actions.
 */

import { db } from "@intelligo-dev/core/db";
import {
  usageRecords,
  monthlyUsage,
  creditBalances,
  creditReservations,
  trialCredits,
} from "@intelligo-dev/core/db/schema";
import { eq, sql, and, gte, lte, gt } from "drizzle-orm";
import { hasActiveTrialMnt } from "./trial";
import { checkNotificationTriggers } from "./notifications";
import {
  calculateChargedMnt,
  estimateWorstCaseChargedMnt,
} from "@intelligo-dev/executions/pricing";
import { getBillingSettings } from "./billing-settings";
import { getWorkspaceBilling } from "./queries";
import type {
  QuotaCheckResult,
  RecordUsageParams,
  UsageSummary,
} from "./quota-types";
import { getPlanMonthlyCreditMnt, getPlanMessageLimit } from "./quota-plan";
import {
  getCurrentMonthlyUsage,
  getCurrentPeriodStart,
  getCurrentPeriodEnd,
} from "./quota-usage";

// ---------------------------------------------------------------------------
// checkQuota (QUOTA-03, QUOTA-04)
// ---------------------------------------------------------------------------

/**
 * Check whether a workspace is allowed to make an AI request.
 *
 * Cost-based MNT enforcement (replaces legacy message-count quota):
 *   1. Plan grants a monthly MNT allowance (free 2K, std 30K, pro 120K)
 *   2. Top-ups land in credit_balances.balance_mnt
 *   3. Trial users have a separate credits_remaining_mnt grant
 *
 * remainingMnt = max(0, planAllowance - monthly.chargedMnt) + topupBalanceMnt + trialBalanceMnt
 *
 * We refuse the request when remainingMnt < estimatedWorstCaseMnt for
 * the chosen model, so a single expensive turn can't push a user
 * arbitrarily into the red.
 *
 * NOTE: Grace overage was removed — with worst-case request cost ~138K MNT
 * and monthly allowance 2K MNT, a single request always exceeds any realistic
 * grace buffer. The grace period concept only made sense when requests were
 * << monthly allowance.
 *
 * Reservation (B-06): pass options.requestId to make admission atomic.
 * The decision then runs in a transaction serialized per workspace by a
 * pg advisory xact lock: the sum of other ACTIVE unexpired reservations
 * is subtracted from the available balance, and a reservation row for
 * this request's worst-case estimate is inserted before returning
 * allowed=true. recordTokenUsage settles the reservation by requestId;
 * abandoned reservations stop counting after RESERVATION_TTL_MS.
 * Without requestId the check stays a read-only estimate (dashboards).
 */
export async function checkQuota(
  workspaceId: string,
  options?: { modelId?: string; requestId?: string }
): Promise<QuotaCheckResult> {
  const [billing, monthly, trial, settings] = await Promise.all([
    getWorkspaceBilling(workspaceId),
    getCurrentMonthlyUsage(workspaceId),
    hasActiveTrialMnt(workspaceId),
    getBillingSettings(),
  ]);

  const planSlug = billing.plan?.slug ?? "free";
  const monthlyAllowanceMnt = getPlanMonthlyCreditMnt(planSlug);

  const usedMnt = monthly.chargedMnt ?? 0;
  const planRemainingMnt = Math.max(0, monthlyAllowanceMnt - usedMnt);
  const topupBalanceMnt = Math.max(0, billing.creditBalance.balanceMnt ?? 0);
  const trialRemainingMnt = trial.active ? trial.remainingMnt : 0;
  const remainingMnt = planRemainingMnt + topupBalanceMnt + trialRemainingMnt;

  const modelId = options?.modelId ?? "google/gemini-2.5-flash";
  const estimatedMnt = estimateWorstCaseChargedMnt(
    modelId,
    settings.usdToMntRate,
    settings.marginMultiplier
  );

  const percentage =
    monthlyAllowanceMnt > 0
      ? Math.min(100, Math.round((usedMnt / monthlyAllowanceMnt) * 100))
      : 0;

  const base = {
    billingMode: "subscription" as const,
    usage: { used: usedMnt, limit: monthlyAllowanceMnt, percentage },
    creditBalanceMnt: topupBalanceMnt,
    estimatedMnt,
    remainingMnt,
    graceActive: false,
  };

  const refusal = (): QuotaCheckResult => ({
    allowed: false,
    reason:
      remainingMnt > 0
        ? `Insufficient credits for this request (need ~${estimatedMnt}₮, have ${remainingMnt}₮). Top up to continue.`
        : "Monthly credit allowance depleted. Top up or upgrade your plan to continue.",
    usingTrialCredits: false,
    ...base,
  });

  const decide = (reservedMnt: number): QuotaCheckResult => {
    // Grace period removed — see docstring above.
    // Use plan + topup balance first; trial is fallback only.
    const nonTrialRemaining = planRemainingMnt + topupBalanceMnt - reservedMnt;
    if (nonTrialRemaining >= estimatedMnt) {
      return { allowed: true, usingTrialCredits: false, ...base };
    }
    // Trial fallback: reservations count against the trial pool once the
    // non-trial pool (minus reservations) can no longer cover them.
    const trialAvailable =
      trialRemainingMnt -
      Math.max(0, reservedMnt - (planRemainingMnt + topupBalanceMnt));
    if (trial.active && trialAvailable >= estimatedMnt) {
      return { allowed: true, usingTrialCredits: true, ...base };
    }
    return refusal();
  };

  const requestId = options?.requestId;
  if (!requestId) {
    // Read-only estimate (no admission) — dashboards, previews.
    return decide(0);
  }

  // Atomic admission: serialize per workspace, count active reservations,
  // and reserve this request's estimate in the same transaction.
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`
    );

    const reservedRows = await tx
      .select({
        total: sql<number>`coalesce(sum(${creditReservations.estimatedMnt}), 0)`,
      })
      .from(creditReservations)
      .where(
        and(
          eq(creditReservations.workspaceId, workspaceId),
          eq(creditReservations.status, "active"),
          gt(creditReservations.expiresAt, new Date())
        )
      );
    const reservedMnt = Number(reservedRows[0]?.total ?? 0);

    const decision = decide(reservedMnt);
    if (!decision.allowed) return decision;

    await tx.insert(creditReservations).values({
      id: crypto.randomUUID(),
      workspaceId,
      requestId,
      estimatedMnt,
      status: "active",
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
    });

    return { ...decision, reservedRequestId: requestId };
  });
}

/**
 * How long an unsettled reservation keeps counting against the balance.
 * Must exceed the chat route's maxDuration (300s) so a still-streaming
 * request can't have its reservation expire under it.
 */
export const RESERVATION_TTL_MS = 10 * 60_000;

/**
 * Delete reservations that are settled or expired past the TTL.
 * Called from the cleanup cron. The admission sum already ignores
 * expired rows, so this is table hygiene, not correctness.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const deleted = await db
    .delete(creditReservations)
    .where(
      sql`${creditReservations.status} = 'settled' OR ${creditReservations.expiresAt} < ${new Date(
        Date.now() - RESERVATION_TTL_MS
      )}`
    )
    .returning();
  return deleted.length;
}

/**
 * Release an admission hold without charging for it — the run failed
 * before producing usage. Marking it settled (rather than deleting)
 * keeps the row for the cleanup cron and for anyone reconstructing
 * what happened to a request.
 *
 * Idempotent: releasing an already-settled reservation is a no-op.
 */
export async function releaseReservation(requestId: string): Promise<void> {
  await db
    .update(creditReservations)
    .set({ status: "settled", settledAt: new Date() })
    .where(
      and(
        eq(creditReservations.requestId, requestId),
        eq(creditReservations.status, "active")
      )
    );
}

// ---------------------------------------------------------------------------
// recordTokenUsage (QUOTA-05)
// ---------------------------------------------------------------------------

/**
 * Record token consumption for an AI request.
 *
 * Atomically performs operations inside a single transaction:
 * 1. Insert detailed usage_record for reporting
 * 2. Upsert monthly_usage counter (ON CONFLICT DO UPDATE with SQL increment)
 * 3. Deduct from EITHER trial_credits OR credit_balances — never both.
 *    A single authoritative check inside FOR UPDATE locks on both rows
 *    determines which balance to charge. This closes the race window
 *    where trial exhausted between checkQuota and recordTokenUsage.
 *
 * Race condition safety:
 * - monthly_usage increment uses sql`` template (not JS arithmetic)
 * - credit deduction uses sql`` template (not read-modify-write)
 * - Trial deduction uses same SQL arithmetic pattern
 * - Transaction ensures all-or-nothing: if any step fails, all roll back
 * - FOR UPDATE on both trial_credits and credit_balances serializes
 *   concurrent requests so only one can make the deduct decision at a time
 */
export async function recordTokenUsage(
  params: RecordUsageParams
): Promise<void> {
  const periodStart = getCurrentPeriodStart();
  const periodEnd = getCurrentPeriodEnd();

  const settings = await getBillingSettings();

  const { rawCostUsd, chargedMnt } = calculateChargedMnt(
    params.model ?? "unknown",
    params.inputTokens ?? 0,
    params.outputTokens ?? 0,
    settings.usdToMntRate,
    settings.marginMultiplier
  );

  const requestId =
    params.requestId ??
    (typeof params.metadata === "object" && params.metadata !== null
      ? ((params.metadata as Record<string, unknown>).requestId as
          | string
          | undefined)
      : undefined) ??
    null;

  await db.transaction(async (tx) => {
    await tx.insert(usageRecords).values({
      id: crypto.randomUUID(),
      workspaceId: params.workspaceId,
      userId: params.userId,
      type: "ai_tokens",
      model: params.model,
      agent: params.agent,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.totalTokens,
      cost: rawCostUsd,
      marginMultiplier: settings.marginMultiplier,
      fxRate: settings.usdToMntRate,
      chargedMnt,
      requestId,
      conversationId:
        typeof params.metadata === "object" && params.metadata !== null
          ? (((params.metadata as Record<string, unknown>).conversationId as
              | string
              | undefined) ?? null)
          : null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });

    await tx
      .insert(monthlyUsage)
      .values({
        id: crypto.randomUUID(),
        workspaceId: params.workspaceId,
        periodStart,
        periodEnd,
        tokensUsed: params.totalTokens,
        chargedMnt,
        requestCount: 1,
      })
      .onConflictDoUpdate({
        target: [monthlyUsage.workspaceId, monthlyUsage.periodStart],
        set: {
          tokensUsed: sql`${monthlyUsage.tokensUsed} + ${params.totalTokens}`,
          chargedMnt: sql`${monthlyUsage.chargedMnt} + ${chargedMnt}`,
          requestCount: sql`${monthlyUsage.requestCount} + 1`,
          updatedAt: new Date(),
        },
      });

    // B-01/B-02 fix: Single authoritative deduction decision inside FOR UPDATE locks.
    // Lock both trial_credits and credit_balances rows, then decide which to deduct.
    // This prevents:
    // - Double deduction (trial + credit balance both charged)
    // - 2x balance consumption (two concurrent requests slipping through checkQuota)
    //
    // Strategy:
    // - If usingTrialCredits=true AND trial row has creditsRemainingMnt > chargedMnt:
    //   deduct from trial only.
    // - Otherwise: deduct from creditBalances (covers both non-trial and
    //   trial-exhausted-at-record-time cases).
    //
    // The FOR UPDATE lock serializes concurrent recordTokenUsage calls so they
    // queue up and make the deduction decision one at a time.

    // Lock trial_credits row if it exists for this workspace
    const trialRow = await tx
      .select()
      .from(trialCredits)
      .where(
        and(
          eq(trialCredits.workspaceId, params.workspaceId),
          eq(trialCredits.status, "active")
        )
      )
      .for("update")
      .limit(1);

    const trialHasSufficient =
      params.usingTrialCredits &&
      trialRow.length > 0 &&
      (trialRow[0]?.creditsRemainingMnt ?? 0) >= chargedMnt;

    if (trialHasSufficient) {
      // Deduct from trial credits only — single atomic update
      await tx
        .update(trialCredits)
        .set({
          creditsRemainingMnt: sql`GREATEST(${trialCredits.creditsRemainingMnt} - ${chargedMnt}, 0)`,
          creditsUsedMnt: sql`${trialCredits.creditsUsedMnt} + ${chargedMnt}`,
          creditsRemaining: sql`GREATEST(${trialCredits.creditsRemaining} - ${params.totalTokens}, 0)`,
          creditsUsed: sql`${trialCredits.creditsUsed} + ${params.totalTokens}`,
          status: sql`CASE WHEN GREATEST(${trialCredits.creditsRemainingMnt} - ${chargedMnt}, 0) <= 0 THEN 'depleted' ELSE ${trialCredits.status} END`,
          depletedAt: sql`CASE WHEN GREATEST(${trialCredits.creditsRemainingMnt} - ${chargedMnt}, 0) <= 0 THEN NOW() ELSE ${trialCredits.depletedAt} END`,
        })
        .where(eq(trialCredits.workspaceId, params.workspaceId));
    } else {
      // Deduct from credit balance only — sql`` arithmetic prevents negative balance
      await tx
        .update(creditBalances)
        .set({
          balanceMnt: sql`GREATEST(${creditBalances.balanceMnt} - ${chargedMnt}, 0)`,
          totalUsedMnt: sql`${creditBalances.totalUsedMnt} + ${chargedMnt}`,
          updatedAt: new Date(),
        })
        .where(eq(creditBalances.workspaceId, params.workspaceId));
    }

    // Settle the admission reservation (B-06) so it stops counting
    // against the workspace's available balance.
    if (requestId) {
      await tx
        .update(creditReservations)
        .set({ status: "settled", settledAt: new Date() })
        .where(eq(creditReservations.requestId, requestId));
    }
  });

  checkNotificationTriggers(params.workspaceId).catch((err) =>
    console.error("[Notifications] Error checking triggers:", err)
  );
}

// ---------------------------------------------------------------------------
// resetMonthlyQuota (QUOTA-06)
// ---------------------------------------------------------------------------

/**
 * Reset monthly quota for a workspace.
 *
 * Called when invoice.paid webhook fires (subscription renewal).
 * Creates a new monthly_usage row for the current period with zeroed counters.
 * Uses ON CONFLICT DO NOTHING — if a row already exists for this period, no-op.
 * The old period row remains for historical reporting.
 */
export async function resetMonthlyQuota(workspaceId: string): Promise<void> {
  const periodStart = getCurrentPeriodStart();
  const periodEnd = getCurrentPeriodEnd();

  await db
    .insert(monthlyUsage)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      periodStart,
      periodEnd,
      tokensUsed: 0,
      requestCount: 0,
    })
    .onConflictDoNothing({
      target: [monthlyUsage.workspaceId, monthlyUsage.periodStart],
    });
}

// ---------------------------------------------------------------------------
// getUsageSummary (QUOTA-07)
// ---------------------------------------------------------------------------

/**
 * Get usage summary for dashboard display.
 *
 * Returns:
 * - currentPeriod: tokens used, request count, limit, percentage
 * - byModel: token breakdown per AI model
 * - byAgent: token breakdown per agent
 * - daily: daily token usage within date range
 */
export async function getUsageSummary(
  workspaceId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<UsageSummary> {
  const startDate = options?.startDate ?? getCurrentPeriodStart();
  const endDate = options?.endDate ?? getCurrentPeriodEnd();

  const monthly = await getCurrentMonthlyUsage(workspaceId);

  const billing = await getWorkspaceBilling(workspaceId);
  const planSlug = billing.plan?.slug ?? "free";
  const messageLimit = getPlanMessageLimit(planSlug);
  const percentage =
    messageLimit > 0
      ? Math.round((monthly.requestCount / messageLimit) * 100)
      : 0;

  const byModelRows = await db
    .select({
      model: usageRecords.model,
      totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)`,
      requestCount: sql<number>`count(*)`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.workspaceId, workspaceId),
        gte(usageRecords.recordedAt, startDate),
        lte(usageRecords.recordedAt, endDate)
      )
    )
    .groupBy(usageRecords.model);

  const byAgentRows = await db
    .select({
      agent: usageRecords.agent,
      totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)`,
      requestCount: sql<number>`count(*)`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.workspaceId, workspaceId),
        gte(usageRecords.recordedAt, startDate),
        lte(usageRecords.recordedAt, endDate)
      )
    )
    .groupBy(usageRecords.agent);

  const dailyRows = await db
    .select({
      date: sql<string>`to_char(${usageRecords.recordedAt}, 'YYYY-MM-DD')`,
      totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)`,
      requestCount: sql<number>`count(*)`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.workspaceId, workspaceId),
        gte(usageRecords.recordedAt, startDate),
        lte(usageRecords.recordedAt, endDate)
      )
    )
    .groupBy(sql`to_char(${usageRecords.recordedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${usageRecords.recordedAt}, 'YYYY-MM-DD')`);

  return {
    currentPeriod: {
      tokensUsed: monthly.tokensUsed,
      requestCount: monthly.requestCount,
      limit: messageLimit,
      percentage,
    },
    byModel: byModelRows.map((r) => ({
      model: r.model ?? "unknown",
      totalTokens: Number(r.totalTokens),
      requestCount: Number(r.requestCount),
    })),
    byAgent: byAgentRows.map((r) => ({
      agent: r.agent ?? "unknown",
      totalTokens: Number(r.totalTokens),
      requestCount: Number(r.requestCount),
    })),
    daily: dailyRows.map((r) => ({
      date: r.date,
      totalTokens: Number(r.totalTokens),
      requestCount: Number(r.requestCount),
    })),
  };
}

// ---------------------------------------------------------------------------
// getQuotaThresholds (QUOTA-08, QUOTA-09)
// ---------------------------------------------------------------------------

/**
 * Get quota threshold flags for notification triggering.
 *
 * Returns the current usage percentage and boolean flags for 80% and 100% thresholds.
 * Phase 14 will use these to send email notifications; for now, expose the data
 * so the dashboard can display warning badges.
 */
export async function getQuotaThresholds(workspaceId: string) {
  const monthly = await getCurrentMonthlyUsage(workspaceId);
  const billing = await getWorkspaceBilling(workspaceId);
  const planSlug = billing.plan?.slug ?? "free";
  const monthlyAllowanceMnt = getPlanMonthlyCreditMnt(planSlug);
  const usedMnt = monthly.chargedMnt ?? 0;
  const percentage =
    monthlyAllowanceMnt > 0
      ? Math.min(100, Math.round((usedMnt / monthlyAllowanceMnt) * 100))
      : 0;

  return {
    percentage,
    warningThreshold: percentage >= 80,
    criticalThreshold: percentage >= 100,
  };
}

// Re-export types
export type {
  QuotaCheckResult,
  RecordUsageParams,
  UsageSummary,
} from "./quota-types";

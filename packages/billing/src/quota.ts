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
import { getActiveTrialGrant } from "./trial";
import { checkNotificationTriggers } from "./notifications";
import {
  UnknownModelError,
  chargeFor,
  estimateWorstCaseCharge,
  type BillingRate,
} from "@intelligo-dev/executions/pricing";
import {
  add,
  compare,
  formatMoney,
  isNegative,
  isZero,
  money,
  subtract,
  zero,
  type Money,
} from "@intelligo-dev/core/money";
import { getBillingSettings } from "./billing-settings";
import { getWorkspaceBilling } from "./queries";
import type {
  QuotaCheckResult,
  QuotaEstimate,
  QuotaAdmission,
  RecordUsageParams,
  SettlementOutcome,
  UsageSummary,
} from "./quota-types";
import {
  getPlanMessageLimit,
  getPlanMonthlyAllowance,
} from "./quota-plan";
import { BillingNotConfiguredError } from "./plan-registry";

export type {
  SettlementOutcome,
  QuotaRefusalCode,
  QuotaEstimate,
  QuotaAdmission,
} from "./quota-types";
import {
  getCurrentMonthlyUsage,
  getCurrentPeriodStart,
  getCurrentPeriodEnd,
} from "./quota-usage";

// ---------------------------------------------------------------------------
// checkQuota (QUOTA-03, QUOTA-04)
// ---------------------------------------------------------------------------

/**
 * The three pools a workspace can spend from, read once per decision.
 *
 *   remaining = max(zero, allowance − used) + topupBalance + trialRemaining
 *
 * `allowanceUsedMicros` is the part of this period's spend that the plan
 * allowance funded — `recordTokenUsage` increments it only up to the
 * allowance and sends the remainder to top-up or trial — so the three
 * pools never count one charge twice.
 */
type Pools = {
  planSlug: string;
  trialActive: boolean;
  /**
   * The pools, in the deployment's own currency. A number that does not
   * say what it is of is how a tugrik ledger came to be shown with a
   * dollar sign.
   */
  allowance: Money;
  used: Money;
  planRemaining: Money;
  topupBalance: Money;
  trialRemaining: Money;
  /** What this deployment bills in — currency, USD rate, margin. */
  rate: BillingRate;
};

async function readPools(workspaceId: string): Promise<Pools> {
  const [billing, monthly, trial, settings] = await Promise.all([
    getWorkspaceBilling(workspaceId),
    getCurrentMonthlyUsage(workspaceId),
    getActiveTrialGrant(workspaceId),
    getBillingSettings(),
  ]);

  const planSlug = billing.plan?.slug ?? "free";

  // Micros are the only denomination left: 0045 dropped the whole-unit
  // columns, so there is no second copy to reconcile against.
  const pooled = (micros: number | null | undefined): Money =>
    money(Math.max(0, micros ?? 0), settings.currency);

  const allowance = getPlanMonthlyAllowance(planSlug, settings.currency);
  const used = pooled(monthly.allowanceUsedMicros);
  const planLeft = subtract(allowance, used);
  const trialRemaining = trial.active
    ? pooled(trial.remainingMicros)
    : zero(settings.currency);

  return {
    planSlug,
    trialActive: trial.active,
    allowance,
    used,
    planRemaining: isNegative(planLeft) ? zero(settings.currency) : planLeft,
    topupBalance: pooled(billing.creditBalance.balanceMicros),
    trialRemaining,
    rate: {
      currency: settings.currency,
      usdRateMicros: settings.usdRateMicros,
      marginBp: settings.marginBp,
    },
  };
}

const DEFAULT_MODEL_ID = "google/gemini-2.5-flash";

/** What `estimateQuota`/`reserveQuota` return when billing is unconfigured. */
function notConfigured(): QuotaCheckResult {
  return {
    allowed: false,
    code: "billing_not_configured",
    reason:
      "Billing is not configured for this deployment: no product or plans are registered.",
    billingMode: "subscription",
    usage: { used: 0, limit: 0, percentage: 0 },
    usingTrialCredits: false,
    graceActive: false,
  };
}

/**
 * Read-only estimate of whether a workspace could run a turn on
 * `modelId` right now. Nothing is locked or written, and outstanding
 * reservations are NOT subtracted, so two estimates can both say yes
 * against one balance — this is for dashboards and previews and must
 * never gate a run. Use `reserveQuota` for that.
 */
export async function estimateQuota(
  workspaceId: string,
  options?: { modelId?: string }
): Promise<QuotaEstimate> {
  try {
    return decideQuota(
      await readPools(workspaceId),
      options?.modelId ?? DEFAULT_MODEL_ID,
      0
    );
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) return notConfigured();
    throw error;
  }
}

/**
 * Atomic admission: decide, and hold the worst-case cost, in one step.
 *
 * Cost-based enforcement: the plan grants a monthly allowance, top-ups
 * land in `credit_balances.balance_mnt`, and a trial is a separate
 * grant used last. The request is refused when the remaining total is
 * below the worst-case cost of one turn on the chosen model, so a
 * single expensive turn cannot push a workspace into the red. (Worst
 * case at current constants: ~343₮ for Gemini Flash, ~2 319₮ for
 * Claude or any unregistered id.)
 *
 * The decision runs in a transaction serialized per workspace by
 * `pg_advisory_xact_lock`. Balances are read only after the lock is
 * held — settlement takes the same lock, so no charge can land between
 * the snapshot and the reservation — the sum of other active, unexpired
 * reservations is subtracted, and a reservation for this request's
 * worst-case estimate is inserted before `allowed: true` is returned.
 * `recordTokenUsage` settles the reservation by `requestId`; abandoned
 * reservations stop counting after RESERVATION_TTL_MS.
 *
 * A refusal carries a stable `code` (`QuotaRefusalCode`) for transports
 * to map; `reason` is the human-readable form.
 */
export async function reserveQuota(
  workspaceId: string,
  options: { modelId?: string; requestId: string }
): Promise<QuotaAdmission> {
  const modelId = options.modelId ?? DEFAULT_MODEL_ID;
  const { requestId } = options;
  if (!requestId) {
    throw new Error("reserveQuota requires a requestId to reserve against.");
  }

  try {
    return await db.transaction(async (tx): Promise<QuotaAdmission> => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`
      );

      // Only now read the balances: every settlement holds this same
      // lock for the duration of its writes, so what we read here cannot
      // be consumed between this snapshot and our reservation.
      const pools = await readPools(workspaceId);

      const reservedRows = await tx
        .select({
          total: sql<number>`coalesce(sum(${creditReservations.estimatedMicros}), 0)`,
        })
        .from(creditReservations)
        .where(
          and(
            eq(creditReservations.workspaceId, workspaceId),
            eq(creditReservations.status, "active"),
            gt(creditReservations.expiresAt, new Date())
          )
        );
      const reservedMicros = Number(reservedRows[0]?.total ?? 0);

      const decision = decideQuota(pools, modelId, reservedMicros);
      if (!decision.allowed) return decision as QuotaAdmission;

      await tx.insert(creditReservations).values({
        id: crypto.randomUUID(),
        workspaceId,
        requestId,
        estimatedMicros: decision.estimated?.amount ?? 0,
        currency: decision.estimated?.currency ?? "MNT",
        status: "active",
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      });

      return { ...decision, allowed: true, reservedRequestId: requestId };
    });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) {
      return notConfigured() as QuotaAdmission;
    }
    throw error;
  }
}

/**
 * @deprecated One name for two behaviours: with `requestId` this is
 * `reserveQuota` (atomic admission), without it `estimateQuota` (a
 * read-only estimate that must never gate a run). Call the one you
 * mean; this wrapper stays for one release.
 */
export async function checkQuota(
  workspaceId: string,
  options?: { modelId?: string; requestId?: string }
): Promise<QuotaCheckResult> {
  return options?.requestId
    ? reserveQuota(workspaceId, {
        modelId: options.modelId,
        requestId: options.requestId,
      })
    : estimateQuota(workspaceId, { modelId: options?.modelId });
}

function decideQuota(
  pools: Pools,
  modelId: string,
  reservedMicros: number
): QuotaCheckResult {
  {
    const { trialActive } = pools;
    const remaining = add(
      add(pools.planRemaining, pools.topupBalance),
      pools.trialRemaining
    );
    const reserved = money(reservedMicros, pools.rate.currency);

    // A model with no registered price cannot be estimated, and
    // admission must not invent a ceiling — guessing one is how a turn
    // ran on the cheapest model and billed at the most expensive.
    // Refuse with a code the transport can turn into a 402 that says
    // why, rather than letting the throw become a 500.
    let estimated: Money;
    try {
      estimated = estimateWorstCaseCharge(modelId, pools.rate);
    } catch (error) {
      if (error instanceof UnknownModelError) {
        return {
          allowed: false,
          code: "unknown_model",
          reason: error.message,
          billingMode: "subscription",
          usage: {
            used: pools.used.amount,
            limit: pools.allowance.amount,
            percentage: 0,
          },
          usingTrialCredits: false,
          graceActive: false,
        };
      }
      throw error;
    }
    const percentage =
      pools.allowance.amount > 0
        ? Math.min(
            100,
            Math.round((pools.used.amount / pools.allowance.amount) * 100)
          )
        : 0;

    const base = {
      billingMode: "subscription" as const,
      usage: {
        used: pools.used.amount,
        limit: pools.allowance.amount,
        percentage,
      },
      estimated,
      creditBalance: pools.topupBalance,
      remaining,
      graceActive: false,
    };

    // Plan + top-up first; trial is fallback only. The comparisons are
    // between amounts now, not between whole tugrik standing in for
    // them — the pools, the ceiling and the outstanding reservations
    // are all in the deployment's own currency.
    const nonTrial = subtract(
      add(pools.planRemaining, pools.topupBalance),
      reserved
    );
    if (compare(nonTrial, estimated) >= 0) {
      return { allowed: true, usingTrialCredits: false, ...base };
    }
    // Reservations count against the trial pool once the non-trial
    // pool (minus reservations) can no longer cover them.
    const overflow = subtract(
      reserved,
      add(pools.planRemaining, pools.topupBalance)
    );
    const trialAvailable = isNegative(overflow)
      ? pools.trialRemaining
      : subtract(pools.trialRemaining, overflow);
    if (trialActive && compare(trialAvailable, estimated) >= 0) {
      return { allowed: true, usingTrialCredits: true, ...base };
    }
    return remaining.amount > 0
      ? {
          allowed: false,
          code: "insufficient_credits",
          // Both amounts name their own currency: a deployment that
          // bills in dollars was being told it was short of tugrik.
          reason: `Insufficient credits for this request (need ~${formatMoney(estimated, "en-US")}, have ${formatMoney(remaining, "en-US")}). Top up to continue.`,
          usingTrialCredits: false,
          ...base,
        }
      : {
          allowed: false,
          code: "allowance_depleted",
          reason:
            "Monthly credit allowance depleted. Top up or upgrade your plan to continue.",
          usingTrialCredits: false,
          ...base,
        };
  }
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
 * Record token consumption for an AI request and charge it.
 *
 * One transaction, serialized per workspace by the same advisory lock
 * `checkQuota` takes for admission:
 *
 * 1. Insert the `usage_records` row (the full charge, for reporting).
 * 2. Charge the plan allowance first: `monthly_usage.charged_mnt` grows
 *    by at most what is left of the allowance this period.
 * 3. Send the remainder — if any — to exactly one of the trial grant
 *    (when the request was admitted on trial credits and the grant
 *    still covers it) or the top-up balance. Never both, and never the
 *    part the allowance already funded: admission sums the three pools,
 *    so charging two of them for one turn would count it twice.
 * 4. Settle the admission reservation by `requestId`.
 *
 * The `monthly_usage` and `trial_credits` rows are read `FOR UPDATE`
 * and every decrement is SQL arithmetic, so nothing here is
 * read-modify-write in JavaScript.
 *
 * Not idempotent per `requestId`: calling this twice for one request
 * records and charges twice. The execution lifecycle's compare-and-swap
 * is what guarantees a single call per execution.
 */
export async function recordTokenUsage(
  params: RecordUsageParams
): Promise<SettlementOutcome> {
  const periodStart = getCurrentPeriodStart();
  const periodEnd = getCurrentPeriodEnd();

  const settings = await getBillingSettings();

  // Exact in micros and carrying its currency: what the ledger's
  // `*_micros` columns and every surface that shows an amount read.
  const rate: BillingRate = {
    currency: settings.currency,
    usdRateMicros: settings.usdRateMicros,
    marginBp: settings.marginBp,
  };
  const { providerCost, charged } = chargeFor(
    params.model ?? "unknown",
    params.inputTokens ?? 0,
    params.outputTokens ?? 0,
    rate
  );

  const requestId =
    params.requestId ??
    (typeof params.metadata === "object" && params.metadata !== null
      ? ((params.metadata as Record<string, unknown>).requestId as
          | string
          | undefined)
      : undefined) ??
    null;

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${params.workspaceId}))`
    );

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
      providerCostMicros: providerCost.amount,
      marginBp: rate.marginBp,
      usdRateMicros: rate.usdRateMicros,
      chargedMicros: charged.amount,
      currency: charged.currency,
      requestId,
      conversationId:
        typeof params.metadata === "object" && params.metadata !== null
          ? (((params.metadata as Record<string, unknown>).conversationId as
              | string
              | undefined) ?? null)
          : null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });

    // The plan allowance funds the charge first. Make sure the period
    // row exists, lock it, and take only what is left of the allowance.
    const billing = await getWorkspaceBilling(params.workspaceId);
    const allowance = getPlanMonthlyAllowance(
      billing.plan?.slug ?? "free",
      rate.currency
    );

    await tx
      .insert(monthlyUsage)
      .values({
        id: crypto.randomUUID(),
        workspaceId: params.workspaceId,
        periodStart,
        periodEnd,
        tokensUsed: 0,
        allowanceUsedMicros: 0,
        currency: rate.currency,
        requestCount: 0,
      })
      .onConflictDoNothing({
        target: [monthlyUsage.workspaceId, monthlyUsage.periodStart],
      });

    const periodRows = await tx
      .select({ allowanceUsedMicros: monthlyUsage.allowanceUsedMicros })
      .from(monthlyUsage)
      .where(
        and(
          eq(monthlyUsage.workspaceId, params.workspaceId),
          eq(monthlyUsage.periodStart, periodStart)
        )
      )
      .for("update")
      .limit(1);

    // The split is arithmetic on the amounts themselves now. It used to
    // be decided in whole tugrik and the typed values derived from it by
    // ratio, which meant the money followed a number that had already
    // rounded. The allowance takes the lesser of the charge and what is
    // left of it; whatever remains goes to exactly one of trial or
    // top-up, never both. Taking the remainder by subtraction keeps
    // `charged === plan + topup + trial` exact.
    const allowanceUsed = money(
      Number(periodRows[0]?.allowanceUsedMicros ?? 0),
      rate.currency
    );
    const allowanceLeft = subtract(allowance, allowanceUsed);
    const plan = isNegative(allowanceLeft)
      ? zero(rate.currency)
      : compare(charged, allowanceLeft) <= 0
        ? charged
        : allowanceLeft;
    const remainder = subtract(charged, plan);

    await tx
      .update(monthlyUsage)
      .set({
        tokensUsed: sql`${monthlyUsage.tokensUsed} + ${params.totalTokens}`,
        allowanceUsedMicros: sql`${monthlyUsage.allowanceUsedMicros} + ${plan.amount}`,
        requestCount: sql`${monthlyUsage.requestCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(monthlyUsage.workspaceId, params.workspaceId),
          eq(monthlyUsage.periodStart, periodStart)
        )
      );

    let trial = zero(rate.currency);
    let topup = zero(rate.currency);

    if (!isZero(remainder)) {
      // Lock the trial row (if any) so the pool decision is made once.
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
        (trialRow[0]?.remainingMicros ?? 0) >= remainder.amount;

      if (trialHasSufficient) {
        trial = remainder;
        await tx
          .update(trialCredits)
          .set({
            remainingMicros: sql`GREATEST(${trialCredits.remainingMicros} - ${remainder.amount}, 0)`,
            usedMicros: sql`${trialCredits.usedMicros} + ${remainder.amount}`,
            creditsRemaining: sql`GREATEST(${trialCredits.creditsRemaining} - ${params.totalTokens}, 0)`,
            creditsUsed: sql`${trialCredits.creditsUsed} + ${params.totalTokens}`,
            status: sql`CASE WHEN GREATEST(${trialCredits.remainingMicros} - ${remainder.amount}, 0) <= 0 THEN 'depleted' ELSE ${trialCredits.status} END`,
            depletedAt: sql`CASE WHEN GREATEST(${trialCredits.remainingMicros} - ${remainder.amount}, 0) <= 0 THEN NOW() ELSE ${trialCredits.depletedAt} END`,
          })
          .where(eq(trialCredits.workspaceId, params.workspaceId));
      } else {
        // Top-up balance. GREATEST keeps the stored balance at zero when
        // the charge exceeds it; total_used_micros still records the
        // full remainder so the shortfall is visible.
        topup = remainder;
        await tx
          .update(creditBalances)
          .set({
            balanceMicros: sql`GREATEST(${creditBalances.balanceMicros} - ${remainder.amount}, 0)`,
            totalUsedMicros: sql`${creditBalances.totalUsedMicros} + ${remainder.amount}`,
            updatedAt: new Date(),
          })
          .where(eq(creditBalances.workspaceId, params.workspaceId));
      }
    }

    // Settle the admission reservation so it stops counting against
    // the workspace's available balance.
    if (requestId) {
      await tx
        .update(creditReservations)
        .set({ status: "settled", settledAt: new Date() })
        .where(eq(creditReservations.requestId, requestId));
    }

    return { charged, plan, topup, trial };
  });

  checkNotificationTriggers(params.workspaceId).catch((err) =>
    console.error("[Notifications] Error checking triggers:", err)
  );

  return outcome;
}

/**
 * Was this request already charged? Answers `executions.reconcile()`'s
 * question for a row stuck in `settling`: a `usage_records` row for
 * the request means settlement committed; none means it did not.
 */
export async function findSettlementByRequestId(
  workspaceId: string,
  requestId: string
): Promise<{ charged?: Money } | null> {
  const rows = await db
    .select({
      chargedMicros: usageRecords.chargedMicros,
      currency: usageRecords.currency,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.workspaceId, workspaceId),
        eq(usageRecords.requestId, requestId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.currency
    ? { charged: money(Number(row.chargedMicros ?? 0), row.currency) }
    : {};
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
  const settings = await getBillingSettings();
  const allowance = getPlanMonthlyAllowance(planSlug, settings.currency);
  const used = Math.max(0, monthly.allowanceUsedMicros ?? 0);
  const percentage =
    allowance.amount > 0
      ? Math.min(100, Math.round((used / allowance.amount) * 100))
      : 0;

  return {
    percentage,
    warningThreshold: percentage >= 80,
    criticalThreshold: percentage >= 100,
    /**
     * The amounts behind the percentage, in micros of the deployment's
     * billing currency. Returned so a caller that needs them — the
     * quota email — reads them from the one place that computes them
     * rather than repeating the arithmetic against columns of its own.
     */
    usedMicros: used,
    limitMicros: allowance.amount,
  };
}

// Re-export types
export type {
  QuotaCheckResult,
  RecordUsageParams,
  UsageSummary,
} from "./quota-types";

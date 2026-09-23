import "server-only";

/**
 * Cross-tenant usage and plan read models for a platform console: what
 * the platform spent on providers, on which models, for which users, and
 * which plans its workspaces are on. Cross-tenant by design — every
 * caller passes through `requireAdmin` first.
 *
 * Amounts are `Money`: provider cost is always USD micros, and a charge
 * is in the currency it was recorded in. A product converts or formats
 * at its edge (`formatMoney`, `toMajor`), never by re-deriving the
 * engine's arithmetic.
 */

import { db } from "@intelligo-dev/core/db";
import {
  organization,
  plans,
  subscriptions,
  usageRecords,
  users,
} from "@intelligo-dev/core/db/schema";
import { currency, money, type Money } from "@intelligo-dev/core/money";
import {
  PROVIDER_CURRENCY,
  applyRate,
  type BillingRate,
} from "@intelligo-dev/executions/pricing";
import { count, desc, eq, sql } from "drizzle-orm";

const costSum = sql<string>`coalesce(sum(${usageRecords.providerCostMicros}), 0)`;
const usd = (micros: unknown): Money =>
  money(Number(micros ?? 0), PROVIDER_CURRENCY);

/** Provider cost across every recorded request. */
export async function getProviderCostTotal(): Promise<Money> {
  const [row] = await db.select({ micros: costSum }).from(usageRecords);
  return usd(row?.micros);
}

export type UsageByModelRow = {
  model: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  providerCost: Money;
};

/** The models that cost the most, with their token totals. */
export async function getUsageByModel(limit = 20): Promise<UsageByModelRow[]> {
  const rows = await db
    .select({
      model: usageRecords.model,
      requests: count(),
      inputTokens: sql<string>`coalesce(sum(${usageRecords.inputTokens}), 0)`,
      outputTokens: sql<string>`coalesce(sum(${usageRecords.outputTokens}), 0)`,
      micros: costSum,
    })
    .from(usageRecords)
    .groupBy(usageRecords.model)
    .orderBy(desc(costSum))
    .limit(limit);
  return rows.map((r) => ({
    model: r.model,
    requests: Number(r.requests),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    providerCost: usd(r.micros),
  }));
}

export type UsageByUserRow = {
  userId: string;
  name: string | null;
  email: string | null;
  requests: number;
  totalTokens: number;
  providerCost: Money;
};

/** The users who cost the most, across every workspace. */
export async function getUsageByUser(limit = 20): Promise<UsageByUserRow[]> {
  const rows = await db
    .select({
      userId: usageRecords.userId,
      name: users.name,
      email: users.email,
      requests: count(),
      totalTokens: sql<string>`coalesce(sum(${usageRecords.totalTokens}), 0)`,
      micros: costSum,
    })
    .from(usageRecords)
    .leftJoin(users, eq(users.id, usageRecords.userId))
    .groupBy(usageRecords.userId, users.name, users.email)
    .orderBy(desc(costSum))
    .limit(limit);
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? null,
    email: r.email ?? null,
    requests: Number(r.requests),
    totalTokens: Number(r.totalTokens),
    providerCost: usd(r.micros),
  }));
}

export type PlanDistributionRow = {
  planSlug: string;
  subscriptions: number;
};

/** How many workspaces hold a subscription on each plan. */
export async function getPlanDistribution(): Promise<PlanDistributionRow[]> {
  const rows = await db
    .select({ planSlug: plans.slug, n: count() })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .groupBy(plans.slug);
  return rows.map((r) => ({ planSlug: r.planSlug, subscriptions: Number(r.n) }));
}

export type UsageRecordRow = {
  id: string;
  recordedAt: Date;
  workspaceName: string | null;
  userEmail: string | null;
  model: string | null;
  agent: string | null;
  inputTokens: number;
  outputTokens: number;
  providerCost: Money;
  /** The rate the charge was computed at; null for a record with none. */
  rate: BillingRate | null;
  charged: Money;
  /**
   * What the recorded rate applied to the recorded cost gives. A charge
   * that differs means the pricing pipeline is broken somewhere.
   */
  expectedCharge: Money | null;
};

/** The most recent usage records, each with its charge audited. */
export async function listUsageRecords(limit = 200): Promise<UsageRecordRow[]> {
  const rows = await db
    .select({
      id: usageRecords.id,
      recordedAt: usageRecords.recordedAt,
      workspaceName: organization.name,
      userEmail: users.email,
      model: usageRecords.model,
      agent: usageRecords.agent,
      inputTokens: usageRecords.inputTokens,
      outputTokens: usageRecords.outputTokens,
      providerCostMicros: usageRecords.providerCostMicros,
      marginBp: usageRecords.marginBp,
      usdRateMicros: usageRecords.usdRateMicros,
      chargedMicros: usageRecords.chargedMicros,
      currency: usageRecords.currency,
    })
    .from(usageRecords)
    .leftJoin(organization, eq(organization.id, usageRecords.workspaceId))
    .leftJoin(users, eq(users.id, usageRecords.userId))
    .orderBy(desc(usageRecords.recordedAt))
    .limit(Math.min(Math.max(1, limit), 1000));

  return rows.map((r) => {
    const providerCost = usd(r.providerCostMicros);
    const rate: BillingRate | null =
      r.usdRateMicros > 0
        ? {
            currency: currency(r.currency),
            usdRateMicros: r.usdRateMicros,
            marginBp: r.marginBp,
          }
        : null;
    let expectedCharge: Money | null = null;
    if (rate) {
      try {
        expectedCharge = applyRate(providerCost, rate);
      } catch {
        // A record whose own snapshot is not a valid rate (a USD row
        // with a conversion) is itself the finding; it has no expected
        // charge to compare against.
        expectedCharge = null;
      }
    }
    return {
      id: r.id,
      recordedAt: r.recordedAt,
      workspaceName: r.workspaceName ?? null,
      userEmail: r.userEmail ?? null,
      model: r.model,
      agent: r.agent,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      providerCost,
      rate,
      charged: money(r.chargedMicros, currency(r.currency)),
      expectedCharge,
    };
  });
}

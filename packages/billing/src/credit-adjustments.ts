/**
 * Credit given back or given away: a refund of a charge, or a credit a
 * product decides on (goodwill, a promotion). A credit lands on the
 * workspace's top-up balance and is recorded three ways: the ledger
 * (`credit_balances`), a `usage_records` row of type `credit` with a
 * negative charge, and an audit event naming who granted it and why.
 * It is not an execution: nothing ran.
 *
 * A charge that should never have happened — a job that failed — is
 * not refunded; its execution fails and the hold is released
 * (`run.fail()`). A refund is for money that was rightly taken and is
 * given back.
 */

import { and, eq, ne, sql } from "drizzle-orm";

import { recordAuditEvent } from "@intelligo-dev/audit";
import { db } from "@intelligo-dev/core/db";
import { creditBalances, usageRecords } from "@intelligo-dev/core/db/schema";
import { compare, money, type Money } from "@intelligo-dev/core/money";

import { getBillingSettings } from "./billing-settings";
import { ChargeError } from "./charge-error";
import { assertChargeable } from "./quota";

export type CreditResult = {
  credited: Money;
  /** The request was credited before; nothing was credited again. */
  replayed: boolean;
};

export type CreditOptions = {
  /** Why, in the operator's words; recorded on the usage row and the audit event. */
  reason: string;
  /**
   * The idempotency key, per workspace: a second call with one already
   * credited returns that credit with `replayed: true`. Stored as
   * `credit:<requestId>`, so it never meets a charge's key.
   */
  requestId: string;
  /** Who granted it; the audit event's actor. */
  actorId?: string | null;
};

/**
 * Add `amount` to the workspace's top-up balance and record it. Credit
 * is not a purchase: `total_purchased_micros` is left alone, and so is
 * `total_used_micros` — what was used stays used.
 */
export function creditWorkspace(
  workspaceId: string,
  amount: Money,
  options: CreditOptions
): Promise<CreditResult> {
  return applyCredit(
    workspaceId,
    amount,
    { ...options, requestId: `credit:${options.requestId}` },
    null
  );
}

/**
 * Give back what the request `requestId` was charged — all of it, or
 * `amount` of it — as top-up credit, whichever pool (allowance, top-up,
 * trial) paid the charge. One refund per charge: its key is
 * `refund:<requestId>`, so a repeated call (a retried webhook, a double
 * click) replays the first, a partial one included.
 */
export async function refundCharge(
  workspaceId: string,
  requestId: string,
  options: { reason: string; amount?: Money; actorId?: string | null }
): Promise<CreditResult> {
  const [charge] = await db
    .select({
      chargedMicros: usageRecords.chargedMicros,
      currency: usageRecords.currency,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.workspaceId, workspaceId),
        eq(usageRecords.requestId, requestId),
        ne(usageRecords.type, "credit")
      )
    )
    .limit(1);
  const charged =
    charge?.currency && Number(charge.chargedMicros) > 0
      ? money(Number(charge.chargedMicros), charge.currency)
      : null;
  if (!charged) {
    throw new ChargeError(
      "charge_not_found",
      `No charge for request ${requestId} in this workspace.`
    );
  }
  const amount = options.amount ?? charged;
  if (amount.currency !== charged.currency || compare(amount, charged) > 0) {
    throw new ChargeError(
      "refund_exceeds_charge",
      "A refund cannot exceed the charge it refunds."
    );
  }
  return applyCredit(
    workspaceId,
    amount,
    {
      reason: options.reason,
      requestId: `refund:${requestId}`,
      actorId: options.actorId,
    },
    requestId
  );
}

async function applyCredit(
  workspaceId: string,
  amount: Money,
  options: CreditOptions,
  refundOf: string | null
): Promise<CreditResult> {
  const { currency } = await getBillingSettings();
  assertChargeable(amount, currency);
  const metadata = {
    reason: options.reason,
    ...(refundOf ? { refundOf } : {}),
  };

  // The replay check runs under the workspace lock settlement takes, so
  // two concurrent calls with one key credit once.
  const result = await db.transaction(async (tx): Promise<CreditResult> => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`
    );
    const [prior] = await tx
      .select({
        chargedMicros: usageRecords.chargedMicros,
        currency: usageRecords.currency,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.workspaceId, workspaceId),
          eq(usageRecords.requestId, options.requestId),
          eq(usageRecords.type, "credit")
        )
      )
      .limit(1);
    if (prior?.currency) {
      return {
        credited: money(-Number(prior.chargedMicros), prior.currency),
        replayed: true,
      };
    }

    const ledger = await tx
      .insert(creditBalances)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        balanceMicros: amount.amount,
        currency: amount.currency,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: creditBalances.workspaceId,
        set: {
          balanceMicros: sql`${creditBalances.balanceMicros} + ${amount.amount}`,
          updatedAt: new Date(),
        },
        setWhere: sql`${creditBalances.currency} = ${amount.currency}`,
      })
      .returning({ id: creditBalances.id });
    if (ledger.length === 0) {
      throw new ChargeError(
        "currency_mismatch",
        `The workspace's ledger is not in ${amount.currency}.`
      );
    }
    await tx.insert(usageRecords).values({
      id: crypto.randomUUID(),
      workspaceId,
      userId: null,
      type: "credit",
      agent: refundOf ? "billing.refund" : "billing.credit",
      chargedMicros: -amount.amount,
      currency: amount.currency,
      requestId: options.requestId,
      metadata: JSON.stringify(metadata),
    });
    return { credited: amount, replayed: false };
  });

  if (!result.replayed) {
    await recordAuditEvent({
      workspaceId,
      actorId: options.actorId ?? null,
      action: refundOf ? "billing.refund" : "billing.credit",
      resourceKind: "credit",
      resourceId: options.requestId,
      metadata: {
        amount: amount.amount,
        currency: amount.currency,
        ...metadata,
      },
    });
  }
  return result;
}

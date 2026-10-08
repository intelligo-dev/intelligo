/**
 * Taking purchased credit back when the payment for it is refunded or
 * disputed at Stripe.
 *
 * The share of the purchase's grant that matches the share of the
 * payment refunded or disputed is debited from the workspace's balance,
 * never below zero: credit already spent stays spent. Each reversal is
 * recorded as a `usage_records` row of type `credit` with a positive
 * charge (credit removed), keyed by the purchase and the refund's charge
 * or the dispute, and as an audit event. The rows are read back under
 * the workspace lock settlement takes, so a redelivered event, a second
 * partial refund, or a dispute after a refund never takes back more than
 * the purchase granted.
 */

import { and, eq, like, sql } from "drizzle-orm";

import { recordAuditEvent } from "@intelligo-dev/audit";
import { db } from "@intelligo-dev/core/db";
import {
  creditBalances,
  creditPurchases,
  usageRecords,
} from "@intelligo-dev/core/db/schema";
import { createLogger } from "@intelligo-dev/core/logger";

const log = createLogger("CreditReversal");

/** Purchase statuses after which the purchase is never granted again. */
export const REVERSED_PURCHASE_STATUSES = ["refunded", "disputed"] as const;

export type CreditReversalInput = {
  /** The Stripe payment intent the purchase was paid with. */
  paymentIntentId: string;
  /** The Checkout session that took the payment, when known. */
  checkoutSessionId?: string | null;
  /**
   * What this refund or dispute covers so far, as a share of the
   * payment: `covered` of `paid`, both in the payment's minor units.
   * For a refund it is the charge's cumulative refunded amount.
   */
  covered: number;
  paid: number;
  /** One per refunded charge or per dispute: `refund:<charge>`, `dispute:<id>`. */
  key: string;
  /** The status the purchase takes; null leaves it as it is. */
  status: (typeof REVERSED_PURCHASE_STATUSES)[number] | null;
  reason: "refund" | "dispute";
};

export type CreditReversalResult =
  | { outcome: "no_purchase" }
  | { outcome: "not_granted"; purchaseId: string }
  | { outcome: "ledger_currency_mismatch"; purchaseId: string }
  | {
      outcome: "reversed";
      purchaseId: string;
      /** The credit this reversal covers, in micros. */
      reversedMicros: number;
      /** What was actually debited; less when the credit was already spent. */
      debitedMicros: number;
      currency: string;
    };

async function findPurchase(input: CreditReversalInput) {
  const [byIntent] = await db
    .select()
    .from(creditPurchases)
    .where(eq(creditPurchases.stripePaymentIntentId, input.paymentIntentId))
    .limit(1);
  if (byIntent) return byIntent;
  if (!input.checkoutSessionId) return null;
  const [bySession] = await db
    .select()
    .from(creditPurchases)
    .where(eq(creditPurchases.stripeCheckoutSessionId, input.checkoutSessionId))
    .limit(1);
  return bySession ?? null;
}

/**
 * Take back the share of a credit purchase that a refund or dispute
 * covers. A payment that bought no credit (a subscription invoice)
 * answers `no_purchase`; a purchase that was never granted is marked
 * with `status`, so a late grant of it is refused, and nothing is
 * debited.
 */
export async function reverseCreditPurchase(
  input: CreditReversalInput
): Promise<CreditReversalResult> {
  const purchase = await findPurchase(input);
  if (!purchase) return { outcome: "no_purchase" };

  if (purchase.status !== "completed" && !isReversed(purchase.status)) {
    if (input.status) {
      await db
        .update(creditPurchases)
        .set({ status: input.status })
        .where(
          and(
            eq(creditPurchases.id, purchase.id),
            eq(creditPurchases.status, purchase.status)
          )
        );
    }
    return { outcome: "not_granted", purchaseId: purchase.id };
  }

  const granted = Math.max(0, Number(purchase.grantedMicros ?? 0));
  const currency = purchase.grantedCurrency;
  if (!currency || granted === 0 || input.paid <= 0) {
    return { outcome: "not_granted", purchaseId: purchase.id };
  }
  const share = Math.min(1, Math.max(0, input.covered / input.paid));
  const target = Math.min(granted, Math.floor(granted * share));
  const keyPrefix = `reversal:${purchase.id}:`;
  const requestId = `${keyPrefix}${input.key}`;

  const result = await db.transaction(
    async (tx): Promise<CreditReversalResult> => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${purchase.workspaceId}))`
      );
      const [prior] = await tx
        .select({
          forKey: sql<string>`coalesce(sum(case when ${usageRecords.requestId} = ${requestId} then ${usageRecords.chargedMicros} else 0 end), 0)`,
          total: sql<string>`coalesce(sum(${usageRecords.chargedMicros}), 0)`,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.workspaceId, purchase.workspaceId),
            eq(usageRecords.type, "credit"),
            like(usageRecords.requestId, `${keyPrefix}%`)
          )
        );
      const reversed = Math.min(
        target - Number(prior?.forKey ?? 0),
        granted - Number(prior?.total ?? 0)
      );

      if (input.status) {
        await tx
          .update(creditPurchases)
          .set({ status: input.status })
          .where(eq(creditPurchases.id, purchase.id));
      }
      if (reversed <= 0) {
        return {
          outcome: "reversed",
          purchaseId: purchase.id,
          reversedMicros: 0,
          debitedMicros: 0,
          currency,
        };
      }

      const [ledger] = await tx
        .select({
          balanceMicros: creditBalances.balanceMicros,
          currency: creditBalances.currency,
        })
        .from(creditBalances)
        .where(eq(creditBalances.workspaceId, purchase.workspaceId))
        .limit(1);
      if (ledger && ledger.currency !== currency) {
        return {
          outcome: "ledger_currency_mismatch",
          purchaseId: purchase.id,
        };
      }
      const debited = Math.min(
        reversed,
        Math.max(0, Number(ledger?.balanceMicros ?? 0))
      );
      if (ledger) {
        await tx
          .update(creditBalances)
          .set({
            balanceMicros: sql`${creditBalances.balanceMicros} - ${debited}`,
            totalPurchasedMicros: sql`greatest(${creditBalances.totalPurchasedMicros} - ${reversed}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(creditBalances.workspaceId, purchase.workspaceId));
      }
      await tx.insert(usageRecords).values({
        id: crypto.randomUUID(),
        workspaceId: purchase.workspaceId,
        userId: null,
        type: "credit",
        agent: "billing.reversal",
        chargedMicros: reversed,
        currency,
        requestId,
        metadata: JSON.stringify({
          reason: input.reason,
          purchaseId: purchase.id,
          debitedMicros: debited,
        }),
      });
      return {
        outcome: "reversed",
        purchaseId: purchase.id,
        reversedMicros: reversed,
        debitedMicros: debited,
        currency,
      };
    }
  );

  if (result.outcome === "ledger_currency_mismatch") {
    log.error("Workspace ledger is in another currency; credit not reversed", {
      workspaceId: purchase.workspaceId,
      purchaseId: purchase.id,
      grantedCurrency: currency,
    });
    return result;
  }
  if (result.outcome === "reversed" && result.reversedMicros > 0) {
    await recordAuditEvent({
      workspaceId: purchase.workspaceId,
      actorId: null,
      actorKind: "system",
      action: "billing.credit_reversed",
      resourceKind: "credit_purchase",
      resourceId: purchase.id,
      metadata: {
        reason: input.reason,
        amount: result.reversedMicros,
        debited: result.debitedMicros,
        currency,
      },
    });
    log.info("Purchased credit reversed", {
      workspaceId: purchase.workspaceId,
      purchaseId: purchase.id,
      reason: input.reason,
      reversedMicros: result.reversedMicros,
      debitedMicros: result.debitedMicros,
    });
  }
  return result;
}

function isReversed(status: string): boolean {
  return (REVERSED_PURCHASE_STATUSES as readonly string[]).includes(status);
}

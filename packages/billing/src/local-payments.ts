/**
 * Payments taken through a registered payment provider — QR-and-poll
 * methods such as QPay, SocialPay, PIX or UPI — recorded and granted on
 * the server.
 *
 * Opening an invoice writes a `payments` row with the price the server
 * decided, so nothing the browser sends later can change who pays or
 * what it costs. Settling asks the provider that issued the invoice
 * whether it was paid and, when it was, marks the row fulfilled and
 * applies the grant in one transaction. The mark is a conditional
 * update on `fulfilled_at`, so any number of concurrent polls grant
 * once.
 *
 * What a reference buys is the product's decision: settlement asks the
 * caller's `fulfil` for the grant and applies it with the same writes a
 * plan grant and a Stripe credit purchase use.
 */

import { and, asc, eq, gt, isNull, lt } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";
import { payments, type Payment } from "@intelligo-dev/core/db/schema";
import { createLogger } from "@intelligo-dev/core/logger";
import { toMinor, type Money } from "@intelligo-dev/core/money";

import { getBillingSettings } from "./billing-settings";
import { BillingServiceError } from "./checkout";
import { creditPurchasedBalance } from "./credit-ledger";
import { invalidateFeatureCache } from "./features";
import {
  currentPaymentMode,
  getPaymentProviderFor,
  type CreatePaymentResult,
} from "./payment";
import { writePlanGrant } from "./plan-grant";

const log = createLogger("LocalPayments");

/**
 * What a paid invoice gives the workspace: a plan by slug, or credit. A
 * plan with `days` lapses that many days after it is granted (or after the
 * same plan's running grant ends); without, it has no end.
 */
export type LocalPaymentGrant =
  { plan: string; days?: number } | { credits: Money };

/**
 * What a reference sells for and what paying it grants — the product's
 * answer, looked up on the server when the invoice is opened and again
 * when it is settled.
 */
export type LocalPaymentOffer = {
  price: Money;
  grant: LocalPaymentGrant;
  /** The line the provider shows the buyer. */
  description?: string;
};

/** An invoice as the buyer's poll sees it; an expired invoice is `failed`. */
export type LocalPaymentStatus = "pending" | "paid" | "failed";

export type OpenLocalInvoiceInput = {
  workspaceId: string;
  /** The signed-in buyer, resolved from the session. */
  userId: string;
  /** What is being bought, in the product's words: a plan slug, a bundle id. */
  reference: string;
  /** The price, decided on the server. */
  price: Money;
  /** The line the provider shows the buyer; defaults to `reference`. */
  description?: string;
};

/**
 * Issue an invoice for `price` through the provider PAYMENT_MODE names
 * and record it as `pending`. Returns the provider's invoice: its id,
 * and the QR code and app deeplinks the buyer pays with.
 *
 * @throws {BillingServiceError} `invalid_bundle` for a price that is
 *   not positive; whatever the provider throws when it refuses.
 */
export async function openLocalInvoice(
  input: OpenLocalInvoiceInput
): Promise<CreatePaymentResult> {
  const amountMinor = toMinor(input.price);
  if (amountMinor <= 0) {
    throw new BillingServiceError(
      "invalid_bundle",
      `A local invoice needs a positive price; "${input.reference}" is priced at ${amountMinor}.`
    );
  }

  const mode = currentPaymentMode();
  const provider = getPaymentProviderFor(mode);
  if (provider.currency && provider.currency !== input.price.currency) {
    throw new BillingServiceError(
      "currency_mismatch",
      `The ${mode} provider charges in ${provider.currency}; "${input.reference}" is priced in ${input.price.currency}.`
    );
  }
  const invoice = await provider.createPayment({
    amount: amountMinor,
    description: input.description ?? input.reference,
    userId: input.userId,
    planSlug: input.reference,
  });

  await db.insert(payments).values({
    id: crypto.randomUUID(),
    provider: mode,
    invoiceId: invoice.invoiceId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    reference: input.reference,
    amountMinor,
    currency: input.price.currency,
    status: "pending",
  });

  log.info("Local invoice opened", {
    workspaceId: input.workspaceId,
    invoiceId: invoice.invoiceId,
    provider: mode,
    reference: input.reference,
  });

  return invoice;
}

export type SettleLocalInvoiceInput = {
  invoiceId: string;
  /** The caller's workspace; an invoice of any other is not found. */
  workspaceId: string;
  /**
   * What the paid invoice grants. Called once the provider reports it
   * paid and before anything is written, so a throw leaves the invoice
   * unfulfilled for the next settle to retry.
   */
  fulfil: (payment: Payment) => LocalPaymentGrant | Promise<LocalPaymentGrant>;
};

/**
 * Ask the issuing provider about `invoiceId` and settle it: grant what
 * it bought when paid, mark it failed when the provider says it failed
 * or expired, and report `pending` otherwise. Settling an invoice that
 * was already fulfilled reports `paid` and grants nothing.
 *
 * @throws {BillingServiceError}
 *   `payment_not_found` when no invoice of `workspaceId` has the id;
 *   `payment_mismatch` when the provider reports a paid amount other
 *   than the invoice's price;
 *   `currency_mismatch` when credit is granted in a currency other than
 *   the deployment's or the workspace ledger's;
 *   `invalid_plan` when the granted plan has no row.
 *   Nothing is written in any of these cases.
 */
export async function settleLocalInvoice(
  input: SettleLocalInvoiceInput
): Promise<LocalPaymentStatus> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.invoiceId, input.invoiceId),
        eq(payments.workspaceId, input.workspaceId)
      )
    )
    .limit(1);
  if (!payment) {
    throw new BillingServiceError(
      "payment_not_found",
      "No invoice with that id belongs to this workspace."
    );
  }

  if (payment.fulfilledAt) return "paid";
  if (payment.status === "failed") return "failed";

  const check = await getPaymentProviderFor(payment.provider).checkPayment(
    payment.invoiceId
  );

  if (check.status === "failed" || check.status === "expired") {
    await db
      .update(payments)
      .set({ status: "failed" })
      .where(and(eq(payments.id, payment.id), isNull(payments.fulfilledAt)));
    log.info("Local invoice failed", {
      workspaceId: payment.workspaceId,
      invoiceId: payment.invoiceId,
      providerStatus: check.status,
    });
    return "failed";
  }

  if (check.status !== "paid") return "pending";

  if (check.amount !== payment.amountMinor) {
    log.error("Provider reports a paid amount other than the invoice's", {
      workspaceId: payment.workspaceId,
      invoiceId: payment.invoiceId,
      invoicedMinor: payment.amountMinor,
      reportedMinor: check.amount,
    });
    throw new BillingServiceError(
      "payment_mismatch",
      "The provider reports a different amount than was invoiced."
    );
  }

  const grant = await input.fulfil(payment);

  if ("credits" in grant) {
    const ledgerCurrency = (await getBillingSettings()).currency;
    if (grant.credits.currency !== ledgerCurrency) {
      throw currencyMismatch(payment, grant.credits.currency);
    }
  }

  const fulfilled = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(payments)
      .set({ status: "paid", fulfilledAt: new Date() })
      .where(and(eq(payments.id, payment.id), isNull(payments.fulfilledAt)))
      .returning({ id: payments.id });
    if (claimed.length === 0) return false;

    if ("plan" in grant) {
      await writePlanGrant(tx, {
        workspaceId: payment.workspaceId,
        planSlug: grant.plan,
        days: grant.days,
        reason: `local payment ${payment.invoiceId}`,
        actorId: payment.userId,
      });
    } else if (
      !(await creditPurchasedBalance(tx, payment.workspaceId, grant.credits))
    ) {
      throw currencyMismatch(payment, grant.credits.currency);
    }
    return true;
  });

  if (fulfilled) {
    if ("plan" in grant) invalidateFeatureCache(payment.workspaceId);
    log.info("Local invoice paid and granted", {
      workspaceId: payment.workspaceId,
      invoiceId: payment.invoiceId,
      reference: payment.reference,
    });
  }
  return "paid";
}

function currencyMismatch(payment: Payment, granted: string) {
  log.error("Local payment grants credit in another currency", {
    workspaceId: payment.workspaceId,
    invoiceId: payment.invoiceId,
    grantedCurrency: granted,
  });
  return new BillingServiceError(
    "currency_mismatch",
    `Credit in ${granted} cannot be added to this workspace's ledger.`
  );
}

export type SettlePendingLocalInvoicesInput = {
  fulfil: SettleLocalInvoiceInput["fulfil"];
  /**
   * Settle this invoice only, whichever workspace recorded it — a
   * provider's callback naming it. The provider is still asked; nothing
   * the callback said is taken as payment.
   */
  invoiceId?: string;
  /** Skip invoices opened after this, which the buyer's tab is still polling. Default: a minute ago. */
  openedBefore?: Date;
  /** Skip invoices opened before this, long expired at the provider. Default: a day ago. */
  openedAfter?: Date;
  /** At most this many invoices per run, oldest first. Default 100. */
  limit?: number;
};

export type SettlePendingLocalInvoicesResult = Record<
  LocalPaymentStatus,
  number
> & { errors: string[] };

/**
 * Settle the invoices nobody is polling: a buyer who paid in their bank's
 * app and closed the tab is granted what they bought on the next run.
 * Every unfulfilled `pending` invoice in the window is settled with
 * `settleLocalInvoice` against the workspace that recorded it — asked of
 * its provider, granted once, marked failed when expired. Run it from a
 * schedule (the `payment-poll` item's route does) and from a provider's
 * callback with `invoiceId`.
 */
export async function settlePendingLocalInvoices(
  input: SettlePendingLocalInvoicesInput
): Promise<SettlePendingLocalInvoicesResult> {
  const now = Date.now();
  const unfulfilled = and(
    eq(payments.status, "pending"),
    isNull(payments.fulfilledAt)
  );
  const where = input.invoiceId
    ? and(unfulfilled, eq(payments.invoiceId, input.invoiceId))
    : and(
        unfulfilled,
        lt(payments.createdAt, input.openedBefore ?? new Date(now - 60_000)),
        gt(
          payments.createdAt,
          input.openedAfter ?? new Date(now - 24 * 60 * 60_000)
        )
      );

  const rows = await db
    .select({
      invoiceId: payments.invoiceId,
      workspaceId: payments.workspaceId,
    })
    .from(payments)
    .where(where)
    .orderBy(asc(payments.createdAt))
    .limit(input.limit ?? 100);

  const result: SettlePendingLocalInvoicesResult = {
    paid: 0,
    pending: 0,
    failed: 0,
    errors: [],
  };
  for (const row of rows) {
    try {
      const status = await settleLocalInvoice({
        invoiceId: row.invoiceId,
        workspaceId: row.workspaceId,
        fulfil: input.fulfil,
      });
      result[status]++;
    } catch (error) {
      const message = `${row.invoiceId}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(message);
      log.error("Settling a local invoice failed", {
        workspaceId: row.workspaceId,
        invoiceId: row.invoiceId,
        error: message,
      });
    }
  }
  return result;
}

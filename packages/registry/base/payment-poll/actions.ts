"use server";

/**
 * Transport for the QR-and-poll payment flow: resolve the caller's
 * workspace, ask `@/lib/local-payment` what the reference costs and
 * grants, and hand the rest to `@intelligo-dev/billing`, which records
 * the invoice and grants a paid one on the server.
 *
 * Neither action takes a user id, a workspace id or an amount from the
 * browser: who pays is a session fact, and what it costs is priced
 * server-side from `reference`.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireRole, requireWorkspace } from "@intelligo-dev/auth";
import type { ActionResult } from "@intelligo-dev/next";
import {
  isBillingServiceError,
  openLocalInvoice,
  settleLocalInvoice,
  type LocalPaymentStatus,
} from "@intelligo-dev/billing";
import type { CreatePaymentResult } from "@intelligo-dev/billing/payment";

import { priceLocalPayment } from "@/lib/local-payment";
import { paymentPollConfig } from "@/lib/payment-poll-config";

/**
 * Who may open an invoice. Read with `in`: a config written before the
 * field existed still compiles, and keeps the owner-only default.
 */
const PAYER_ROLES =
  ("payerRoles" in paymentPollConfig ? paymentPollConfig.payerRoles : null) ??
  (["owner"] as const);

export type PaymentActionResult<T> = ActionResult<T>;

type LocalPaymentInvoice = Pick<
  CreatePaymentResult,
  "invoiceId" | "qrCode" | "deeplinks"
>;

export async function startLocalPayment(
  reference: string
): Promise<PaymentActionResult<LocalPaymentInvoice>> {
  const t = await getTranslations("payment-poll");

  if (typeof reference !== "string" || reference.length === 0) {
    return { success: false, error: t("errors.unavailable") };
  }

  let context;
  try {
    context = await requireWorkspace();
  } catch {
    return { success: false, error: t("errors.unauthorized") };
  }
  try {
    await requireRole([...PAYER_ROLES]);
  } catch {
    return { success: false, error: t("errors.forbidden") };
  }

  try {
    const offer = await priceLocalPayment(reference);
    if (!offer) return { success: false, error: t("errors.unavailable") };

    const invoice = await openLocalInvoice({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      reference,
      price: offer.price,
      description: offer.description,
    });
    return {
      success: true,
      data: {
        invoiceId: invoice.invoiceId,
        qrCode: invoice.qrCode,
        deeplinks: invoice.deeplinks,
      },
    };
  } catch (error) {
    // Provider errors can carry account identifiers and endpoint
    // details; the caller gets the generic message, the log the cause.
    console.error("[payment-poll]", error);
    return { success: false, error: t("errors.createFailed") };
  }
}

export async function pollLocalPayment(
  invoiceId: string
): Promise<PaymentActionResult<LocalPaymentStatus>> {
  const t = await getTranslations("payment-poll");

  if (typeof invoiceId !== "string" || invoiceId.length === 0) {
    return { success: false, error: t("errors.statusFailed") };
  }

  let context;
  try {
    context = await requireWorkspace();
  } catch {
    return { success: false, error: t("errors.unauthorized") };
  }

  try {
    const status = await settleLocalInvoice({
      invoiceId,
      workspaceId: context.workspace.id,
      fulfil: async (payment) => {
        const offer = await priceLocalPayment(payment.reference);
        if (!offer) {
          throw new Error(
            `"${payment.reference}" no longer prices through lib/local-payment.ts; ` +
              `invoice ${payment.invoiceId} is paid and left unfulfilled.`
          );
        }
        return offer.grant;
      },
    });
    // What was bought shows everywhere the workspace's plan or balance
    // is rendered, so every page is stale once it lands.
    if (status === "paid") revalidatePath("/", "layout");
    return { success: true, data: status };
  } catch (error) {
    if (!isBillingServiceError(error) || error.code !== "payment_not_found") {
      console.error("[payment-poll]", error);
    }
    return { success: false, error: t("errors.statusFailed") };
  }
}

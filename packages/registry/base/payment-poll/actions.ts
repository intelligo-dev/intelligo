"use server";

/**
 * Transport for the QR-and-poll payment flow — thin over the provider
 * binding in `@/lib/local-payment`.
 *
 * Both actions require a signed-in caller and never accept a user id
 * from the browser: who is paying is a session fact, not a parameter.
 * The provider binding decides what an invoice costs; `reference` only
 * names what is being bought, and your implementation is responsible
 * for pricing it server-side rather than trusting `amount` — which is
 * why `amount` is not in this signature at all.
 */

import { getTranslations } from "next-intl/server";

import { requireAuth } from "@intelligo-dev/auth";

import {
  checkLocalPaymentStatus,
  createLocalPayment,
  type LocalPaymentInvoice,
  type LocalPaymentStatus,
} from "@/lib/local-payment";

export type PaymentActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function startLocalPayment(
  reference: string,
  amount: number
): Promise<PaymentActionResult<LocalPaymentInvoice>> {
  const t = await getTranslations("payment-poll");

  try {
    await requireAuth();
  } catch {
    return { success: false, error: t("errors.unauthorized") };
  }

  try {
    const invoice = await createLocalPayment({ reference, amount });
    return { success: true, data: invoice };
  } catch {
    // Provider errors can carry account identifiers and endpoint
    // details; the caller gets the generic message.
    return { success: false, error: t("errors.createFailed") };
  }
}

export async function pollLocalPayment(
  invoiceId: string
): Promise<PaymentActionResult<LocalPaymentStatus>> {
  const t = await getTranslations("payment-poll");

  try {
    await requireAuth();
  } catch {
    return { success: false, error: t("errors.unauthorized") };
  }

  try {
    return { success: true, data: await checkLocalPaymentStatus(invoiceId) };
  } catch {
    return { success: false, error: t("errors.statusFailed") };
  }
}

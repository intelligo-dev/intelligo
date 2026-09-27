import "server-only";

import type { LocalPaymentGrant } from "@intelligo-dev/billing";
import type { Payment } from "@intelligo-dev/core/db/schema";

import { priceLocalPayment } from "@/lib/local-payment";

/**
 * What a paid invoice grants: `lib/local-payment.ts`'s answer for its
 * reference, asked again at settlement. Shared by the buyer's poll and
 * the settle routes, so an invoice grants the same whichever settles it.
 *
 * A reference that no longer prices throws, which leaves the paid
 * invoice unfulfilled for the next settle to retry once it prices again.
 */
export async function grantLocalPayment(
  payment: Payment
): Promise<LocalPaymentGrant> {
  const offer = await priceLocalPayment(payment.reference);
  if (!offer) {
    throw new Error(
      `"${payment.reference}" no longer prices through lib/local-payment.ts; ` +
        `invoice ${payment.invoiceId} is paid and left unfulfilled.`
    );
  }
  return offer.grant;
}

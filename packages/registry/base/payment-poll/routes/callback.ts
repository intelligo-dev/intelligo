/**
 * The payment provider's callback: point the provider's callback URL at
 * /api/webhooks/local-payment.
 *
 * Only the invoice id is read from the request, by the provider's own
 * `invoiceIdFromCallback`; the invoice is then settled by asking the
 * provider, so a forged callback grants nothing that is not paid. A
 * provider without `invoiceIdFromCallback` has no callback here (404), and
 * its invoices are settled by the buyer's poll and the settle route.
 */

import {
  isBillingServiceError,
  settlePendingLocalInvoices,
} from "@intelligo-dev/billing";
import {
  currentPaymentMode,
  getPaymentProviderFor,
} from "@intelligo-dev/billing/payment";

import { composeIntelligo } from "@/lib/intelligo";
import { grantLocalPayment } from "@/lib/local-payment-grant";

async function handle(request: Request): Promise<Response> {
  composeIntelligo();
  const provider = getPaymentProviderFor(currentPaymentMode());
  if (!provider.invoiceIdFromCallback) {
    return new Response("Not found", { status: 404 });
  }
  const invoiceId = await provider.invoiceIdFromCallback(request);
  if (!invoiceId) return new Response("Bad request", { status: 400 });

  try {
    const result = await settlePendingLocalInvoices({
      invoiceId,
      fulfil: grantLocalPayment,
    });
    // A settle that failed answers 500 so the provider calls again.
    return Response.json(result, { status: result.errors.length ? 500 : 200 });
  } catch (error) {
    if (!isBillingServiceError(error)) throw error;
    return Response.json({ error: error.code }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;

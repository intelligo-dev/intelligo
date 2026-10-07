/**
 * The payment provider's callback: point the provider's callback URL at
 * /api/webhooks/local-payment.
 *
 * Only the invoice id is read from the request, by the provider's own
 * `invoiceIdFromCallback`; the invoice is then settled by asking the
 * provider, so a forged callback grants nothing that is not paid. A
 * provider without `invoiceIdFromCallback` has no callback here (404), and
 * its invoices are settled by the buyer's poll and the settle route.
 *
 * The answer is the provider's `callbackResponse` when it has one, so a
 * provider that expects a particular body gets it; otherwise `{ ok }`.
 * It says nothing more: the caller is unauthenticated, and what failed
 * is in the server log.
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

  // A settle that failed answers so the provider calls again.
  try {
    const result = await settlePendingLocalInvoices({
      invoiceId,
      fulfil: grantLocalPayment,
    });
    const settled = result.errors.length === 0;
    return (
      provider.callbackResponse?.({ settled }) ??
      Response.json({ ok: settled }, { status: settled ? 200 : 500 })
    );
  } catch (error) {
    if (!isBillingServiceError(error)) throw error;
    return (
      provider.callbackResponse?.({ settled: false }) ??
      Response.json({ ok: false }, { status: 500 })
    );
  }
}

export const GET = handle;
export const POST = handle;

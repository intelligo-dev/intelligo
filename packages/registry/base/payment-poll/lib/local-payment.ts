import "server-only";

/**
 * Local payment provider binding — consumer-owned.
 *
 * Card checkout is a redirect: you send the user to the processor and
 * they come back. Most of the world's payment methods are not that.
 * QR-and-poll — QPay and SocialPay in Mongolia, PIX in Brazil, UPI in
 * India, PromptPay in Thailand — issues an invoice, shows a code the
 * user scans in their own banking app, and waits for the provider to
 * say it was paid. `LocalPaymentModal` renders that flow; this file is
 * where you bind it to an actual provider.
 *
 * Both functions run on the server, and neither takes a user id: the
 * caller is resolved from the session inside your implementation. A
 * client-supplied user id on a payment call is an invitation to
 * charge someone else's plan to a stranger's account.
 *
 * The default throws rather than returning a fake invoice — a payment
 * flow that silently no-ops is worse than one that is obviously
 * unbound.
 */

export interface LocalPaymentInvoice {
  /** Provider's invoice id; passed back to `checkLocalPaymentStatus`. */
  invoiceId: string;
  /** QR image as a data: URI or an absolute URL. */
  qrCode?: string;
  /** Banking apps that can settle this invoice directly. */
  deeplinks?: { app: string; url: string }[];
}

export type LocalPaymentStatus = "pending" | "paid" | "failed";

export interface LocalPaymentRequest {
  /**
   * What is being bought — a plan slug, a credit bundle id, an order.
   *
   * Your implementation prices it server-side. The browser says what it
   * wants, never what it costs: an amount that arrives as an argument
   * is an amount the buyer chose.
   */
  reference: string;
}

export async function createLocalPayment(
  _request: LocalPaymentRequest
): Promise<LocalPaymentInvoice> {
  throw new Error(
    "createLocalPayment is not bound. Implement it in lib/local-payment.ts " +
      "against your payment provider, or remove the payment-poll item."
  );
}

export async function checkLocalPaymentStatus(
  _invoiceId: string
): Promise<LocalPaymentStatus> {
  throw new Error(
    "checkLocalPaymentStatus is not bound. Implement it in lib/local-payment.ts " +
      "against your payment provider, or remove the payment-poll item."
  );
}

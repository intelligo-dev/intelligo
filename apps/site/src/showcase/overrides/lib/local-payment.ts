/** Types from the payment-poll item's `lib/local-payment.ts`; the provider calls are server-only and are fixtured in the preview. */
export interface LocalPaymentInvoice {
  invoiceId: string;
  qrCode?: string;
  deeplinks?: { app: string; url: string }[];
}

export type LocalPaymentStatus = "pending" | "paid" | "failed";

export interface LocalPaymentRequest {
  reference: string;
}

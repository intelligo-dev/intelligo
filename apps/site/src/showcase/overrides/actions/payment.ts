import type {
  LocalPaymentInvoice,
  LocalPaymentStatus,
} from "@showcase/lib/local-payment";
import { wait } from "./_preview";

export type PaymentActionResult<T> =
  { success: true; data: T } | { success: false; error: string };

/** A stand-in QR: the modal shows whatever image the provider returns. */
const QR_PREVIEW = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/><path fill="#000" d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM14 0h7v7h-7zM15 1v5h5V1zM16 2h3v3h-3zM0 14h7v7H0zM1 15v5h5v-5zM2 16h3v3H2zM9 0h1v2H9zM11 1h2v1h-2zM8 3h3v1H8zM12 3h1v3h-1zM9 5h2v2H9zM0 9h2v1H0zM3 8h2v2H3zM6 9h3v1H6zM10 8h2v1h-2zM13 9h1v2h-1zM15 8h2v2h-2zM18 9h3v1h-3zM1 11h1v2H1zM4 11h3v1H4zM8 11h2v2H8zM11 11h2v1h-2zM14 12h2v1h-2zM17 11h1v2h-1zM19 12h2v1h-2zM9 14h1v2H9zM11 14h3v1h-3zM15 14h2v2h-2zM18 15h1v2h-1zM20 14h1v3h-1zM8 17h2v1H8zM11 17h1v2h-1zM13 16h1v3h-1zM15 18h3v1h-3zM9 19h2v2H9zM12 20h2v1h-2zM16 20h5v1h-5z"/></svg>`
)}`;

let polls = 0;

export async function startLocalPayment(
  _reference: string
): Promise<PaymentActionResult<LocalPaymentInvoice>> {
  polls = 0;
  await wait();
  return {
    success: true,
    data: {
      invoiceId: "inv_preview",
      qrCode: QR_PREVIEW,
      deeplinks: [
        { app: "Bank App", url: "#" },
        { app: "Wallet App", url: "#" },
      ],
    },
  };
}

// "pending" on the first poll, "paid" on the next — with the item's own
// 3 s poll interval the modal reaches its paid state after about 6 s.
export async function pollLocalPayment(
  _invoiceId: string
): Promise<PaymentActionResult<LocalPaymentStatus>> {
  await wait(150);
  polls += 1;
  return { success: true, data: polls < 2 ? "pending" : "paid" };
}

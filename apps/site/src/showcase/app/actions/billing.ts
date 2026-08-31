import { wait, PREVIEW_NOTE } from "./_preview";

export type BillingActionResult<T = { url: string }> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CheckoutActionInput = {
  planSlug: string;
  interval: "monthly" | "yearly";
};
export type CreditPurchaseActionInput = { bundleId: string };

export async function createCheckoutSession(
  ..._args: unknown[]
): Promise<BillingActionResult> {
  await wait();
  return {
    success: false,
    error: `Checkout would open Stripe here. ${PREVIEW_NOTE}`,
  };
}
export async function createCreditPurchaseSession(
  ..._args: unknown[]
): Promise<BillingActionResult> {
  await wait();
  return {
    success: false,
    error: `Credit purchase would open Stripe here. ${PREVIEW_NOTE}`,
  };
}
export async function createPortalSession(
  ..._args: unknown[]
): Promise<BillingActionResult> {
  await wait();
  return {
    success: false,
    error: `The billing portal would open here. ${PREVIEW_NOTE}`,
  };
}

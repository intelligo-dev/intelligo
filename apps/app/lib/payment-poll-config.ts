/**
 * Polling behaviour for the QR payment modal — consumer-owned.
 *
 * `pollIntervalMs`: how often to ask the provider whether the invoice
 * settled. Three seconds is a compromise: fast enough that the success
 * screen feels immediate, slow enough not to hammer a provider that
 * rate-limits status reads.
 *
 * `timeoutMs`: when to stop asking and offer a retry instead. Five
 * minutes is long enough for someone to switch apps, log into their
 * bank, and confirm — the common case that a shorter timeout would
 * cut off mid-payment.
 *
 * `payerRoles`: who in a workspace may open an invoice. A payment buys
 * the workspace a plan or credit, so by default only an owner may, as
 * with card checkout.
 */

import type { WorkspaceRole } from "@intelligo-dev/auth";

export interface PaymentPollConfig {
  pollIntervalMs: number;
  timeoutMs: number;
  payerRoles?: WorkspaceRole[];
}

export const paymentPollConfig: PaymentPollConfig = {
  pollIntervalMs: 3_000,
  timeoutMs: 5 * 60_000,
  payerRoles: ["owner"],
};

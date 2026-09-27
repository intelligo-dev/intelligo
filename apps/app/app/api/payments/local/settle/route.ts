/**
 * Settles the local invoices nobody is polling any more.
 *
 * The buyer's tab settles its invoice while it polls. A buyer who pays in
 * their bank's app and closes the tab is granted what they bought here
 * instead: schedule GET /api/payments/local/settle with
 * `Authorization: Bearer $CRON_SECRET` every few minutes, beside the
 * maintenance route (on Vercel, a `crons` entry in vercel.json). Each run
 * asks the provider about every unfulfilled invoice opened in the last
 * day, grants the paid ones once, and marks the expired ones failed.
 */

import { settlePendingLocalInvoices } from "@intelligo-dev/billing";
import { withCronSecret } from "@intelligo-dev/next/route";

import { composeIntelligo } from "@/lib/intelligo";
import { grantLocalPayment } from "@/lib/local-payment-grant";

export const maxDuration = 60;

export const GET = withCronSecret(async () => {
  composeIntelligo();
  const result = await settlePendingLocalInvoices({
    fulfil: grantLocalPayment,
  });
  return Response.json(result, { status: result.errors.length ? 207 : 200 });
});

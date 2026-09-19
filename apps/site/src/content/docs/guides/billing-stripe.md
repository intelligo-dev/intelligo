---
title: Billing with Stripe
description: Connect your plans and credit bundles to a Stripe account — keys, price ids, the webhook, checkout and the customer portal, locally and in production.
order: 4
---

At the end of this guide a workspace owner can subscribe to a plan, buy a credit bundle and open Stripe's customer portal, and your database follows every change through one webhook. Before you start, everything except payment already works.

## Before Stripe is configured

Plans, allowances and feature gates run from `lib/plans.ts` and need no Stripe account. A workspace with no subscription row is on the free plan: `getBillingOverview` reports `Free`, and the quota engine spends the free plan's `monthlyAllowance`.

[`/pricing`](/blocks/pricing) lists your registered plans and [`/settings/billing`](/blocks/billing-settings) shows the plan, the credit balance and your bundles. Pressing an upgrade button returns `checkout_unavailable`, because no plan has a Stripe price yet. The Stripe client is created on first use (`getStripe`), so the app boots without a key.

`BillingNotConfiguredError` is a different condition: no product slug was registered. The scaffolded composition root calls `setDefaultProductSlug`, so you only meet it if you remove that line.

## Add the keys

```bash title=".env"
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Both are optional to `assertEnv`; see [Environment](/docs/getting-started/environment). Checkout is a redirect to Stripe's hosted page, so the browser needs no key.

## Connect plans to Stripe prices

Create one product per paid plan in Stripe, with a recurring price per interval you sell. Put the price ids on the plan. Test mode and live mode have different ids, so read them from the environment:

```ts title="lib/plans.ts"
pro: {
  name: "Pro",
  slug: "pro",
  // …
  priceMonthly: 20,
  priceYearly: 200,
  stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
},
```

The pricing page shows its monthly/yearly toggle once a plan declares `priceMonthly` or `priceYearly`. An interval with no price id answers `checkout_unavailable`. Everything else about a plan is covered in [Plans and features](/docs/guides/plans-and-features).

## The plan rows

A subscription row references the `plans` table by id, and checkout writes `plan_<slug>`. The scaffolded composition root keeps that table in step with your catalogue: `ensurePlanRows()` runs after `registerProductPlans` and writes one row per plan, updating a row whose plan you edited. A migration never seeds them, so an app whose composition root predates the call adds it next to `ensureBillingSettingsRow`.

## Credit bundles

A bundle is a one-time purchase. It has a `price`, charged through Stripe, and a `grant`, added to the workspace's credit ledger:

```ts title="lib/billing-config.ts"
export const CREDIT_BUNDLES: CreditBundle[] = [
  {
    id: "credits-small",
    name: "Small credit pack",
    grant: fromMajor(5, CURRENCY),
    price: fromMajor(5, "USD"),
  },
];
```

Both amounts are micros with a currency, built by `fromMajor`. The browser sends only the bundle id; the action resolves it with `getCreditBundle`. Bundles need nothing in the Stripe dashboard: `createCreditCheckout` sends the name and amount inline. `grant` must be in the currency you passed to `ensureBillingSettingsRow`, or the purchase is refused as `invalid_bundle`. How the balance is spent is in [Credits and money](/docs/concepts/credits-and-money).

## The webhook

The scaffold already has the route:

<!-- snippet: packages/cli/templates/app-scaffold/stripe-webhook-route.ts.tpl -->

```ts title="app/api/webhooks/stripe/route.ts"
import { createStripeWebhookHandler } from "@intelligo-dev/billing";

import { composeIntelligo } from "@/lib/intelligo";

const handler = createStripeWebhookHandler();

export async function POST(request: Request) {
  composeIntelligo();
  return handler(request);
}
```

The handler verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET` (400 when it is missing or wrong), writes the event to `finance_events` keyed by Stripe's event id, and claims it before processing. A repeated delivery answers 200 with `duplicate: true` and changes nothing. A handler error releases the claim and answers 500, so Stripe retries.

| Event                           | What changes                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkout.session.completed`    | Subscription: upserts the workspace's `subscriptions` row, marks a trial converted, clears the feature cache, emails the owner. Payment: when `payment_status` is `paid`, adds the grant to `credit_balances` and completes the `credit_purchases` row |
| `invoice.paid`                  | Status `active`, the new period dates, and a fresh monthly usage row                                                                                                                                                                                   |
| `invoice.payment_failed`        | Status `past_due`, and an email to the owner                                                                                                                                                                                                           |
| `customer.subscription.updated` | Status, period and cancel-at-period-end                                                                                                                                                                                                                |
| `customer.subscription.deleted` | Status `canceled`                                                                                                                                                                                                                                      |

Enable exactly these five on the dashboard endpoint. Other types are recorded and acknowledged.

Entitlement reads the row's plan, not its status, so a cancelled subscription keeps its plan until you move it. `onEvent` runs after the built-in handler for every event; throw to make Stripe retry:

```ts title="app/api/webhooks/stripe/route.ts"
import { eq } from "drizzle-orm";

import {
  createStripeWebhookHandler,
  invalidateFeatureCache,
} from "@intelligo-dev/billing";
import { db } from "@intelligo-dev/core/db";
import { subscriptions } from "@intelligo-dev/core/db/schema";

const handler = createStripeWebhookHandler({
  async onEvent(event) {
    if (event.type !== "customer.subscription.deleted") return;
    const subscription = event.data.object;
    await db
      .update(subscriptions)
      .set({ planId: "plan_free", updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
    invalidateFeatureCache(subscription.metadata.workspaceId);
  },
});
```

Locally, forward events with the Stripe CLI and use the secret it prints:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Checkout and the portal

The installed `actions/billing.ts` holds three Server Actions. Each calls `requireRole(["owner"])` first, then one service function, and maps a `BillingServiceError` code to a translated message.

| Action                        | Service                      | Returns to                          |
| ----------------------------- | ---------------------------- | ----------------------------------- |
| `createCheckoutSession`       | `createSubscriptionCheckout` | `/checkout/success?session_id=…`    |
| `createCreditPurchaseSession` | `createCreditCheckout`       | `/settings/billing?credits=success` |
| `createPortalSession`         | `createBillingPortal`        | `/settings/billing`                 |

Redirect URLs are built from `NEXT_PUBLIC_APP_URL`. Members and admins see a read-only plan summary; only the owner sees the balance, bundles and portal button, and the button appears once the workspace has a Stripe customer.

The [success page](/blocks/checkout) calls `getCheckoutSession`, which reads the session from Stripe rather than your database, so it shows the right plan even when the webhook has not arrived yet.

The subscription handlers take the plan from the `planId` metadata that checkout sets, so a plan switched inside the portal does not change the workspace's plan. Leave plan switching off in the portal's configuration.

## Going live

- Set the live `STRIPE_SECRET_KEY` and live price ids. A `sk_test_` key under `NODE_ENV=production` logs `STRIPE_SECRET_KEY is a test key in production environment` at startup.
- Add a dashboard endpoint at `NEXT_PUBLIC_APP_URL` + `/api/webhooks/stripe` with the five events, and set its signing secret as `STRIPE_WEBHOOK_SECRET`.

## Payments outside Stripe

`registerPaymentProvider(mode, provider)` from `@intelligo-dev/billing/payment` registers a `PaymentProvider` in the composition root, and `PAYMENT_MODE` selects which one `getPaymentProvider` returns. The mode defaults to `mock`: register `mockPaymentProvider` under that name for development, and expect production to refuse it. The [payment-poll block](/blocks/payment-poll) renders the invoice, QR code and polling flow; you bind it to your provider in `lib/local-payment.ts`.

## Next

- [Plans and features](/docs/guides/plans-and-features)
- [Credits and money](/docs/concepts/credits-and-money)
- [Deploy](/docs/guides/deploy)

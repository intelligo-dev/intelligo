"use server";

/**
 * Checkout server actions over `@intelligo-dev/billing`'s checkout service:
 * authorize, call the service, and map a `BillingServiceError` code to a
 * translated message. The `billing-settings` item imports this file too.
 */

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireRole } from "@intelligo-dev/auth";
import {
  createBillingPortal,
  createCreditCheckout,
  createSubscriptionCheckout,
  isBillingServiceError,
} from "@intelligo-dev/billing";
import { getDefaultProductSlug } from "@intelligo-dev/billing/plans";
import type { ActionResult } from "@intelligo-dev/next";

import { getCreditBundle } from "@/lib/billing";

export type BillingActionResult<T = { url: string }> = ActionResult<T>;

type Translator = Awaited<ReturnType<typeof getTranslations<"pricing">>>;

function friendlyMessage(t: Translator): Partial<Record<string, string>> {
  return {
    invalid_plan: t("errors.invalidPlan"),
    checkout_unavailable: t("errors.checkoutUnavailable"),
    invalid_bundle: t("errors.invalidBundle"),
    no_billing_account: t("errors.noBillingAccount"),
    provider_error: t("errors.providerError"),
  };
}

function friendlyError(error: unknown, t: Translator): string {
  if (isBillingServiceError(error)) {
    return friendlyMessage(t)[error.code] ?? error.message;
  }
  // `Error#message` can carry internals (SQL, hostnames) to the UI.
  console.error("[pricing]", error);
  return t("errors.genericFailure");
}

/**
 * This deployment's origin, for Stripe's success/cancel redirect URLs.
 *
 * `NEXT_PUBLIC_APP_URL` first: the `Host` header is whatever the client
 * sent, and a forged one points the post-payment redirect — which
 * carries `{CHECKOUT_SESSION_ID}` — at someone else's domain. The
 * header stays as the fallback for a deployment that has not set the
 * variable.
 */
async function origin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${host}`;
}

const checkoutSchema = z.object({
  planSlug: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

export type CheckoutActionInput = z.infer<typeof checkoutSchema>;

export async function createCheckoutSession(
  input: CheckoutActionInput
): Promise<BillingActionResult> {
  const t = await getTranslations("pricing");

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }

  try {
    const { workspace, user } = await requireRole(["owner"]);
    const base = await origin();

    const { url } = await createSubscriptionCheckout({
      workspaceId: workspace.id,
      userId: user.id,
      planSlug: parsed.data.planSlug,
      interval: parsed.data.interval,
      productSlug: getDefaultProductSlug(),
      successUrl: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/pricing?canceled=true`,
    });

    return { success: true, data: { url } };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

const creditPurchaseSchema = z.object({
  bundleId: z.string().min(1),
});

export type CreditPurchaseActionInput = z.infer<typeof creditPurchaseSchema>;

export async function createCreditPurchaseSession(
  input: CreditPurchaseActionInput
): Promise<BillingActionResult> {
  const t = await getTranslations("pricing");

  const parsed = creditPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }

  const bundle = getCreditBundle(parsed.data.bundleId);
  if (!bundle) {
    return { success: false, error: t("errors.invalidBundle") };
  }

  try {
    const { workspace, user } = await requireRole(["owner"]);
    const base = await origin();

    const { url } = await createCreditCheckout({
      workspaceId: workspace.id,
      userId: user.id,
      bundle,
      successUrl: `${base}/settings/billing?credits=success`,
      cancelUrl: `${base}/settings/billing?credits=cancelled`,
    });

    return { success: true, data: { url } };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

export async function createPortalSession(): Promise<BillingActionResult> {
  const t = await getTranslations("pricing");

  try {
    const { workspace } = await requireRole(["owner"]);
    const base = await origin();

    const { url } = await createBillingPortal({
      workspaceId: workspace.id,
      returnUrl: `${base}/settings/billing`,
    });

    return { success: true, data: { url } };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

"use server";

/**
 * Billing server actions — thin transport over `@intelligo/billing`'s
 * checkout service: authorize with `@intelligo/auth`, resolve this
 * deployment's product slug and credit bundles from `@/lib/billing`,
 * call the service, and map any `BillingServiceError` to a friendly,
 * translated message. No checkout/Stripe logic here — that lives in
 * the service.
 *
 * Shared with the `billing-settings` item, which imports this file
 * rather than shipping its own copy (install `pricing` first).
 *
 * All user-facing error text is resolved via `getTranslations("pricing")`
 * (ADR-0010) — the `BillingServiceError.code` → message map below
 * becomes a code → translation-key map instead of a code → English
 * string map.
 */

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireRole } from "@intelligo/auth";
import {
  createBillingPortal,
  createCreditCheckout,
  createSubscriptionCheckout,
  isBillingServiceError,
} from "@intelligo/billing";

import { PRODUCT_SLUG, getCreditBundle } from "@/lib/billing";

export type BillingActionResult<T = { url: string }> =
  | { success: true; data: T }
  | { success: false; error: string };

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
  return error instanceof Error ? error.message : t("errors.genericFailure");
}

/** This deployment's origin, for Stripe's success/cancel redirect URLs. */
async function origin(): Promise<string> {
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
      productSlug: PRODUCT_SLUG,
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

import { CheckCircle2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";
import { getCheckoutSession } from "@intelligo-dev/billing";

import { Link, redirect } from "@/i18n/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

/**
 * Checkout success page.
 *
 * Verifies the session by querying Stripe directly through
 * `getCheckoutSession` (`@intelligo-dev/billing`) rather than trusting the
 * workspace's local subscription row. Stripe's webhook can arrive
 * 15-20% slower than the browser's redirect to this page; reading the
 * checkout session itself is what makes this page show the right plan
 * immediately regardless of webhook timing. No Stripe call happens in
 * this component — that's the whole point of routing through the
 * service instead of `getStripe()` directly.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const t = await getTranslations("checkout");
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    redirect({ href: "/pricing", locale: await getLocale() });
    return null; // redirect throws; this narrows sessionId for TS
  }

  await requireWorkspace();

  try {
    const session = await getCheckoutSession({ sessionId });

    if (session.status === "complete" && session.isSubscriptionActive) {
      return (
        <div className="container max-w-2xl py-16">
          <Card className="border-success/30">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="size-10 text-success" />
              </div>
              <CardTitle className="text-3xl">{t("success.title")}</CardTitle>
              <CardDescription className="text-base">
                {session.planName
                  ? t("success.planActive", { planName: session.planName })
                  : t("success.subscriptionActive")}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="rounded-lg border bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    {session.planName && (
                      <p className="font-medium">
                        {t("success.planLabel", { planName: session.planName })}
                      </p>
                    )}
                    {session.billingInterval && (
                      <p className="text-sm text-muted-foreground">
                        {session.billingInterval === "month"
                          ? t("success.billedMonthly")
                          : t("success.billedYearly")}
                      </p>
                    )}
                  </div>
                  <StatusBadge status="success" dot>
                    {t("success.status")}
                  </StatusBadge>
                </div>
              </div>

              {session.customerEmail && (
                <p className="text-center text-sm text-muted-foreground">
                  {t("success.receiptSent", { email: session.customerEmail })}
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="w-full sm:flex-1"
                render={<Link href="/dashboard" />}
                nativeButton={false}
              >
                {t("actions.goToDashboard")}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:flex-1"
                render={<Link href="/settings/billing" />}
                nativeButton={false}
              >
                {t("actions.viewBillingSettings")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    if (session.status !== "complete") {
      return (
        <div className="container max-w-2xl py-16">
          <Card>
            <CardHeader className="text-center">
              <CardTitle>{t("pending.title")}</CardTitle>
              <CardDescription>{t("pending.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Spinner className="size-8 text-muted-foreground" />
            </CardContent>
            <CardFooter className="justify-center">
              <Button
                variant="outline"
                render={<Link href="/settings/billing" />}
                nativeButton={false}
              >
                {t("actions.checkBillingSettings")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return (
      <div className="container max-w-2xl py-16">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>{t("received.title")}</CardTitle>
            <CardDescription>{t("received.description")}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center gap-3">
            <Button render={<Link href="/dashboard" />} nativeButton={false}>
              {t("actions.goToDashboard")}
            </Button>
            <Button
              variant="outline"
              render={<Link href="/settings/billing" />}
              nativeButton={false}
            >
              {t("actions.viewBillingSettings")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  } catch {
    // session_not_found (a stale/invalid session id) or a Stripe
    // outage — either way, the customer likely did pay. Show a
    // generic thank-you and point at billing settings rather than
    // surfacing a Stripe error to someone who just completed checkout.
    return (
      <div className="container max-w-2xl py-16">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="size-10 text-success" />
            </div>
            <CardTitle>{t("fallback.title")}</CardTitle>
            <CardDescription>{t("fallback.description")}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              {t("fallback.note")}
            </p>
          </CardContent>
          <CardFooter className="justify-center gap-3">
            <Button render={<Link href="/dashboard" />} nativeButton={false}>
              {t("actions.goToDashboard")}
            </Button>
            <Button
              variant="outline"
              render={<Link href="/settings/billing" />}
              nativeButton={false}
            >
              {t("actions.viewBillingSettings")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
}

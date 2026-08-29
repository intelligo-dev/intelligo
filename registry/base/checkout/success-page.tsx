import { CheckCircle2, Loader2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo/auth";
import { getCheckoutSession } from "@intelligo/billing";

import { Link, redirect } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

/**
 * Checkout success page.
 *
 * Verifies the session by querying Stripe directly through
 * `getCheckoutSession` (`@intelligo/billing`) rather than trusting the
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
          <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
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
                  <Badge variant="default" className="bg-green-600">
                    {t("success.status")}
                  </Badge>
                </div>
              </div>

              {session.customerEmail && (
                <p className="text-center text-sm text-muted-foreground">
                  {t("success.receiptSent", { email: session.customerEmail })}
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:flex-1">
                <Link href="/dashboard">{t("actions.goToDashboard")}</Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:flex-1">
                <Link href="/settings/billing">
                  {t("actions.viewBillingSettings")}
                </Link>
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
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
            <CardFooter className="justify-center">
              <Button asChild variant="outline">
                <Link href="/settings/billing">
                  {t("actions.checkBillingSettings")}
                </Link>
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
            <Button asChild>
              <Link href="/dashboard">{t("actions.goToDashboard")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/billing">
                {t("actions.viewBillingSettings")}
              </Link>
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
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
            <Button asChild>
              <Link href="/dashboard">{t("actions.goToDashboard")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/billing">
                {t("actions.viewBillingSettings")}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
}

"use client";

/**
 * Displays this deployment's credit bundles (`@/lib/billing`'s
 * `CREDIT_BUNDLES`, installed by the `pricing` item) for one-time
 * purchase.
 *
 * `bundle.name` is deployment config from `CREDIT_BUNDLES`
 * (`lib/billing-config.ts`), not copy owned by this item — it is
 * rendered verbatim rather than routed through `messages/en.json`
 * (ADR-0010); localize it in that config file if this deployment
 * needs bundle names in more than one language.
 *
 * A bundle carries two amounts and each is formatted in its own
 * currency: `price` is what the buyer pays the payment provider, and
 * `grant` is what lands in the ledger. They are not the same money —
 * a pack can cost $5 and grant ₮100,000 — and the version of this card
 * that formatted one number with the ledger's `CURRENCY` printed a
 * $1.01 pack as "₮1": right glyph, wrong money, rounded to nothing.
 *
 * A bundle still written in the older `{ credits, priceUsd }` shape is
 * read the way the ledger read it: whole units of `CURRENCY`, priced
 * in dollars.
 */

import { useState } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { createCreditPurchaseSession } from "@/actions/billing";
import { CREDIT_BUNDLES, CURRENCY } from "@/lib/billing-config";

/** Micros are millionths of one major unit. */
const MICROS_PER_UNIT = 1_000_000;

type Bundle = (typeof CREDIT_BUNDLES)[number];
type Amount = { amount: number; currency: string };

/** What the workspace receives, in the ledger's own currency. */
function grantOf(bundle: Bundle): Amount {
  return "grant" in bundle
    ? bundle.grant
    : { amount: bundle.credits * MICROS_PER_UNIT, currency: CURRENCY };
}

/** What the buyer pays, in the currency the provider charges. */
function priceOf(bundle: Bundle): Amount {
  return "price" in bundle
    ? bundle.price
    : {
        amount: Math.round(bundle.priceUsd * MICROS_PER_UNIT),
        currency: "USD",
      };
}

interface CreditBundlesProps {
  /**
   * The top-up balance, in the ledger's own currency. It was a bare
   * number the page pluralised as "N credits", whatever the deployment
   * actually billed in.
   */
  currentBalance?: Amount | null;
}

export function CreditBundles({ currentBalance }: CreditBundlesProps) {
  const t = useTranslations("billing-settings");
  const format = useFormatter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async (bundleId: string) => {
    setError(null);
    setLoadingId(bundleId);

    const result = await createCreditPurchaseSession({ bundleId });

    if (!result.success) {
      setError(result.error);
      setLoadingId(null);
      return;
    }

    window.location.href = result.data.url;
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t("creditBundles.buyMore")}</p>
        {currentBalance && (
          <p className="text-sm text-muted-foreground">
            {t("creditBundles.currentBalance", {
              balance: format.number(currentBalance.amount / MICROS_PER_UNIT, {
                style: "currency",
                currency: currentBalance.currency,
              }),
            })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CREDIT_BUNDLES.map((bundle) => {
          const isLoading = loadingId === bundle.id;
          const grant = grantOf(bundle);
          const price = priceOf(bundle);
          return (
            <Card key={bundle.id} className="space-y-4 p-6">
              <div className="flex items-center gap-2">
                <Coins className="size-5 text-muted-foreground" />
                <p className="font-medium">{bundle.name}</p>
              </div>
              <p className="text-2xl font-semibold text-foreground">
                {format.number(grant.amount / MICROS_PER_UNIT, {
                  style: "currency",
                  currency: grant.currency,
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("creditBundles.oneTime", {
                  price: format.number(price.amount / MICROS_PER_UNIT, {
                    style: "currency",
                    currency: price.currency,
                  }),
                })}
              </p>
              <Button
                onClick={() => handlePurchase(bundle.id)}
                disabled={isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading
                  ? t("creditBundles.redirecting")
                  : t("creditBundles.purchase")}
              </Button>
            </Card>
          );
        })}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

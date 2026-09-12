"use client";

/**
 * Triggers a Stripe subscription checkout for one plan/interval and
 * redirects the browser to the returned hosted checkout URL.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { createCheckoutSession } from "@/actions/billing";

interface CheckoutButtonProps {
  planSlug: string;
  interval: "monthly" | "yearly";
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function CheckoutButton({
  planSlug,
  interval,
  children,
  disabled,
  className,
}: CheckoutButtonProps) {
  const t = useTranslations("pricing");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setIsLoading(true);

    const result = await createCheckoutSession({ planSlug, interval });

    if (!result.success) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    window.location.href = result.data.url;
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={className}
      >
        {isLoading ? t("checkoutButton.redirecting") : children}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

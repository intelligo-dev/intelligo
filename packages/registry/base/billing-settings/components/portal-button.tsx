"use client";

/**
 * Triggers a Stripe Customer Portal session for managing payment
 * methods, invoices, and subscription changes, and redirects the
 * browser there.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { createPortalSession } from "@/actions/billing";

interface PortalButtonProps {
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "ghost";
}

export function PortalButton({
  children,
  className,
  variant = "default",
}: PortalButtonProps) {
  const t = useTranslations("billing-settings");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setIsLoading(true);

    const result = await createPortalSession();

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
        disabled={isLoading}
        className={className}
        variant={variant}
      >
        {isLoading
          ? t("portalButton.redirecting")
          : (children ?? t("portalButton.manageBilling"))}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

"use client";

/**
 * Client error boundary for the invitation-accept route.
 *
 * Self-contained: registry items ship consumer-owned, translated copy
 * with no dependency beyond `@/components/ui/*` (ADR-0010), so this
 * does not reach for an app-internal shared error component or an
 * error reporting SDK.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AcceptInvitationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("invitation-accept");

  useEffect(() => {
    console.error("[accept-invitation] error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("errorBoundary.message")}</AlertDescription>
        </Alert>

        <div className="flex justify-center gap-3">
          <Button onClick={reset}>{t("errorBoundary.retry")}</Button>
          <Button asChild variant="outline">
            <Link href="/">{t("errorBoundary.goHome")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

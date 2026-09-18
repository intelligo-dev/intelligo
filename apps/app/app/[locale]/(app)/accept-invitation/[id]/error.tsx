"use client";

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
    <div className="flex min-h-96 items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("errorBoundary.message")}</AlertDescription>
        </Alert>

        <div className="flex justify-center gap-3">
          <Button onClick={reset}>{t("errorBoundary.retry")}</Button>
          <Button
            variant="outline"
            render={<Link href="/" />}
            nativeButton={false}
          >
            {t("errorBoundary.goHome")}
          </Button>
        </div>
      </div>
    </div>
  );
}

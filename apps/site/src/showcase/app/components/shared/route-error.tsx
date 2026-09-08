"use client";

/**
 * Shared route-level error boundary UI.
 *
 * Every `error.tsx` in the catalogue renders this, so a route segment
 * needs a ten-line wrapper instead of its own copy of the same layout,
 * reporting call, console log, and error classification. Items that
 * ship an `error.tsx` depend on this component the way `dashboard`
 * depends on `team-settings`' `lib/team.ts` — install `route-error`
 * first.
 *
 * Error reporting goes through the `reportRouteError` seam
 * (`@/lib/error-reporting`), which is a no-op until you bind a
 * reporter — registry items never import an SDK directly.
 *
 * The message is chosen by `getErrorType`, which maps a network blip,
 * a timeout, and a server fault to distinct copy; `fallback` lets a
 * route supply its own key for the "none of the above" case (e.g. the
 * chat item passes `conversation`).
 */

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "use-intl";

import { Link } from "@showcase/i18n/navigation";
import { Alert, AlertDescription } from "@showcase/components/ui/alert";
import { Button } from "@showcase/components/ui/button";
import { reportRouteError } from "@showcase/lib/error-reporting";
import { getErrorType } from "@showcase/lib/errors/get-error-type";

export interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Short identifier for the route segment, used in logs and reports. */
  scope: string;
  /** Where the secondary button goes (default: `/dashboard`). */
  homeHref?: string;
  /** Message key for the secondary button's label. */
  homeKey?: string;
  /**
   * Message key used when no classification rule matches — for a route
   * with copy of its own. Defaults to `generic`.
   */
  fallback?: string;
  /**
   * Full-screen layout instead of the in-shell inset one. Set this for
   * boundaries that render outside the `(app)` shell.
   */
  fullScreen?: boolean;
}

export function RouteError({
  error,
  reset,
  scope,
  homeHref = "/dashboard",
  homeKey = "goToDashboard",
  fallback,
  fullScreen = false,
}: RouteErrorProps) {
  const t = useTranslations("route-error");

  useEffect(() => {
    reportRouteError(error, { scope });
    console.error(`[${scope}] error boundary caught:`, {
      message: error.message,
      digest: error.digest,
    });
  }, [error, scope]);

  const errorType = getErrorType(error, fallback);

  return (
    <div
      className={
        fullScreen
          ? "flex min-h-screen items-center justify-center p-4"
          : "flex min-h-[60vh] items-center justify-center p-8"
      }
    >
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="mt-2">{t(errorType)}</AlertDescription>
        </Alert>

        <div className="flex justify-center gap-3">
          <Button onClick={reset}>{t("retry")}</Button>
          <Button asChild variant="outline">
            <Link href={homeHref}>{t(homeKey)}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

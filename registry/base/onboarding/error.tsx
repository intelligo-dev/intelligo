"use client";

/**
 * Error boundary for the onboarding wizard (renders outside the app shell). Renders the shared `RouteError` from the
 * `route-error` item — install it alongside this one.
 */

import { RouteError } from "@/components/shared/route-error";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      scope="onboarding"
      fullScreen
      homeHref="/login"
      homeKey="goToLogin"
    />
  );
}

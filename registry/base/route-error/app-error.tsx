"use client";

/**
 * Error boundary for the whole `(app)` route group — the backstop for
 * any authenticated page whose own segment doesn't ship one.
 */

import { RouteError } from "@/components/shared/route-error";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} scope="app" />;
}

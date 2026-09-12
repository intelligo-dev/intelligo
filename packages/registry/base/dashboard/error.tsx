"use client";

/**
 * Error boundary for the workspace dashboard. Renders the shared `RouteError` from the
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
  return <RouteError error={error} reset={reset} scope="dashboard" />;
}

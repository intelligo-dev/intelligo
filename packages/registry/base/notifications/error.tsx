"use client";

/**
 * Error boundary for the notifications page. Renders `RouteError` from
 * the `route-error` item, which must be installed too.
 */

import { RouteError } from "@/components/shared/route-error";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} scope="notifications" />;
}

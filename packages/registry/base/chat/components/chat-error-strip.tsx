"use client";

/**
 * The transient error under the transcript — a stream that failed, a
 * rate limit, a network blip. Blocking refusals (credits, plan) are
 * the credit banner's; this strip is for what a retry can fix.
 */

import { useTranslations } from "next-intl";
import { AlertTriangleIcon, RefreshCwIcon, XIcon } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ChatErrorStripProps {
  message: string;
  /** Regenerate the last reply; omitted while a reply streams. */
  onRetry?: () => void;
  onDismiss: () => void;
}

export function ChatErrorStrip({
  message,
  onRetry,
  onDismiss,
}: ChatErrorStripProps) {
  const t = useTranslations("chat");

  return (
    <Alert variant="destructive" className="mx-auto mb-2 w-full max-w-3xl">
      <AlertTriangleIcon />
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        {onRetry ? (
          <Button size="xs" variant="outline" type="button" onClick={onRetry}>
            <RefreshCwIcon data-icon="inline-start" />
            {t("error.retry")}
          </Button>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          type="button"
          onClick={onDismiss}
          aria-label={t("error.dismiss")}
        >
          <XIcon />
        </Button>
      </AlertAction>
    </Alert>
  );
}

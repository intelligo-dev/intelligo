"use client";

/**
 * Tells the reader about their credit before they spend a message on
 * finding out.
 *
 * Two states, and both matter:
 *
 *   - **blocked** — the next turn will be refused. Server-rendered
 *     from `getChatQuotaState()`, or seeded from the route's own 402
 *     when the balance runs out mid-conversation.
 *   - **running low** — allowed, but one more turn would take most of
 *     what is left. A warning nobody asked for beats a refusal nobody
 *     expected.
 *
 * Copy lives in this item's `chat` namespace, not in props.
 *
 * Amounts are credits, not money. That is the unit the balance and the
 * estimate are both in; rendering it as currency would need an
 * exchange rate this component has no business choosing.
 */

import { AlertTriangleIcon, SparklesIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { ChatQuotaState } from "@intelligo-dev/chat/client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * What the page opened with, read by `getChatQuotaState()`. The shape
 * is the transport's (`@intelligo-dev/chat/client`, which imports
 * nothing, so a client component can read it without pulling a server
 * module into its graph). Re-exported so `lib/chat-quota.ts` and the
 * page name it from the component that renders it.
 */
export type { ChatQuotaState };

/**
 * A refusal that arrived from the route mid-conversation, rather than
 * from the server render.
 */
export type ChatBlock = {
  code: string;
  message: string;
};

interface CreditStatusBannerProps {
  quotaState: ChatQuotaState | null;
  block: ChatBlock | null;
}

export function CreditStatusBanner({
  quotaState,
  block,
}: CreditStatusBannerProps) {
  const t = useTranslations("chat");
  const format = useFormatter();

  // A block from the route wins: it is the newer fact. The
  // server-rendered state is what the page opened with, and the reader
  // may have spent their last credits since.
  const refusal: ChatBlock | null =
    block ??
    (quotaState && !quotaState.allowed
      ? { code: quotaState.code ?? "", message: quotaState.reason ?? "" }
      : null);

  if (refusal) {
    return (
      <Alert
        variant="destructive"
        data-testid="credit-status-banner"
        className="mx-auto mb-2 w-full max-w-3xl"
      >
        <AlertTriangleIcon />
        <AlertTitle>
          {refusal.code === "insufficient_credits" ||
          refusal.code === "allowance_depleted"
            ? t("creditBanner.outOfCredits")
            : t("creditBanner.upgradeRequired")}
        </AlertTitle>
        {refusal.message ? (
          <AlertDescription>{refusal.message}</AlertDescription>
        ) : null}
        <AlertAction>
          <Button
            size="sm"
            variant="destructive"
            render={<Link href={quotaState?.upgradeHref ?? "/pricing"} />}
            nativeButton={false}
          >
            {t("creditBanner.upgrade")}
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  // "Running low" is one turn's worth of headroom, not a percentage: a
  // share of a large allowance can still be plenty, while twice the
  // estimate is exactly the point where the next message might be the
  // last one.
  const runningLow =
    quotaState !== null &&
    quotaState.allowed &&
    quotaState.estimated > 0 &&
    quotaState.remaining < quotaState.estimated * 2;

  if (!runningLow || !quotaState) return null;

  return (
    <Alert
      role="status"
      data-testid="credit-status-warning"
      className="mx-auto mb-2 w-full max-w-3xl border-warning/30 bg-warning/10 text-warning"
    >
      <SparklesIcon />
      <AlertTitle>
        {t("creditBanner.runningLow", {
          count: quotaState.remaining,
          amount: format.number(quotaState.remaining),
        })}
      </AlertTitle>
      <AlertAction>
        <Button
          size="xs"
          variant="ghost"
          className="text-warning hover:text-warning"
          render={<Link href={quotaState.upgradeHref} />}
          nativeButton={false}
        >
          {t("creditBanner.topUp")}
        </Button>
      </AlertAction>
    </Alert>
  );
}

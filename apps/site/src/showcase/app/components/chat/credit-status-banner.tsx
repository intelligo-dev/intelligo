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
 * Copy lives in this item's `chat` namespace, not in props. The
 * product-side version of this component took a `CreditBannerStrings`
 * object with English defaults, because it lived in a package and a
 * package cannot reach next-intl — which also meant its defaults
 * hardcoded a currency symbol and a language. An item has no such
 * problem (ADR-0010).
 *
 * Amounts are credits, not money. That is the unit the balance and the
 * estimate are both in; rendering it as currency would need an
 * exchange rate this component has no business choosing.
 */

import { AlertTriangle, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";

import { Link } from "@showcase/i18n/navigation";

/**
 * What the page opened with, read by `getChatQuotaState()`.
 *
 * Declared here rather than beside that function because the reader of
 * a contract is the better place for it: `lib/chat-quota.ts` is
 * `server-only`, and a client component that imports a type from it
 * pulls a server module into its graph for something the compiler
 * erases anyway.
 *
 * Amounts are credits — the unit the balance and the estimate are both
 * in — not money.
 */
export type ChatQuotaState = {
  /** False when the next turn would be refused. */
  allowed: boolean;
  /** Why, when the engine refused. */
  reason: string | null;
  /** Typed refusal, for a UI that wants to distinguish them. */
  code: string | null;
  /** Credits left across every pool. */
  remaining: number;
  /** Worst-case credits one turn could cost. */
  estimated: number;
  /** Where "upgrade" and "top up" should go. */
  upgradeHref: string;
};

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
      <div
        role="alert"
        data-testid="credit-status-banner"
        className="mx-auto mb-2 flex w-full max-w-3xl items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm"
      >
        <div className="flex min-w-0 items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium">
              {refusal.code === "insufficient_credits" ||
              refusal.code === "allowance_depleted"
                ? t("creditBanner.outOfCredits")
                : t("creditBanner.upgradeRequired")}
            </span>
            {refusal.message ? (
              <span className="ml-1.5 text-destructive/80">
                {refusal.message}
              </span>
            ) : null}
          </span>
        </div>
        <Link
          href={quotaState?.upgradeHref ?? "/pricing"}
          className="shrink-0 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          {t("creditBanner.upgrade")}
        </Link>
      </div>
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
    <div
      data-testid="credit-status-warning"
      className="mx-auto mb-2 flex w-full max-w-3xl items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {t("creditBanner.runningLow", {
            count: quotaState.remaining,
            amount: format.number(quotaState.remaining),
          })}
        </span>
      </div>
      <Link
        href={quotaState.upgradeHref}
        className="font-medium underline underline-offset-2 hover:opacity-80"
      >
        {t("creditBanner.topUp")}
      </Link>
    </div>
  );
}

import { cn } from "../utils";
import { Progress } from "./progress";

/**
 * Remaining credit for a workspace.
 *
 * The middle of the three levels a capability ships at: the headless
 * service (`@intelligo-dev/billing`) computes the numbers, this draws
 * them, and the CLI's billing template wires the two together. A
 * consumer that wants a different design uses the service and skips
 * this; a consumer in a hurry drops it in.
 *
 * Presentational only — no fetching, no package imports. Everything
 * that varies by market or product arrives as a prop:
 *
 *   - `formatAmount`, because this package must not decide that money
 *     is written "₮5,000". The default is a plain grouped number,
 *     which is wrong for nobody in particular.
 *   - `labels`, because @intelligo-dev/ui has no i18n runtime and should
 *     not acquire one to render six words.
 */

export type CreditBalanceLabels = {
  title: string;
  remaining: string;
  ofAllowance: string;
  low: string;
  depleted: string;
};

export const DEFAULT_CREDIT_BALANCE_LABELS: CreditBalanceLabels = {
  title: "Credits",
  remaining: "remaining",
  ofAllowance: "of",
  low: "Running low",
  depleted: "Depleted",
};

export type CreditLevel = "ok" | "low" | "depleted";

/** Below this share of the allowance, the balance reads as low. */
export const LOW_CREDIT_THRESHOLD = 0.2;

/**
 * Classify a balance.
 *
 * Exported and pure so the threshold is testable and so a consumer
 * building its own UI can agree with this one about what "low" means
 * instead of picking a second number.
 *
 * With no allowance configured (`0`), only zero remaining counts as
 * depleted — a plan with no monthly grant is not perpetually "low".
 */
export function creditLevel(
  remainingMnt: number,
  allowanceMnt: number
): CreditLevel {
  if (remainingMnt <= 0) return "depleted";
  if (allowanceMnt <= 0) return "ok";
  return remainingMnt / allowanceMnt <= LOW_CREDIT_THRESHOLD ? "low" : "ok";
}

/** Portion of the allowance still available, clamped to 0…100. */
export function creditPercentage(
  remainingMnt: number,
  allowanceMnt: number
): number {
  if (allowanceMnt <= 0) return remainingMnt > 0 ? 100 : 0;
  const pct = (remainingMnt / allowanceMnt) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export type CreditBalanceProps = {
  remainingMnt: number;
  /** Monthly grant. Zero or absent means the plan has none. */
  allowanceMnt?: number;
  labels?: Partial<CreditBalanceLabels>;
  /** Defaults to a grouped integer — no currency symbol assumed. */
  formatAmount?: (amount: number) => string;
  className?: string;
};

const formatDefault = (amount: number) => amount.toLocaleString();

export function CreditBalance({
  remainingMnt,
  allowanceMnt = 0,
  labels,
  formatAmount = formatDefault,
  className,
}: CreditBalanceProps) {
  const copy = { ...DEFAULT_CREDIT_BALANCE_LABELS, ...labels };
  const level = creditLevel(remainingMnt, allowanceMnt);
  const percentage = creditPercentage(remainingMnt, allowanceMnt);

  return (
    <div
      className={cn("rounded-lg border bg-card p-4", className)}
      data-level={level}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-sm">{copy.title}</span>
        {level !== "ok" ? (
          <span
            className={cn(
              "text-xs",
              level === "depleted" ? "text-destructive" : "text-amber-600"
            )}
          >
            {level === "depleted" ? copy.depleted : copy.low}
          </span>
        ) : null}
      </div>

      <p className="mt-1 font-semibold text-2xl tabular-nums">
        {formatAmount(Math.max(0, remainingMnt))}
      </p>
      <p className="text-muted-foreground text-xs">
        {allowanceMnt > 0
          ? `${copy.remaining} ${copy.ofAllowance} ${formatAmount(allowanceMnt)}`
          : copy.remaining}
      </p>

      <Progress className="mt-3" value={percentage} />
    </div>
  );
}

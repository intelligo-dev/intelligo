"use server";

/**
 * Usage actions — thin reads over the execution boundary and the
 * billing package's entitlement/trial reads.
 *
 * No business math lives here: `summarizeExecutions`/`listExecutions`
 * (`@intelligo-dev/executions`) own the token/charge aggregation, and
 * `getQuotaThresholds`/`getTrialStatus`/`getWorkspaceBilling`
 * (`@intelligo-dev/billing`) own quota, trial, and plan state. This file
 * only authenticates the caller, calls those, and reshapes the result
 * for the page and its components.
 *
 * Error fallbacks are translated (`getTranslations("usage")`, ADR-0010)
 * and always generic — a thrown `Error#message` is never surfaced to
 * the UI, since it can carry internals (SQL, hostnames).
 */

import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";
import {
  getQuotaThresholds,
  getTrialStatus,
  getWorkspaceBilling,
} from "@intelligo-dev/billing";
import {
  listExecutions,
  summarizeExecutions,
  summarizeExecutionsByDay,
} from "@intelligo-dev/executions";

export type UsagePeriod = "7d" | "30d" | "current";

export type UsagePeriodSummary = {
  tokensUsed: number;
  /**
   * The charged amount for the period, in whatever unit the
   * deployment's billing settings charge in (`chargedMnt` on the
   * underlying execution/usage rows — the field name carries one
   * deployment's currency choice, not a framework assumption). Render
   * it as a plain number; a product that wants a currency symbol adds
   * one in its own copy of this component.
   */
  chargedAmount: number;
  requestCount: number;
};

export type UsageQuotaState = {
  percentage: number;
  warningThreshold: boolean;
  criticalThreshold: boolean;
};

export type UsageTrialState = {
  hasTrialCredits: boolean;
  status: "active" | "depleted" | "converted" | "expired" | "none";
  creditsRemaining: number;
  initialCredits: number;
  percentageRemaining: number;
};

export type UsagePlan = {
  name: string;
  slug: string;
};

export type UsageRecord = {
  id: string;
  capability: string;
  status: "running" | "settling" | "succeeded" | "failed" | "refused";
  model: string | null;
  totalTokens: number | null;
  chargedAmount: number | null;
  startedAt: string; // ISO
  durationMs: number | null;
};

export type UsageDailyPoint = {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  tokensUsed: number;
  requestCount: number;
};

export type UsageOverview = {
  plan: UsagePlan;
  billingMode: "subscription" | "credit";
  currentPeriod: UsagePeriodSummary;
  quota: UsageQuotaState;
  trial: UsageTrialState;
  /** One point per day in the current period, gaps filled with zero. */
  daily: UsageDailyPoint[];
  records: UsageRecord[];
};

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Windows are computed in UTC because the per-day read model buckets
 * in UTC (`summarizeExecutionsByDay`). Mixing the two — a local month
 * boundary against UTC buckets — silently produces a leading or
 * trailing day that belongs to the wrong period, and the size of the
 * error depends on where the reader is sitting.
 */
function periodWindow(period: UsagePeriod): { from: Date; to: Date } {
  const to = new Date();

  if (period === "current") {
    return {
      from: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)),
      to,
    };
  }

  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (period === "7d" ? 7 : 30));
  return { from, to };
}

async function summarizePeriod(
  workspaceId: string,
  period: UsagePeriod
): Promise<UsagePeriodSummary> {
  const summary = await summarizeExecutions(workspaceId, periodWindow(period));
  return {
    tokensUsed: summary.totals.totalTokens,
    chargedAmount: summary.totals.chargedMnt,
    requestCount: summary.totals.count,
  };
}

/**
 * Day-by-day series for the period, with absent days filled in as
 * zero. The read model omits days nothing ran on (see
 * `summarizeExecutionsByDay`); a chart needs the gaps, because a flat
 * stretch and a missing stretch look identical once they are drawn.
 */
function fillDailyGaps(
  rows: Array<{ date: string; totalTokens: number; count: number }>,
  window: { from: Date; to: Date }
): UsageDailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const points: UsageDailyPoint[] = [];

  const cursor = new Date(
    Date.UTC(
      window.from.getUTCFullYear(),
      window.from.getUTCMonth(),
      window.from.getUTCDate()
    )
  );
  const end = Date.UTC(
    window.to.getUTCFullYear(),
    window.to.getUTCMonth(),
    window.to.getUTCDate()
  );

  while (cursor.getTime() <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const row = byDate.get(date);
    points.push({
      date,
      tokensUsed: row?.totalTokens ?? 0,
      requestCount: row?.count ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

/**
 * Full initial load for the usage page: the current-month summary,
 * quota/trial/plan state, and the most recent execution records.
 */
export async function getUsageOverview(): Promise<ActionResult<UsageOverview>> {
  const t = await getTranslations("usage");

  try {
    const { workspace } = await requireWorkspace();

    const window = periodWindow("current");

    const [currentPeriod, quota, trial, billing, recent, daily] =
      await Promise.all([
        summarizePeriod(workspace.id, "current"),
        getQuotaThresholds(workspace.id),
        getTrialStatus(workspace.id),
        getWorkspaceBilling(workspace.id),
        listExecutions({ workspaceId: workspace.id, limit: 25 }),
        summarizeExecutionsByDay(workspace.id, window),
      ]);

    return {
      success: true,
      data: {
        plan: {
          name: billing.plan?.name ?? "Free",
          slug: billing.plan?.slug ?? "free",
        },
        billingMode: billing.billingMode,
        currentPeriod,
        quota,
        trial: {
          hasTrialCredits: trial.hasTrialCredits,
          status: trial.status,
          creditsRemaining: trial.creditsRemaining,
          initialCredits: trial.initialCredits,
          percentageRemaining: trial.percentageRemaining,
        },
        daily: fillDailyGaps(daily, window),
        records: recent.map((execution) => ({
          id: execution.id,
          capability: execution.capability,
          status: execution.status as UsageRecord["status"],
          model: execution.model,
          totalTokens: execution.totalTokens,
          chargedAmount: execution.chargedMnt,
          startedAt: execution.startedAt.toISOString(),
          durationMs: execution.durationMs,
        })),
      },
    };
  } catch {
    return {
      success: false,
      // Always the translated key — a raw Error#message can carry
      // internals (SQL, hostnames) to the UI.
      error: t("errors.loadOverview"),
    };
  }
}

/**
 * Re-summarize just the current-period tile for a different window,
 * called from the client-side period selector. Quota/trial/plan state
 * and the records table are not period-dependent, so they are not
 * refetched here.
 */
export async function getUsagePeriodSummary(
  period: UsagePeriod
): Promise<ActionResult<UsagePeriodSummary>> {
  const t = await getTranslations("usage");

  try {
    const { workspace } = await requireWorkspace();
    const data = await summarizePeriod(workspace.id, period);
    return { success: true, data };
  } catch {
    return {
      success: false,
      error: t("errors.loadSummary"),
    };
  }
}

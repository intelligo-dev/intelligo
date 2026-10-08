"use server";

/**
 * Usage actions — thin reads over `@intelligo-dev/executions` (token and
 * charge aggregation) and `@intelligo-dev/billing` (quota, trial, plan).
 * They authenticate the caller and reshape the result for the page.
 *
 * What a caller sees follows their role: an owner or admin reads the
 * workspace's usage, spend, quota and trial credit; anyone else reads
 * only the runs they started, with no workspace billing state.
 *
 * Error fallbacks are translated and always generic — a thrown
 * `Error#message` can carry internals (SQL, hostnames).
 */

import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";
import {
  getRequestHeaders,
  resolveTimeZone,
} from "@intelligo-dev/core/request-context";
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
import type { ActionResult as BaseActionResult } from "@intelligo-dev/next";

import type { MoneyLike } from "@/lib/format-money";
import { planName } from "@/lib/plan-copy";

export type UsagePeriod = "7d" | "30d" | "current";

export type UsagePeriodSummary = {
  tokensUsed: number;
  /**
   * What the period charged, in micros with its currency. Null when
   * nothing was charged, or when the rows carry no currency.
   */
  charged: MoneyLike | null;
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
  /** What this run charged, in micros with its currency. */
  charged: MoneyLike | null;
  startedAt: string; // ISO
  durationMs: number | null;
};

export type UsageDailyPoint = {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  tokensUsed: number;
  requestCount: number;
};

/** Whose usage the page shows: the workspace's, or the caller's own. */
export type UsageScope = "workspace" | "own";

export type UsageOverview = {
  scope: UsageScope;
  plan: UsagePlan;
  billingMode: "subscription" | "credit";
  currentPeriod: UsagePeriodSummary;
  /** Null when the caller reads only their own usage. */
  quota: UsageQuotaState | null;
  /** Null when the caller reads only their own usage. */
  trial: UsageTrialState | null;
  /** One point per day in the current period, gaps filled with zero. */
  daily: UsageDailyPoint[];
  records: UsageRecord[];
};

export type ActionResult<T> = BaseActionResult<T>;

/** The roles that read the workspace's usage and billing state. */
const WORKSPACE_USAGE_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

/** The caller's workspace and the filter their role puts on its usage. */
async function usageReader(): Promise<{
  workspaceId: string;
  scope: UsageScope;
  filter: { userId?: string };
}> {
  const { workspace, user, membership } = await requireWorkspace();
  if (WORKSPACE_USAGE_ROLES.has(membership.role)) {
    return { workspaceId: workspace.id, scope: "workspace", filter: {} };
  }
  return {
    workspaceId: workspace.id,
    scope: "own",
    filter: { userId: user.id },
  };
}

/**
 * The reader's own time zone, from the cookie the app shell writes.
 * Falls back to UTC on the first request of a session, which has no
 * cookie yet, and anywhere no request context is bound.
 */
async function readerTimeZone(): Promise<string> {
  try {
    const cookie = (await getRequestHeaders()).get("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)tz=([^;]*)/);
    return resolveTimeZone(match?.[1] ? decodeURIComponent(match[1]) : null);
  } catch {
    return "UTC";
  }
}

type CalendarDay = { year: number; month: number; day: number };

/** The calendar day an instant falls on, as it reads in `timeZone`. */
function partsIn(date: Date, timeZone: string): CalendarDay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** How far `timeZone` is from UTC at this instant, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // The wall clock there, read as if it were UTC, minus the real instant.
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second")
  );
  return asUtc - date.getTime();
}

/**
 * The instant a calendar day begins in `timeZone`.
 *
 * The offset is applied twice because the first correction can land on
 * the other side of a DST change, where the offset differs.
 */
function startOfDay(day: CalendarDay, timeZone: string): Date {
  const naive = Date.UTC(day.year, day.month - 1, day.day);
  const guess = naive - offsetMs(new Date(naive), timeZone);
  return new Date(naive - offsetMs(new Date(guess), timeZone));
}

const labelOf = (day: CalendarDay) =>
  `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;

/** The calendar day `count` days after this one. */
function addDays(day: CalendarDay, count: number): CalendarDay {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + count));
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

/**
 * Windows are computed in the reader's zone, because the per-day read
 * model buckets there too (`summarizeExecutionsByDay`). Mixing the
 * two — a local month boundary against UTC buckets — silently produces
 * a leading or trailing day that belongs to the wrong period, and the
 * size of the error depends on where the reader is sitting.
 */
function periodWindow(
  period: UsagePeriod,
  timeZone: string
): { from: Date; to: Date } {
  const to = new Date();
  const today = partsIn(to, timeZone);

  const first =
    period === "current"
      ? { ...today, day: 1 }
      : addDays(today, period === "7d" ? -7 : -30);

  return { from: startOfDay(first, timeZone), to };
}

async function summarizePeriod(
  workspaceId: string,
  period: UsagePeriod,
  timeZone: string,
  filter: { userId?: string }
): Promise<UsagePeriodSummary> {
  const summary = await summarizeExecutions(
    workspaceId,
    periodWindow(period, timeZone),
    filter
  );
  return {
    tokensUsed: summary.totals.totalTokens,
    // A workspace bills in one currency, so the summary has at most one
    // entry; the array is what keeps a platform-wide read honest.
    charged: summary.totals.charged[0] ?? null,
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
  window: { from: Date; to: Date },
  timeZone: string
): UsageDailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const points: UsageDailyPoint[] = [];

  // Walk the reader's calendar days, which is what the query grouped
  // by. Counting days rather than adding 24 hours to an instant keeps
  // a DST change from skipping or repeating one.
  let cursor = partsIn(window.from, timeZone);
  const end = labelOf(partsIn(window.to, timeZone));

  for (let guard = 0; guard < 400; guard += 1) {
    const date = labelOf(cursor);
    const row = byDate.get(date);
    points.push({
      date,
      tokensUsed: row?.totalTokens ?? 0,
      requestCount: row?.count ?? 0,
    });
    if (date >= end) break;
    cursor = addDays(cursor, 1);
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
    const { workspaceId, scope, filter } = await usageReader();
    const ownOnly = scope === "own";

    const timeZone = await readerTimeZone();
    const window = periodWindow("current", timeZone);

    const [currentPeriod, quota, trial, billing, recent, daily] =
      await Promise.all([
        summarizePeriod(workspaceId, "current", timeZone, filter),
        ownOnly ? null : getQuotaThresholds(workspaceId),
        ownOnly ? null : getTrialStatus(workspaceId),
        getWorkspaceBilling(workspaceId),
        listExecutions({ workspaceId, ...filter, limit: 25 }),
        summarizeExecutionsByDay(workspaceId, window, { timeZone, ...filter }),
      ]);

    // The plan's name in the reader's language, when the deployment's
    // `plans` messages translate it (lib/plan-copy.ts).
    const tPlans = await getTranslations("plans");
    const planSlug = billing.plan?.slug ?? "free";

    return {
      success: true,
      data: {
        scope,
        plan: {
          name: planName(
            tPlans,
            planSlug,
            billing.plan?.name ?? t("summaryCards.noPlan")
          ),
          slug: planSlug,
        },
        billingMode: billing.billingMode,
        currentPeriod,
        quota,
        trial: trial && {
          hasTrialCredits: trial.hasTrialCredits,
          status: trial.status,
          creditsRemaining: trial.creditsRemaining,
          initialCredits: trial.initialCredits,
          percentageRemaining: trial.percentageRemaining,
        },
        daily: fillDailyGaps(daily, window, timeZone),
        records: recent.map((execution) => ({
          id: execution.id,
          capability: execution.capability,
          status: execution.status as UsageRecord["status"],
          model: execution.model,
          totalTokens: execution.totalTokens,
          charged:
            execution.chargedMicros !== null && execution.currency
              ? {
                  amount: Number(execution.chargedMicros),
                  currency: execution.currency,
                }
              : null,
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
    const { workspaceId, filter } = await usageReader();
    const data = await summarizePeriod(
      workspaceId,
      period,
      await readerTimeZone(),
      filter
    );
    return { success: true, data };
  } catch {
    return {
      success: false,
      error: t("errors.loadSummary"),
    };
  }
}

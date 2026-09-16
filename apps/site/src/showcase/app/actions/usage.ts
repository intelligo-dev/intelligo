import { wait, daysAgo } from "./_preview";

export type UsagePeriod = "7d" | "30d" | "current";
/** An amount in micros and the currency it is denominated in. */
export type MoneyLike = { amount: number; currency: string };

export type UsagePeriodSummary = {
  tokensUsed: number;
  chargedAmount: number;
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
export type UsagePlan = { name: string; slug: string };
export type UsageRecord = {
  id: string;
  capability: string;
  status: "running" | "settling" | "succeeded" | "failed" | "refused";
  model: string | null;
  totalTokens: number | null;
  chargedAmount: number | null;
  charged: MoneyLike | null;
  startedAt: string;
  durationMs: number | null;
};
export type UsageDailyPoint = {
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
  daily: UsageDailyPoint[];
  records: UsageRecord[];
};
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Dollars, as the framework hands them over: micros with a currency. */
const usd = (major: number): MoneyLike => ({
  amount: Math.round(major * 1_000_000),
  currency: "USD",
});

const SUMMARY: Record<UsagePeriod, UsagePeriodSummary> = {
  "7d": {
    tokensUsed: 412_300,
    chargedAmount: 9.4,
    charged: usd(9.4),
    requestCount: 318,
  },
  "30d": {
    tokensUsed: 2_140_000,
    chargedAmount: 41.2,
    charged: usd(41.2),
    requestCount: 1_284,
  },
  current: {
    tokensUsed: 1_960_500,
    chargedAmount: 37.8,
    charged: usd(37.8),
    requestCount: 1_162,
  },
};

const DAILY: UsageDailyPoint[] = Array.from({ length: 30 }, (_, i) => {
  const n = 29 - i;
  const wave = [30, 55, 40, 70, 62, 85, 48][i % 7]!;
  return {
    date: daysAgo(n).slice(0, 10),
    tokensUsed: Math.round(wave * 1_100 + (i % 5) * 900),
    requestCount: Math.round(wave / 2.2),
  };
});

export const USAGE_OVERVIEW: UsageOverview = {
  plan: { name: "Pro", slug: "pro" },
  billingMode: "subscription",
  currentPeriod: SUMMARY.current,
  quota: { percentage: 64, warningThreshold: false, criticalThreshold: false },
  trial: {
    hasTrialCredits: false,
    status: "converted",
    creditsRemaining: 0,
    initialCredits: 1000,
    percentageRemaining: 0,
  },
  daily: DAILY,
  records: [
    {
      id: "exe_01",
      capability: "chat.message",
      status: "succeeded",
      model: "anthropic/claude-sonnet-4-6",
      totalTokens: 2_412,
      chargedAmount: 0.04,
      charged: usd(0.04),
      startedAt: daysAgo(0, 1),
      durationMs: 3_860,
    },
    {
      id: "exe_02",
      capability: "report.generate",
      status: "succeeded",
      model: "openai/gpt-5-mini",
      totalTokens: 18_930,
      chargedAmount: 0.31,
      charged: usd(0.31),
      startedAt: daysAgo(0, 4),
      durationMs: 21_400,
    },
    {
      id: "exe_03",
      capability: "chat.message",
      status: "refused",
      model: null,
      totalTokens: null,
      chargedAmount: null,
      charged: null,
      startedAt: daysAgo(1, 2),
      durationMs: null,
    },
    {
      id: "exe_04",
      capability: "chat.message",
      status: "failed",
      model: "google/gemini-2.5-flash",
      totalTokens: 610,
      chargedAmount: 0,
      charged: usd(0),
      startedAt: daysAgo(1, 6),
      durationMs: 900,
    },
  ],
};

export async function getUsageOverview(): Promise<ActionResult<UsageOverview>> {
  await wait(300);
  return { success: true, data: USAGE_OVERVIEW };
}
export async function getUsagePeriodSummary(
  period: UsagePeriod,
  ..._rest: unknown[]
): Promise<ActionResult<UsagePeriodSummary>> {
  await wait(300);
  return { success: true, data: SUMMARY[period] ?? SUMMARY.current };
}

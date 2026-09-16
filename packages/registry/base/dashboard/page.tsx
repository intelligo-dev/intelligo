/**
 * Workspace dashboard — an AI-first home, not a metrics console.
 *
 * The order on this page is the argument: what you can do (hero,
 * starters, prompt bar), what you were doing (resume pill, recent
 * conversations), and only then what it costs (plan summary). The
 * previous version of this item led with five stat tiles and five
 * settings links, which reads as an admin console for a product the
 * person hasn't used yet.
 *
 * Everything configurable lives in two consumer-owned seams:
 * `@/lib/dashboard-config` (hero copy, starters, chat base path,
 * shortcuts) and `@/lib/dashboard-data` (`getResume` — what
 * "unfinished work" means for this product). Neither requires editing
 * a file this item ships.
 *
 * Pairs with the `chat` item: the hero's starters and the prompt bar
 * open `${chatBasePath}/<new-uuid>?query=…`, which the chat panel sends
 * as the first turn. Without a chat surface installed, set
 * `chatBasePath` or drop those affordances.
 *
 * Workspace resolution: `requireWorkspace()` is called directly and
 * allowed to throw. The `app-shell` item's layout already guarantees an
 * active workspace before any `(app)` route renders, so a failure here
 * means something is genuinely wrong (a revoked session mid-request),
 * not an empty state — and this item ships an `error.tsx` for exactly
 * that.
 *
 * No `actions.ts`: every read is a plain server-side call with no
 * client-triggered refetch (contrast the `usage` item, whose period
 * selector needs one).
 */

import type { Metadata } from "next";
import { getTimeZone, getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";
import { getTrialStatus, getWorkspaceBilling } from "@intelligo-dev/billing";
import { listConversations } from "@intelligo-dev/core/conversations";
import { summarizeExecutions } from "@intelligo-dev/executions";

import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { PlanSummary } from "@/components/dashboard/plan-summary";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { RecentConversations } from "@/components/dashboard/recent-conversations";
import { Link } from "@/i18n/navigation";
import { dashboardConfig } from "@/lib/dashboard-config";
import { getResume } from "@/lib/dashboard-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("meta.title") };
}

/**
 * The first moment of this month where the reader is sitting.
 *
 * The server's own zone is nobody's: it used to decide when "this
 * month" began, so the figure here and the one on the usage page could
 * disagree for a day at every month boundary. next-intl already
 * resolves the reader's zone for formatting; this uses the same one.
 */
async function startOfMonth(): Promise<Date> {
  const timeZone = await getTimeZone();

  /** How far the zone is from UTC at this instant, in milliseconds. */
  const offsetMs = (date: Date) => {
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
    // The wall clock there, read as if it were UTC, minus the instant.
    return (
      Date.UTC(
        value("year"),
        value("month") - 1,
        value("day"),
        value("hour") % 24,
        value("minute"),
        value("second")
      ) - date.getTime()
    );
  };

  const now = new Date();
  const here = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    Number(here.find((part) => part.type === type)?.value ?? "0");

  // Midnight on the first, corrected by the offset — twice, because the
  // first correction can land the other side of a DST change.
  const naive = Date.UTC(value("year"), value("month") - 1, 1);
  const guess = naive - offsetMs(new Date(naive));
  return new Date(naive - offsetMs(new Date(guess)));
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  // Namespace-less: shortcut `titleKey`s are fully qualified so a
  // product can point them at its own namespace.
  const tAny = await getTranslations();
  const { workspace, user } = await requireWorkspace();
  const actor = { workspaceId: workspace.id, userId: user.id };

  const [recent, resume, monthSummary, billing, trial] = await Promise.all([
    listConversations(actor, { limit: 5 }),
    getResume(actor, { chatBasePath: dashboardConfig.chatBasePath }),
    summarizeExecutions(workspace.id, {
      from: await startOfMonth(),
      to: new Date(),
    }),
    getWorkspaceBilling(workspace.id),
    getTrialStatus(workspace.id),
  ]);

  const shortcuts = dashboardConfig.shortcuts ?? [];

  return (
    <div className="flex min-h-full flex-col">
      {/* Bottom padding so the last thing on the page clears the
          composer's band instead of ending flush against it. */}
      <div className="flex-1 px-4 pt-12 pb-8 md:pt-16">
        <DashboardHero resume={resume} />

        <RecentConversations
          conversations={recent.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            updatedAt: conversation.updatedAt.toISOString(),
          }))}
        />

        {dashboardConfig.showPlanSummary !== false ? (
          <PlanSummary
            planName={billing.plan?.name ?? t("plan.freeName")}
            billingMode={billing.billingMode}
            chargedThisMonth={monthSummary.totals.chargedMnt}
            charged={monthSummary.totals.charged[0] ?? null}
            requestsThisMonth={monthSummary.totals.count}
            trial={{
              hasTrialCredits: trial.hasTrialCredits,
              status: trial.status,
              creditsRemaining: trial.creditsRemaining,
              initialCredits: trial.initialCredits,
              percentageRemaining: trial.percentageRemaining,
              daysRemaining: trial.daysRemaining,
            }}
          />
        ) : null}

        {shortcuts.length > 0 ? (
          <div className="mx-auto mt-8 flex w-full max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="size-3.5" />
                  {tAny(shortcut.titleKey)}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      <PromptBar />
    </div>
  );
}

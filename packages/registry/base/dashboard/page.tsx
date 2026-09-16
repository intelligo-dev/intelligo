/**
 * Workspace dashboard — an AI-first home, not a metrics console.
 *
 * One thing to do, centred: the hero names the surface, the composer
 * answers it, and starter chips fill the composer. Nothing else.
 *
 * It got here by subtraction. The page used to carry a shortcuts row
 * (the shell's own navigation, rendered twice), a list of recent
 * conversations (the sidebar's history, rendered twice) and a plan and
 * usage strip. None of it was what a person opened the app to do, and
 * on a real workspace the recent list repeated itself — two
 * conversations that begin with the same message are two identical
 * rows. Spend lives on `/usage`, plans on `/pricing`, history in the
 * sidebar; each is one click away and none of it competes with the
 * composer here.
 *
 * Everything configurable lives in two consumer-owned seams:
 * `@/lib/dashboard-config` (hero copy, starters, chat base path) and
 * `@/lib/dashboard-data` (`getResume` — what "unfinished work" means
 * for this product). Neither requires editing a file this item ships.
 *
 * Pairs with the `chat` item: the composer and the starters open
 * `${chatBasePath}/<new-uuid>?query=…`, which the chat panel sends as
 * the first turn. Without a chat surface installed, set `chatBasePath`
 * or drop those affordances.
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
import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";

import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { dashboardConfig } from "@/lib/dashboard-config";
import { getResume } from "@/lib/dashboard-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("meta.title") };
}

export default async function DashboardPage() {
  const { workspace, user } = await requireWorkspace();

  const resume = await getResume(
    { workspaceId: workspace.id, userId: user.id },
    { chatBasePath: dashboardConfig.chatBasePath }
  );

  return (
    <div className="flex min-h-full flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <DashboardHero resume={resume} />
        <PromptBar />
      </div>
    </div>
  );
}

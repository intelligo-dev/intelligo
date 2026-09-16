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

"use client";

/**
 * The dashboard's primary surface: what this workspace is for, a way
 * back into unfinished work, and three ways to start.
 *
 * Deliberately not a stat wall — plan, spend and token counts are real
 * but secondary information, and they live below in `PlanSummary`. A
 * person opening the app wants to do the thing, not read a meter.
 *
 * Starting a conversation mints a client-side UUID and navigates to
 * `${chatBasePath}/${id}?query=…`; the chat item's panel reads that
 * `query` param and sends it as the first turn, creating the row on the
 * server. Nothing is written here.
 */

import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { dashboardConfig } from "@/lib/dashboard-config";
import type { ResumeTarget } from "@/lib/dashboard-data";

interface DashboardHeroProps {
  resume: ResumeTarget | null;
}

export function DashboardHero({ resume }: DashboardHeroProps) {
  const t = useTranslations("dashboard");
  // Namespace-less: hero/starter keys are fully qualified so a product
  // can point them at its own namespace (see `@/lib/dashboard-config`).
  const tAny = useTranslations();
  const router = useRouter();

  const Icon = dashboardConfig.hero?.icon ?? Sparkles;
  const chatBasePath = dashboardConfig.chatBasePath ?? "/chat";
  const starters = (dashboardConfig.starters ?? []).map((key) => tAny(key));

  const title = dashboardConfig.hero?.titleKey
    ? tAny(dashboardConfig.hero.titleKey)
    : t("hero.title");
  const subtitle = dashboardConfig.hero?.subtitleKey
    ? tAny(dashboardConfig.hero.subtitleKey)
    : t("hero.subtitle");

  function start(prompt?: string) {
    const id = crypto.randomUUID();
    router.push(
      prompt
        ? `${chatBasePath}/${id}?query=${encodeURIComponent(prompt)}`
        : `${chatBasePath}/${id}`
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl text-center">
      <div className="flex justify-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-8 text-primary" strokeWidth={1.75} />
        </div>
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
        {subtitle}
      </p>

      {resume ? (
        <button
          type="button"
          onClick={() => router.push(resume.href)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent/60 px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          {resume.label ?? t("hero.resume")}
          <ArrowRight className="size-3.5" />
        </button>
      ) : null}

      {starters.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {starters.map((starter, index) => (
            <button
              key={index}
              type="button"
              onClick={() => start(starter)}
              className="group flex h-28 flex-col justify-start rounded-2xl border border-border/60 bg-card p-4 text-left text-sm leading-snug text-muted-foreground transition-all hover:border-border hover:bg-accent/40 hover:text-foreground"
            >
              <span className="line-clamp-4">{starter}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

/**
 * What this workspace is for, and a way back into unfinished work.
 *
 * Deliberately short: the hero's job is to name the surface and then
 * get out of the way of the composer directly beneath it. Starters
 * belong to the composer (`prompt-bar.tsx`), because they are ways of
 * filling it rather than a separate menu of features — keeping them
 * here put three cards between the question and the box that answers
 * it.
 *
 * Not a stat wall: plan, spend and token counts are real but secondary,
 * and they live in the strip at the foot of the page. A person opening
 * the app wants to do the thing, not read a meter.
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
  // Namespace-less: hero keys are fully qualified so a product can
  // point them at its own namespace (see `@/lib/dashboard-config`).
  const tAny = useTranslations();
  const router = useRouter();

  const Icon = dashboardConfig.hero?.icon ?? Sparkles;

  const title = dashboardConfig.hero?.titleKey
    ? tAny(dashboardConfig.hero.titleKey)
    : t("hero.title");
  const subtitle = dashboardConfig.hero?.subtitleKey
    ? tAny(dashboardConfig.hero.subtitleKey)
    : t("hero.subtitle");

  return (
    <div className="text-center">
      <div className="flex justify-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-6 text-primary" strokeWidth={1.75} />
        </div>
      </div>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
        {subtitle}
      </p>

      {resume ? (
        <button
          type="button"
          onClick={() => router.push(resume.href)}
          // `max-w-full` and a truncating label: a resumed conversation
          // is titled from its first message, which on a phone is wider
          // than the screen and wrapped the pill into a block.
          className="mt-5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent/60 px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <span
            className="size-1.5 shrink-0 rounded-full bg-primary"
            aria-hidden
          />
          <span className="truncate">{resume.label ?? t("hero.resume")}</span>
          <ArrowRight className="size-3.5 shrink-0" />
        </button>
      ) : null}
    </div>
  );
}

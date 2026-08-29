/**
 * Onboarding page — server component.
 *
 * Loads the caller's onboarding state directly via `@/lib/onboarding`
 * (same pattern as `team-settings`/`workspace-settings`: state reads
 * happen in the page, not through a server action) and renders the
 * wizard, resuming at the caller's persisted step if there is one. A
 * caller who has already completed onboarding is redirected to the
 * completion screen's CTA target rather than shown the wizard again.
 */

// Session reads make this page inherently per-request; declaring it
// dynamic keeps `next build` from attempting a static prerender.
export const dynamic = "force-dynamic";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { onboarding } from "@/lib/onboarding";
import { onboardingConfig } from "@/lib/onboarding-steps";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const state = await onboarding.getState();

  if (state.completed) {
    redirect({
      href: onboardingConfig.complete.ctaHref,
      locale: await getLocale(),
    });
  }

  return <OnboardingWizard initialStepId={state.currentStep} />;
}

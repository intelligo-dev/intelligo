export const dynamic = "force-dynamic";

import { getLocale } from "next-intl/server";
import { getAuthSession } from "@intelligo-dev/auth";
import { redirect } from "@/i18n/navigation";
import { onboarding } from "@/lib/onboarding";
import { onboardingConfig } from "@/lib/onboarding-steps";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  // Outside `(app)`, so the shell's session check does not cover it.
  if (!(await getAuthSession())) {
    redirect({ href: "/login", locale: await getLocale() });
  }

  const state = await onboarding.getState();

  if (state.completed) {
    redirect({
      href: onboardingConfig.complete.ctaHref,
      locale: await getLocale(),
    });
  }

  return <OnboardingWizard initialStepId={state.currentStep} />;
}

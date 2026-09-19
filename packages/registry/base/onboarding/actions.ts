"use server";

/**
 * Onboarding actions over the service in `@/lib/onboarding`: call it, map
 * an `OnboardingServiceError` to a translated message, revalidate. The
 * page reads state from the service directly.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { isOnboardingServiceError } from "@intelligo-dev/auth";

import { profile } from "@/lib/onboarding-profile";
import { onboarding } from "@/lib/onboarding";
import {
  onboardingConfig,
  type OnboardingAnswers,
} from "@/lib/onboarding-steps";

export type OnboardingActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

async function friendlyError(error: unknown): Promise<string> {
  if (isOnboardingServiceError(error)) {
    if (error.code === "invalid_input") return error.message;
    const t = await getTranslations("onboarding");
    if (error.code === "forbidden") return t("errors.forbidden");
    return t("errors.unexpected");
  }
  // `Error#message` can carry internals (SQL, hostnames) to the UI.
  console.error("[onboarding]", error);
  const t = await getTranslations("onboarding");
  return t("errors.generic");
}

/**
 * Leaves the step `from` for `to`. Going forward (`answers` given), it
 * first runs `onStepSubmit` from `lib/onboarding-steps.ts` with `from`
 * and its answers; going back submits nothing. `to` null is the
 * completion screen, which persists no step id, so the caller resumes
 * at `from`.
 */
export async function advanceStep(move: {
  from: string;
  to: string | null;
  answers?: OnboardingAnswers;
}): Promise<OnboardingActionResult> {
  try {
    if (move.answers && onboardingConfig.onStepSubmit) {
      await onboardingConfig.onStepSubmit(move.from, move.answers);
    }
    await onboarding.setStep(move.to ?? move.from);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: await friendlyError(error) };
  }
}

export async function completeOnboarding(): Promise<OnboardingActionResult> {
  try {
    await onboarding.complete();
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: await friendlyError(error) };
  }
}

export async function skipOnboarding(): Promise<OnboardingActionResult> {
  try {
    await onboarding.skip();
    revalidatePath("/");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: await friendlyError(error) };
  }
}

/**
 * Saves a display name typed into the wizard.
 *
 * A server action because `lib/onboarding-steps.ts` is also imported by
 * the client wizard, and calling a server-only service from there would
 * pull `next/headers` into the client bundle. Any persistence you add in
 * `onStepSubmit` should take the same shape.
 */
export async function saveDisplayName(
  name: string
): Promise<OnboardingActionResult> {
  const trimmed = name.trim();
  // The service validates length; anything shorter is the wizard's own
  // required-field problem, not a reason to fail the step.
  if (trimmed.length < 2) return { success: true, data: undefined };

  try {
    await profile.updateProfile({ name: trimmed });
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: await friendlyError(error) };
  }
}

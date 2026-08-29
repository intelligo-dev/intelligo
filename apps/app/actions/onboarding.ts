"use server";

/**
 * Onboarding server actions — thin transport over the bound onboarding
 * service (`@/lib/onboarding`): call the service, map any
 * `OnboardingServiceError` to a friendly message, and revalidate. No
 * business rules here — those live in the service. State reads happen
 * directly in `page.tsx` via `@/lib/onboarding`, not through an action
 * — same pattern as `team-settings`/`workspace-settings`.
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
  | { success: true; data: T }
  | { success: false; error: string };

async function friendlyError(error: unknown): Promise<string> {
  if (isOnboardingServiceError(error)) {
    if (error.code === "invalid_input") return error.message;
    const t = await getTranslations("onboarding");
    if (error.code === "forbidden") return t("errors.forbidden");
    return t("errors.unexpected");
  }
  if (error instanceof Error) return error.message;
  const t = await getTranslations("onboarding");
  return t("errors.generic");
}

/**
 * Advance (or move back) to `stepId`. Runs the consumer's
 * `onStepSubmit` hook (see `lib/onboarding-steps.ts`) with the
 * step-being-left's answers before persisting the new step id, so a
 * product can turn field answers into durable data of its own.
 */
export async function advanceStep(
  stepId: string,
  answers: OnboardingAnswers
): Promise<OnboardingActionResult> {
  try {
    if (onboardingConfig.onStepSubmit) {
      await onboardingConfig.onStepSubmit(stepId, answers);
    }
    await onboarding.setStep(stepId);
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
 * Persists a display name typed into the wizard.
 *
 * A server action rather than a call inside `lib/onboarding-steps.ts`,
 * because that config is also imported by the `"use client"` wizard
 * (for the steps and completion copy) — reaching into a server-only
 * service from there would drag `next/headers` into the client bundle.
 * A server action reference is serializable, so the client never sees
 * this implementation. That is the same shape any product-specific
 * persistence should take in `onStepSubmit`.
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

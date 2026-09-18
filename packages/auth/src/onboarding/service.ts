/**
 * The caller's first-run onboarding state: two columns on `users`
 * (`onboardingCompleted`, `onboardingStep`). Completing onboarding has no
 * trial or credit side effects; first-workspace bootstrapping runs once per
 * workspace through `ensureUserWorkspace`'s `onWorkspaceCreated`. Each method
 * authorizes itself and throws `OnboardingServiceError`.
 */

import { eq } from "drizzle-orm";
import { db } from "@intelligo-dev/core/db";
import { users } from "@intelligo-dev/core/db/schema";

import { requireAuth } from "../helpers";
import { setStepSchema } from "./schemas";
import { OnboardingServiceError, isOnboardingServiceError } from "./errors";

/** The caller's onboarding progress. */
export interface OnboardingState {
  completed: boolean;
  currentStep: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps requireAuth failures to `forbidden`. */
function toForbidden(error: unknown): OnboardingServiceError {
  if (isOnboardingServiceError(error)) return error;
  return new OnboardingServiceError("forbidden", errorMessage(error), {
    cause: error,
  });
}

export function createOnboardingService() {
  async function callRequireAuth() {
    try {
      return await requireAuth();
    } catch (error) {
      throw toForbidden(error);
    }
  }

  /** The caller's current onboarding state. */
  async function getState(): Promise<OnboardingState> {
    const { user } = await callRequireAuth();

    const [row] = await db
      .select({
        onboardingCompleted: users.onboardingCompleted,
        onboardingStep: users.onboardingStep,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row) {
      throw new OnboardingServiceError("not_found", "User not found");
    }

    return {
      completed: row.onboardingCompleted,
      currentStep: row.onboardingStep,
    };
  }

  /**
   * Set the caller's current step. Step ids are the product's; this only
   * checks for a non-empty string of at most 64 characters and persists it
   * verbatim. Does not touch `onboardingCompleted`.
   */
  async function setStep(step: string): Promise<OnboardingState> {
    const { user } = await callRequireAuth();

    const parsed = setStepSchema.safeParse(step);
    if (!parsed.success) {
      throw new OnboardingServiceError(
        "invalid_input",
        parsed.error.issues.map((issue) => issue.message).join("; ") ||
          "Invalid step",
        { cause: parsed.error }
      );
    }

    await db
      .update(users)
      .set({ onboardingStep: parsed.data, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return { completed: false, currentStep: parsed.data };
  }

  /** Mark onboarding complete and clear the step. */
  async function complete(): Promise<OnboardingState> {
    const { user } = await callRequireAuth();

    await db
      .update(users)
      .set({
        onboardingCompleted: true,
        onboardingStep: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { completed: true, currentStep: null };
  }

  /**
   * Skip onboarding. Same durable effect as `complete()` (there is no
   * "skipped" column); a separate method so a transport can tell them apart.
   */
  async function skip(): Promise<OnboardingState> {
    return complete();
  }

  return { getState, setStep, complete, skip };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;

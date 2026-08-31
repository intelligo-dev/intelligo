/**
 * Onboarding service — the durable business rules behind a user's
 * first-run onboarding flow, lifted out of the first product's
 * onboarding actions (page/registry migration, `onboarding` family,
 * roadmap item 11).
 *
 * Unlike `../team/service.ts` and `../workspace/service.ts`, this
 * service has no Better-Auth organization-plugin calls to make — it
 * reads and writes exactly two columns on `@intelligo-dev/core`'s `users`
 * table (`onboardingCompleted`, `onboardingStep`) directly via Drizzle.
 *
 * No ports: `complete()` and `skip()` only flip those two columns and
 * return the resulting state — they do NOT provision trial credits,
 * record referrals, or perform any other first-workspace bootstrapping.
 * The product's original `completeOnboarding()` action did exactly that
 * (`provisionTrialCredits`/`recordReferralSignup`/`grantReferralUpgrade`
 * inline), but that work belongs to the consumer's own
 * `onWorkspaceCreated` binding instead — see `../workspace-init.ts`'s
 * `onWorkspaceCreated` port and the `app-shell` registry item's
 * `lib/workspace-bootstrap.ts`, which already runs once per new
 * workspace. Duplicating it here would either double-provision (it
 * would fire again on every onboarding completion, not just the first
 * workspace) or force this package to depend on `@intelligo-dev/billing`,
 * which the allowlist in
 * `tests/architecture/dependency-direction.test.ts` forbids.
 *
 * ---------------------------------------------------------------------
 * Why `setStep` takes a bare `string`, not an enum
 * ---------------------------------------------------------------------
 * See the doc comment on `./schemas.ts`'s `setStepSchema`. Short
 * version: the `onboarding_step` column is untyped `text`, and a
 * framework-owned service can't know a consumer's step ids in advance
 * — a different product may have two steps, or six. This module
 * accepts any non-empty string up to 64 characters and persists it
 * verbatim.
 *
 * ---------------------------------------------------------------------
 * Why `skip()` has the same durable effect as `complete()`
 * ---------------------------------------------------------------------
 * The `users` table has no separate "skipped" column, so there is
 * nothing else to persist. The product's original `skipOnboarding()` action
 * logged an analytics event and then delegated to `completeOnboarding()`
 * unchanged; this service mirrors that shape as two distinct methods
 * (rather than collapsing `skip` into an alias) so a transport can
 * still log/tag the skip differently before or after calling it —
 * that shaping, like everything else transport-level, does not belong
 * in this service.
 *
 * Authorization (`requireAuth`) lives INSIDE each method, not at the
 * transport. Every recognized failure throws `OnboardingServiceError`
 * with a stable `code` — no revalidatePath/Sentry/next-intl/toast here;
 * that shaping is the transport's job (a Server Action, a route
 * handler).
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

  /**
   * Get the caller's current onboarding state.
   */
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
   * Set the caller's current onboarding step. A product defines its
   * own step ids (see the module doc comment); this only validates
   * that `step` is a non-empty, bounded string and persists it
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

  /**
   * Mark onboarding complete and clear the step. No trial/referral
   * side effects — see the module doc comment.
   */
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
   * Skip onboarding. Same durable effect as `complete()` — see the
   * module doc comment for why this is its own method rather than an
   * alias.
   */
  async function skip(): Promise<OnboardingState> {
    return complete();
  }

  return { getState, setStep, complete, skip };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;

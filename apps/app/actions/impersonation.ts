"use server";

/**
 * Support impersonation, exposed to the operational console.
 *
 * Thin by design (ADR-0005): the policy — platform-admin gate,
 * audit-or-refuse, mandatory reason, time cap — is
 * `@intelligo/admin`'s, and these actions only adapt it to a form
 * submission and a redirect. Reimplementing any of it here would
 * create a second place that can disagree about who may act as whom.
 *
 * Failures are logged in full and returned generically. Every reason
 * this can refuse — you are not an admin, the target is an admin, the
 * audit log is unavailable — is something a caller who should not be
 * here would learn from.
 */

import { redirect } from "next/navigation";

import { startImpersonation, stopImpersonation } from "@intelligo/admin";
import { createLogger } from "@intelligo/core/logger";

const log = createLogger("Impersonation");

export type ImpersonationActionState = { error?: string };

export async function impersonateUserAction(
  _prev: ImpersonationActionState,
  formData: FormData
): Promise<ImpersonationActionState> {
  const targetUserId = String(formData.get("userId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!targetUserId) return { error: "Choose a user to act as." };
  if (!reason) {
    return {
      error:
        "A reason is required — it is the only record of why this account was accessed.",
    };
  }

  try {
    const result = await startImpersonation({ targetUserId, reason });
    log.warn("Impersonation started", {
      targetUserId,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    log.error("Impersonation refused", {
      targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Could not start impersonation." };
  }

  // Outside the try: redirect() signals by throwing.
  redirect("/dashboard");
}

export async function stopImpersonationAction(
  _prev: ImpersonationActionState,
  formData: FormData
): Promise<ImpersonationActionState> {
  const targetUserId = String(formData.get("userId") ?? "").trim();

  try {
    await stopImpersonation({ targetUserId });
    log.warn("Impersonation stopped", { targetUserId });
  } catch (error) {
    log.error("Failed to stop impersonation", {
      targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Could not stop impersonation." };
  }

  redirect("/admin");
}

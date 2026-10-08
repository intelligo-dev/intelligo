"use server";

/**
 * Restoring an account scheduled for deletion — a thin transport over
 * `restoreAccount` (`@intelligo-dev/auth`): call it, map a
 * `ProfileServiceError` to a message, revalidate.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  isProfileServiceError,
  restoreAccount as restore,
} from "@intelligo-dev/auth";
import type { ActionResult } from "@intelligo-dev/next";

export async function restoreAccount(): Promise<ActionResult> {
  const t = await getTranslations("auth-login");
  try {
    await restore();
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    if (isProfileServiceError(error)) {
      const message: Partial<Record<string, string>> = {
        restore_expired: t("restore.errors.expired"),
        reauthentication_required: t("restore.errors.reauthenticate"),
        not_scheduled: t("restore.errors.notScheduled"),
      };
      return {
        success: false,
        error: message[error.code] ?? t("restore.errors.failed"),
      };
    }
    console.error("[auth-login] restoreAccount", error);
    return { success: false, error: t("restore.errors.failed") };
  }
}

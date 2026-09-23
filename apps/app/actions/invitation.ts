"use server";

/**
 * Thin transport over the team service bound at `@/lib/team` (installed
 * by the `team-settings` item). Authorization, invitation ownership and
 * membership checks live in the service; this file maps a thrown
 * `TeamServiceError` to a message and revalidates.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  isTeamServiceError,
  type TeamServiceErrorCode,
} from "@intelligo-dev/auth";
import type { ActionResult } from "@intelligo-dev/next";

import { team } from "@/lib/team";

export type InvitationActionResult = ActionResult;

type Translator = Awaited<
  ReturnType<typeof getTranslations<"invitation-accept">>
>;

function friendlyMessages(
  t: Translator
): Partial<Record<TeamServiceErrorCode, string>> {
  return {
    invitation_not_found: t("errors.invitationNotFound"),
    accept_verification_failed: t("errors.acceptVerificationFailed"),
    forbidden: t("errors.forbidden"),
    invalid_input: t("errors.invalidInput"),
    provider_error: t("errors.providerError"),
  };
}

function toMessage(error: unknown, fallback: string, t: Translator): string {
  if (isTeamServiceError(error)) {
    return friendlyMessages(t)[error.code] ?? fallback;
  }
  return fallback;
}

export async function acceptInvitation(
  invitationId: string
): Promise<InvitationActionResult> {
  const t = await getTranslations("invitation-accept");
  try {
    await team.acceptInvitation(invitationId);
  } catch (error) {
    return {
      success: false,
      error: toMessage(error, t("errors.acceptFailed"), t),
    };
  }

  revalidatePath("/[locale]/accept-invitation/[id]", "page");
  revalidatePath("/settings/team");
  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function rejectInvitation(
  invitationId: string
): Promise<InvitationActionResult> {
  const t = await getTranslations("invitation-accept");
  try {
    await team.rejectInvitation(invitationId);
  } catch (error) {
    return {
      success: false,
      error: toMessage(error, t("errors.declineFailed"), t),
    };
  }

  revalidatePath("/[locale]/accept-invitation/[id]", "page");
  return { success: true, data: undefined };
}

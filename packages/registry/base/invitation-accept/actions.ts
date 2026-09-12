"use server";

/**
 * Invitation accept/decline server actions.
 *
 * Thin transport over `@intelligo-dev/auth`'s team service, bound with
 * this consumer's ports at `@/lib/team` (installed by the
 * `team-settings` registry item — see its module doc for the exact
 * port bindings). All authorization, invitation-ownership checks, and
 * post-accept membership verification live in the service; this file
 * only calls it, maps a thrown `TeamServiceError` to a friendly
 * message, and revalidates the paths that show invitation/membership
 * state.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  isTeamServiceError,
  type TeamServiceErrorCode,
} from "@intelligo-dev/auth";

import { team } from "@/lib/team";

export type InvitationActionResult =
  | { success: true }
  | { success: false; error: string };

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

  revalidatePath("/accept-invitation/[id]", "page");
  revalidatePath("/settings/team");
  revalidatePath("/");
  return { success: true };
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

  revalidatePath("/accept-invitation/[id]", "page");
  return { success: true };
}

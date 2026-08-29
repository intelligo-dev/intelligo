"use server";

/**
 * Team settings server actions — thin transport over the bound team
 * service (`@/lib/team`): parse input with the schemas from
 * `@intelligo/auth`, call the service, map any `TeamServiceError` to a
 * friendly message, and revalidate the page. No business rules here —
 * those live in the service.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  inviteMemberSchema,
  isTeamServiceError,
  updateRoleSchema,
  type InviteMemberInput,
  type UpdateRoleInput,
} from "@intelligo/auth";

import { team } from "@/lib/team";

export type TeamActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type Translator = Awaited<ReturnType<typeof getTranslations<"team-settings">>>;

function friendlyMessage(t: Translator): Partial<Record<string, string>> {
  return {
    invitation_not_found: t("errors.invitationNotFound"),
    sole_owner: t("errors.soleOwner"),
    forbidden: t("errors.forbidden"),
    accept_verification_failed: t("errors.acceptVerificationFailed"),
    provider_error: t("errors.providerError"),
  };
}

function friendlyError(error: unknown, t: Translator): string {
  // Unknown errors deliberately map to the generic key — a raw
  // `Error#message` can carry internals (SQL, hostnames) to the UI.
  if (isTeamServiceError(error)) {
    return friendlyMessage(t)[error.code] ?? t("errors.somethingWentWrong");
  }
  return t("errors.somethingWentWrong");
}

export async function inviteMember(
  input: InviteMemberInput
): Promise<TeamActionResult> {
  const t = await getTranslations("team-settings");
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }

  try {
    await team.inviteMember(parsed.data);
    revalidatePath("/settings/team");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

export async function cancelInvitation(
  invitationId: string
): Promise<TeamActionResult> {
  const t = await getTranslations("team-settings");
  try {
    await team.cancelInvitation(invitationId);
    revalidatePath("/settings/team");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

export async function removeMember(
  memberId: string
): Promise<TeamActionResult> {
  const t = await getTranslations("team-settings");
  try {
    await team.removeMember(memberId);
    revalidatePath("/settings/team");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

export async function updateMemberRole(
  input: UpdateRoleInput
): Promise<TeamActionResult> {
  const t = await getTranslations("team-settings");
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }

  try {
    await team.updateMemberRole(parsed.data);
    revalidatePath("/settings/team");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

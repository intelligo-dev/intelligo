"use server";

/**
 * Profile settings server actions — thin transport over the bound
 * profile service (`@/lib/profile`): parse input with the schema from
 * `@intelligo-dev/auth`, call the service, map any `ProfileServiceError` to
 * a friendly message, and revalidate. No business rules here — those
 * live in the service.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  isProfileServiceError,
  updateProfileSchema,
  type UpdateProfileInput,
} from "@intelligo-dev/auth";

import { profile } from "@/lib/profile";

export type ProfileActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

type Translator = Awaited<
  ReturnType<typeof getTranslations<"profile-settings">>
>;

function friendlyMessage(t: Translator): Partial<Record<string, string>> {
  return {
    forbidden: t("errors.forbidden"),
    provider_error: t("errors.providerError"),
  };
}

function friendlyError(error: unknown, t: Translator): string {
  if (isProfileServiceError(error)) {
    return friendlyMessage(t)[error.code] ?? error.message;
  }
  // `Error#message` can carry internals (SQL, hostnames) to the UI.
  console.error("[profile-settings]", error);
  return t("errors.somethingWentWrong");
}

export async function updateProfile(
  input: UpdateProfileInput
): Promise<ProfileActionResult> {
  const t = await getTranslations("profile-settings");
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }

  try {
    await profile.updateProfile(parsed.data);
    revalidatePath("/settings/profile");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

export async function deleteAccount(): Promise<ProfileActionResult> {
  const t = await getTranslations("profile-settings");
  try {
    await profile.deleteAccount();
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

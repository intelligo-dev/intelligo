"use server";

/**
 * Workspace settings server actions — thin transport over the bound
 * workspace service (`@/lib/workspace`): parse input with the schemas
 * from `@intelligo/auth`, call the service, map any
 * `WorkspaceServiceError` to a friendly message, and revalidate the
 * page. No business rules here — those live in the service.
 *
 * Only the two actions this page uses. `listWorkspaces`,
 * `createWorkspace`, `switchWorkspace`, and `getActiveWorkspace` belong
 * to the broader workspace-switcher/creation surface (the `app-shell`
 * item), not workspace settings.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  isWorkspaceServiceError,
  updateWorkspaceSchema,
  type UpdateWorkspaceInput,
} from "@intelligo/auth";

import { workspace } from "@/lib/workspace";

export type WorkspaceActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type Translator = Awaited<
  ReturnType<typeof getTranslations<"workspace-settings">>
>;

function friendlyMessage(t: Translator): Partial<Record<string, string>> {
  return {
    forbidden: t("errors.forbidden"),
    not_found: t("errors.notFound"),
    workspace_limit_reached: t("errors.workspaceLimitReached"),
    provider_error: t("errors.providerError"),
  };
}

function friendlyError(error: unknown, t: Translator): string {
  if (isWorkspaceServiceError(error)) {
    return friendlyMessage(t)[error.code] ?? error.message;
  }
  return error instanceof Error
    ? error.message
    : t("errors.somethingWentWrong");
}

export async function updateWorkspace(
  input: UpdateWorkspaceInput
): Promise<WorkspaceActionResult> {
  const t = await getTranslations("workspace-settings");
  const parsed = updateWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }

  try {
    await workspace.updateWorkspace(parsed.data);
    revalidatePath("/settings/workspace");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

export async function deleteWorkspace(): Promise<WorkspaceActionResult> {
  const t = await getTranslations("workspace-settings");
  try {
    await workspace.deleteWorkspace();
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

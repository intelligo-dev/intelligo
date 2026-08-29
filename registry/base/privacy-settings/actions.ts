"use server";

/**
 * Privacy settings server actions — thin transport over the
 * framework's identity service (`@intelligo/core/identity`):
 * authenticate the caller, call the service, map any
 * `IdentityServiceError` to a friendly message, and revalidate. No
 * business rules here — fact ownership checks, the memory-audit write,
 * and data-export aggregation all live in the service.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo/auth";
import {
  deleteFact as deleteFactService,
  exportIdentity as exportIdentityService,
  getAuditTrail as getAuditTrailService,
  isIdentityServiceError,
  listFacts as listFactsService,
  type IdentityExport,
  type UserFact,
  type UserMemoryAuditRow,
} from "@intelligo/core/identity";

export type PrivacyActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type Translator = Awaited<
  ReturnType<typeof getTranslations<"privacy-settings">>
>;

function friendlyMessage(t: Translator): Partial<Record<string, string>> {
  return {
    not_found: t("errors.notFound"),
    invalid_input: t("errors.invalidInput"),
    database_error: t("errors.databaseError"),
  };
}

function friendlyError(error: unknown, t: Translator): string {
  if (isIdentityServiceError(error)) {
    return friendlyMessage(t)[error.code] ?? error.message;
  }
  return error instanceof Error
    ? error.message
    : t("errors.somethingWentWrong");
}

const PRIVACY_SETTINGS_PATH = "/settings/privacy";
const AUDIT_TRAIL_PAGE_SIZE = 50;

/** The caller's own facts, most important and most confident first. */
export async function listFacts(): Promise<UserFact[]> {
  const { user, workspace } = await requireWorkspace();
  return listFactsService({ userId: user.id, workspaceId: workspace.id });
}

/** Delete one of the caller's own facts. Records the deletion in the audit trail. */
export async function deleteFact(factId: string): Promise<PrivacyActionResult> {
  const t = await getTranslations("privacy-settings");
  try {
    const { user, workspace } = await requireWorkspace();
    await deleteFactService(
      { userId: user.id, workspaceId: workspace.id },
      factId
    );
    revalidatePath(PRIVACY_SETTINGS_PATH);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

/**
 * A GDPR-style export of everything stored about the caller: facts,
 * memories, their latest profile snapshot, and the full audit trail.
 * Client-triggered, in-browser download — not a streamed endpoint.
 */
export async function exportIdentity(): Promise<
  PrivacyActionResult<IdentityExport>
> {
  const t = await getTranslations("privacy-settings");
  try {
    const { user, workspace } = await requireWorkspace();
    const data = await exportIdentityService({
      userId: user.id,
      workspaceId: workspace.id,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: friendlyError(error, t) };
  }
}

/** The caller's most recent memory-audit rows, most recent first. */
export async function getAuditTrail(): Promise<UserMemoryAuditRow[]> {
  const { user, workspace } = await requireWorkspace();
  return getAuditTrailService(
    { userId: user.id, workspaceId: workspace.id },
    { limit: AUDIT_TRAIL_PAGE_SIZE }
  );
}

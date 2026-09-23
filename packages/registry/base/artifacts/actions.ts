"use server";

/**
 * Artifact library actions over `@intelligo-dev/core/documents`: resolve
 * the caller with `requireWorkspace()`, call the service, map a
 * `DocumentServiceError` to a translated message.
 *
 * Deleting uses `deleteDocumentVersions(actor, id, timestamp)`, which
 * removes every version created strictly after `timestamp`, within the
 * last 30 days. It is a revert, not a hard delete: `deleteLatestVersion`
 * passes one millisecond before the version this page shows, so an
 * artifact with older versions reverts to the previous one, and one
 * with a single version disappears.
 */

import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";
import {
  deleteDocumentVersions,
  getUserDocuments,
  isDocumentServiceError,
  isProductDocument,
  type DocumentListItem,
} from "@intelligo-dev/core/documents";
import type { ActionResult as BaseActionResult } from "@intelligo-dev/next";

export type ActionResult<T> = BaseActionResult<T>;

/**
 * A document list item plus whether its title matches a pattern
 * registered through `@/lib/document-patterns.ts` — drives the
 * "Reports" filter tab.
 */
export type ArtifactListItem = DocumentListItem & { isReport: boolean };

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function friendlyMessageKey(code: string): string | undefined {
  switch (code) {
    case "not_found":
      return "actions.notFound";
    case "forbidden":
      return "actions.forbidden";
    case "invalid_input":
      return "actions.invalidInput";
    case "database_error":
      return "actions.databaseError";
    default:
      return undefined;
  }
}

function friendlyError(t: Translator, error: unknown): string {
  // Unknown errors deliberately map to the generic key — a raw
  // `Error#message` can carry internals (SQL, hostnames) to the UI.
  if (isDocumentServiceError(error)) {
    const key = friendlyMessageKey(error.code);
    return key ? t(key) : t("actions.genericError");
  }
  return t("actions.genericError");
}

/**
 * Every artifact the caller owns in the active workspace, newest first.
 * Filtering happens client-side.
 */
export async function listDocuments(): Promise<
  ActionResult<ArtifactListItem[]>
> {
  try {
    const { workspace, user } = await requireWorkspace();
    const documents = await getUserDocuments({
      workspaceId: workspace.id,
      userId: user.id,
    });

    return {
      success: true,
      data: documents.map((doc) => ({
        ...doc,
        isReport: isProductDocument(doc.title),
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("artifacts"), error),
    };
  }
}

/**
 * Deletes the version of the artifact this page shows (see the module
 * comment). `latestCreatedAt` is that version's `createdAt` as an ISO
 * string, as `listDocuments` returns it.
 */
export async function deleteLatestVersion(
  id: string,
  latestCreatedAt: string
): Promise<ActionResult<undefined>> {
  const latest = new Date(latestCreatedAt);
  if (Number.isNaN(latest.getTime())) {
    const t = await getTranslations("artifacts");
    return { success: false, error: t("actions.invalidTimestamp") };
  }

  try {
    const { workspace, user } = await requireWorkspace();
    const cutoff = new Date(latest.getTime() - 1).toISOString();

    await deleteDocumentVersions(
      { workspaceId: workspace.id, userId: user.id },
      id,
      cutoff
    );

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: friendlyError(await getTranslations("artifacts"), error),
    };
  }
}

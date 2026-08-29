"use server";

/**
 * Artifact (document) server actions — thin transport over
 * `@intelligo/core/documents` (ADR-0009): resolve the caller's actor via
 * `requireWorkspace()`, call the core documents service, map any
 * `DocumentServiceError` to a friendly message, and reshape the result
 * for the page and its components. No business rules here — those live
 * in `@intelligo/core/documents`.
 *
 * Only `getUserDocuments` and `deleteDocumentVersions` are wired here:
 * this item is a read/browse artifact library page, not the artifact
 * editor. `saveDocument` is called from wherever your product's AI tool
 * calls create/update an artifact mid-conversation (the `chat` item),
 * not from this page. `getDocument` (single-item fetch) isn't needed
 * either — the list already carries each artifact's full content.
 *
 * `deleteDocumentVersions(actor, id, timestamp)` deletes every version
 * created strictly *after* `timestamp`, bounded to the last 30 days —
 * it's a revert primitive (undo edits back to a checkpoint), not a
 * generic "delete this artifact forever" call, and the service exposes
 * no way to look up an artifact's *earliest* version. `deleteLatestVersion`
 * below uses it the only way this page's data supports honestly: delete
 * the single version this page already has, by passing a timestamp one
 * millisecond before it. When that version is the artifact's only one,
 * the artifact disappears; when older versions exist, the artifact
 * reverts to the previous one instead of disappearing —
 * `components/document-actions.tsx`'s confirm dialog says so.
 *
 * Product-specific document title patterns (for custom agent labels and
 * the "report" filter) register through `@intelligo/core/documents`'s
 * `registerDocumentPatterns` — see `@/lib/document-patterns.ts`, this
 * item's composition-root extension point. Nothing in this file calls
 * it: per ADR-0005 (no import-side-effect registration), that
 * registration happens once, at startup, from an explicit composition
 * root — never from a request-scoped file like this one, and never as
 * an import side effect.
 */

import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo/auth";
import {
  deleteDocumentVersions,
  getUserDocuments,
  isDocumentServiceError,
  isProductDocument,
  type DocumentListItem,
} from "@intelligo/core/documents";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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
 * Every artifact the caller owns in the active workspace, most recently
 * created first. Filtering (by kind, or by the "report" flag) happens
 * client-side in `document-list.tsx` — this always returns the full
 * set.
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
 * Deletes the version of the artifact this page already has. See the
 * module doc comment above for exactly what that does and doesn't
 * guarantee. `latestCreatedAt` must be that version's own `createdAt`
 * (ISO string), as returned by `listDocuments`.
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

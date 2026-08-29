/**
 * Document Persistence Service — Server-only
 *
 * Core CRUD operations for AI-generated document artifacts with
 * workspace + user isolation. Ported from
 * @intelligo/agents/documents (ADR-0009): the tables (`documents`,
 * `document_types`) always lived in @intelligo/core's schema, only the
 * service layer sat in a dissolving package.
 *
 * Callers pass a resolved actor (workspaceId, userId) rather than this
 * module resolving one itself — @intelligo/core cannot depend on
 * @intelligo/auth (see tests/architecture/dependency-direction.test.ts),
 * so `requireWorkspace()` moved to the caller. Every query still
 * filters by workspaceId AND userId internally; the actor is never
 * trusted to have done that itself.
 *
 * Failure is reported by throwing `DocumentServiceError` (a small,
 * typed code set) rather than returning a `{ success, error }`
 * envelope — that shaping, plus any error-reporting side effect
 * (Sentry, logging), is a transport concern the caller applies at the
 * Server Action / route boundary.
 *
 * This module is SERVER-ONLY. Do not import from client components.
 */

import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { documents } from "../db/schema";
import { classifyDocumentTitle, isProductDocument } from "./classifier";
import { DocumentServiceError } from "./errors";
import type { DocumentActor, DocumentFilter, DocumentListItem } from "./types";

type DocumentRow = {
  id: string;
  title: string;
  kind: string;
  createdAt: Date;
  content: string | null;
};

function toListItem(doc: DocumentRow): DocumentListItem {
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    createdAt: doc.createdAt.toISOString(),
    agentLabel: classifyDocumentTitle(doc.title).agentLabel,
    content: doc.content,
  };
}

// ---------------------------------------------------------------------------
// Query Operations
// ---------------------------------------------------------------------------

/**
 * Get all documents for the actor. Ordered by most recently created
 * first. Uses DISTINCT ON to get the latest version of each document.
 */
export async function getUserDocuments(
  actor: DocumentActor,
  filter?: DocumentFilter
): Promise<DocumentListItem[]> {
  const uniqueDocs = await db
    .selectDistinctOn([documents.id])
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, actor.workspaceId),
        eq(documents.userId, actor.userId)
      )
    )
    .orderBy(documents.id, desc(documents.createdAt));

  let result: DocumentListItem[] = uniqueDocs.map(toListItem);

  const filterType = filter?.type ?? "all";
  if (filterType !== "all") {
    result =
      filterType === "report"
        ? result.filter((doc) => isProductDocument(doc.title))
        : result.filter((doc) => doc.kind === filterType);
  }

  return result;
}

/**
 * Get a single document by id, scoped to the actor.
 * Throws DocumentServiceError("not_found") if no such document exists.
 */
export async function getDocument(
  actor: DocumentActor,
  id: string
): Promise<DocumentListItem> {
  const [doc] = await db
    .selectDistinctOn([documents.id])
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.workspaceId, actor.workspaceId),
        eq(documents.userId, actor.userId)
      )
    )
    .orderBy(documents.id, desc(documents.createdAt));

  if (!doc) {
    throw new DocumentServiceError("not_found", "Document not found");
  }

  return toListItem(doc);
}

// ---------------------------------------------------------------------------
// Mutation Operations
// ---------------------------------------------------------------------------

/**
 * Save (create new version of) a document.
 * Throws DocumentServiceError("forbidden") if a document with this id
 * already exists in the workspace under a different user.
 */
export async function saveDocument(
  actor: DocumentActor,
  params: {
    id: string;
    title: string;
    content: string;
    kind: string;
  }
): Promise<DocumentListItem> {
  const existingDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, params.id),
        eq(documents.workspaceId, actor.workspaceId)
      )
    );

  if (existingDocs.length > 0) {
    const firstDoc = existingDocs[0];
    if (firstDoc && firstDoc.userId !== actor.userId) {
      throw new DocumentServiceError(
        "forbidden",
        "Document belongs to a different user"
      );
    }
  }

  const [newDocument] = await db
    .insert(documents)
    .values({
      id: params.id,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      title: params.title,
      content: params.content,
      kind: params.kind,
      createdAt: new Date(),
    })
    .returning();

  if (!newDocument) {
    throw new DocumentServiceError("database_error", "Failed to save document");
  }

  return toListItem(newDocument);
}

// ---------------------------------------------------------------------------
// Delete Operations
// ---------------------------------------------------------------------------

const MAX_DELETE_WINDOW_DAYS = 30;

/**
 * Delete all versions of a document created after `timestamp`.
 * Throws DocumentServiceError("invalid_input") for an unparsable
 * timestamp or one older than the delete window, and ("not_found") if
 * no document exists at that id within the actor's scope.
 */
export async function deleteDocumentVersions(
  actor: DocumentActor,
  id: string,
  timestamp: string
): Promise<DocumentListItem[]> {
  const parsedTimestamp = new Date(timestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    throw new DocumentServiceError("invalid_input", "Invalid timestamp");
  }

  const oldestAllowed = new Date(
    Date.now() - MAX_DELETE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  if (parsedTimestamp < oldestAllowed) {
    throw new DocumentServiceError(
      "invalid_input",
      `timestamp must be within the last ${MAX_DELETE_WINDOW_DAYS} days`
    );
  }

  const existingDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.workspaceId, actor.workspaceId),
        eq(documents.userId, actor.userId)
      )
    );

  if (existingDocs.length === 0) {
    throw new DocumentServiceError("not_found", "Document not found");
  }

  const deletedDocs = await db
    .delete(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.workspaceId, actor.workspaceId),
        eq(documents.userId, actor.userId),
        gt(documents.createdAt, parsedTimestamp)
      )
    )
    .returning();

  return deletedDocs.map(toListItem);
}

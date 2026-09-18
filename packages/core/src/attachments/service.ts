/**
 * Server-only rows for the files users put into conversations. The bytes
 * live behind the storage port; this table records who uploaded a file,
 * its workspace, type, size and, once the turn is persisted, conversation.
 *
 * Every read and write is scoped to the workspace and the uploader: the ids
 * arrive in the request body, and conversations are user-private, so a
 * workspace-only scope would let a member trade a colleague's attachment id
 * for a signed URL to it.
 */

import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { db } from "../db";
import { attachments } from "../db/schema";
import { AttachmentServiceError } from "./errors";
import type { Attachment, AttachmentActor } from "./types";

export async function createAttachment(
  actor: AttachmentActor,
  params: {
    id?: string;
    storageKey: string;
    filename: string;
    mediaType: string;
    sizeBytes: number;
    conversationId?: string | null;
    extractedText?: string | null;
  }
): Promise<Attachment> {
  if (!params.filename.trim()) {
    throw new AttachmentServiceError("invalid_input", "Filename is required");
  }
  if (params.sizeBytes < 0) {
    throw new AttachmentServiceError(
      "invalid_input",
      "Size cannot be negative"
    );
  }
  const [row] = await db
    .insert(attachments)
    .values({
      id: params.id ?? crypto.randomUUID(),
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      conversationId: params.conversationId ?? null,
      storageKey: params.storageKey,
      filename: params.filename,
      mediaType: params.mediaType,
      sizeBytes: params.sizeBytes,
      extractedText: params.extractedText ?? null,
    })
    .returning();
  if (!row) {
    throw new AttachmentServiceError(
      "database_error",
      "Failed to create attachment"
    );
  }
  return row;
}

/** One attachment, if the actor uploaded it in their own workspace. */
export async function getAttachment(
  actor: AttachmentActor,
  id: string
): Promise<Attachment> {
  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.workspaceId, actor.workspaceId),
        eq(attachments.userId, actor.userId)
      )
    )
    .limit(1);
  if (!row) {
    throw new AttachmentServiceError("not_found", "Attachment not found");
  }
  return row;
}

/** The attachments among `ids` that the actor uploaded. */
export async function getAttachments(
  actor: AttachmentActor,
  ids: readonly string[]
): Promise<Attachment[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(attachments)
    .where(
      and(
        inArray(attachments.id, [...ids]),
        eq(attachments.workspaceId, actor.workspaceId),
        eq(attachments.userId, actor.userId)
      )
    );
}

/** Tie uploaded files to the conversation whose turn carried them. */
export async function attachToConversation(
  actor: AttachmentActor,
  params: { ids: readonly string[]; conversationId: string }
): Promise<void> {
  if (params.ids.length === 0) return;
  await db
    .update(attachments)
    .set({ conversationId: params.conversationId })
    .where(
      and(
        inArray(attachments.id, [...params.ids]),
        eq(attachments.workspaceId, actor.workspaceId),
        eq(attachments.userId, actor.userId),
        isNull(attachments.conversationId)
      )
    );
}

export async function setExtractedText(
  actor: AttachmentActor,
  params: { id: string; text: string | null }
): Promise<void> {
  await db
    .update(attachments)
    .set({ extractedText: params.text })
    .where(
      and(
        eq(attachments.id, params.id),
        eq(attachments.workspaceId, actor.workspaceId),
        eq(attachments.userId, actor.userId)
      )
    );
}

/** Remove the row. The caller deletes the object behind `storageKey`. */
export async function deleteAttachment(
  actor: AttachmentActor,
  id: string
): Promise<Attachment> {
  const [row] = await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.workspaceId, actor.workspaceId),
        eq(attachments.userId, actor.userId)
      )
    )
    .returning();
  if (!row) {
    throw new AttachmentServiceError("not_found", "Attachment not found");
  }
  return row;
}

/**
 * Uploads that never made it into a conversation — a turn that was
 * refused, a tab closed mid-compose. A maintenance job deletes them
 * and their objects.
 */
export async function listOrphanAttachments(params: {
  olderThan: Date;
  limit?: number;
}): Promise<Attachment[]> {
  return db
    .select()
    .from(attachments)
    .where(
      and(
        isNull(attachments.conversationId),
        lt(attachments.createdAt, params.olderThan)
      )
    )
    .limit(params.limit ?? 100);
}

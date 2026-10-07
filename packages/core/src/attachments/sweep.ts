/**
 * Deleting what uploads leave behind: rows no turn ever claimed, and the
 * objects of every attachment row deleted since the last run. The
 * database queues an object's key whenever its row is deleted
 * (`storage_deletions`), so a workspace or user deletion that cascades
 * through the rows leaves the keys here too.
 */

import { and, inArray, isNull, lt } from "drizzle-orm";

import { db } from "../db";
import { attachments, storageDeletions } from "../db/schema";
import type { StorageAdapter } from "../storage";

export type AttachmentSweepResult = {
  /** Rows deleted because no conversation claimed them in time. */
  orphansDeleted: number;
  /** Objects deleted from storage, with their queue entries. */
  objectsDeleted: number;
  /** Objects storage refused to delete; their keys stay queued. */
  objectsFailed: number;
};

/**
 * One pass of the sweep: delete unclaimed rows older than `olderThan`,
 * then delete up to `limit` queued objects. A key leaves the queue only
 * once storage has deleted its object, so a failure is retried on a
 * later run, behind the keys queued since.
 */
export async function sweepAttachments(params: {
  storage: StorageAdapter;
  olderThan: Date;
  limit?: number;
}): Promise<AttachmentSweepResult> {
  const limit = params.limit ?? 100;

  const orphans = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        isNull(attachments.conversationId),
        lt(attachments.createdAt, params.olderThan)
      )
    )
    .limit(limit);
  const orphanIds = orphans.map((row) => row.id);
  if (orphanIds.length > 0) {
    await db.delete(attachments).where(inArray(attachments.id, orphanIds));
  }

  const queued = await db
    .select({ storageKey: storageDeletions.storageKey })
    .from(storageDeletions)
    .orderBy(storageDeletions.queuedAt)
    .limit(limit);

  const deleted: string[] = [];
  const failed: string[] = [];
  for (const { storageKey } of queued) {
    try {
      await params.storage.delete(storageKey);
      deleted.push(storageKey);
    } catch {
      failed.push(storageKey);
    }
  }
  if (deleted.length > 0) {
    await db
      .delete(storageDeletions)
      .where(inArray(storageDeletions.storageKey, deleted));
  }
  // A key storage refused goes to the back of the queue, so keys that
  // keep failing cannot fill every pass ahead of the ones queued later.
  if (failed.length > 0) {
    await db
      .update(storageDeletions)
      .set({ queuedAt: new Date() })
      .where(inArray(storageDeletions.storageKey, failed));
  }

  return {
    orphansDeleted: orphanIds.length,
    objectsDeleted: deleted.length,
    objectsFailed: failed.length,
  };
}

/**
 * Reads of part of a conversation's transcript: one message, some by
 * id, or the latest page. A long conversation's full
 * transcript is a large read, and most callers need a slice of it.
 */

import { and, asc, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";

import { db } from "../db";
import { messages } from "../db/schema";
import { getConversation } from "./service";
import type { ConversationActor, Message } from "./types";

/** One message of a conversation the actor owns, or null. */
export async function getMessage(
  actor: ConversationActor,
  conversationId: string,
  messageId: string
): Promise<Message | null> {
  await getConversation(actor, conversationId);
  const [row] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.id, messageId)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * The latest `limit` messages, oldest first — or the `limit` before the
 * message `before`, to page back through a long conversation.
 * `hasEarlier` says whether anything precedes the page.
 */
export async function getRecentMessages(
  actor: ConversationActor,
  conversationId: string,
  options: { limit: number; before?: string }
): Promise<{ messages: Message[]; hasEarlier: boolean }> {
  await getConversation(actor, conversationId);

  if (options.before && !(await exists(conversationId, options.before))) {
    return { messages: [], hasEarlier: false };
  }

  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        options.before
          ? lt(messages.createdAt, createdAtOf(conversationId, options.before))
          : undefined
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(options.limit + 1);

  const hasEarlier = rows.length > options.limit;
  return { messages: rows.slice(0, options.limit).reverse(), hasEarlier };
}

/**
 * The messages of a conversation the actor owns with these ids, in
 * conversation order. Ids the conversation does not hold are skipped.
 */
export async function getMessagesByIds(
  actor: ConversationActor,
  conversationId: string,
  ids: readonly string[]
): Promise<Message[]> {
  await getConversation(actor, conversationId);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        inArray(messages.id, [...ids])
      )
    )
    .orderBy(asc(messages.createdAt));
}

/**
 * A message's `created_at`, compared in SQL: read into a `Date` it
 * would lose the column's microseconds and stop matching itself.
 */
function createdAtOf(conversationId: string, messageId: string): SQL {
  return sql`(SELECT ${messages.createdAt} FROM ${messages} WHERE ${messages.conversationId} = ${conversationId} AND ${messages.id} = ${messageId})`;
}

async function exists(
  conversationId: string,
  messageId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.id, messageId)
      )
    )
    .limit(1);
  return row !== undefined;
}

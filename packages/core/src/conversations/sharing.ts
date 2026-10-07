/**
 * Sharing a conversation: the owner publishes it, and anyone holding its
 * link reads it without an account.
 */

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { conversations, messages } from "../db/schema";
import { ConversationServiceError } from "./errors";
import { getConversation } from "./service";
import type { Conversation, ConversationActor, Message } from "./types";

export type ConversationVisibility = "private" | "public";

/**
 * Publish or unpublish a conversation. Public means readable by anyone
 * holding its share link (`shareRef`).
 */
export async function setConversationVisibility(
  actor: ConversationActor,
  id: string,
  visibility: ConversationVisibility
): Promise<Conversation> {
  await getConversation(actor, id);

  // Sharing an already public conversation keeps its link; sharing it
  // again after unsharing issues a new one, and unsharing forgets it.
  const shareToken =
    visibility === "public"
      ? sql`CASE WHEN ${conversations.visibility} = 'public' AND ${conversations.shareToken} IS NOT NULL THEN ${conversations.shareToken} ELSE ${newShareToken()} END`
      : null;

  const [updated] = await db
    .update(conversations)
    .set({ visibility, shareToken, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();

  if (!updated) {
    throw new ConversationServiceError(
      "database_error",
      "Failed to update conversation visibility"
    );
  }

  return updated;
}

/** 18 random bytes, base64url: the part of a share link nobody can guess. */
function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * The public link's path segment for a conversation: its share token,
 * or its id when it was shared before conversations had tokens.
 */
export function shareRef(row: {
  id: string;
  shareToken: string | null;
}): string {
  return row.shareToken ?? row.id;
}

/**
 * A conversation its owner published, by its share link alone — no
 * actor, because the reader has none. `ref` is the share token; a
 * conversation shared before tokens existed, and not re-shared since,
 * still answers to its id. Everything else about the row stays
 * private: only what a shared page shows is projected.
 */
export async function getPublicConversation(ref: string): Promise<{
  id: string;
  title: string | null;
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  const [row] = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      agentId: conversations.agentId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.visibility, "public"),
        or(
          eq(conversations.shareToken, ref),
          and(isNull(conversations.shareToken), eq(conversations.id, ref))
        )
      )
    )
    .limit(1);

  if (!row) {
    throw new ConversationServiceError("not_found", "Conversation not found");
  }
  return row;
}

/**
 * The messages of a published conversation, by its share link, oldest
 * first. Throws `not_found` when the link names nothing public.
 */
export async function getPublicMessages(ref: string): Promise<Message[]> {
  const { id } = await getPublicConversation(ref);
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
}

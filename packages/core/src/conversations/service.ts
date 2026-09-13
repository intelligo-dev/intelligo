/**
 * Conversation & Message Persistence Service — Server-only
 *
 * Persistence-only: conversation lifecycle (create, list, read,
 * rename, delete), message append/window reads, and vote state.
 * Ported from the product application's conversation server actions
 * and chat-route persistence helper (ADR-0009) — the tables
 * (`conversations`, `messages`, `votes`) always lived in
 * @intelligo-dev/core's schema, only the service layer sat in the product
 * application.
 *
 * What did NOT come with it (stays product-side, native AI code):
 *   - LLM title generation (`generateTitleFromUserMessage` ran a
 *     Mastra agent inside an execution boundary — that's product
 *     logic over the execution boundary, not persistence).
 *   - Conversation windowing/summarization
 *     (applyConversationWindow, summarizeOldMessages) and the
 *     `conversationSummary` metadata write they produce.
 *   - The product's assessment-state read/write helpers — a
 *     product-specific shape living under `conversations.metadata`.
 *   - Agent id validation (the product's own agent slugs) and
 *     default model selection — product decides both; this module
 *     accepts an already-resolved agentId/modelId.
 *
 * Callers pass a resolved actor (workspaceId, userId) rather than this
 * module resolving one itself — @intelligo-dev/core cannot depend on
 * @intelligo-dev/auth (see tests/architecture/dependency-direction.test.ts).
 * Every query still filters by workspaceId AND userId internally
 * (conversations are USER-PRIVATE within a workspace); the actor is
 * never trusted to have done that itself.
 *
 * Failure is reported by throwing `ConversationServiceError` rather
 * than returning a `{ success, error }` envelope — see ./errors.ts.
 *
 * This module is SERVER-ONLY. Do not import from client components.
 */

import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { conversations, messages, votes } from "../db/schema";
import { ConversationServiceError } from "./errors";
import type {
  Conversation,
  ConversationActor,
  InsertMessage,
  Message,
  Vote,
} from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Verify conversation ownership (workspaceId + userId) and return the
 * row. Throws ConversationServiceError("not_found") otherwise — a
 * conversation owned by someone else in the same workspace is
 * indistinguishable from a conversation that doesn't exist, which is
 * the point: the id alone should never reveal existence across users.
 */
async function verifyConversation(
  actor: ConversationActor,
  id: string
): Promise<Conversation> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.workspaceId, actor.workspaceId),
        eq(conversations.userId, actor.userId)
      )
    )
    .limit(1);

  if (!conversation) {
    throw new ConversationServiceError("not_found", "Conversation not found");
  }

  return conversation;
}

// ---------------------------------------------------------------------------
// Conversation lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new conversation.
 *
 * `agentId` and `modelId` are opaque to this module — the product
 * decides which agents exist and which model backs a new conversation
 * (see the module doc comment). `id` defaults to a fresh UUID when
 * omitted.
 */
export async function createConversation(
  actor: ConversationActor,
  params: {
    agentId: string;
    modelId: string;
    id?: string;
    title?: string | null;
  }
): Promise<Conversation> {
  const [conversation] = await db
    .insert(conversations)
    .values({
      id: params.id ?? crypto.randomUUID(),
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      agentId: params.agentId,
      modelId: params.modelId,
      title: params.title ?? null,
    })
    .returning();

  if (!conversation) {
    throw new ConversationServiceError(
      "database_error",
      "Failed to create conversation"
    );
  }

  return conversation;
}

/** Get a single conversation, scoped to the actor. */
export async function getConversation(
  actor: ConversationActor,
  id: string
): Promise<Conversation> {
  return verifyConversation(actor, id);
}

/**
 * List conversations for the actor, most recently updated first.
 * Projects only the columns a sidebar/dashboard list needs.
 */
export async function listConversations(
  actor: ConversationActor,
  options?: { limit?: number; offset?: number }
): Promise<
  Array<
    Pick<Conversation, "id" | "title" | "agentId" | "updatedAt" | "metadata">
  >
> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      agentId: conversations.agentId,
      updatedAt: conversations.updatedAt,
      metadata: conversations.metadata,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, actor.workspaceId),
        eq(conversations.userId, actor.userId)
      )
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);
}

const MAX_HISTORY_LIMIT = 100;

/** Paginated conversation history with cursor-based pagination. */
export async function getConversationHistory(
  actor: ConversationActor,
  params: { limit: number; endingBefore?: string }
): Promise<{ chats: Conversation[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(1, params.limit), MAX_HISTORY_LIMIT);

  let cursorUpdatedAt: Date | undefined;
  if (params.endingBefore) {
    // Scope the cursor lookup too: unscoped, it would answer "does
    // this conversation id exist, and when was it updated?" for any
    // id in any tenant — a cross-tenant existence oracle.
    const [cursorConversation] = await db
      .select({ updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, params.endingBefore),
          eq(conversations.workspaceId, actor.workspaceId),
          eq(conversations.userId, actor.userId)
        )
      )
      .limit(1);
    cursorUpdatedAt = cursorConversation?.updatedAt;
  }

  const result = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, actor.workspaceId),
        eq(conversations.userId, actor.userId),
        ...(cursorUpdatedAt
          ? [lt(conversations.updatedAt, cursorUpdatedAt)]
          : [])
      )
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(limit + 1);

  const hasMore = result.length > limit;
  const chats = hasMore ? result.slice(0, -1) : result;

  return { chats, hasMore };
}

const MAX_TITLE_LENGTH = 300;

/** Rename a conversation. Throws on an empty title or a title that's too long. */
export async function renameConversation(
  actor: ConversationActor,
  id: string,
  title: string
): Promise<Conversation> {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new ConversationServiceError(
      "invalid_input",
      "Title cannot be empty"
    );
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ConversationServiceError(
      "invalid_input",
      `Title cannot exceed ${MAX_TITLE_LENGTH} characters`
    );
  }

  await verifyConversation(actor, id);

  const [updated] = await db
    .update(conversations)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();

  if (!updated) {
    throw new ConversationServiceError(
      "database_error",
      "Failed to rename conversation"
    );
  }

  return updated;
}

/**
 * Merge a patch into the conversation's `metadata` bag. Shallow: each
 * top-level key in `patch` replaces the stored one, every other key
 * stays. A runtime's session cursor, a summary of pruned history, a
 * pin — anything the row should remember that is not a column.
 */
export async function updateConversationMetadata(
  actor: ConversationActor,
  id: string,
  patch: Record<string, unknown>
): Promise<Conversation> {
  await verifyConversation(actor, id);

  const [updated] = await db
    .update(conversations)
    .set({
      metadata: sql`coalesce(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, id))
    .returning();

  if (!updated) {
    throw new ConversationServiceError(
      "database_error",
      "Failed to update conversation metadata"
    );
  }

  return updated;
}

export type ConversationVisibility = "private" | "public";

/** Publish or unpublish a conversation. Public means readable by its id, by anyone. */
export async function setConversationVisibility(
  actor: ConversationActor,
  id: string,
  visibility: ConversationVisibility
): Promise<Conversation> {
  await verifyConversation(actor, id);

  const [updated] = await db
    .update(conversations)
    .set({ visibility, updatedAt: new Date() })
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

/**
 * A conversation its owner published, by id alone — no actor, because
 * the reader has none. Everything else about the row stays private:
 * only what a shared page shows is projected.
 */
export async function getPublicConversation(id: string): Promise<{
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
    .where(and(eq(conversations.id, id), eq(conversations.visibility, "public")))
    .limit(1);

  if (!row) {
    throw new ConversationServiceError("not_found", "Conversation not found");
  }
  return row;
}

/** The messages of a published conversation, oldest first. Empty when it is not public. */
export async function getPublicMessages(id: string): Promise<Message[]> {
  await getPublicConversation(id);
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
}

/** Delete a conversation and all its messages (CASCADE). */
export async function deleteConversation(
  actor: ConversationActor,
  id: string
): Promise<void> {
  await verifyConversation(actor, id);
  await db.delete(conversations).where(eq(conversations.id, id));
}

/** Delete all conversations for the actor (user-scoped within the workspace). */
export async function deleteAllConversations(
  actor: ConversationActor
): Promise<{ deletedCount: number }> {
  const deleted = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.workspaceId, actor.workspaceId),
        eq(conversations.userId, actor.userId)
      )
    )
    .returning();

  return { deletedCount: deleted.length };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Get all messages for a conversation, ordered oldest-first. */
export async function getMessages(
  actor: ConversationActor,
  conversationId: string
): Promise<Message[]> {
  await verifyConversation(actor, conversationId);

  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

/**
 * Save a batch of messages. Every message's `conversationId` must
 * belong to a conversation the actor owns — this is a directly
 * reachable persistence entry point (through a Server Action or
 * route), not a background job with its own scope check, so a
 * workspace-only guard here would let any member insert content into
 * a colleague's private conversation. Bumps `updatedAt` on the
 * touched conversations.
 */
export async function saveMessages(
  actor: ConversationActor,
  messagesToSave: InsertMessage[]
): Promise<Message[]> {
  if (messagesToSave.length === 0) return [];

  const conversationIds = [
    ...new Set(messagesToSave.map((m) => m.conversationId)),
  ];

  const ownedConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, actor.workspaceId),
        eq(conversations.userId, actor.userId),
        inArray(conversations.id, conversationIds)
      )
    );

  const ownedIds = new Set(ownedConversations.map((c) => c.id));
  const unowned = messagesToSave.filter((m) => !ownedIds.has(m.conversationId));
  if (unowned.length > 0) {
    throw new ConversationServiceError(
      "forbidden",
      "One or more messages reference a conversation the actor does not own"
    );
  }

  // A batch arrives in conversation order, but `defaultNow()` would
  // stamp every row with the same transaction time, and a tie in
  // created_at makes "the messages after this one" undefined — a
  // regenerate could then delete nothing or everything. One millisecond
  // per position keeps the order the caller gave.
  const base = Date.now();
  const stamped = messagesToSave.map((message, index) => ({
    ...message,
    createdAt: message.createdAt ?? new Date(base + index),
  }));

  const inserted = await db.insert(messages).values(stamped).returning();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(inArray(conversations.id, conversationIds));

  return inserted;
}

/**
 * Upsert streamed messages after completion — transport-adjacent
 * batched upsert, ported from the chat route's post-stream
 * persistence step. No actor param: by the time a caller reaches this
 * (mid- or post-stream, inside an already-authorized request) the
 * conversation's ownership was already verified once (typically via
 * `getConversation`/`getMessages` at the top of the request); this
 * function's job is the idempotent write, not a second ownership
 * check per message.
 *
 * Uses a single multi-row `INSERT ... ON CONFLICT (id) DO UPDATE` so
 * an N-message tool loop pays one round-trip instead of 2N. The
 * `WHERE` clause on the DO UPDATE keeps the write scoped to
 * `conversationId` even if a message id collided across
 * conversations (defended against, not expected under normal id
 * generation).
 */
export async function upsertMessages(
  conversationId: string,
  finishedMessages: Array<{ id: string; role: string; parts: unknown[] }>
): Promise<void> {
  if (finishedMessages.length === 0) return;

  // Increment per row so `ORDER BY created_at` (used by getMessages)
  // preserves insertion order across a batched tool loop. Sharing a
  // single `new Date()` across rows would tie their timestamps and
  // let Postgres return them in heap order.
  const baseMs = Date.now();
  const rows = finishedMessages.map((m, i) => ({
    id: m.id,
    conversationId,
    role: m.role,
    parts: JSON.stringify(m.parts),
    createdAt: new Date(baseMs + i),
  }));

  await db
    .insert(messages)
    .values(rows)
    .onConflictDoUpdate({
      target: messages.id,
      set: {
        parts: sql`excluded.parts`,
      },
      setWhere: sql`${messages.conversationId} = excluded.conversation_id`,
    });
}

/** Update a message's parts (e.g. for a tool-approval flow). */
export async function updateMessage(
  actor: ConversationActor,
  params: { id: string; parts: unknown }
): Promise<Message> {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, params.id))
    .limit(1);

  if (!message) {
    throw new ConversationServiceError("not_found", "Message not found");
  }

  await verifyConversation(actor, message.conversationId);

  const [updated] = await db
    .update(messages)
    .set({ parts: JSON.stringify(params.parts) })
    .where(eq(messages.id, params.id))
    .returning();

  if (!updated) {
    throw new ConversationServiceError(
      "database_error",
      "Failed to update message"
    );
  }

  return updated;
}

/** Delete all messages created after a specific message. */
export async function deleteTrailingMessages(
  actor: ConversationActor,
  params: { id: string }
): Promise<{ deletedCount: number }> {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, params.id))
    .limit(1);

  if (!message) {
    throw new ConversationServiceError("not_found", "Message not found");
  }

  await verifyConversation(actor, message.conversationId);

  // Compare inside SQL rather than against the JS Date read above: the
  // driver truncates Postgres microseconds to milliseconds, so a message
  // whose real timestamp is 12:00:00.123456 reads back as .123, and
  // `created_at > .123` then matches the message itself — deleting the
  // row a regenerate was supposed to keep.
  const deleted = await db
    .delete(messages)
    .where(
      and(
        eq(messages.conversationId, message.conversationId),
        gt(
          messages.createdAt,
          sql`(select ${messages.createdAt} from ${messages} where ${messages.id} = ${params.id})`
        )
      )
    )
    .returning();

  return { deletedCount: deleted.length };
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

/** Vote on a message (upvote or downvote). */
export async function voteMessage(
  actor: ConversationActor,
  params: { chatId: string; messageId: string; type: "up" | "down" }
): Promise<void> {
  await verifyConversation(actor, params.chatId);

  const [message] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.id, params.messageId),
        eq(messages.conversationId, params.chatId)
      )
    )
    .limit(1);

  if (!message) {
    throw new ConversationServiceError("not_found", "Message not found");
  }

  await db
    .insert(votes)
    .values({
      chatId: params.chatId,
      messageId: params.messageId,
      isUpvoted: params.type === "up",
    })
    .onConflictDoUpdate({
      target: [votes.chatId, votes.messageId],
      set: { isUpvoted: params.type === "up" },
    });
}

/** Withdraw a vote. A missing vote is not an error. */
export async function clearVote(
  actor: ConversationActor,
  params: { chatId: string; messageId: string }
): Promise<void> {
  await verifyConversation(actor, params.chatId);
  await db
    .delete(votes)
    .where(
      and(eq(votes.chatId, params.chatId), eq(votes.messageId, params.messageId))
    );
}

/** Get all votes for a conversation. */
export async function getVotes(
  actor: ConversationActor,
  chatId: string
): Promise<Vote[]> {
  await verifyConversation(actor, chatId);

  return db.select().from(votes).where(eq(votes.chatId, chatId));
}

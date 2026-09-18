/**
 * AI Database Schema
 *
 * Tables for AI conversations, messages, attachments, votes and documents
 * (artifact versions) — the chat persistence every product shares.
 *
 * Pattern: snake_case columns in PostgreSQL, camelCase TypeScript API (via Drizzle mapping)
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  boolean,
  primaryKey,
  jsonb,
} from "drizzle-orm/pg-core";
import { organization, users } from "./auth";
import type { LocalizedText } from "./agents";

/**
 * Generic conversation metadata bag.
 *
 * A product that needs to attach typed state to a conversation
 * puts it under `productContext` and owns the shape in its own
 * package.
 */
export type ConversationMetadata = {
  conversationSummary?: string; // LLM-generated summary of pruned messages (WIND-02)
  productContext?: Record<string, unknown>;
  // Extensible for other products
  [key: string]: unknown;
};

/**
 * Conversations table - Chat sessions per workspace/user
 * Each conversation tracks a single chat session with a specific agent
 */
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(), // the product's agent slug
    title: text("title"), // Nullable, auto-generated from first message in Phase 19
    modelId: text("model_id"), // e.g., "openai/gpt-4o"
    visibility: text("visibility").notNull().default("private"), // "private" | "public"
    metadata: jsonb("metadata"), // Assessment state and product-specific metadata
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("conversations_workspace_id_idx").on(table.workspaceId),
    index("conversations_user_id_idx").on(table.userId),
    index("conversations_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt
    ),
    index("conversations_workspace_user_idx").on(
      table.workspaceId,
      table.userId
    ),
  ]
);

/**
 * Messages table - Individual messages within conversations
 * Stores user and assistant messages with tool invocations
 */
export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant" | "system" | "tool"
    content: text("content"), // Backward compat - nullable now
    parts: text("parts").notNull(), // JSON array of AI SDK UIMessagePart objects
    attachments: text("attachments"), // JSON array of file attachment metadata
    toolInvocations: text("tool_invocations"), // JSON string of tool calls/results (AI SDK format)
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
);

/**
 * Attachments table - Files a user put into a conversation
 * The object lives behind the storage port under `storage_key`; the
 * row is what makes a URL safe to hand out (tenancy, type, size).
 * `conversation_id` is set once the turn that carried the file is
 * persisted; a row that never gets one is an orphan to sweep.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    extractedText: text("extracted_text"), // document text for the model, when a policy extracts it
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("attachments_workspace_id_idx").on(table.workspaceId),
    index("attachments_conversation_id_idx").on(table.conversationId),
    uniqueIndex("attachments_storage_key_idx").on(table.storageKey),
  ]
);

/**
 * Votes table - Message upvote/downvote tracking
 * Composite primary key on chatId + messageId for one vote per message
 */
export const votes = pgTable(
  "votes",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    isUpvoted: boolean("is_upvoted").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.messageId] }),
    index("votes_message_id_idx").on(table.messageId),
  ]
);

/**
 * Documents table - Artifact version history
 * Composite primary key on id + createdAt for version tracking
 * Used for AI-generated documents (code, text, sheets) with revision history
 */
export const documents = pgTable(
  "documents",
  {
    id: text("id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    title: text("title").notNull(),
    content: text("content"),
    kind: text("kind").notNull().default("text"),
    metadata: jsonb("metadata"), // Structured data (e.g. a report's JSON)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    index("documents_workspace_id_idx").on(table.workspaceId),
    index("documents_user_id_idx").on(table.userId),
  ]
);

// Export inferred types for TypeScript usage
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type InsertVote = typeof votes.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

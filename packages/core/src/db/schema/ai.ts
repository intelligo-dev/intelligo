/**
 * AI Database Schema
 *
 * Tables for AI conversations, messages, and knowledge base with pgvector support.
 * Used by every product built on the framework for chat persistence and RAG.
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
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";
import { organization, users } from "./auth";
import type { BilingualText } from "./agents";

/**
 * Generic conversation metadata bag.
 *
 * The first product's AssessmentState type and the
 * `assessmentState` field that used to live here moved to
 * that product's schemas in Wave 2 of the decoupling. Any
 * vertical product that needs to attach typed state to a
 * conversation should put it under `productContext` and own the
 * shape in its own package.
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
 * Knowledge documents table - Uploaded files for RAG
 * Each document is chunked and embedded for similarity search
 */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    chunkCount: integer("chunk_count").default(0),
    status: text("status").notNull().default("processing"), // "processing" | "ready" | "failed"
    product: text("product"), // product slug, or null (shared)
    metadata: text("metadata"), // JSON string for additional info
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_documents_workspace_id_idx").on(table.workspaceId),
  ]
);

/**
 * Knowledge chunks table - Text chunks with embeddings for RAG
 * Each chunk is a piece of a document with a 1536-dimension vector embedding
 * Workspace filtering prevents context leakage between organizations
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector({ dimensions: 1536 }), // OpenAI text-embedding-3-small
    metadata: text("metadata"), // JSON: { page, section, heading }
    chunkIndex: integer("chunk_index").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_chunks_document_id_idx").on(table.documentId),
    index("knowledge_chunks_workspace_id_idx").on(table.workspaceId),
    // HNSW index for vector similarity search will be added in the migration SQL
    // because Drizzle doesn't support HNSW index syntax natively
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
 * Document Types reference table
 * Lookup table for document kinds — extensible without code changes.
 */
export const documentTypes = pgTable("document_types", {
  id: text("id").primaryKey(), // e.g. "summary-report"
  name: text("name").notNull(), // Display name
  nameMn: text("name_mn").notNull(), // Mongolian display name
  description: text("description"),
  icon: text("icon"), // Optional icon identifier
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
    kind: text("kind").notNull().default("text"), // Legacy field, kept for compatibility
    typeId: text("type_id").references(() => documentTypes.id, {
      onDelete: "set null",
    }),
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
    index("documents_type_id_idx").on(table.typeId),
    index("documents_user_id_idx").on(table.userId),
  ]
);

/**
 * Suggestions table - Inline document edit suggestions
 * Used for AI-suggested edits to documents that users can accept/reject
 */
export const suggestions = pgTable(
  "suggestions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    documentCreatedAt: timestamp("document_created_at").notNull(),
    originalText: text("original_text").notNull(),
    suggestedText: text("suggested_text").notNull(),
    description: text("description"),
    isResolved: boolean("is_resolved").notNull().default(false),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("suggestions_workspace_id_idx").on(table.workspaceId),
    index("suggestions_document_id_idx").on(table.documentId),
    index("suggestions_workspace_document_idx").on(
      table.workspaceId,
      table.documentId
    ),
  ]
);

// userProfiles table moved to the vertical package's schema in
// Wave 2 of the architecture decoupling. The Phase B identity graph
// (`user_facts`, `user_profile_snapshots`) supersedes it for new
// writes; the legacy table is kept around in the product package
// until the backfill migration has run in production and the chat
// handler stops reading from it.

/**
 * Image Tools table - Available image generation tool templates
 * Each tool represents a predefined prompt template for a specific use case
 */
export const imageTools = pgTable("image_tools", {
  id: text("id").primaryKey(),
  name: jsonb("name").notNull().$type<BilingualText>(),
  description: jsonb("description").notNull().$type<BilingualText>(),
  category: text("category").notNull(), // "photo" | "ecommerce" | "style_transfer" | "trending"
  promptTemplate: text("prompt_template").notNull(),
  model: text("model").notNull().default("gpt-image-1"),
  previewImageUrl: text("preview_image_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isTrending: boolean("is_trending").notNull().default(false),
  isSeasonal: boolean("is_seasonal").notNull().default(false),
  activeMonths: integer("active_months").array(),
  season: text("season"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Image Generations table - Per-user image generation history
 * Tracks each generation request for quota enforcement and history display
 */
export const imageGenerations = pgTable(
  "image_generations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    toolId: text("tool_id").references(() => imageTools.id, {
      onDelete: "set null",
    }),
    prompt: text("prompt").notNull(),
    resultUrl: text("result_url"),
    model: text("model").notNull().default("gpt-image-1"),
    status: text("status").notNull().default("pending"), // "pending" | "completed" | "failed"
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("image_generations_user_id_idx").on(table.userId),
    index("image_generations_workspace_id_idx").on(table.workspaceId),
    index("image_generations_tool_id_idx").on(table.toolId),
    index("image_generations_created_at_idx").on(table.createdAt),
    index("image_generations_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("image_generations_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  ]
);

/**
 * Knowledge Articles table — generic curated bilingual articles.
 *
 * The category column is opaque text. Each vertical product validates
 * its allowed categories at the application layer (each product's set
 * lives in that product's configuration).
 * The decoupling moved the category enum out of this comment.
 */
export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    category: text("category").notNull(),
    title: jsonb("title").notNull().$type<BilingualText>(),
    description: jsonb("description").notNull().$type<BilingualText>(),
    content: jsonb("content").notNull().$type<BilingualText>(),
    tags: text("tags").array(),
    readingTimeMinutes: integer("reading_time_minutes").notNull().default(5),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_articles_slug_idx").on(table.slug),
    index("knowledge_articles_category_idx").on(table.category),
  ]
);

// competitions and competition_entries tables moved to
// the vertical package's schema in Wave 2 of the architecture
// decoupling. They use product-specific scoring (assessment count) and
// would graduate to a generic leaderboard primitive here when a
// second vertical needs them.

/**
 * Referral Codes table - Unique referral codes per user
 * Each user gets one 6-char alphanumeric code (e.g., "BOLD26").
 *
 * Generic growth primitive — kept in core because every vertical
 * product can benefit from a referral mechanic; every product reuses
 * the same table without a copy.
 */
export const referralCodes = pgTable(
  "referral_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // 6-char alphanumeric e.g., "BOLD26"
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("referral_codes_code_idx").on(table.code),
    uniqueIndex("referral_codes_user_id_idx").on(table.userId),
  ]
);

/**
 * Referrals table - Tracks referral relationships between users
 * One referral per referred user (unique constraint on referred_user_id)
 */
export const referrals = pgTable(
  "referrals",
  {
    id: text("id").primaryKey(),
    referrerId: text("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referralCodeId: text("referral_code_id")
      .notNull()
      .references(() => referralCodes.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // "pending" | "completed"
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("referrals_referrer_id_idx").on(table.referrerId),
    index("referrals_referred_user_id_idx").on(table.referredUserId),
    uniqueIndex("referrals_referred_user_id_unique_idx").on(
      table.referredUserId
    ),
  ]
);

// shared_reports table moved to the vertical package's schema in
// Wave 2 of the architecture decoupling. The reportType field is a
// closed union of that product's report kinds; a future generic
// shared-documents primitive would replace it with an opaque slug.

// Export inferred types for TypeScript usage
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type InsertKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type InsertVote = typeof votes.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type Suggestion = typeof suggestions.$inferSelect;
export type InsertSuggestion = typeof suggestions.$inferInsert;
export type ImageTool = typeof imageTools.$inferSelect;
export type InsertImageTool = typeof imageTools.$inferInsert;
export type ImageGeneration = typeof imageGenerations.$inferSelect;
export type InsertImageGeneration = typeof imageGenerations.$inferInsert;
export type KnowledgeArticle = typeof knowledgeArticles.$inferSelect;
export type InsertKnowledgeArticle = typeof knowledgeArticles.$inferInsert;
export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = typeof referralCodes.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;
// UserProfile, Competition, CompetitionEntry, SharedReport types moved
// to the vertical package's schema alongside their tables.

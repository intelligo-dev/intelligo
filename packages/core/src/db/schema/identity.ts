/**
 * User Identity Graph Schema (AI-ARCHITECTURE Phase B)
 *
 * Platform-level memory primitive — separate from any single product. The
 * four tables below turn a user's scattered signals (facts, episodic
 * memories, audit trails) into a single synthesized profile snapshot that
 * every agent session hydrates from in one DB read.
 *
 * Why four tables instead of a JSON blob:
 *  1. `user_facts` is the structured source of truth — queryable by
 *     category and weightable by confidence / importance.
 *  2. `user_memories` is the unstructured narrative surface — pgvector
 *     search for episodic recall during long-running conversations.
 *  3. `user_profile_snapshots` is the cached synthesis layer — voice
 *     agents can't afford to rebuild the profile at the top of every
 *     turn (<500ms budget), so we pre-render to this table and refresh
 *     on trigger events (session close, fact threshold, daily cron).
 *  4. `user_memory_audit` is the trust layer — every write is logged
 *     so the "My Memory" settings page can show provenance per fact.
 *
 * See docs/AI-ARCHITECTURE.md §2 for the full design.
 *
 * Migration: src/db/migrations/0018_identity_graph.sql creates all four
 * tables, their indexes, and the append-only triggers on
 * user_memory_audit. Apply via `pnpm --filter @intelligo-dev/core db:push`
 * before any code path calls into @intelligo-dev/agents/memory.
 */

import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";
import { organization, users } from "./auth";

// ---------------------------------------------------------------------------
// 1. user_facts — structured, evidence-backed facts
// ---------------------------------------------------------------------------

/**
 * Discriminated category for a fact. Used as a filter axis when querying
 * facts for synthesis or display. Keep this list tight — adding a new
 * category should be a product decision, not a free-form string.
 */
export const USER_FACT_CATEGORIES = [
  "interest",
  "skill",
  "goal",
  "constraint",
  "trait",
  "value",
  "preference",
  "context",
  "background",
] as const;

export type UserFactCategory = (typeof USER_FACT_CATEGORIES)[number];

/**
 * How a fact entered the system. "explicit_user_input" facts are
 * considered ground truth and survive conflict resolution against
 * lower-confidence LLM extractions.
 */
export const USER_FACT_EXTRACTION_METHODS = [
  "llm_extraction",
  "explicit_user_input",
  "inline_tool",
  "onboarding_form",
] as const;

export type UserFactExtractionMethod =
  (typeof USER_FACT_EXTRACTION_METHODS)[number];

export const userFacts = pgTable(
  "user_facts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    category: text("category").$type<UserFactCategory>().notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    importance: integer("importance").notNull().default(5),

    sourceProduct: text("source_product"),
    sourceSessionId: text("source_session_id"),
    sourceMessageId: text("source_message_id"),
    extractionMethod:
      text("extraction_method").$type<UserFactExtractionMethod>(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastConfirmedAt: timestamp("last_confirmed_at"),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    index("user_facts_user_idx").on(table.userId),
    index("user_facts_workspace_idx").on(table.workspaceId),
    index("user_facts_category_idx").on(table.workspaceId, table.category),
    // Uniqueness is scoped to (user, workspace, category, key) — a shared
    // workspace (e.g. a family or classroom org) can hold the same fact
    // key for multiple members without collision.
    uniqueIndex("user_facts_user_workspace_category_key_uniq").on(
      table.userId,
      table.workspaceId,
      table.category,
      table.key
    ),
  ]
);

// ---------------------------------------------------------------------------
// 2. user_memories — episodic, semantic recall via pgvector
// ---------------------------------------------------------------------------

export const USER_MEMORY_KINDS = [
  "conversation_summary",
  "event",
  "insight",
  "preference_statement",
  "decision",
  "struggle",
  "success",
] as const;

export type UserMemoryKind = (typeof USER_MEMORY_KINDS)[number];

export const userMemories = pgTable(
  "user_memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    kind: text("kind").$type<UserMemoryKind>().notNull(),
    content: text("content").notNull(),
    embedding: vector({ dimensions: 1536 }),

    sourceProduct: text("source_product"),
    sourceSessionId: text("source_session_id"),
    sourceMessageIds: text("source_message_ids").array(),

    importance: integer("importance").notNull().default(5),
    decayFactor: doublePrecision("decay_factor").notNull().default(1.0),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_memories_user_idx").on(table.userId),
    index("user_memories_workspace_idx").on(table.workspaceId),
    index("user_memories_kind_idx").on(table.workspaceId, table.kind),
    // pgvector IVFFlat / HNSW index is added in the migration SQL because
    // drizzle-orm doesn't expose the syntax natively.
  ]
);

// ---------------------------------------------------------------------------
// 3. user_profile_snapshots — synthesized, fast-read cache
// ---------------------------------------------------------------------------

export const SYNTHESIS_TRIGGER_REASONS = [
  "fact_threshold",
  "session_close",
  "daily_cron",
  "manual",
] as const;

export type SynthesisTriggerReason = (typeof SYNTHESIS_TRIGGER_REASONS)[number];

export const userProfileSnapshots = pgTable(
  "user_profile_snapshots",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),

    summary: text("summary").notNull(),
    summaryEn: text("summary_en"),
    summaryMn: text("summary_mn"),

    factsDigest: jsonb("facts_digest").notNull(),
    activeGoals: jsonb("active_goals"),
    personalitySignals: jsonb("personality_signals"),
    relationshipNotes: jsonb("relationship_notes"),

    synthesizedByModel: text("synthesized_by_model"),
    synthesizedAt: timestamp("synthesized_at").notNull().defaultNow(),
    nextSynthesisAt: timestamp("next_synthesis_at"),
    triggerReason: text("trigger_reason").$type<SynthesisTriggerReason>(),
  },
  // Composite PK: a user can have one snapshot per workspace. Scoping
  // by workspace matters the moment a user belongs to more than one
  // org — e.g. a student in both their family workspace and a
  // classroom workspace should get two distinct synthesized profiles.
  (table) => [
    primaryKey({ columns: [table.userId, table.workspaceId] }),
    index("user_profile_snapshots_workspace_idx").on(table.workspaceId),
  ]
);

// ---------------------------------------------------------------------------
// 4. user_memory_audit — privacy + trust audit trail
// ---------------------------------------------------------------------------

export const AUDIT_TARGET_KINDS = ["fact", "memory", "snapshot"] as const;
export type AuditTargetKind = (typeof AUDIT_TARGET_KINDS)[number];

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "view",
  "export",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTOR_KINDS = [
  "agent",
  "user",
  "system_job",
  "admin",
] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

export const userMemoryAudit = pgTable(
  "user_memory_audit",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    targetKind: text("target_kind").$type<AuditTargetKind>().notNull(),
    targetId: text("target_id").notNull(),
    action: text("action").$type<AuditAction>().notNull(),
    actorKind: text("actor_kind").$type<AuditActorKind>().notNull(),
    actorId: text("actor_id"),

    beforeValue: jsonb("before_value"),
    afterValue: jsonb("after_value"),
    reason: text("reason"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_memory_audit_user_idx").on(table.userId),
    index("user_memory_audit_workspace_idx").on(table.workspaceId),
    index("user_memory_audit_target_idx").on(table.targetKind, table.targetId),
  ]
);

// ---------------------------------------------------------------------------
// 5. pending_extractions — queue of conversations awaiting fact extraction
// ---------------------------------------------------------------------------

/**
 * Background-job queue for fact extraction. When a chat session ends
 * the chat handler enqueues the conversation id here; a consumer-owned
 * extraction worker polls and processes pending rows. Status starts as 'pending', flips to
 * 'processing' while the worker holds the row, then 'completed' or
 * 'failed' on exit. Failed rows track attempts so we can retry with
 * exponential backoff and a hard cap.
 *
 * Keeping the queue in Postgres rather than Inngest/QStash for now —
 * launch traffic is small enough that DB polling is sufficient.
 */

export const EXTRACTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const pendingExtractions = pgTable(
  "pending_extractions",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productSlug: text("product_slug").notNull(),

    status: text("status")
      .$type<ExtractionStatus>()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),

    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at"),

    enqueuedAt: timestamp("enqueued_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("pending_extractions_status_idx").on(table.status),
    index("pending_extractions_workspace_idx").on(table.workspaceId),
    uniqueIndex("pending_extractions_conversation_uniq").on(
      table.conversationId
    ),
    // Composite index for listPendingExtractions + claimNextExtraction
    // queries that filter by (status = 'pending' AND next_retry_at IS NULL / <= now).
    // Without this, the OR clause forces a seq scan on status='pending' rows.
    index("pending_extractions_status_retry_idx").on(
      table.status,
      table.nextRetryAt
    ),
    // 0033_pending_extractions_partial_idx.sql adds a partial index
    // (workspace_id) WHERE status = 'pending' — used by claimNextExtraction
    // and listPendingExtractions for per-workspace queue polling.
  ]
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type UserFact = typeof userFacts.$inferSelect;
export type InsertUserFact = typeof userFacts.$inferInsert;
export type UserMemory = typeof userMemories.$inferSelect;
export type InsertUserMemory = typeof userMemories.$inferInsert;
export type UserProfileSnapshot = typeof userProfileSnapshots.$inferSelect;
export type InsertUserProfileSnapshot =
  typeof userProfileSnapshots.$inferInsert;
export type UserMemoryAuditRow = typeof userMemoryAudit.$inferSelect;
export type InsertUserMemoryAudit = typeof userMemoryAudit.$inferInsert;
export type PendingExtraction = typeof pendingExtractions.$inferSelect;
export type InsertPendingExtraction = typeof pendingExtractions.$inferInsert;

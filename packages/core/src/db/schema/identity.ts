/**
 * The user identity graph: a user's facts, episodic memories and audit
 * trail, synthesized into one profile snapshot an agent session reads in
 * one query.
 *
 *  - `user_facts`: the structured source of truth, queryable by category
 *    and weighted by confidence and importance.
 *  - `user_memories`: unstructured episodic recall via pgvector search.
 *  - `user_profile_snapshots`: the cached synthesis, since voice agents
 *    cannot rebuild the profile inside a turn's latency budget.
 *  - `user_memory_audit`: append-only log of every write, so a user can see
 *    where each fact came from.
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

/**
 * A fact's category, the filter axis for synthesis and display. A closed
 * list on purpose: a new category is a decision, not a free-form string.
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
    // Scoped to (user, workspace, category, key) so members of a shared
    // workspace can hold the same fact key without collision.
    uniqueIndex("user_facts_user_workspace_category_key_uniq").on(
      table.userId,
      table.workspaceId,
      table.category,
      table.key
    ),
  ]
);

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
    // The pgvector index is created in migration SQL: drizzle-orm cannot
    // express it.
  ]
);

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
  // One snapshot per user per workspace: a user in two workspaces gets two
  // distinct profiles.
  (table) => [
    primaryKey({ columns: [table.userId, table.workspaceId] }),
    index("user_profile_snapshots_workspace_idx").on(table.workspaceId),
  ]
);

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

export type UserFact = typeof userFacts.$inferSelect;
export type InsertUserFact = typeof userFacts.$inferInsert;
export type UserMemory = typeof userMemories.$inferSelect;
export type InsertUserMemory = typeof userMemories.$inferInsert;
export type UserProfileSnapshot = typeof userProfileSnapshots.$inferSelect;
export type InsertUserProfileSnapshot =
  typeof userProfileSnapshots.$inferInsert;
export type UserMemoryAuditRow = typeof userMemoryAudit.$inferSelect;
export type InsertUserMemoryAudit = typeof userMemoryAudit.$inferInsert;

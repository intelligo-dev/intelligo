/**
 * RAG documents schema (Phase H).
 *
 * Single shared table that backs every collection in
 * @intelligo/agents/rag. Each collection (e.g., support.universities,
 * support.scholarships, support.majors) lives as a `collection` slug
 * filter on this table — so adding a new collection means writing a
 * Collection<TMeta> instance, not a migration.
 *
 * Schema choices:
 *  - `collection` is indexed for the per-collection filter clause.
 *  - `metadata` is freeform JSONB; the typed Collection wrapper in
 *    @intelligo/agents validates with Zod at write time.
 *  - `embedding` is a 1536-dim pgvector to match
 *    OpenAI text-embedding-3-small (the embeddings module in
 *    @intelligo/ai already targets that model).
 *  - `external_id` lets ingestion be idempotent — re-running a seed
 *    upserts on (collection, external_id) instead of duplicating.
 *
 * The pgvector IVFFlat / HNSW index lives in the SQL migration
 * because drizzle-orm doesn't expose the syntax natively, same
 * pattern as user_memories in identity.ts.
 */

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";

export const ragDocuments = pgTable(
  "rag_documents",
  {
    id: text("id").primaryKey(),
    collection: text("collection").notNull(),
    externalId: text("external_id"),

    content: text("content").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    embedding: vector({ dimensions: 1536 }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("rag_documents_collection_idx").on(table.collection),
    uniqueIndex("rag_documents_collection_external_uniq").on(
      table.collection,
      table.externalId
    ),
    // HNSW index for vector similarity search lives in the SQL migration
    // (0031_rag_documents_hnsw.sql) because drizzle-orm doesn't expose the
    // HNSW index syntax natively. Pattern mirrors knowledge_chunks above.
  ]
);

export type RagDocument = typeof ragDocuments.$inferSelect;
export type InsertRagDocument = typeof ragDocuments.$inferInsert;

/**
 * A DB-backed job queue — the default adapter behind the job contract.
 * No Redis, no external broker: Postgres `FOR UPDATE SKIP LOCKED` is
 * sufficient at this scale and keeps self-hosting to one dependency.
 *
 * Scanned by drizzle-kit alongside the core schema directory — see
 * packages/core/drizzle.config.ts.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organization } from "@intelligo-dev/core/db/schema";

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    /** Null for platform-wide jobs (cleanup crons, health sweeps). */
    workspaceId: text("workspace_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    /** Handler key, e.g. "credits.cleanup-reservations". */
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    /** pending | running | succeeded | failed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    /** Earliest time a worker may claim this job. */
    runAt: timestamp("run_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("jobs_claim_idx").on(table.status, table.runAt),
    index("jobs_kind_idx").on(table.kind, table.status),
    index("jobs_workspace_idx").on(table.workspaceId),
  ]
);

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

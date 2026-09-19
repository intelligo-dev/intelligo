/**
 * @intelligo-dev/jobs — job contract plus a Postgres-backed default adapter.
 *
 * The contract is what consumers code against; the adapter is what runs
 * when nobody supplies another. Swapping in a different queue means
 * implementing `JobQueue`, not rewriting call sites.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED`, so several workers (Vercel
 * cron invocations, a long-running process, a local script) can drain
 * the same queue without double-processing.
 */

import { db } from "@intelligo-dev/core/db";
import { createLogger } from "@intelligo-dev/core/logger";
import { and, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";

import { jobs } from "./db/schema";
import type { Job } from "./db/schema";

const log = createLogger("Jobs");

const UNHANDLED_DELAY_MS = 60_000;
const ABANDONED_AFTER_MS = 30 * 60_000;

export type EnqueueInput = {
  kind: string;
  payload?: Record<string, unknown>;
  workspaceId?: string | null;
  /** Delay before the job becomes claimable. */
  runAt?: Date;
  maxAttempts?: number;
};

export type JobHandler = (job: Job) => Promise<void>;

export type JobQueue = {
  enqueue(input: EnqueueInput): Promise<string>;
  /** Claim and run up to `limit` due jobs; returns what happened. */
  drain(
    handlers: Record<string, JobHandler>,
    options?: { limit?: number }
  ): Promise<DrainResult>;
};

export type DrainResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  /** Jobs whose kind had no registered handler — left pending. */
  unhandled: string[];
};

export async function enqueue(input: EnqueueInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    workspaceId: input.workspaceId ?? null,
    kind: input.kind,
    payload: input.payload ?? null,
    runAt: input.runAt ?? new Date(),
    maxAttempts: input.maxAttempts ?? 3,
  });
  return id;
}

/**
 * Claim due jobs atomically. SKIP LOCKED means a concurrent worker
 * takes different rows rather than blocking on ours. A job whose
 * handler started more than `ABANDONED_AFTER_MS` ago and is still
 * `running` belongs to a worker that died mid-handler, and is claimed
 * again — so a handler must finish well within that.
 */
async function claim(limit: number): Promise<Job[]> {
  const now = new Date();
  const abandonedBefore = new Date(now.getTime() - ABANDONED_AFTER_MS);
  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      or(
        and(eq(jobs.status, "pending"), lte(jobs.runAt, now)),
        and(eq(jobs.status, "running"), lt(jobs.startedAt, abandonedBefore))
      )
    )
    .orderBy(jobs.runAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  return db
    .update(jobs)
    .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, startedAt: now })
    .where(inArray(jobs.id, due))
    .returning();
}

export async function drain(
  handlers: Record<string, JobHandler>,
  options: { limit?: number } = {}
): Promise<DrainResult> {
  const claimedJobs = await claim(options.limit ?? 10);
  const result: DrainResult = {
    claimed: claimedJobs.length,
    succeeded: 0,
    failed: 0,
    unhandled: [],
  };

  for (const job of claimedJobs) {
    const handler = handlers[job.kind];

    if (!handler) {
      // Put it back rather than burning an attempt on a kind this
      // worker simply doesn't know about — another deployment might.
      // Moving `runAt` sends it behind the due jobs this worker can run,
      // so a backlog of unknown kinds cannot fill every claim.
      result.unhandled.push(job.kind);
      await db
        .update(jobs)
        .set({
          status: "pending",
          attempts: sql`${jobs.attempts} - 1`,
          runAt: new Date(Date.now() + UNHANDLED_DELAY_MS),
        })
        .where(eq(jobs.id, job.id));
      continue;
    }

    try {
      // A batch runs one job at a time; the clock that decides a job was
      // abandoned starts when its own handler does.
      await db
        .update(jobs)
        .set({ startedAt: new Date() })
        .where(eq(jobs.id, job.id));
      await handler(job);
      await db
        .update(jobs)
        .set({ status: "succeeded", finishedAt: new Date(), lastError: null })
        .where(eq(jobs.id, job.id));
      result.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = job.attempts >= job.maxAttempts;
      await db
        .update(jobs)
        .set({
          status: exhausted ? "failed" : "pending",
          finishedAt: exhausted ? new Date() : null,
          // Back off linearly; a failing dependency shouldn't be
          // hammered every drain.
          runAt: exhausted
            ? job.runAt
            : new Date(Date.now() + job.attempts * 60_000),
          lastError: message.slice(0, 1000),
        })
        .where(eq(jobs.id, job.id));
      result.failed += 1;
      log.error("Job failed", {
        jobId: job.id,
        kind: job.kind,
        attempt: String(job.attempts),
        exhausted: String(exhausted),
        error: message,
      });
    }
  }

  return result;
}

/** Jobs that exhausted their attempts, newest first — surfaced in the admin console. */
export async function listFailedJobs(limit = 50) {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "failed"))
    .orderBy(desc(jobs.finishedAt))
    .limit(limit);
}

/** Delete succeeded jobs older than the cutoff. */
export async function pruneJobs(before: Date): Promise<number> {
  const deleted = await db
    .delete(jobs)
    .where(and(eq(jobs.status, "succeeded"), lte(jobs.finishedAt, before)))
    .returning();
  return deleted.length;
}

/** The default Postgres-backed queue. */
export const postgresJobQueue: JobQueue = { enqueue, drain };

export { jobs } from "./db/schema";
export type { Job, InsertJob } from "./db/schema";

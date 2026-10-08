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
import { and, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";

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
  /** Claimed but not started before `deadlineMs`; put back pending. */
  deferred: number;
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
 *
 * The `startedAt` a claim writes is the claiming worker's hold on the
 * row: every later write by that worker matches it, and a worker that
 * claims the row again writes a different one.
 */
async function claim(limit: number): Promise<{ claimed: Job[]; at: Date }> {
  const now = new Date();
  const abandonedBefore = new Date(now.getTime() - ABANDONED_AFTER_MS);
  const abandoned = and(
    eq(jobs.status, "running"),
    lt(jobs.startedAt, abandonedBefore)
  );
  // An abandoned job that has used its attempts — one whose handler
  // keeps killing the worker — fails here instead of being run again.
  await db
    .update(jobs)
    .set({
      status: "failed",
      finishedAt: now,
      lastError: "The worker stopped while the handler ran.",
    })
    .where(and(abandoned, gte(jobs.attempts, jobs.maxAttempts)));
  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      or(
        and(eq(jobs.status, "pending"), lte(jobs.runAt, now)),
        and(abandoned, lt(jobs.attempts, jobs.maxAttempts))
      )
    )
    .orderBy(jobs.runAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  const claimed = await db
    .update(jobs)
    .set({
      status: "running",
      attempts: sql`${jobs.attempts} + 1`,
      startedAt: now,
    })
    .where(inArray(jobs.id, due))
    .returning();
  return { claimed, at: now };
}

/** Matches the row only while the worker that wrote `startedAt` holds it. */
function held(id: string, startedAt: Date) {
  return and(
    eq(jobs.id, id),
    eq(jobs.status, "running"),
    eq(jobs.startedAt, startedAt)
  );
}

const OUTCOME_WRITE_ATTEMPTS = 3;

/**
 * Write a job's outcome, retrying a failed write: a row left `running`
 * would be claimed again once abandoned and its handler run a second
 * time.
 */
async function writeOutcome(
  job: Job,
  startedAt: Date,
  fields: Partial<typeof jobs.$inferInsert>
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.update(jobs).set(fields).where(held(job.id, startedAt));
      return;
    } catch (error) {
      if (attempt >= OUTCOME_WRITE_ATTEMPTS) {
        log.error("Job outcome not recorded", {
          jobId: job.id,
          kind: job.kind,
          status: String(fields.status),
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
}

/**
 * Run the due jobs, one at a time. `deadlineMs` stops starting new ones
 * that long after the drain began, so a run fits its route's time limit;
 * the claimed jobs it did not start go back, attempt unspent, as
 * `deferred`.
 *
 * A job runs only while this worker still holds it: one that waited in
 * the batch long enough for another worker to claim it as abandoned is
 * skipped here, and none of this worker's writes land on it.
 */
export async function drain(
  handlers: Record<string, JobHandler>,
  options: { limit?: number; deadlineMs?: number } = {}
): Promise<DrainResult> {
  const deadline =
    options.deadlineMs === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() + options.deadlineMs;
  const { claimed: claimedJobs, at: claimedAt } = await claim(
    options.limit ?? 10
  );
  const result: DrainResult = {
    claimed: claimedJobs.length,
    succeeded: 0,
    failed: 0,
    unhandled: [],
    deferred: 0,
  };

  for (const job of claimedJobs) {
    try {
      await runClaimed(job, claimedAt, handlers, deadline, result);
    } catch (error) {
      // A bookkeeping write failed; the job stays `running` and is
      // claimed again once abandoned. The rest of the batch still runs.
      log.error("Job bookkeeping failed", {
        jobId: job.id,
        kind: job.kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

async function runClaimed(
  job: Job,
  claimedAt: Date,
  handlers: Record<string, JobHandler>,
  deadline: number,
  result: DrainResult
): Promise<void> {
  if (Date.now() >= deadline) {
    result.deferred += 1;
    await db
      .update(jobs)
      .set({
        status: "pending",
        attempts: sql`${jobs.attempts} - 1`,
        startedAt: null,
      })
      .where(held(job.id, claimedAt));
    return;
  }
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
        startedAt: null,
        runAt: new Date(Date.now() + UNHANDLED_DELAY_MS),
      })
      .where(held(job.id, claimedAt));
    return;
  }

  // A batch runs one job at a time; the clock that decides a job was
  // abandoned starts when its own handler does. The restamp is also the
  // check that the row is still this worker's to run.
  const startedAt = new Date(Math.max(Date.now(), claimedAt.getTime() + 1));
  const started = await db
    .update(jobs)
    .set({ startedAt })
    .where(held(job.id, claimedAt))
    .returning({ id: jobs.id });
  if (started.length === 0) return;

  let failure: string | undefined;
  try {
    await handler(job);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (failure === undefined) {
    result.succeeded += 1;
    await writeOutcome(job, startedAt, {
      status: "succeeded",
      finishedAt: new Date(),
      lastError: null,
    });
    return;
  }

  const exhausted = job.attempts >= job.maxAttempts;
  result.failed += 1;
  log.error("Job failed", {
    jobId: job.id,
    kind: job.kind,
    attempt: String(job.attempts),
    exhausted: String(exhausted),
    error: failure,
  });
  await writeOutcome(job, startedAt, {
    status: exhausted ? "failed" : "pending",
    finishedAt: exhausted ? new Date() : null,
    // Back off linearly; a failing dependency shouldn't be
    // hammered every drain.
    runAt: exhausted ? job.runAt : new Date(Date.now() + job.attempts * 60_000),
    lastError: failure.slice(0, 1000),
  });
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

const PRUNE_BATCH = 1_000;

/**
 * Delete finished jobs older than the cutoff — succeeded ones finished
 * before `before`, failed ones before `failedBefore` (default: the same
 * cutoff) — and return how many. Rows go in bounded batches, and only
 * their count comes back.
 */
export async function pruneJobs(
  before: Date,
  options: { failedBefore?: Date } = {}
): Promise<number> {
  const failedBefore = options.failedBefore ?? before;
  const finished = or(
    and(eq(jobs.status, "succeeded"), lte(jobs.finishedAt, before)),
    and(eq(jobs.status, "failed"), lte(jobs.finishedAt, failedBefore))
  );
  let total = 0;
  for (;;) {
    const batch = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(finished)
      .limit(PRUNE_BATCH);
    const { rowCount } = await db.delete(jobs).where(inArray(jobs.id, batch));
    const deleted = rowCount ?? 0;
    total += deleted;
    if (deleted < PRUNE_BATCH) return total;
  }
}

/** The default Postgres-backed queue. */
export const postgresJobQueue: JobQueue = { enqueue, drain };

export { jobs } from "./db/schema";
export type { Job, InsertJob } from "./db/schema";

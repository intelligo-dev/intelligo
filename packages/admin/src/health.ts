import "server-only";

/**
 * Integration health.
 *
 * The console's job here is to answer one question during an incident:
 * which moving part is broken? So each check reports a status, a single
 * actionable line, and the numbers behind it — not a green dot.
 *
 * Intelligo ships the checks for the things it owns and can read
 * without asking anyone: the database, the job queue, and execution
 * settlement. Everything else is the product's — which payment
 * processor, which mail provider, which model provider — so those
 * arrive through `registerIntegrationProbe` from the composition root
 * (ADR-0005). A framework package guessing at which env vars a product
 * needs is how it ends up knowing the product's vocabulary, and the
 * dependency-direction test refuses the import that would let it.
 *
 * Every check is wrapped: a probe that throws becomes a `down` row, not
 * a 500 on the page a support engineer opened *because* something is
 * down.
 */

import { db } from "@intelligo-dev/core/db";
import { createRegistry } from "@intelligo-dev/core/registry";
import { executions as executionsTable } from "@intelligo-dev/executions";
import { jobs } from "@intelligo-dev/jobs";
import { and, gte, inArray, lt, sql } from "drizzle-orm";

export type HealthStatus = "ok" | "degraded" | "down" | "unconfigured";

export type IntegrationHealth = {
  /** Stable machine key — "database", "jobs", "stripe". */
  key: string;
  label: string;
  status: HealthStatus;
  /** One line telling a human what to do about it. */
  detail: string;
  metrics?: Record<string, number | string>;
};

export type IntegrationProbe = {
  key: string;
  label: string;
  check: () => Promise<Omit<IntegrationHealth, "key" | "label">>;
};

const probes = createRegistry<IntegrationProbe>("admin/health-probes");

/**
 * Register a product-owned integration check.
 *
 * Re-registering a key replaces it, so a composition root that runs
 * twice does not double the list.
 */
export function registerIntegrationProbe(probe: IntegrationProbe): void {
  probes.set(probe.key, probe);
}

export function clearIntegrationProbes(): void {
  probes.clear();
}

/** How long a job may sit pending before the worker is presumed dead. */
const JOB_BACKLOG_WARN_MS = 15 * 60_000;
/** An execution stuck between running and settled past this is unsettled. */
const UNSETTLED_MS = 10 * 60_000;

async function checkDatabase(): Promise<
  Omit<IntegrationHealth, "key" | "label">
> {
  const startedAt = Date.now();
  await db.execute(sql`select 1`);
  const latencyMs = Date.now() - startedAt;

  return {
    status: latencyMs > 1_000 ? "degraded" : "ok",
    detail:
      latencyMs > 1_000
        ? `Round-trip took ${latencyMs}ms — check the database region and pooling.`
        : `Round-trip ${latencyMs}ms.`,
    metrics: { latencyMs },
  };
}

async function checkJobs(): Promise<Omit<IntegrationHealth, "key" | "label">> {
  const staleBefore = new Date(Date.now() - JOB_BACKLOG_WARN_MS);

  const [[pending], [stale], [failed]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(inArray(jobs.status, ["pending", "running"])),
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(
        and(inArray(jobs.status, ["pending"]), lt(jobs.runAt, staleBefore))
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ["failed"]),
          gte(jobs.createdAt, new Date(Date.now() - 24 * 60 * 60_000))
        )
      ),
  ]);

  const pendingCount = Number(pending?.n ?? 0);
  const staleCount = Number(stale?.n ?? 0);
  const failedCount = Number(failed?.n ?? 0);

  // A backlog of jobs whose run time has long passed means nothing is
  // draining the queue — a far more urgent signal than a big backlog.
  if (staleCount > 0) {
    return {
      status: "down",
      detail: `${staleCount} job(s) overdue by more than 15 minutes — no worker appears to be draining the queue.`,
      metrics: {
        pending: pendingCount,
        overdue: staleCount,
        failed24h: failedCount,
      },
    };
  }

  return {
    status: failedCount > 0 ? "degraded" : "ok",
    detail:
      failedCount > 0
        ? `${failedCount} job(s) exhausted their retries in the last 24h.`
        : `${pendingCount} job(s) queued, none overdue.`,
    metrics: { pending: pendingCount, overdue: 0, failed24h: failedCount },
  };
}

async function checkSettlement(): Promise<
  Omit<IntegrationHealth, "key" | "label">
> {
  const cutoff = new Date(Date.now() - UNSETTLED_MS);

  const [[unsettled]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(executionsTable)
      .where(
        and(
          inArray(executionsTable.status, ["running", "settling"]),
          lt(executionsTable.startedAt, cutoff)
        )
      ),
  ]);

  const count = Number(unsettled?.n ?? 0);

  // Unsettled executions are held credit nobody has charged or
  // released — the money is neither the customer's nor ours.
  return {
    status: count > 0 ? "degraded" : "ok",
    detail:
      count > 0
        ? `${count} execution(s) never settled — credit is still held against them.`
        : "Every execution older than 10 minutes has settled.",
    metrics: { unsettled: count },
  };
}

const BUILT_IN: IntegrationProbe[] = [
  { key: "database", label: "Database", check: checkDatabase },
  { key: "jobs", label: "Job queue", check: checkJobs },
  { key: "settlement", label: "Execution settlement", check: checkSettlement },
];

/**
 * Run every check. Never throws: a probe that fails is reported as
 * `down` with its own error message, because the page exists to be
 * readable while things are broken.
 */
export async function getIntegrationHealth(): Promise<IntegrationHealth[]> {
  const all = [...BUILT_IN, ...probes.values()];

  return Promise.all(
    all.map(async ({ key, label, check }) => {
      try {
        return { key, label, ...(await check()) };
      } catch (error) {
        return {
          key,
          label,
          status: "down" as const,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );
}

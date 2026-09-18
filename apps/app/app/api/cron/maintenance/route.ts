/**
 * Maintenance route: the periodic work the framework relies on.
 *
 * Mount a scheduler at GET /api/cron/maintenance with
 * `Authorization: Bearer $CRON_SECRET` every few minutes. On Vercel,
 * add an entry to `crons` in vercel.json with this path and a
 * five-minute schedule (`0-59/5 * * * *`); Vercel sends the header
 * itself.
 *
 * What one run does, and why each step exists:
 *
 * - **Reconcile stale executions.** A row still `running` or `settling`
 *   past the chat route's `maxDuration` is usage nobody finished
 *   accounting for. `executions.reconcile` confirms a charge the
 *   ledger already holds, re-runs settlement from the recorded usage,
 *   or fails an abandoned run and releases its hold.
 * - **Drop expired reservations.** Admission already ignores them; this
 *   is table hygiene.
 * - **Drop old rate-limit buckets.** Same.
 * - **Expire trials and send reminders.** `hasActiveTrial` checks the
 *   end date inline, so admission is safe without this — feature
 *   access and the reminder emails are what it drives.
 * - **Prune finished jobs** older than a week.
 *
 * Draining the job queue is NOT done here: `drain` needs your handlers,
 * so give it its own route (or call it below once you have some).
 *
 * This file is yours. Add product maintenance to it freely.
 */

import { timingSafeEqual } from "node:crypto";

import {
  cleanupExpiredReservations,
  cleanupRateLimitEntries,
  processTrialExpirations,
} from "@intelligo-dev/billing";
import { findStaleExecutions } from "@intelligo-dev/executions";
import { pruneJobs } from "@intelligo-dev/jobs";
import { createLogger } from "@intelligo-dev/core/logger";

import { composeIntelligo, executions } from "@/lib/intelligo";

const log = createLogger("cron.maintenance");

export const maxDuration = 60;

/** Executions older than this and still non-terminal are reconciled. */
const STALE_AFTER_MS = 10 * 60_000;
/** Finished jobs older than this are pruned. */
const PRUNE_JOBS_AFTER_MS = 7 * 24 * 60 * 60_000;

/** Constant-time bearer comparison; length is compared too. */
function bearerMatches(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const token = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(token, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    log.error("CRON_SECRET missing or shorter than 32 chars — refusing");
    return new Response("Forbidden", { status: 403 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  composeIntelligo();
  const errors: string[] = [];
  const step = async <T>(
    name: string,
    run: () => Promise<T>
  ): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`${name} failed`, { error: message });
      errors.push(`${name}: ${message}`);
      return null;
    }
  };

  const stale = await step("findStaleExecutions", () =>
    findStaleExecutions(new Date(Date.now() - STALE_AFTER_MS))
  );
  const reconciled: Record<string, number> = {};
  for (const row of stale ?? []) {
    const result = await step(`reconcile ${row.id}`, () =>
      executions.reconcile(row.id, { abandonRunningAfterMs: STALE_AFTER_MS })
    );
    if (result)
      reconciled[result.action] = (reconciled[result.action] ?? 0) + 1;
  }

  const summary = {
    staleExecutions: stale?.length ?? 0,
    reconciled,
    expiredReservationsDeleted: await step(
      "cleanupExpiredReservations",
      cleanupExpiredReservations
    ),
    rateLimitEntriesDeleted: await step(
      "cleanupRateLimitEntries",
      cleanupRateLimitEntries
    ),
    trials: await step("processTrialExpirations", processTrialExpirations),
    jobsPruned: await step("pruneJobs", () =>
      pruneJobs(new Date(Date.now() - PRUNE_JOBS_AFTER_MS))
    ),
    errors,
  };

  log.info("Maintenance run", summary);
  return Response.json(summary, { status: errors.length ? 207 : 200 });
}

# @intelligo-dev/jobs

A Postgres-backed job queue: enqueue, claim with SKIP LOCKED, retry with backoff and prune. No Redis.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/jobs](https://intelligo.dev/docs/packages/jobs).

## Install

```bash
pnpm add @intelligo-dev/jobs drizzle-orm
```

`drizzle-orm` is a peer. The queue is one table, `jobs`, in the framework's
schema: `intelligo migrate` from
[`@intelligo-dev/cli`](https://www.npmjs.com/package/@intelligo-dev/cli)
creates it, and the connection is the `DATABASE_URL` that
`@intelligo-dev/core` reads.

## Use

Enqueue from anywhere that can reach the database:

```ts
import { enqueue } from "@intelligo-dev/jobs";

await enqueue({
  kind: "digest.send",
  workspaceId, // or null: a job no workspace owns (an anonymous request's work)
  payload: { userId },
  runAt: new Date(Date.now() + 60_000), // optional: not before
  maxAttempts: 5, // optional: 3 by default
});
```

Drain from a cron route, a long-running worker or a script — handlers are
keyed by `kind`:

```ts
import { drain } from "@intelligo-dev/jobs";

const result = await drain(
  {
    "digest.send": async (job) => {
      await sendDigest(job.payload);
    },
  },
  { limit: 25, deadlineMs: 45_000 }
);
// { claimed, succeeded, failed, unhandled, deferred }
```

## What the queue guarantees

- **No double-processing.** Claiming is `FOR UPDATE SKIP LOCKED`, so several
  workers drain the same queue and each takes different rows. A worker writes
  to a job only while it still holds the claim: a job another worker claimed
  again while it waited in a batch is skipped, and a late outcome never
  overwrites the newer one.
- **A recorded outcome.** A handler runs once per attempt: a failed status
  write is retried rather than counted as a handler failure, and one job's
  failed write does not stop the rest of the batch.
- **Retry with backoff.** A handler that throws puts the job back, one more
  minute later per attempt; after `maxAttempts` it is `failed` and keeps its
  last error. `listFailedJobs()` reads them, newest first.
- **A dead worker does not strand a job.** One still `running` thirty minutes
  after its handler started is claimed again, so a handler must finish well
  inside that — until it has used its attempts: a handler that keeps killing
  its worker ends `failed`.
- **A drain fits its time limit.** With `deadlineMs`, jobs claimed but not
  started by then go back without spending an attempt (`deferred`).
- **An unknown kind costs nothing.** A job with no handler in this worker goes
  back without spending an attempt, a minute behind the jobs the worker can
  run — another deployment may know it.

`pruneJobs(before, { failedBefore })` deletes succeeded jobs finished before
`before` and failed ones finished before `failedBefore` (the same cutoff when
omitted), in bounded batches, and returns how many. `postgresJobQueue` is the same `enqueue` and `drain` as one
`JobQueue` value; a different queue implements that type, and call sites stay
as they are.

## Licence

Apache-2.0

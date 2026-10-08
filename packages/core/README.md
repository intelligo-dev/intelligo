# @intelligo-dev/core

Database schema, email, logging, notifications, and the conversation, document and identity contracts.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/core](https://intelligo.dev/docs/packages/core).

## Install

```bash
pnpm add @intelligo-dev/core drizzle-orm
```

`drizzle-orm` is a peer; `react` 19 is an optional one, needed only by the
email templates. Every other `@intelligo-dev/*` package depends on this one,
and this one imports none of them.

## Use

```ts
import { db, withWorkspaceFilter } from "@intelligo-dev/core/db";
import { conversations } from "@intelligo-dev/core/db/schema";
import { createLogger } from "@intelligo-dev/core/logger";
import { eq } from "drizzle-orm";

const log = createLogger("Inbox");

const mine = await db
  .select()
  .from(conversations)
  .where(
    withWorkspaceFilter(
      conversations.workspaceId,
      workspace.id,
      eq(conversations.userId, user.id)
    )
  );
log.info("Loaded conversations", { count: String(mine.length) });
```

`db` connects on first use from `DATABASE_URL`: a Neon host takes the
WebSocket driver and anything else takes node-postgres, unless
`INTELLIGO_DB_DRIVER` says `pg` or `neon-serverless`. Every tenant-scoped query
filters on `workspaceId`; `workspaceEq` and `withWorkspaceFilter` make that the
short way to write one.

The leaves import nothing, so a client bundle, an edge runtime or another
package can reach them without pulling in the database:

```ts
import { formatMoney, fromMajor } from "@intelligo-dev/core/money";
import { sanitizeForSystemPrompt } from "@intelligo-dev/core/prompt";

formatMoney(fromMajor(12.5, "USD"), "en-US"); // "$12.50", held as 12_500_000 micros

const system = `${basePrompt}\n\nAbout the user: ${sanitizeForSystemPrompt(profile)}`;
```

## Exports

| Subpath            | What                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| `/db`              | Drizzle client and the workspace-scoped query helpers                                  |
| `/db/schema`       | Every framework table                                                                  |
| `/conversations`   | Conversation and message persistence                                                   |
| `/documents`       | Document persistence and the title classifier                                          |
| `/identity`        | The identity graph: facts, memories, profile snapshots                                 |
| `/attachments`     | Rows for the files users put into conversations                                        |
| `/storage`         | Where those files' bytes live: one adapter (S3, R2, disk) bound by the application     |
| `/storage/s3`      | That adapter for any S3-compatible bucket (S3, R2, MinIO), signed without an SDK       |
| `/email`           | Transactional email and its templates                                                  |
| `/notifications`   | In-app notification records and triggers                                               |
| `/logger`          | Structured logging with credential redaction                                           |
| `/registry`        | Registries that survive a bundler duplicating a module                                 |
| `/money`           | Amount-plus-currency value object in micros; imports nothing                           |
| `/request-context` | Where the framework reads the request's headers from; bound by the adapter             |
| `/prompt`          | Prompt-injection sanitisation for user text bound for a system prompt; imports nothing |
| `/env`             | Environment validation                                                                 |

## Storage

`/storage` is the port; `/storage/s3` is an adapter for any S3-compatible
bucket. It signs requests itself (Signature Version 4 over `fetch` and Web
Crypto), so it adds no dependency and runs wherever `fetch` does. Bind it from
the composition root:

```ts
import { setStorageAdapter } from "@intelligo-dev/core/storage";
import { s3StorageFromEnv } from "@intelligo-dev/core/storage/s3";

const storage = s3StorageFromEnv(); // null without STORAGE_BUCKET
if (storage) setStorageAdapter(storage);
```

`s3StorageFromEnv` reads `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`,
`STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION` (default `auto`, R2's) and
`STORAGE_ENDPOINT` (R2's `https://<account>.r2.cloudflarestorage.com`, a MinIO
URL; unset means AWS). A custom endpoint is addressed path-style; pass
`createS3Storage({ …, pathStyle })` to choose. Uploads are buffered to be
hashed. A request the bucket does not answer within `timeoutMs` (default 30
seconds) is abandoned and the call throws.

## Environment

`assertEnv()` from `/env` fails at boot rather than at the first query when
`DATABASE_URL`, `BETTER_AUTH_SECRET` or `NEXT_PUBLIC_APP_URL` is missing;
`validateEnv()` returns the same findings, with warnings for the optional
Stripe, email and `CRON_SECRET` values. The composition root calls it once.

## Migrations

The framework migration chain ships inside this package
(`src/db/migrations`) and is applied by `intelligo migrate` from
[`@intelligo-dev/cli`](https://www.npmjs.com/package/@intelligo-dev/cli).

Do not provision with `drizzle-kit push`. A pushed database has the schema and
no migration records, and the migrator refuses it rather than half-applying the
chain to tables that already exist.

## Licence

Apache-2.0

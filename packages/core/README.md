# @intelligo-dev/core

Database schema, email, logging, notifications, and the conversation, document and identity contracts.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/core
```

## Exports

| Subpath            | What                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| `/db`              | Drizzle client and the workspace-scoped query helpers                                  |
| `/db/schema`       | Every framework table                                                                  |
| `/conversations`   | Conversation and message persistence                                                   |
| `/documents`       | Document persistence and the title classifier                                          |
| `/identity`        | The identity graph: facts, memories, profile snapshots                                 |
| `/email`           | Transactional email and its templates                                                  |
| `/notifications`   | In-app notification records and triggers                                               |
| `/logger`          | Structured logging with credential redaction                                           |
| `/registry`        | Registries that survive a bundler duplicating a module                                 |
| `/money`           | Amount-plus-currency value object in micros; imports nothing                           |
| `/request-context` | Where the framework reads the request's headers from; bound by the adapter             |
| `/prompt`          | Prompt-injection sanitisation for user text bound for a system prompt; imports nothing |
| `/env`             | Environment validation                                                                 |

## Migrations

The framework migration chain ships inside this package
(`src/db/migrations`) and is applied by `intelligo migrate` from
[`@intelligo-dev/cli`](https://www.npmjs.com/package/@intelligo-dev/cli).

Do not provision with `drizzle-kit push`. A pushed database has the schema and
no migration records, and the migrator refuses it rather than half-applying the
chain to tables that already exist.

## Licence

Apache-2.0

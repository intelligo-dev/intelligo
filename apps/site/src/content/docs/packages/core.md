---
title: "@intelligo-dev/core"
description: "Database, email, logging, notifications, and the conversation, document and identity contracts."
order: 1
label: core
---

## Install

```bash
pnpm add @intelligo-dev/core
```

## Capabilities

- Conversations and messages: cursor-paginated history, renaming, votes, trailing-message deletion for regeneration, and a batched upsert built for streaming writes
- Documents/artifacts with versioning, a registrable title classifier, and ownership checks on every read
- User notifications with read state and product-registrable triggers
- A real privacy surface: self-auditing data export, a memory-audit trail, per-fact deletion
- Every operation takes a resolved actor and enforces workspace + user scoping **inside the service**, not in the page

## Exports

| Subpath            | What                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| `/db`              | Drizzle client and the workspace-scoped query helpers                                  |
| `/db/schema`       | Every framework table                                                                  |
| `/conversations`   | Conversation and message persistence ([ADR-0009](https://github.com/intelligo-mn/framework/tree/main/docs/adr))                                        |
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
no migration records, and the migrator refuses it rather than half-applying 44
files to tables that already exist.

[npm](https://www.npmjs.com/package/@intelligo-dev/core) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/core)

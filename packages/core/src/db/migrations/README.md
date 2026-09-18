# Migrations

The framework's schema is one migration, `0000_baseline.sql`, generated
from the Drizzle schema (`src/db/schema/*` plus the audit, executions
and jobs packages' `schema.ts`) with the pieces Drizzle cannot express
added by hand: the `vector` extension, the HNSW index on memory
embeddings, and the triggers that keep `audit_events` and
`user_memory_audit` append-only. Later migrations follow it in
`meta/_journal.json`.

A migration here changes structure only. It never inserts or edits rows:
what a deployment bills in, its plans and its agents come from its own
composition root (`ensureBillingSettingsRow`, the plan registry).
`tests/architecture/baseline.test.ts` enforces it.

## In a consumer application

This directory ships inside the published package (it is in `files`,
next to `dist`), and `intelligo migrate` applies it: it resolves the
chain from `node_modules/@intelligo-dev/core/src/db/migrations`, applies
what is pending by content hash, and records it in drizzle's default
`drizzle.__drizzle_migrations` table — the table
`intelligo migrate --check` reads.

The tables an application owns are a second chain, kept apart on
purpose: drizzle-kit applies by timestamp, so a framework migration
published after the consumer generated one of theirs would be skipped
silently if the two shared a journal. `intelligo create` scaffolds a
`drizzle.config.ts` whose `schema` lists only the consumer's files,
whose `out` is the app's own `./drizzle`, and whose `migrations.table`
is `__app_migrations`. A consumer schema file may `references()` a
framework table — drizzle-kit emits the foreign key by name and does
not try to create the referenced table. The scaffold's scripts:

```
pnpm db:generate   # drizzle-kit generate           — your chain
pnpm db:migrate    # intelligo migrate && drizzle-kit migrate
pnpm db:check      # intelligo migrate --check      — deploy gate
```

`drizzle-kit push` has no place in this layout: it diffs the whole
database against the schema it can see, and the consumer config sees
only the consumer's tables.

## Adding a migration

Change the schema, then `pnpm --filter @intelligo-dev/core db:generate`,
which writes the `.sql` file, its snapshot and its journal entry. A
hand-written file (a trigger, a data-free `DO` block) needs its journal
entry added by hand — `intelligo doctor` fails if the journal and the
directory disagree.

## Databases from before 1.0

Before 1.0 the framework's schema was a chain of 48 migrations that had
grown with the product it came from; some created tables the framework
no longer owns. `legacy-chain.json` lists that chain's tags and content
hashes — not its SQL. A database that ran the whole chain is **adopted**:
`intelligo migrate` records `0000_baseline` as applied without running
it, then applies `0001_reconcile_chain_built_databases`, which brings
the few places where the old chain and the schema disagreed into line
(a no-op on a database created from the baseline). Tables the old chain
created that the framework no longer defines are left untouched; a
product that still uses them keeps them in its own migrations.

A database that ran only part of the old chain is refused: finish it
with `@intelligo-dev/core@1.0.0-beta.7` first.

## Baselining a push-provisioned database

A database provisioned with `drizzle-kit push` has the schema but no
migration records, and `intelligo migrate` refuses it rather than
applying the baseline to tables that already exist. Record the chain as
applied before the first `migrate`, one row per journal entry, in
journal order: `hash` is the sha256 of the `.sql` file's contents and
`created_at` the entry's `when`.

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
```

Then verify with `intelligo migrate --check`. Do this on a restored copy
first.

## Verifying the chain

CI replays every file against an empty database on each run and then
asserts the columns the running code depends on, and the database
integration suites run against that replay — which is what proves these
files are a provisioning mechanism rather than documentation.

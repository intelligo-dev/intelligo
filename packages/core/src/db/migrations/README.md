# Migrations

`drizzle-kit migrate` applies the `.sql` files listed in
`meta/_journal.json`, in journal order. Both halves have to agree, and
for most of this repository's life they did not: the journal stopped at
entry 11 while the directory grew to 39 files, so `migrate` silently
applied a quarter of the chain and every environment was really
provisioned by `drizzle-kit push` from `schema.ts`.

That is how `0032` shipped documenting a unique constraint on a
`minute_bucket` column no migration ever created — the rate limiter's
`ON CONFLICT` could not have resolved on a database built from these
files. `0037` repairs it, and `intelligo doctor` now fails CI if the
journal and the directory drift apart again.

## In a consumer application

This directory ships inside the published package (it is in `files`,
next to `dist`), and `intelligo migrate` applies it: it resolves the
chain from `node_modules/@intelligo-dev/core/src/db/migrations`, runs
drizzle's migrator over it in journal order, and records what it applied
in the default `drizzle.__drizzle_migrations` table — the same table
`intelligo migrate --check` reads. On a database that already has the
framework's tables but no records (one provisioned with `db:push`) it
refuses and points here; baseline first, below.

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

Prefer `pnpm --filter @intelligo-dev/core db:generate`, which writes both
the `.sql` file and its journal entry. A hand-written file needs its
tag added to `meta/_journal.json` by hand — `doctor` will tell you if
you forget.

Note that `db:generate` diffs against `meta/NNNN_snapshot.json`, and
snapshots exist only up to `0011`. Until the snapshots are rebuilt,
generate produces a full-schema diff rather than an incremental one;
hand-write the file and add the journal entry instead.

## Baselining an existing database

Because the journal previously listed only 12 of the 39 files, a
database provisioned with `push` has the schema but no record of the
migrations. Running `migrate` against it now would try to apply all 39.
Most are `IF NOT EXISTS`-guarded, but not all.

Mark them as already applied before the first `migrate` on such a
database:

```sql
-- One row per journal entry, in journal order. hash is the sha256 of
-- the .sql file contents; drizzle compares it on subsequent runs.
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
```

Generate the rows with the file hashes and the `when` values from the
journal, then verify with `intelligo doctor` and a `migrate` run that
reports nothing to apply. Do this on a restored copy first.

## Verifying the chain

CI replays every file against an empty database on each run (see the
`e2e` job) and then asserts the columns the running code depends on.
That check is what proves these files are a provisioning mechanism
rather than documentation.

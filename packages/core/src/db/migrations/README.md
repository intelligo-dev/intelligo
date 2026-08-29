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

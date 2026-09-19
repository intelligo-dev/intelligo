/**
 * `intelligo migrate` — apply the framework's migration chain.
 *
 * A consumer application has two migration chains in one database:
 * the framework's, shipped inside `@intelligo-dev/core` (its `.sql`
 * files and journal are in the package's `files`), and its own, which
 * drizzle-kit generates from the tables the application owns. They
 * must not share a journal — drizzle-kit applies by timestamp, so a
 * framework migration published after the consumer generated one of
 * theirs would be silently skipped — and a consumer cannot write into
 * `node_modules` anyway. So the framework chain is applied by this
 * command, into drizzle's default `drizzle.__drizzle_migrations`
 * table, and the consumer's chain by `drizzle-kit migrate` from their
 * own `drizzle.config.ts`, into a table of its own (the scaffold sets
 * `migrations.table` to `__app_migrations`).
 *
 * Migrations are selected by content hash (what `migrate --check`
 * compares), not by drizzle's journal-timestamp rule, and are recorded
 * in the same table drizzle's migrator writes — see
 * `readPendingMigrations` for why.
 *
 * The one thing this refuses to do is guess. A database with the
 * framework's tables but no migration records was provisioned with
 * `db:push`; applying the whole chain to it would fail part-way (not
 * every migration is `IF NOT EXISTS`-guarded) and leave the records
 * half-written. Baselining is the fix, and it is deliberately a manual
 * step — see `packages/core/src/db/migrations/README.md`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  hashMigration,
  isPartialLegacy,
  migrateCheck,
  type MigrateCheckResult,
} from "./migrate-check.js";

export type ApplyDecision =
  | {
      action: "apply";
      pending: string[];
      /** Recorded as applied without running: the schema is already there. */
      adopted: string[];
    }
  | { action: "noop" }
  | { action: "refuse"; reason: string };

/**
 * What to do with a database, given the check result and whether the
 * framework's schema already exists in it. Pure, so the three states
 * that matter — empty, push-provisioned, behind — are unit-testable
 * without a database.
 */
export function decideApply(
  check: MigrateCheckResult,
  schemaExists: boolean
): ApplyDecision {
  if (check.unknown.length > 0) {
    return {
      action: "refuse",
      reason:
        `Database is ahead: ${check.unknown.length} applied migration(s) are ` +
        `not in this checkout (${check.unknown.join(", ")}). Upgrade ` +
        `@intelligo-dev/core before migrating, or restore the database.`,
    };
  }

  if (isPartialLegacy(check)) {
    return {
      action: "refuse",
      reason:
        `This database ran ${check.legacy.length} of the ` +
        `${check.legacyChainLength} pre-1.0 migrations. Finish that chain ` +
        `with @intelligo-dev/core 1.0.0-beta.7 (\`intelligo migrate\`) ` +
        `before upgrading.`,
    };
  }

  if (check.adoptable) {
    const [baseline, ...rest] = check.pending;
    return {
      action: "apply",
      adopted: baseline ? [baseline] : [],
      pending: rest,
    };
  }

  if (check.unmanaged && schemaExists) {
    return {
      action: "refuse",
      reason:
        `This database has the framework's tables but no migration records — ` +
        `it was provisioned with db:push. Baseline it before running migrate, ` +
        `otherwise all ${check.chain.length} migrations would be applied to ` +
        `tables that already exist. See README.md in @intelligo-dev/core's ` +
        `src/db/migrations.`,
    };
  }

  if (check.pending.length === 0) return { action: "noop" };

  return { action: "apply", pending: check.pending, adopted: [] };
}

type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

/**
 * One migration ready to run: its statements and the journal entry it
 * will be recorded under. `createdAt` is the journal's `when`, which is
 * what drizzle-kit writes to `created_at` too, so records made here and
 * records made by drizzle's own migrator are indistinguishable.
 */
export type PendingMigration = {
  tag: string;
  hash: string;
  createdAt: number;
  statements: string[];
};

/**
 * Read the pending migrations off disk, in journal order.
 *
 * The chain is applied by content hash — the same key `migrate --check`
 * compares — and not by drizzle's rule of "every entry whose journal
 * timestamp is greater than the last applied row's". That rule depends
 * on `when` values increasing monotonically, which a hand-numbered
 * journal does not guarantee: an entry numbered below an applied one is
 * skipped silently while the check reports it pending. Selecting by hash makes "pending" mean exactly what the check says.
 */
export function readPendingMigrations(
  migrationsDir: string,
  pendingTags: string[]
): PendingMigration[] {
  const journal = JSON.parse(
    readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8")
  ) as {
    entries?: Array<{ tag: string; when: number; breakpoints?: boolean }>;
  };
  const byTag = new Map((journal.entries ?? []).map((e) => [e.tag, e]));

  return pendingTags.map((tag) => {
    const entry = byTag.get(tag);
    if (!entry) throw new Error(`${tag} is pending but not in the journal`);
    const sql = readFileSync(path.join(migrationsDir, `${tag}.sql`), "utf8");
    const statements = (
      entry.breakpoints === false
        ? [sql]
        : sql.split("--> statement-breakpoint")
    )
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { tag, hash: hashMigration(sql), createdAt: entry.when, statements };
  });
}

/** The records table drizzle's migrator uses, created the way it creates it. */
export const MIGRATIONS_TABLE_SQL = [
  `CREATE SCHEMA IF NOT EXISTS "drizzle"`,
  `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
];

export type ApplyMigrationsOptions = {
  migrationsDir: string;
  /** Runs a read-only query and returns its rows. */
  query: QueryFn;
  /**
   * Applies the given migrations in order, all in one transaction,
   * recording each in `drizzle.__drizzle_migrations` as it goes.
   */
  run: (pending: PendingMigration[]) => Promise<void>;
};

export type ApplyMigrationsResult = ApplyDecision & {
  /** After the run, for the summary line and for `noop` detection. */
  chainLength: number;
};

/**
 * `users` is the first table the framework creates (auth), so its
 * presence with no migration records is the push-provisioned signature.
 */
export const SCHEMA_PROBE_SQL = `SELECT to_regclass('public.users') AS rel`;

export async function applyMigrations(
  options: ApplyMigrationsOptions
): Promise<ApplyMigrationsResult> {
  const check = await migrateCheck(
    options.migrationsDir,
    async (sql) => (await options.query(sql)) as Array<{ hash: string }>
  );

  const probe = await options.query(SCHEMA_PROBE_SQL);
  const schemaExists = probe.length > 0 && probe[0]!.rel != null;

  const decision = decideApply(check, schemaExists);
  if (decision.action === "apply") {
    // An adopted migration is recorded with no statements: its schema is
    // already in the database.
    const adopted = readPendingMigrations(
      options.migrationsDir,
      decision.adopted
    ).map((m) => ({ ...m, statements: [] }));
    await options.run([
      ...adopted,
      ...readPendingMigrations(options.migrationsDir, decision.pending),
    ]);
  }

  return { ...decision, chainLength: check.chain.length };
}

export function formatApplyResult(r: ApplyMigrationsResult): string {
  switch (r.action) {
    case "refuse":
      return `✗ ${r.reason}`;
    case "noop":
      return `✓ Nothing to apply (${r.chainLength}/${r.chainLength} applied)`;
    case "apply":
      return [
        ...r.adopted.map(
          (tag) =>
            `✓ Adopted ${tag}: this database ran the pre-1.0 chain, so its schema is already there`
        ),
        `✓ Applied ${r.pending.length} migration(s):`,
        ...r.pending.map((tag) => `    ${tag}`),
      ].join("\n");
  }
}

export function applyExitCode(r: ApplyMigrationsResult): number {
  return r.action === "refuse" ? 1 : 0;
}

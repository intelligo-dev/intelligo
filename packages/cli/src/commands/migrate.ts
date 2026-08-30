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
 * The one thing this refuses to do is guess. A database with the
 * framework's tables but no migration records was provisioned with
 * `db:push`; applying the whole chain to it would fail part-way (not
 * every migration is `IF NOT EXISTS`-guarded) and leave the records
 * half-written. Baselining is the fix, and it is deliberately a manual
 * step — see `packages/core/src/db/migrations/README.md`.
 */

import { migrateCheck, type MigrateCheckResult } from "./migrate-check.js";

export type ApplyDecision =
  | { action: "apply"; pending: string[] }
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

  if (check.unmanaged && schemaExists) {
    return {
      action: "refuse",
      reason:
        `This database has the framework's tables but no migration records — ` +
        `it was provisioned with db:push. Baseline it before running migrate, ` +
        `otherwise all ${check.chain.length} migrations would be applied to ` +
        `tables that already exist. See packages/core/src/db/migrations/README.md`,
    };
  }

  if (check.pending.length === 0) return { action: "noop" };

  return { action: "apply", pending: check.pending };
}

type QueryFn = (sql: string) => Promise<Array<Record<string, unknown>>>;

export type ApplyMigrationsOptions = {
  migrationsDir: string;
  /** Runs a read-only query and returns its rows. */
  query: QueryFn;
  /** Applies every pending migration in journal order, transactionally. */
  run: () => Promise<void>;
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
  if (decision.action === "apply") await options.run();

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
        `✓ Applied ${r.pending.length} migration(s):`,
        ...r.pending.map((tag) => `    ${tag}`),
      ].join("\n");
  }
}

export function applyExitCode(r: ApplyMigrationsResult): number {
  return r.action === "refuse" ? 1 : 0;
}

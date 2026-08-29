/**
 * `intelligo migrate --check`
 *
 * Answers "would deploying this code against that database work?"
 * without changing anything. Two failure modes matter and neither is
 * visible from the code alone:
 *
 *   - migrations the database has not applied yet (deploying now runs
 *     code against an older schema);
 *   - migrations the database has applied that this checkout does not
 *     contain (the database is ahead — usually a rollback in progress).
 *
 * Drizzle records applied migrations in `drizzle.__drizzle_migrations`
 * by content hash. A database provisioned with `db:push` has the
 * schema but no rows there at all, which this reports distinctly:
 * "unmanaged" is a different problem from "behind", and baselining is
 * the fix (see the migrations README).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { readMigrationChain } from "../migrations.js";

export type MigrateCheckResult = {
  /** Journal tags this checkout knows about, in order. */
  chain: string[];
  /** Applied according to the database. */
  applied: string[];
  /** In the chain but not applied — a deploy would run against an older schema. */
  pending: string[];
  /** Applied but absent from this checkout — the database is ahead. */
  unknown: string[];
  /**
   * True when the migrations table is empty or missing while the
   * schema exists — a push-provisioned database that needs baselining.
   */
  unmanaged: boolean;
};

/** Drizzle hashes the file contents with sha256. */
export function hashMigration(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

type QueryFn = (sql: string) => Promise<Array<{ hash: string }>>;

export async function migrateCheck(
  migrationsDir: string,
  query: QueryFn
): Promise<MigrateCheckResult> {
  const chain = readMigrationChain(migrationsDir);

  const hashToTag = new Map<string, string>();
  for (const tag of chain.journalTags) {
    const file = path.join(migrationsDir, `${tag}.sql`);
    try {
      hashToTag.set(hashMigration(readFileSync(file, "utf8")), tag);
    } catch {
      // readMigrationChain already reports files the journal names but
      // that are not on disk; nothing to hash here.
    }
  }

  let rows: Array<{ hash: string }> = [];
  let tableMissing = false;
  try {
    rows = await query(
      `SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at`
    );
  } catch {
    tableMissing = true;
  }

  const appliedHashes = new Set(rows.map((r) => r.hash));
  const applied: string[] = [];
  const unknown: string[] = [];
  for (const hash of appliedHashes) {
    const tag = hashToTag.get(hash);
    if (tag) applied.push(tag);
    else unknown.push(hash.slice(0, 12));
  }

  const appliedTags = new Set(applied);
  const pending = chain.journalTags.filter((t) => !appliedTags.has(t));

  return {
    chain: chain.journalTags,
    applied,
    pending,
    unknown,
    unmanaged: tableMissing || appliedHashes.size === 0,
  };
}

export function formatMigrateCheck(r: MigrateCheckResult): string {
  const lines: string[] = [];

  if (r.unmanaged) {
    lines.push(
      `! This database has no migration records. If it was provisioned with ` +
        `db:push, baseline it before running migrate — otherwise migrate will ` +
        `try to apply all ${r.chain.length} migrations. See ` +
        `packages/core/src/db/migrations/README.md`
    );
  }

  if (r.unknown.length > 0) {
    lines.push(
      `✗ Database is ahead: ${r.unknown.length} applied migration(s) are not in ` +
        `this checkout (${r.unknown.join(", ")})`
    );
  }

  if (r.pending.length > 0) {
    lines.push(
      `✗ ${r.pending.length} migration(s) pending: ${r.pending.join(", ")}`
    );
  } else if (!r.unmanaged) {
    lines.push(`✓ Up to date (${r.applied.length}/${r.chain.length} applied)`);
  }

  return lines.join("\n");
}

/** Non-zero when deploying this code would run against a stale schema. */
export function migrateCheckExitCode(r: MigrateCheckResult): number {
  return r.pending.length > 0 || r.unknown.length > 0 ? 1 : 0;
}

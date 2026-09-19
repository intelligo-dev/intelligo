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
 *
 * The framework's chain is one baseline. A database that ran the pre-1.0
 * chain holds its hashes, which `legacy-chain.json` (next to the
 * journal) lists: they are reported as `legacy`, not as unknown, and a
 * database holding all of them is `adoptable` — its schema is the
 * baseline's, so `migrate` records the baseline without running it.
 *
 * The exit code is 1 whenever anything is pending or the database is
 * ahead, which a brand-new database and a stale one share. A deploy
 * gate that must tell them apart reads `migrate --check --json`: one
 * JSON object on stdout, same exit code, whose `state` is
 *
 *   - `up_to_date` — every migration is applied;
 *   - `pending`    — a migrated database is behind this checkout;
 *   - `fresh`      — no migration records and none of the framework's
 *                    tables: an empty database, `migrate` applies the chain;
 *   - `unmanaged`  — the tables exist with no records (`db:push`);
 *   - `ahead`      — applied migrations this checkout does not contain;
 *   - `legacy`     — the pre-1.0 chain; `adoptable` says whether
 *                    `migrate` can take it over.
 *
 * Beside `state` it carries `exitCode`, `chain`, `applied`, `pending`,
 * `unknown`, `legacy` and `adoptable`.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
  /** Pre-1.0 migrations the database ran, by tag. */
  legacy: string[];
  /** Length of the pre-1.0 chain (0 when this checkout ships none). */
  legacyChainLength: number;
  /**
   * The database ran the whole pre-1.0 chain and not the baseline:
   * `migrate` records the baseline as applied without running it.
   */
  adoptable: boolean;
};

/** The pre-1.0 chain's tags and hashes, if this checkout ships them. */
export function readLegacyChain(
  migrationsDir: string
): Array<{ tag: string; hash: string }> {
  const file = path.join(migrationsDir, "legacy-chain.json");
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    entries?: Array<{ tag: string; hash: string }>;
  };
  return parsed.entries ?? [];
}

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

  const legacyChain = readLegacyChain(migrationsDir);
  const legacyByHash = new Map(legacyChain.map((e) => [e.hash, e.tag]));

  const appliedHashes = new Set(rows.map((r) => r.hash));
  const applied: string[] = [];
  const unknown: string[] = [];
  const legacy: string[] = [];
  for (const hash of appliedHashes) {
    const tag = hashToTag.get(hash);
    const legacyTag = legacyByHash.get(hash);
    if (tag) applied.push(tag);
    else if (legacyTag) legacy.push(legacyTag);
    else unknown.push(hash.slice(0, 12));
  }

  const appliedTags = new Set(applied);
  const pending = chain.journalTags.filter((t) => !appliedTags.has(t));
  const baseline = chain.journalTags[0];

  return {
    chain: chain.journalTags,
    applied,
    pending,
    unknown,
    unmanaged: tableMissing || appliedHashes.size === 0,
    legacy,
    legacyChainLength: legacyChain.length,
    adoptable:
      legacyChain.length > 0 &&
      legacy.length === legacyChain.length &&
      baseline !== undefined &&
      !appliedTags.has(baseline),
  };
}

/**
 * `schemaExists` is whether the framework's tables are in the database
 * (`SCHEMA_PROBE_SQL`). When the caller did not probe, a database with
 * no records gets the cautious `db:push` wording.
 */
export function formatMigrateCheck(
  r: MigrateCheckResult,
  schemaExists?: boolean
): string {
  const lines: string[] = [];

  if (r.unmanaged && schemaExists === false) {
    lines.push(
      `! This database is empty: no migration records and none of the ` +
        `framework's tables. \`intelligo migrate\` applies all ` +
        `${r.chain.length} migration(s).`
    );
  } else if (r.unmanaged) {
    lines.push(
      `! This database has no migration records. If it was provisioned with ` +
        `db:push, baseline it before running migrate — otherwise migrate will ` +
        `try to apply all ${r.chain.length} migrations. See README.md in ` +
        `@intelligo-dev/core's src/db/migrations.`
    );
  }

  if (r.adoptable) {
    lines.push(
      `! This database ran the framework's pre-1.0 migration chain. migrate ` +
        `records ${r.chain[0]} as applied without running it (the schema is ` +
        `already there), then applies what follows. Tables the old chain ` +
        `created that the framework no longer owns are left untouched.`
    );
  } else if (r.legacy.length > 0 && r.legacy.length < r.legacyChainLength) {
    lines.push(
      `✗ This database ran ${r.legacy.length} of the ${r.legacyChainLength} ` +
        `pre-1.0 migrations. Finish that chain with @intelligo-dev/core ` +
        `1.0.0-beta.7 (\`intelligo migrate\`) before upgrading.`
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

/** A partial pre-1.0 chain: neither adoptable nor migratable from here. */
export function isPartialLegacy(r: MigrateCheckResult): boolean {
  return r.legacy.length > 0 && r.legacy.length < r.legacyChainLength;
}

export type MigrateState =
  "up_to_date" | "pending" | "fresh" | "ahead" | "unmanaged" | "legacy";

/**
 * One word for what the check found, most urgent first: a database that
 * is ahead or on the pre-1.0 chain is that before it is anything else.
 * `schemaExists` separates an empty database from a push-provisioned one.
 */
export function migrateState(
  r: MigrateCheckResult,
  schemaExists: boolean
): MigrateState {
  if (r.unknown.length > 0) return "ahead";
  if (r.legacy.length > 0) return "legacy";
  if (r.unmanaged) return schemaExists ? "unmanaged" : "fresh";
  return r.pending.length > 0 ? "pending" : "up_to_date";
}

/** The `--json` report: `state` first, then the detail behind it. */
export function formatMigrateCheckJson(
  r: MigrateCheckResult,
  schemaExists: boolean
): string {
  return JSON.stringify({
    state: migrateState(r, schemaExists),
    exitCode: migrateCheckExitCode(r),
    chain: r.chain,
    applied: r.applied,
    pending: r.pending,
    unknown: r.unknown,
    legacy: r.legacy,
    adoptable: r.adoptable,
  });
}

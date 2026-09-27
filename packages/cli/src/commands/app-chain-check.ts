/**
 * The application's own migration chain, as `migrate --check` reports it.
 *
 * The scaffold's `drizzle.config.ts` generates the tables an app owns into
 * `./drizzle` and has `drizzle-kit migrate` record them in
 * `drizzle.__app_migrations`, apart from the framework's chain. A deploy
 * gate that runs only the framework's check passes while one of the app's
 * migrations is still pending, so the check reads this chain too, by the
 * same content hash drizzle-kit records.
 *
 * An app without `drizzle/meta/_journal.json` owns no chain in the
 * scaffold's layout, and the check says nothing about it.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readMigrationChain } from "../migrations.js";
import { hashMigration } from "./migrate-check.js";

/** Where the scaffold's `drizzle.config.ts` writes the app's chain. */
export const APP_MIGRATIONS_DIR = "drizzle";

export type AppChainResult = {
  /** Journal tags of the app's chain, in order. */
  chain: string[];
  applied: string[];
  /** In the journal but not recorded — `db:migrate` has not run them. */
  pending: string[];
  /** Recorded but not in this checkout, by hash prefix. */
  unknown: string[];
};

type QueryFn = (sql: string) => Promise<Array<{ hash: string }>>;

export async function appChainCheck(
  appDir: string,
  query: QueryFn
): Promise<AppChainResult | null> {
  const dir = path.join(appDir, APP_MIGRATIONS_DIR);
  if (!existsSync(path.join(dir, "meta", "_journal.json"))) return null;

  const { journalTags } = readMigrationChain(dir);
  const hashToTag = new Map<string, string>();
  for (const tag of journalTags) {
    const file = path.join(dir, `${tag}.sql`);
    if (existsSync(file)) {
      hashToTag.set(hashMigration(readFileSync(file, "utf8")), tag);
    }
  }

  let rows: Array<{ hash: string }> = [];
  try {
    rows = await query(`SELECT hash FROM drizzle.__app_migrations`);
  } catch {
    // No table yet: drizzle-kit creates it on the first `db:migrate`.
  }

  const applied: string[] = [];
  const unknown: string[] = [];
  for (const hash of new Set(rows.map((r) => r.hash))) {
    const tag = hashToTag.get(hash);
    if (tag) applied.push(tag);
    else unknown.push(hash.slice(0, 12));
  }
  const appliedTags = new Set(applied);

  return {
    chain: journalTags,
    applied,
    pending: journalTags.filter((t) => !appliedTags.has(t)),
    unknown,
  };
}

export function formatAppChainCheck(r: AppChainResult): string {
  const lines: string[] = [];
  if (r.unknown.length > 0) {
    lines.push(
      `✗ App database is ahead: ${r.unknown.length} applied app migration(s) ` +
        `are not in ${APP_MIGRATIONS_DIR}/ (${r.unknown.join(", ")})`
    );
  }
  if (r.pending.length > 0) {
    lines.push(
      `✗ ${r.pending.length} app migration(s) pending: ${r.pending.join(", ")}` +
        ` — \`drizzle-kit migrate\` (pnpm db:migrate) applies them`
    );
  } else {
    lines.push(
      `✓ App chain up to date (${r.applied.length}/${r.chain.length} applied)`
    );
  }
  return lines.join("\n");
}

export function appChainExitCode(r: AppChainResult | null): number {
  return r && (r.pending.length > 0 || r.unknown.length > 0) ? 1 : 0;
}

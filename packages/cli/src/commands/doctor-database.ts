/**
 * The part of `doctor` that asks the database, run when DATABASE_URL is
 * set and `--offline` is not: whether the framework's and the app's
 * chains are applied (the same reading as `migrate --check`), whether
 * pgvector can be installed, and whether the billing row's currency is
 * the one the app's code formats money in.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { appChainCheck } from "./app-chain-check.js";
import type { CheckResult } from "./doctor.js";
import { migrateCheck, migrateState } from "./migrate-check.js";

export type DatabaseQuery = (
  sql: string
) => Promise<Array<Record<string, unknown>>>;

/** The currency `lib/billing-config.ts` declares, when it is a literal. */
export function declaredCurrency(appRoot: string): string | null {
  const file = path.join(appRoot, "lib", "billing-config.ts");
  if (!existsSync(file)) return null;
  const match = /export const CURRENCY\s*=\s*["'`]([A-Za-z]{3})["'`]/.exec(
    readFileSync(file, "utf8")
  );
  return match ? match[1]!.toUpperCase() : null;
}

export async function databaseChecks(options: {
  appRoot: string;
  migrationsDir: string | null;
  query: DatabaseQuery;
}): Promise<CheckResult[]> {
  const { appRoot, migrationsDir, query } = options;
  const results: CheckResult[] = [];
  const hashes = async (sql: string) =>
    (await query(sql)) as Array<{ hash: string }>;

  if (migrationsDir) {
    const framework = await migrateCheck(migrationsDir, hashes);
    const [probe] = await query(`SELECT to_regclass('public.users') AS rel`);
    const state = migrateState(framework, probe?.rel != null);
    results.push(
      state === "up_to_date"
        ? {
            name: "database",
            status: "ok",
            detail: "framework migrations applied",
          }
        : {
            name: "database",
            status: state === "pending" || state === "fresh" ? "warn" : "error",
            detail: `framework migrations: ${state} — run \`intelligo migrate --check\` for the detail`,
          }
    );
  }
  const app = await appChainCheck(appRoot, hashes);
  if (app && app.pending.length + app.unknown.length > 0) {
    results.push({
      name: "database",
      status: "warn",
      detail: `the app's migrations: ${app.pending.length} pending, ${app.unknown.length} unknown — \`drizzle-kit migrate\``,
    });
  }

  const vector = await query(
    `SELECT installed_version FROM pg_available_extensions WHERE name = 'vector'`
  );
  if (vector.length === 0) {
    results.push({
      name: "database",
      status: "error",
      detail:
        "the pgvector extension is not available on this server — the framework's migrations need it (use a Postgres with pgvector, such as pgvector/pgvector or Neon)",
    });
  }

  const declared = declaredCurrency(appRoot);
  if (declared) {
    const settings = await query(
      `SELECT currency FROM billing_settings WHERE id = 'default'`
    ).catch(() => []);
    const stored = settings[0]?.currency;
    if (typeof stored === "string" && stored.toUpperCase() !== declared) {
      results.push({
        name: "database",
        status: "warn",
        detail: `billing_settings bills in ${stored.toUpperCase()} but lib/billing-config.ts formats ${declared} — the row is never re-seeded; change it in the admin console`,
      });
    }
  }
  return results;
}

/** Doctor's database section; an unreachable database is one finding. */
export async function runDatabaseChecks(
  url: string,
  appRoot: string,
  migrationsDir: string | null
): Promise<CheckResult[]> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (error) {
    return [
      {
        name: "database",
        status: "warn",
        detail: `could not connect (${error instanceof Error ? error.message : String(error)}) — pass --offline to skip`,
      },
    ];
  }
  try {
    return await databaseChecks({
      appRoot,
      migrationsDir,
      query: async (sql) => (await client.query(sql)).rows,
    });
  } finally {
    await client.end();
  }
}

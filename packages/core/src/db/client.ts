/**
 * One Drizzle handle, two drivers: `pg` (node-postgres) for ordinary
 * Postgres URLs, and `neon-serverless` (Neon's WebSocket driver) for Neon
 * URLs.
 *
 * Neon's HTTP driver is deliberately not an option: it has no session, so
 * `db.transaction()` throws, and quota admission (`pg_advisory_xact_lock` +
 * reservation insert) and usage settlement are transactions.
 *
 * `INTELLIGO_DB_DRIVER=pg | neon-serverless` forces a driver, for a
 * Neon-compatible proxy or a self-hosted Postgres whose hostname happens to
 * match.
 *
 * The client is created on first access so `next build` can collect route
 * metadata without DATABASE_URL; a missing URL throws on the first query.
 */

import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "./schema";

export type DbDriver = "pg" | "neon-serverless";

type Db = ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePostgres>;

let cached: Db | null = null;

/**
 * Which driver a connection string gets. Pure, so the rule is testable
 * without a database: an explicit `INTELLIGO_DB_DRIVER` wins; otherwise
 * Neon hosts (`neon.tech`) and Neon endpoint ids (`@ep-…`) take the
 * WebSocket driver and everything else takes node-postgres.
 */
export function selectDriver(url: string, override?: string): DbDriver {
  if (override === "pg" || override === "neon-serverless") return override;
  if (override) {
    throw new Error(
      `INTELLIGO_DB_DRIVER must be "pg" or "neon-serverless", got "${override}". ` +
        `(neon-http is not supported: it cannot run transactions.)`
    );
  }
  const isNeon = url.includes("neon.tech") || url.includes("@ep-");
  return isNeon ? "neon-serverless" : "pg";
}

function initDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not defined. Please set it in your .env file."
    );
  }

  const driver = selectDriver(url, process.env.INTELLIGO_DB_DRIVER);

  if (driver === "neon-serverless") {
    // The WebSocket driver needs a WebSocket implementation. Node 22+
    // has one globally; older runtimes must install `ws` and assign
    // `neonConfig.webSocketConstructor` themselves before first use.
    if (!neonConfig.webSocketConstructor && typeof WebSocket !== "undefined") {
      neonConfig.webSocketConstructor = WebSocket;
    }
    const pool = new NeonPool({ connectionString: url });
    console.log("📊 Database: Neon (serverless, WebSocket)");
    return drizzleNeon(pool, { schema });
  }

  const pool = new Pool({ connectionString: url });
  console.log("📊 Database: PostgreSQL");
  return drizzlePostgres(pool as any, { schema });
}

function resolveDb(): Db {
  if (!cached) cached = initDb();
  return cached;
}

// Proxy keeps the ergonomic `db.select()...` shape for all call
// sites while deferring actual driver instantiation to first access.
// `next build` never touches these handlers, so module load is
// env-independent; first real request materializes the client.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = resolveDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Db;

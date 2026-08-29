/**
 * Database Client
 *
 * Uses different drivers based on environment:
 * - Local development: postgres driver (node-postgres)
 * - Production (Neon): @neondatabase/serverless driver
 *
 * The client is initialized lazily on first method access so that
 * `next build` can statically collect API route metadata without
 * having DATABASE_URL available. The throw still happens at runtime
 * for any request that actually touches the DB, so a missing env in
 * production surfaces loudly on the first query.
 */

import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "./schema";

type Db = ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePostgres>;

let cached: Db | null = null;

function initDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not defined. Please set it in your .env file."
    );
  }

  const isNeon = url.includes("neon.tech") || url.includes("@ep-");

  if (isNeon) {
    const sql = neon(url);
    console.log("📊 Database: Neon (serverless)");
    return drizzleNeon(sql, { schema });
  }

  const pool = new Pool({ connectionString: url });
  console.log("📊 Database: PostgreSQL (local)");
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

/**
 * Two `intelligo migrate` runs against one database at once. Runs only
 * when TEST_PG_URL is set; it creates and drops a database of its own:
 *
 *   TEST_PG_URL=postgres://postgres:postgres@localhost:5445/intelligo \
 *     pnpm vitest run packages/cli/src/commands/migrate.int.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";

import { migrateDatabase } from "./migrate.js";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("migrateDatabase run concurrently", () => {
  const name = `intelligo_migrate_lock_${Date.now()}`;
  let dir = "";
  let url = "";

  beforeAll(async () => {
    const admin = new Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
    const target = new URL(PG_URL!);
    target.pathname = `/${name}`;
    url = target.toString();

    dir = mkdtempSync(path.join(tmpdir(), "intelligo-migrate-lock-"));
    mkdirSync(path.join(dir, "meta"));
    // Not IF NOT EXISTS-guarded: applying it twice fails.
    writeFileSync(
      path.join(dir, "0000_a.sql"),
      `CREATE TABLE "users" ("id" text PRIMARY KEY);\n--> statement-breakpoint\nSELECT pg_sleep(0.3);`
    );
    writeFileSync(
      path.join(dir, "meta", "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          { idx: 0, version: "7", when: 1, tag: "0000_a", breakpoints: true },
        ],
      })
    );
  });

  afterAll(async () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    const admin = new Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });

  it("applies the chain once; the second run finds nothing to do", async () => {
    const clients = [
      new Client({ connectionString: url }),
      new Client({ connectionString: url }),
    ];
    await Promise.all(clients.map((c) => c.connect()));
    try {
      const results = await Promise.all(
        clients.map((c) => migrateDatabase(c, dir))
      );
      expect(results.map((r) => r.action).sort()).toEqual(["apply", "noop"]);
      const rows = await clients[0]!.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`
      );
      expect(rows.rows[0]!.n).toBe(1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });
});

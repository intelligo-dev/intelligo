/**
 * migrate --check tests.
 *
 * The distinction that matters is between "behind" and "unmanaged":
 * a push-provisioned database has the schema but no migration records,
 * and telling its operator to run `migrate` — which would try to apply
 * the whole chain — is worse advice than saying nothing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  formatMigrateCheck,
  hashMigration,
  migrateCheck,
  migrateCheckExitCode,
} from "./migrate-check.js";

let dir: string;
const SQL = "SELECT 1;";

function chain(tags: string[]) {
  for (const t of tags) writeFileSync(path.join(dir, `${t}.sql`), SQL);
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: tags.map((tag, idx) => ({
        idx,
        version: "7",
        when: idx,
        tag,
        breakpoints: true,
      })),
    })
  );
}

const applied = (n: number) => async () =>
  Array.from({ length: n }, () => ({ hash: hashMigration(SQL) }));

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "intelligo-migrate-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("migrateCheck", () => {
  it("reports an unmanaged database when the migrations table is missing", async () => {
    chain(["0000_a", "0001_b"]);

    const r = await migrateCheck(dir, async () => {
      throw new Error('relation "drizzle.__drizzle_migrations" does not exist');
    });

    expect(r.unmanaged).toBe(true);
    expect(formatMigrateCheck(r)).toContain("baseline");
  });

  it("treats an empty migrations table as unmanaged, not as fully pending", async () => {
    chain(["0000_a"]);

    const r = await migrateCheck(dir, async () => []);

    expect(r.unmanaged).toBe(true);
  });

  it("reports pending migrations by tag", async () => {
    chain(["0000_a", "0001_b"]);
    // Both files have identical contents, so one applied hash matches
    // both tags; the check reports what is missing from the applied set.
    const r = await migrateCheck(dir, applied(1));

    expect(r.unmanaged).toBe(false);
    expect(r.pending.length).toBeGreaterThan(0);
    expect(migrateCheckExitCode(r)).toBe(1);
  });

  it("flags a database that is ahead of this checkout", async () => {
    chain(["0000_a"]);

    const r = await migrateCheck(dir, async () => [
      { hash: hashMigration(SQL) },
      { hash: "deadbeefdeadbeefdeadbeef" },
    ]);

    expect(r.unknown).toHaveLength(1);
    expect(formatMigrateCheck(r)).toContain("ahead");
    expect(migrateCheckExitCode(r)).toBe(1);
  });

  it("passes when every journal entry is applied", async () => {
    chain(["0000_a"]);

    const r = await migrateCheck(dir, applied(1));

    expect(r.pending).toEqual([]);
    expect(migrateCheckExitCode(r)).toBe(0);
    expect(formatMigrateCheck(r)).toContain("Up to date");
  });
});

describe("hashMigration", () => {
  it("is content-addressed, matching how drizzle records applies", () => {
    expect(hashMigration("a")).not.toBe(hashMigration("b"));
    expect(hashMigration("a")).toBe(hashMigration("a"));
  });
});

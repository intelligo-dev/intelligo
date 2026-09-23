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
  formatMigrateCheckJson,
  hashMigration,
  migrateCheck,
  migrateCheckExitCode,
  migrateState,
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

describe("migrateState", () => {
  it("tells an empty database from a stale one though both exit 1", async () => {
    chain(["0000_a", "0001_b"]);

    writeFileSync(path.join(dir, "0001_b.sql"), "SELECT 2;");

    const fresh = await migrateCheck(dir, async () => {
      throw new Error('relation "drizzle.__drizzle_migrations" does not exist');
    });
    const stale = await migrateCheck(dir, async () => [
      { hash: hashMigration(SQL) },
    ]);
    const current = await migrateCheck(dir, async () => [
      { hash: hashMigration(SQL) },
      { hash: hashMigration("SELECT 2;") },
    ]);

    expect(migrateState(fresh, false)).toBe("fresh");
    expect(migrateState(stale, true)).toBe("pending");
    expect(migrateCheckExitCode(fresh)).toBe(1);
    expect(migrateCheckExitCode(stale)).toBe(1);
    expect(migrateState(current, true)).toBe("up_to_date");
  });

  it("calls tables without records unmanaged, not fresh", async () => {
    chain(["0000_a"]);
    const r = await migrateCheck(dir, async () => []);

    expect(migrateState(r, true)).toBe("unmanaged");
    expect(formatMigrateCheck(r, true)).toContain("db:push");
    expect(formatMigrateCheck(r, false)).toContain("empty");
    expect(formatMigrateCheck(r, false)).not.toContain("db:push");
  });

  it("puts ahead and legacy before anything else", async () => {
    chain(["0000_a"]);
    writeFileSync(
      path.join(dir, "legacy-chain.json"),
      JSON.stringify({ entries: [{ tag: "0000_old", hash: "0ld" }] })
    );

    const legacy = await migrateCheck(dir, async () => [{ hash: "0ld" }]);
    const ahead = await migrateCheck(dir, async () => [
      { hash: "0ld" },
      { hash: "deadbeefdeadbeefdeadbeef" },
    ]);

    expect(migrateState(legacy, true)).toBe("legacy");
    expect(migrateState(ahead, true)).toBe("ahead");
  });

  it("prints one JSON object carrying the state and the exit code", async () => {
    chain(["0000_a", "0001_b"]);
    const r = await migrateCheck(dir, async () => []);

    expect(JSON.parse(formatMigrateCheckJson(r, false))).toEqual({
      state: "fresh",
      exitCode: 1,
      chain: ["0000_a", "0001_b"],
      applied: [],
      pending: ["0000_a", "0001_b"],
      unknown: [],
      legacy: [],
      legacyMissing: [],
      adoptable: false,
    });
  });

  it("names the pre-1.0 migrations a partial chain lacks, and no version to install", async () => {
    chain(["0000_a"]);
    writeFileSync(
      path.join(dir, "legacy-chain.json"),
      JSON.stringify({
        entries: [
          { tag: "0000_old", hash: "h0" },
          { tag: "0001_old", hash: "h1" },
          { tag: "0002_old", hash: "h2" },
        ],
      })
    );

    const r = await migrateCheck(dir, async () => [
      { hash: "h0" },
      { hash: "h2" },
    ]);
    expect(r.legacyMissing).toEqual(["0001_old"]);

    const printed = formatMigrateCheck(r, true);
    expect(printed).toContain("ran 2 of the 3 pre-1.0 migrations");
    expect(printed).toContain("has not run 0001_old");
    expect(printed).toContain("1.0.0-beta.6");
    expect(printed).not.toMatch(/beta\.7/);
  });
});

describe("hashMigration", () => {
  it("is content-addressed, matching how drizzle records applies", () => {
    expect(hashMigration("a")).not.toBe(hashMigration("b"));
    expect(hashMigration("a")).toBe(hashMigration("a"));
  });
});

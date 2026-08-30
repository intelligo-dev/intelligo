/**
 * migrate (apply) tests.
 *
 * The decision is what matters: an empty database gets the whole
 * chain, a database that is behind gets the rest, and a
 * push-provisioned database — schema present, no records — is refused
 * with the baselining advice instead of a half-applied chain.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { hashMigration } from "./migrate-check.js";
import {
  SCHEMA_PROBE_SQL,
  applyExitCode,
  applyMigrations,
  decideApply,
  formatApplyResult,
  type PendingMigration,
} from "./migrate.js";

let dir: string;
/** Distinct per tag: drizzle records by content hash, and a Set of one hash is one applied migration. */
const sqlFor = (tag: string) =>
  `-- ${tag}\nSELECT 1;\n--> statement-breakpoint\nSELECT 2;`;
let tags: string[] = [];

function chain(list: string[]) {
  tags = list;
  for (const t of tags) writeFileSync(path.join(dir, `${t}.sql`), sqlFor(t));
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      // `when` deliberately NOT monotonic — the applier must not care.
      entries: tags.map((tag, idx) => ({
        idx,
        version: "7",
        when: 1000 - idx,
        tag,
        breakpoints: true,
      })),
    })
  );
}

/**
 * A database in one of the states that matter: `applied` migration
 * rows (or no table at all), and whether the framework's tables exist.
 */
function database(opts: { applied: number | "no-table"; schema: boolean }) {
  return async (sql: string) => {
    if (sql === SCHEMA_PROBE_SQL) {
      return [{ rel: opts.schema ? "users" : null }];
    }
    if (opts.applied === "no-table") throw new Error("relation missing");
    return tags
      .slice(0, opts.applied)
      .map((tag) => ({ hash: hashMigration(sqlFor(tag)) }));
  };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "intelligo-migrate-apply-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("decideApply", () => {
  const check = (over: Partial<Parameters<typeof decideApply>[0]>) => ({
    chain: ["0000_a", "0001_b"],
    applied: [],
    pending: ["0000_a", "0001_b"],
    unknown: [],
    unmanaged: true,
    ...over,
  });

  it("applies the whole chain to an empty database", () => {
    expect(decideApply(check({}), false)).toEqual({
      action: "apply",
      pending: ["0000_a", "0001_b"],
    });
  });

  it("refuses a push-provisioned database and names the fix", () => {
    const d = decideApply(check({}), true);
    expect(d.action).toBe("refuse");
    if (d.action === "refuse") expect(d.reason).toContain("Baseline");
  });

  it("applies only what is pending to a database that is behind", () => {
    expect(
      decideApply(
        check({ applied: ["0000_a"], pending: ["0001_b"], unmanaged: false }),
        true
      )
    ).toEqual({ action: "apply", pending: ["0001_b"] });
  });

  it("is a no-op when up to date", () => {
    expect(
      decideApply(
        check({ applied: ["0000_a", "0001_b"], pending: [], unmanaged: false }),
        true
      )
    ).toEqual({ action: "noop" });
  });

  it("refuses a database that is ahead of this checkout", () => {
    const d = decideApply(
      check({
        applied: ["0000_a", "0001_b"],
        pending: [],
        unknown: ["deadbeef"],
        unmanaged: false,
      }),
      true
    );
    expect(d.action).toBe("refuse");
    if (d.action === "refuse") expect(d.reason).toContain("ahead");
  });
});

describe("applyMigrations", () => {
  it("hands the runner every migration, split into statements, on an empty database", async () => {
    chain(["0000_a", "0001_b"]);
    let runs = 0;
    let received: PendingMigration[] = [];
    const r = await applyMigrations({
      migrationsDir: dir,
      query: database({ applied: "no-table", schema: false }),
      run: async (pending) => {
        runs++;
        received = pending;
      },
    });
    expect(r.action).toBe("apply");
    expect(runs).toBe(1);
    expect(received.map((m) => m.tag)).toEqual(["0000_a", "0001_b"]);
    expect(received[0]!.statements).toEqual([
      "-- 0000_a\nSELECT 1;",
      "SELECT 2;",
    ]);
    expect(received[0]!.hash).toBe(hashMigration(sqlFor("0000_a")));
    // Recorded under the journal's `when`, as drizzle would.
    expect(received.map((m) => m.createdAt)).toEqual([1000, 999]);
    expect(applyExitCode(r)).toBe(0);
    expect(formatApplyResult(r)).toContain("Applied 2 migration(s)");
  });

  it("does not run the migrator on a push-provisioned database", async () => {
    chain(["0000_a", "0001_b"]);
    let runs = 0;
    const r = await applyMigrations({
      migrationsDir: dir,
      query: database({ applied: "no-table", schema: true }),
      run: async () => {
        runs++;
      },
    });
    expect(r.action).toBe("refuse");
    expect(runs).toBe(0);
    expect(applyExitCode(r)).toBe(1);
    expect(formatApplyResult(r)).toContain("README");
  });

  it("applies only what is pending, by hash, regardless of journal timestamps", async () => {
    chain(["0000_a", "0001_b", "0002_c"]);
    let received: PendingMigration[] = [];
    const r = await applyMigrations({
      migrationsDir: dir,
      query: database({ applied: 2, schema: true }),
      run: async (pending) => {
        received = pending;
      },
    });
    expect(r.action).toBe("apply");
    // 0002_c's `when` (998) is below the applied rows' — drizzle's
    // timestamp rule would skip it; the hash rule does not.
    expect(received.map((m) => m.tag)).toEqual(["0002_c"]);
  });

  it("does not run the migrator when nothing is pending", async () => {
    chain(["0000_a", "0001_b"]);
    let runs = 0;
    const r = await applyMigrations({
      migrationsDir: dir,
      query: database({ applied: 2, schema: true }),
      run: async () => {
        runs++;
      },
    });
    expect(r.action).toBe("noop");
    expect(runs).toBe(0);
    expect(formatApplyResult(r)).toContain("Nothing to apply (2/2");
  });
});

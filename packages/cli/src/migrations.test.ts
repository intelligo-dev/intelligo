/**
 * Migration-chain inspection tests.
 *
 * Every case here is a shape this repository actually produced: a
 * journal frozen 27 files behind the directory, two files sharing a
 * numeric prefix, and — the one that mattered — a chain that "applies
 * cleanly" while skipping most of itself.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { inspectMigrationChain, readMigrationChain } from "./migrations.js";

let dir: string;

function migration(name: string) {
  writeFileSync(path.join(dir, `${name}.sql`), "SELECT 1;");
}

function journal(tags: string[]) {
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: tags.map((tag, idx) => ({
        idx,
        version: "7",
        when: 1_700_000_000_000 + idx,
        tag,
        breakpoints: true,
      })),
    })
  );
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "intelligo-migrations-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("readMigrationChain", () => {
  it("separates registered files from unregistered ones", () => {
    migration("0000_init");
    migration("0001_add_users");
    migration("0002_add_orders");
    journal(["0000_init"]);

    const chain = readMigrationChain(dir);

    expect(chain.files).toHaveLength(3);
    expect(chain.journalTags).toEqual(["0000_init"]);
    expect(chain.unregistered).toEqual(["0001_add_users", "0002_add_orders"]);
    expect(chain.missing).toEqual([]);
  });

  it("reports journal entries whose file is gone", () => {
    migration("0000_init");
    journal(["0000_init", "0001_deleted_by_hand"]);

    expect(readMigrationChain(dir).missing).toEqual(["0001_deleted_by_hand"]);
  });

  it("treats a missing journal as everything being unregistered", () => {
    migration("0000_init");

    const chain = readMigrationChain(dir);

    expect(chain.journalTags).toEqual([]);
    expect(chain.unregistered).toEqual(["0000_init"]);
  });
});

describe("inspectMigrationChain", () => {
  it("passes a chain where every file is registered", () => {
    migration("0000_init");
    migration("0001_add_users");
    journal(["0000_init", "0001_add_users"]);

    expect(inspectMigrationChain(readMigrationChain(dir))).toEqual([]);
  });

  it("errors on unregistered files — migrate would silently skip them", () => {
    migration("0000_init");
    migration("0001_add_users");
    journal(["0000_init"]);

    const problems = inspectMigrationChain(readMigrationChain(dir));

    expect(problems).toHaveLength(1);
    expect(problems[0]!.level).toBe("error");
    expect(problems[0]!.message).toContain("skips them");
  });

  it("errors when the journal points at a file that is gone", () => {
    migration("0000_init");
    journal(["0000_init", "0001_gone"]);

    const problems = inspectMigrationChain(readMigrationChain(dir));

    expect(problems.some((p) => p.level === "error")).toBe(true);
    expect(problems[0]!.message).toContain("not on disk");
  });

  it("warns on duplicate prefixes — apply order becomes filename-dependent", () => {
    migration("0000_init");
    migration("0001_first");
    migration("0001_second");
    journal(["0000_init", "0001_first", "0001_second"]);

    const problems = inspectMigrationChain(readMigrationChain(dir));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ level: "warn" });
    expect(problems[0]!.message).toContain("0001");
  });

  it("warns on a numbering gap", () => {
    migration("0000_init");
    migration("0003_later");
    journal(["0000_init", "0003_later"]);

    const problems = inspectMigrationChain(readMigrationChain(dir));

    expect(problems[0]!.message).toContain("0000 → 0003");
  });

  it("errors on an empty directory rather than reporting success", () => {
    const problems = inspectMigrationChain(readMigrationChain(dir));

    expect(problems).toHaveLength(1);
    expect(problems[0]!.level).toBe("error");
  });
});

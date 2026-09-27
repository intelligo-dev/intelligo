/**
 * A deploy gate that runs `migrate --check` must fail while one of the
 * app's own migrations is pending, not only the framework's.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  appChainCheck,
  appChainExitCode,
  formatAppChainCheck,
} from "./app-chain-check.js";
import { hashMigration } from "./migrate-check.js";

let app: string;

function chain(tags: string[]) {
  const dir = path.join(app, "drizzle");
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  for (const t of tags) {
    writeFileSync(path.join(dir, `${t}.sql`), `CREATE TABLE ${t} ();`);
  }
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

const recorded =
  (...tags: string[]) =>
  async () =>
    tags.map((t) => ({ hash: hashMigration(`CREATE TABLE ${t} ();`) }));

beforeEach(() => {
  app = mkdtempSync(path.join(tmpdir(), "intelligo-app-chain-"));
});
afterEach(() => rmSync(app, { recursive: true, force: true }));

describe("appChainCheck", () => {
  it("says nothing about an app that owns no chain", async () => {
    const r = await appChainCheck(app, recorded());

    expect(r).toBeNull();
    expect(appChainExitCode(r)).toBe(0);
  });

  it("is up to date with the scaffold's empty journal", async () => {
    chain([]);

    const r = await appChainCheck(app, async () => {
      throw new Error('relation "drizzle.__app_migrations" does not exist');
    });

    expect(r).toMatchObject({ chain: [], pending: [] });
    expect(appChainExitCode(r)).toBe(0);
  });

  it("fails on a migration drizzle-kit has not recorded", async () => {
    chain(["0000_notes", "0001_tags"]);

    const r = await appChainCheck(app, recorded("0000_notes"));

    expect(r).toMatchObject({
      applied: ["0000_notes"],
      pending: ["0001_tags"],
    });
    expect(appChainExitCode(r)).toBe(1);
    expect(formatAppChainCheck(r!)).toMatch(
      /1 app migration\(s\) pending: 0001_tags/
    );
  });

  it("counts every migration pending before the first db:migrate", async () => {
    chain(["0000_notes"]);

    const r = await appChainCheck(app, async () => {
      throw new Error('relation "drizzle.__app_migrations" does not exist');
    });

    expect(r!.pending).toEqual(["0000_notes"]);
    expect(appChainExitCode(r)).toBe(1);
  });

  it("fails on a recorded migration this checkout does not contain", async () => {
    chain(["0000_notes"]);

    const r = await appChainCheck(app, recorded("0000_notes", "0001_gone"));

    expect(r!.unknown).toHaveLength(1);
    expect(appChainExitCode(r)).toBe(1);
    expect(formatAppChainCheck(r!)).toMatch(/App database is ahead/);
  });

  it("reads drizzle-kit's table, not the framework's", async () => {
    chain(["0000_notes"]);
    const queries: string[] = [];

    await appChainCheck(app, async (sql) => {
      queries.push(sql);
      return [];
    });

    expect(queries).toEqual(["SELECT hash FROM drizzle.__app_migrations"]);
  });
});

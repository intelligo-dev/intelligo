import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { databaseChecks, declaredCurrency } from "./doctor-database.js";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function app(currency?: string): string {
  dir = mkdtempSync(path.join(tmpdir(), "doctor-db-"));
  if (currency) {
    mkdirSync(path.join(dir, "lib"));
    writeFileSync(
      path.join(dir, "lib", "billing-config.ts"),
      `export const CURRENCY = "${currency}";\n`
    );
  }
  return dir;
}

/** Answers each query by the first rule whose pattern it matches. */
function database(rules: Array<[RegExp, Array<Record<string, unknown>>]>) {
  return async (sql: string) =>
    rules.find(([pattern]) => pattern.test(sql))?.[1] ?? [];
}

describe("databaseChecks", () => {
  it("reports a server without pgvector", async () => {
    const results = await databaseChecks({
      appRoot: app(),
      migrationsDir: null,
      query: database([]),
    });
    expect(results).toEqual([
      expect.objectContaining({
        name: "database",
        status: "error",
        detail: expect.stringContaining("pgvector"),
      }),
    ]);
  });

  it("reports a billing row in another currency than the code formats", async () => {
    const results = await databaseChecks({
      appRoot: app("MNT"),
      migrationsDir: null,
      query: database([
        [/pg_available_extensions/, [{ installed_version: "0.8.0" }]],
        [/billing_settings/, [{ currency: "usd" }]],
      ]),
    });
    expect(results).toEqual([
      expect.objectContaining({
        status: "warn",
        detail: expect.stringContaining(
          "USD but lib/billing-config.ts formats MNT"
        ),
      }),
    ]);
  });

  it("finds nothing to report on an agreeing database", async () => {
    const results = await databaseChecks({
      appRoot: app("MNT"),
      migrationsDir: null,
      query: database([
        [/pg_available_extensions/, [{ installed_version: null }]],
        [/billing_settings/, [{ currency: "MNT" }]],
      ]),
    });
    expect(results).toEqual([]);
  });
});

describe("declaredCurrency", () => {
  it("reads a literal CURRENCY and nothing else", () => {
    expect(declaredCurrency(app("mnt"))).toBe("MNT");
    expect(declaredCurrency(app())).toBeNull();
  });
});

/**
 * The framework's migrations describe schema, never a deployment.
 *
 * Before 1.0 the chain seeded rows every consumer inherited: one
 * product's document types, and a billing row in that product's
 * currency at its exchange rate, which `ensureBillingSettingsRow` then
 * refused to overwrite — so every deployment billed in tugrik until
 * someone noticed. The chain is now one baseline; these rules keep it
 * from growing the same habits back.
 *
 *   - A migration changes structure. It does not INSERT, UPDATE or
 *     DELETE rows; data a deployment needs comes from its composition
 *     root (`ensureBillingSettingsRow`, plan registration).
 *   - A schema default never names a currency but the neutral one, and
 *     never an exchange rate: what a deployment bills in is its own
 *     configuration.
 *   - The pre-1.0 chain ships as hashes only (`legacy-chain.json`), so
 *     `intelligo migrate` can adopt a database that ran it without the
 *     old SQL being part of the package.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ROOT } from "./tree";

const MIGRATIONS = path.join(ROOT, "packages/core/src/db/migrations");
const SCHEMA_FILES = [
  ...readdirSync(path.join(ROOT, "packages/core/src/db/schema")).map((f) =>
    path.join(ROOT, "packages/core/src/db/schema", f)
  ),
  path.join(ROOT, "packages/audit/src/db/schema.ts"),
  path.join(ROOT, "packages/executions/src/db/schema.ts"),
  path.join(ROOT, "packages/jobs/src/db/schema.ts"),
].filter((f) => f.endsWith(".ts"));

const sqlFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));

/** SQL with comments stripped, so prose about rows is not a row. */
function statements(file: string): string {
  return readFileSync(path.join(MIGRATIONS, file), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("the framework's migrations describe schema, not a deployment", () => {
  it.each(sqlFiles)("%s writes no rows", (file) => {
    const writes = statements(file).match(
      /^\s*(INSERT\s+INTO|UPDATE\s+"?\w+"?\s+SET|DELETE\s+FROM)\b[^\n]*/gim
    );
    expect(
      writes ?? [],
      "a migration seeds or edits rows every consumer inherits — put the data in the composition root"
    ).toEqual([]);
  });

  it("no schema default names a deployment's currency or exchange rate", () => {
    const offending: string[] = [];
    for (const file of SCHEMA_FILES) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /currency"\)[^\n]*\.default\("(\w+)"\)/g
      )) {
        if (match[1] !== "USD")
          offending.push(`${path.relative(ROOT, file)}: ${match[0]}`);
      }
      for (const match of source.matchAll(
        /usd_rate_micros"[^;]*?\.default\((\d[\d_]*)\)/gs
      )) {
        const value = Number(match[1]!.replace(/_/g, ""));
        if (value !== 0 && value !== 1_000_000)
          offending.push(
            `${path.relative(ROOT, file)}: usd_rate_micros default ${match[1]}`
          );
      }
    }
    expect(offending).toEqual([]);
  });

  it("ships the pre-1.0 chain as hashes, not SQL", () => {
    const legacyPath = path.join(MIGRATIONS, "legacy-chain.json");
    expect(existsSync(legacyPath)).toBe(true);
    const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as {
      entries: Array<{ tag: string; hash: string }>;
    };
    expect(legacy.entries.length).toBeGreaterThan(0);
    for (const entry of legacy.entries) {
      expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(path.join(MIGRATIONS, `${entry.tag}.sql`))).toBe(false);
    }
  });
});

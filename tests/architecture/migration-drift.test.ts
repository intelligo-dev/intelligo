/**
 * Every column the Drizzle schema declares is created by some migration.
 *
 * `db:push` builds tables straight from schema.ts, so a column added to
 * the schema without a migration is invisible in every environment
 * provisioned that way — and fatal in the first one built from the
 * chain.
 *
 * The check is textual on purpose — it needs no database and runs with
 * the rest of the architecture suite. It matches a column's SQL name
 * (explicit `text("col")` or the snake_case of the property, since the
 * drizzle config sets `casing: "snake_case"`) anywhere in the migration
 * files, quoted or bare. That is deliberately loose: a name that exists
 * on another table masks a missing one here, so this catches the
 * common failure (a brand-new column) and not every renaming. The
 * database-backed replay in CI covers the rest.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "packages/core/src/db/migrations");

/** Every schema file the core drizzle config scans (packages/core/drizzle.config.ts). */
const SCHEMA_DIRS = [
  "packages/core/src/db/schema",
  "packages/audit/src/db",
  "packages/executions/src/db",
  "packages/jobs/src/db",
];

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

function schemaFiles(): string[] {
  return SCHEMA_DIRS.flatMap((dir) => {
    const abs = path.join(ROOT, dir);
    return readdirSync(abs)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => path.join(abs, f));
  });
}

type Column = { table: string; column: string; file: string };

function declaredColumns(): Column[] {
  const out: Column[] = [];
  for (const file of schemaFiles()) {
    const src = readFileSync(file, "utf8");
    const tableRe =
      /pgTable\(\s*"([a-z_0-9]+)"\s*,\s*\{([\s\S]*?)\n\s*\}\s*[,)]/g;
    let t: RegExpExecArray | null;
    while ((t = tableRe.exec(src))) {
      const [, table, body] = t;
      const colRe = /^\s+([a-zA-Z0-9]+):\s*[a-zA-Z]+\((?:"([a-z_0-9]+)")?/gm;
      let c: RegExpExecArray | null;
      while ((c = colRe.exec(body!))) {
        out.push({
          table: table!,
          column: c[2] ?? snake(c[1]!),
          file: path.relative(ROOT, file),
        });
      }
    }
  }
  return out;
}

describe("migration drift", () => {
  const migrations = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
  const columns = declaredColumns();
  const mentions = (name: string) =>
    new RegExp(`(^|[^a-z_0-9])"?${name}"?([^a-z_0-9]|$)`, "m").test(migrations);

  it("finds the schema", () => {
    expect(columns.length).toBeGreaterThan(100);
    expect(new Set(columns.map((c) => c.table)).size).toBeGreaterThan(20);
  });

  it("every table the schema declares is created by a migration", () => {
    const tables = [...new Set(columns.map((c) => c.table))];
    expect(tables.filter((t) => !mentions(t))).toEqual([]);
  });

  it("every column the schema declares is created by a migration", () => {
    const missing = columns
      .filter((c) => !mentions(c.column))
      .map((c) => `${c.table}.${c.column} (${c.file})`);
    expect(
      missing,
      `columns with no migration — a database built from the chain will not have them:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });
});

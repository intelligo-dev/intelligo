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
import ts from "typescript";

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

/** The call a column's builder chain starts from: `text("x")` in `text("x").notNull().references(…)`. */
function chainRoot(node: ts.Expression): ts.CallExpression | undefined {
  let e: ts.Expression = node;
  while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression))
    e = e.expression.expression;
  return ts.isCallExpression(e) && ts.isIdentifier(e.expression)
    ? e
    : undefined;
}

type Table = { table: string; file: string; keys: number; columns: Column[] };

/**
 * Every `pgTable("name", { … })` in the schema, parsed with the compiler
 * so a nested object or a multi-line `.references()` cannot end a table
 * early: `keys` is the object's top-level property count, which each
 * table's columns must account for.
 */
function declaredTables(): Table[] {
  const out: Table[] = [];
  for (const file of schemaFiles()) {
    const rel = path.relative(ROOT, file);
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "pgTable"
      ) {
        const [name, shape] = node.arguments;
        if (
          name &&
          ts.isStringLiteral(name) &&
          shape &&
          ts.isObjectLiteralExpression(shape)
        ) {
          const columns: Column[] = [];
          for (const prop of shape.properties) {
            if (!ts.isPropertyAssignment(prop)) continue;
            const root = chainRoot(prop.initializer);
            if (!root) continue;
            const explicit = root.arguments[0];
            columns.push({
              table: name.text,
              column:
                explicit && ts.isStringLiteral(explicit)
                  ? explicit.text
                  : snake(prop.name.getText(sf)),
              file: rel,
            });
          }
          out.push({
            table: name.text,
            file: rel,
            keys: shape.properties.length,
            columns,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

describe("migration drift", () => {
  const migrations = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
  const tables = declaredTables();
  const columns = tables.flatMap((t) => t.columns);
  const mentions = (name: string) =>
    new RegExp(`(^|[^a-z_0-9])"?${name}"?([^a-z_0-9]|$)`, "m").test(migrations);

  it("finds the schema", () => {
    expect(columns.length).toBeGreaterThan(100);
    expect(new Set(columns.map((c) => c.table)).size).toBeGreaterThan(20);
  });

  it("reads every column of every table", () => {
    const short = tables
      .filter((t) => t.columns.length !== t.keys)
      .map((t) => `${t.table}: ${t.columns.length} of ${t.keys} (${t.file})`);
    expect(short).toEqual([]);
  });

  it("every table the schema declares is created by a migration", () => {
    const names = tables.map((t) => t.table);
    expect(names.filter((t) => !mentions(t))).toEqual([]);
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

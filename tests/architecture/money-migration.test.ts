/**
 * Money says what it is of (ADR-0015), and migration 0045 is what made
 * that true of the database as well as the types.
 *
 * Two rules, because the old shape can come back two ways. A column
 * named for a currency — `charged_mnt`, `balance_mnt` — holds an amount
 * whose unit lives in its name, which is how one Gemini Flash turn came
 * to read as "$15" on the usage page and a $5 credit pack came to grant
 * 100,000 units of nothing in particular. An identifier named the same
 * way carries the habit into the API.
 *
 * `migration-drift.test.ts` cannot catch either: it asks whether every
 * declared column is *mentioned* in some migration, and a leftover
 * `chargedMnt` field is mentioned by 0045's own `DROP COLUMN` line. So
 * these are separate rules rather than an extension of that one.
 *
 * Scope is the published packages' source. `packages/registry` is
 * consumer-owned source a product edits, and the apps are generated
 * from it; both are covered by the reference-app drift check instead.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

/** Every schema file the core drizzle config scans. */
const SCHEMA_DIRS = [
  "packages/core/src/db/schema",
  "packages/audit/src/db",
  "packages/executions/src/db",
  "packages/jobs/src/db",
];

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

/**
 * Columns 0044 replaced. Each held an amount with no currency beside
 * it, or a conversion rate the deployment never named.
 */
const SUPERSEDED = new Set([
  "usd_to_mnt_rate",
  "margin_multiplier_bp",
  "margin_multiplier",
  "fx_rate",
]);

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

/** Source files of the published packages, tests excluded. */
function packageSources(): string[] {
  const out: string[] = [];
  const packages = path.join(ROOT, "packages");
  for (const pkg of readdirSync(packages)) {
    if (pkg === "registry") continue; // consumer-owned source
    const src = path.join(packages, pkg, "src");
    try {
      if (!statSync(src).isDirectory()) continue;
    } catch {
      continue;
    }
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "node_modules") walk(full);
        } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          out.push(full);
        }
      }
    };
    walk(src);
  }
  return out;
}

/**
 * Comments stripped: `core/money.ts` explains the names it replaced,
 * and a rule that cannot tell documentation from code would forbid
 * writing down why the rule exists.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("money is denominated, not named after a currency (ADR-0015)", () => {
  it("scans a schema and a package tree", () => {
    expect(declaredColumns().length).toBeGreaterThan(100);
    expect(packageSources().length).toBeGreaterThan(50);
  });

  it("declares no column named for a currency, and none 0044 superseded", () => {
    const offenders = declaredColumns()
      .filter((c) => /_mnt$/.test(c.column) || SUPERSEDED.has(c.column))
      .map((c) => `${c.file}: ${c.table}.${c.column}`);

    expect(
      offenders,
      "migration 0045 dropped these columns; a schema field that outlives " +
        "its column is invisible to migration-drift, which matches the " +
        "DROP statement itself"
    ).toEqual([]);
  });

  it("exports no identifier denominated in a currency name", () => {
    // `chargedMnt`, `balanceMnt`, `hasActiveTrialMnt` — a lower-cased
    // prefix before `Mnt`, which leaves the ISO code `MNT` and
    // `SHIPPED_MNT_RATE_MICROS` alone.
    const offenders: string[] = [];
    for (const file of packageSources()) {
      const source = withoutComments(readFileSync(file, "utf8"));
      const found = new Set(source.match(/\b[a-z][A-Za-z0-9]*Mnt\b/g) ?? []);
      for (const name of found) {
        offenders.push(`${path.relative(ROOT, file)}: ${name}`);
      }
    }

    expect(
      offenders,
      "an amount carries its currency (`Money` from @intelligo-dev/core/money); " +
        "a name ending in the currency is the shape ADR-0015 replaced"
    ).toEqual([]);
  });
});

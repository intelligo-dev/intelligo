#!/usr/bin/env node
/**
 * intelligo <command>
 *
 * The shebang targets node because that is what runs the *published*
 * binary from dist/. In this workspace the source is run with
 * `pnpm exec tsx packages/cli/src/bin.ts`.
 *
 * Deliberately tiny: the commands are library functions, and this file
 * only maps argv onto them, opens a database connection when one is
 * needed, and picks an exit code.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addFeature,
  formatAddResult,
  addExitCode,
  readCatalogue,
} from "./commands/add.js";
import { exitCodeFor, formatResults, runChecks } from "./commands/doctor.js";
import {
  formatMigrateCheck,
  formatMigrateCheckJson,
  migrateCheck,
  migrateCheckExitCode,
} from "./commands/migrate-check.js";
import {
  MIGRATIONS_TABLE_SQL,
  SCHEMA_PROBE_SQL,
  applyExitCode,
  applyMigrations,
  formatApplyResult,
} from "./commands/migrate.js";
import {
  formatSyncReport,
  installedFrameworkVersion,
  selectItems,
  syncApply,
  syncCheck,
  syncCheckExitCode,
  type SyncContext,
} from "./commands/sync.js";
import {
  formatUpgradeReport,
  upgradeCheck,
  upgradeCheckExitCode,
} from "./commands/upgrade-check.js";

import { itemNames, unknownFlags, wantsHelp } from "./args.js";
import { loadAppEnv } from "./env-files.js";
import { workspaceRootVariable } from "./commands/create.js";
import { resolveRegistryDir } from "./registry-bundle.js";
import { findWorkspaceRoot, readRegistryCatalogue } from "./registry-items.js";
import { MIGRATION_LOCATIONS, resolveMigrationsDir } from "./migrations-dir.js";

/**
 * Templates ship with the CLI package.
 *
 * `fileURLToPath`, not `new URL(...).pathname`: on Windows the latter
 * yields `/C:/Users/...`, which every path operation after it treats as
 * a root-relative path that does not exist. The CLI is the first thing
 * a new user runs, so it is the worst place to be silently
 * platform-specific.
 */
const TEMPLATES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates"
);

/**
 * Recorded in the manifest so an upgrade knows what wrote a file, and
 * emitted as the dependency range of a scaffolded app. Read from this
 * package's own manifest so a release cannot ship with a stale literal
 * — `../package.json` resolves from src/ and from dist/ alike.
 */
const FRAMEWORK_VERSION: string = createRequire(import.meta.url)(
  "../package.json"
).version;

function usage(): string {
  return [
    "intelligo <command>",
    "",
    "  create [dir]      Scaffold an app, then install the registry pages you pick",
    "                    (--items a,b | --all, --yes, --no-install, --name <name>)",
    "  doctor            Report configuration and migration-chain problems",
    "  migrate           Apply the framework's migration chain to DATABASE_URL",
    "  migrate --check   Compare the framework's migrations to a database",
    "                    (--json: one object whose `state` is up_to_date | pending |",
    "                    fresh | ahead | unmanaged | legacy)",
    "  add <feature>     Generate consumer-owned source (--force to overwrite)",
    "  upgrade --check   Show what a template upgrade would change",
    "  sync [items…]     Install registry pages from this release's registry",
    "                    (names space- or comma-separated),",
    "                    keeping seams and merging messages (--force replaces",
    "                    hand-edited files; --check only reports, exit 1 on drift)",
    "",
  ].join("\n");
}

async function runMigrate(
  mode: "check" | "apply",
  json = false
): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      `DATABASE_URL is required for \`migrate${mode === "check" ? " --check" : ""}\`.`
    );
    return 1;
  }

  const migrationsDir = resolveMigrationsDir(process.cwd());
  if (!migrationsDir) {
    console.error(
      `No migrations directory (looked in ${MIGRATION_LOCATIONS.join(", ")}) — run from the workspace root, with @intelligo-dev/core installed.`
    );
    return 1;
  }

  // Imported lazily so `doctor` — the command you reach for when the
  // app will not start — never needs a database driver to load.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (mode === "check") {
      const result = await migrateCheck(
        migrationsDir,
        async (sql) => (await client.query<{ hash: string }>(sql)).rows
      );
      const probe = await client.query<{ rel: string | null }>(
        SCHEMA_PROBE_SQL
      );
      const schemaExists = probe.rows[0]?.rel != null;
      console.log(
        json
          ? formatMigrateCheckJson(result, schemaExists)
          : formatMigrateCheck(result, schemaExists)
      );
      return migrateCheckExitCode(result);
    }

    // Applied here rather than by drizzle's migrator: the pending set is
    // chosen by content hash — what `migrate --check` compares — and
    // recorded in drizzle's own table, in one transaction, so a failure
    // part-way leaves neither statements nor records behind.
    const result = await applyMigrations({
      migrationsDir,
      query: async (sql) => (await client.query(sql)).rows,
      run: async (pending) => {
        await client.query("BEGIN");
        try {
          for (const ddl of MIGRATIONS_TABLE_SQL) await client.query(ddl);
          for (const migration of pending) {
            for (const statement of migration.statements) {
              await client.query(statement);
            }
            await client.query(
              `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
              [migration.hash, migration.createdAt]
            );
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      },
    });
    console.log(formatApplyResult(result));
    return applyExitCode(result);
  } finally {
    await client.end();
  }
}

function flagsOk(
  command: string,
  args: readonly string[],
  allowed: readonly string[]
): boolean {
  const unknown = unknownFlags(args, allowed);
  if (unknown.length === 0) return true;
  console.error(
    `intelligo ${command}: unknown argument ${unknown.join(" ")}` +
      (allowed.length ? ` (it takes ${allowed.join(", ")}).` : ".")
  );
  return false;
}

function runAdd(rest: readonly string[]): number {
  if (!flagsOk("add", rest, ["--force"])) return 2;
  const feature = rest.find((a) => !a.startsWith("--"));
  if (!feature) {
    const catalogue = readCatalogue(TEMPLATES_DIR);
    console.error("Usage: intelligo add <feature>\n");
    for (const [name, spec] of Object.entries(catalogue)) {
      console.error(`  ${name.padEnd(16)} ${spec.description}`);
    }
    return 1;
  }
  if (feature === "pnpm-standalone" && findWorkspaceRoot(process.cwd())) {
    console.error(
      "intelligo add pnpm-standalone: this app is a member of a pnpm workspace, and a " +
        "workspace file of its own would take it out; the workspace root's settings apply."
    );
    return 1;
  }
  const result = addFeature(feature, {
    appRoot: process.cwd(),
    templatesDir: TEMPLATES_DIR,
    frameworkVersion: FRAMEWORK_VERSION,
    force: rest.includes("--force"),
    // Computed, not recorded: an app made before the variable existed
    // has no value for it.
    variables:
      feature === "app-scaffold"
        ? workspaceRootVariable(process.cwd())
        : undefined,
  });
  console.log(formatAddResult(result));
  return addExitCode(result);
}

async function main(): Promise<number> {
  const [, , command = "help", ...rest] = process.argv;

  if (wantsHelp(rest)) {
    console.log(usage());
    return 0;
  }

  // The commands that read the app's configuration see what the app
  // itself would: its .env.local and .env, then the pnpm workspace
  // root's, under anything the shell set.
  if (command === "doctor" || command === "migrate" || command === "upgrade") {
    loadAppEnv(process.cwd());
  }

  switch (command) {
    case "doctor": {
      if (!flagsOk("doctor", rest, [])) return 2;
      const results = runChecks();
      console.log(formatResults(results));
      return exitCodeFor(results);
    }
    case "migrate": {
      // Applying is the default, so a mistyped flag (`--dry-run`,
      // `--chek`) must not fall through to it.
      const unknown = rest.filter(
        (arg) => arg !== "--check" && arg !== "--json"
      );
      if (unknown.length > 0) {
        console.error(
          `intelligo migrate: unknown argument ${unknown.join(" ")}. ` +
            "Use `intelligo migrate` to apply, `--check` to only report, " +
            "and `--json` with `--check` for a machine-readable answer."
        );
        return 2;
      }
      return runMigrate(
        rest.includes("--check") ? "check" : "apply",
        rest.includes("--json")
      );
    }
    case "create": {
      // Imported lazily so the prompts library loads only for the one
      // command that converses.
      const { parseCreateFlags, runCreate } =
        await import("./commands/create-flow.js");
      const flags = parseCreateFlags(rest);
      if (flags.unknown.length > 0) {
        console.error(
          `intelligo create: unknown argument ${flags.unknown.join(" ")}.\n`
        );
        console.error(usage());
        return 2;
      }
      return runCreate(flags, {
        templatesDir: TEMPLATES_DIR,
        frameworkVersion: FRAMEWORK_VERSION,
        interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });
    }
    case "add":
      return runAdd(rest);
    case "upgrade": {
      if (!flagsOk("upgrade", rest, ["--check"])) return 2;
      if (!rest.includes("--check")) {
        console.error("Only `upgrade --check` is implemented.");
        console.error(
          "Applying an upgrade means re-running `intelligo add` for the " +
            "features it reports as outdated — deliberately your call, " +
            "since the files are yours."
        );
        return 1;
      }
      const report = upgradeCheck({
        appRoot: process.cwd(),
        templatesDir: TEMPLATES_DIR,
      });
      console.log(formatUpgradeReport(report));
      return upgradeCheckExitCode(report);
    }
    case "sync": {
      if (!flagsOk("sync", rest, ["--check", "--force"])) return 2;
      const registryDir = resolveRegistryDir(TEMPLATES_DIR);
      if (!registryDir) {
        console.error(
          "This CLI has no bundled registry — in the framework repository, run `pnpm registry:build` first."
        );
        return 1;
      }
      const context: SyncContext = {
        appRoot: process.cwd(),
        registryDir,
        requires: readRegistryCatalogue(TEMPLATES_DIR).requires,
        frameworkVersion: FRAMEWORK_VERSION,
      };
      const installed = installedFrameworkVersion(context.appRoot);
      if (installed && installed !== FRAMEWORK_VERSION) {
        console.error(
          `! @intelligo-dev/core is ${installed} but this CLI carries the ${FRAMEWORK_VERSION} registry — ` +
            "run the CLI of the same version (`pnpm exec intelligo`), or pages and packages will disagree."
        );
      }
      const selection = selectItems(itemNames(rest), context);
      if (!selection.ok) {
        console.error(selection.message);
        return 1;
      }
      if (rest.includes("--check")) {
        const report = syncCheck(selection.items, context);
        console.log(formatSyncReport(report));
        return syncCheckExitCode(report);
      }
      return syncApply(selection.items, context, {
        force: rest.includes("--force"),
      });
    }
    case "help":
    case "--help":
    case "-h":
      console.log(usage());
      return 0;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(usage());
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
);

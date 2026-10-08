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
import {
  appChainCheck,
  appChainExitCode,
  formatAppChainCheck,
} from "./commands/app-chain-check.js";
import {
  formatGrantResult,
  formatRevokeResult,
  grantExitCode,
  grantPlatformAdmin,
  revokeExitCode,
  revokePlatformAdmin,
} from "./commands/admin.js";
import { exitCodeFor, formatResults, runChecks } from "./commands/doctor.js";
import { runDatabaseChecks } from "./commands/doctor-database.js";
import {
  formatMigrateCheck,
  formatMigrateCheckJson,
  migrateCheck,
  migrateCheckExitCode,
} from "./commands/migrate-check.js";
import {
  SCHEMA_PROBE_SQL,
  applyExitCode,
  formatApplyResult,
  migrateDatabase,
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
  formatRemoveResult,
  removeItem,
  syncDiff,
} from "./commands/sync-maintenance.js";
import {
  formatUpgradeReport,
  upgradeAccept,
  upgradeCheck,
  upgradeCheckExitCode,
  upgradeDiff,
} from "./commands/upgrade-check.js";

import { itemNames, unknownFlags, wantsHelp } from "./args.js";
import { commandUsage, usage } from "./usage.js";
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
      const hashes = async (sql: string) =>
        (await client.query<{ hash: string }>(sql)).rows;
      const result = await migrateCheck(migrationsDir, hashes);
      const app = await appChainCheck(process.cwd(), hashes);
      const probe = await client.query<{ rel: string | null }>(
        SCHEMA_PROBE_SQL
      );
      const schemaExists = probe.rows[0]?.rel != null;
      if (json) {
        console.log(formatMigrateCheckJson(result, schemaExists, app));
      } else {
        console.log(formatMigrateCheck(result, schemaExists));
        if (app) console.log(formatAppChainCheck(app));
      }
      return Math.max(migrateCheckExitCode(result), appChainExitCode(app));
    }

    // Applied here rather than by drizzle's migrator: the pending set is
    // chosen by content hash — what `migrate --check` compares — and
    // recorded in drizzle's own table.
    const result = await migrateDatabase(client, migrationsDir);
    console.log(formatApplyResult(result));
    return applyExitCode(result);
  } finally {
    await client.end();
  }
}

async function runAdmin(rest: readonly string[]): Promise<number> {
  if (!flagsOk("admin", rest, ["--force"])) return 2;
  const [action, email, ...extra] = rest.filter((a) => !a.startsWith("--"));
  if (
    (action !== "grant" && action !== "revoke") ||
    !email ||
    extra.length > 0
  ) {
    console.error("Usage: intelligo admin grant|revoke <email> [--force]");
    return 2;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`DATABASE_URL is required for \`admin ${action}\`.`);
    return 1;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const query = async (sql: string, params?: unknown[]) =>
      (await client.query(sql, params)).rows;
    const options = {
      production: process.env.NODE_ENV === "production",
      force: rest.includes("--force"),
    };
    if (action === "revoke") {
      const result = await revokePlatformAdmin(email, query, {
        ...options,
        allowlist: process.env.PLATFORM_ADMIN_EMAILS,
      });
      console.log(formatRevokeResult(result));
      return revokeExitCode(result);
    }
    const result = await grantPlatformAdmin(email, query, options);
    console.log(formatGrantResult(result));
    return grantExitCode(result);
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
      // A retired feature stays addable for apps that have it, unlisted.
      if (spec.deprecated) continue;
      console.error(`  ${name.padEnd(16)} ${spec.description}`);
    }
    return 2;
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

async function runDoctor(rest: readonly string[]): Promise<number> {
  if (!flagsOk("doctor", rest, ["--json", "--offline"])) return 2;
  const results = runChecks();
  const url = process.env.DATABASE_URL;
  if (url && !rest.includes("--offline")) {
    results.push(
      ...(await runDatabaseChecks(
        url,
        process.cwd(),
        resolveMigrationsDir(process.cwd())
      ))
    );
  }
  console.log(
    rest.includes("--json")
      ? JSON.stringify({ ok: exitCodeFor(results) === 0, results }, null, 2)
      : formatResults(results)
  );
  return exitCodeFor(results);
}

async function runUpgrade(rest: readonly string[]): Promise<number> {
  if (!flagsOk("upgrade", rest, ["--check", "--json", "--diff", "--accept"])) {
    return 2;
  }
  const target = rest.find((a) => !a.startsWith("--"));
  const upgradeOptions = {
    appRoot: process.cwd(),
    templatesDir: TEMPLATES_DIR,
  };
  if (rest.includes("--diff") || rest.includes("--accept")) {
    if (!target) {
      console.error("Usage: intelligo upgrade --diff|--accept <path>");
      return 2;
    }
    if (rest.includes("--accept")) {
      const accepted = upgradeAccept(upgradeOptions, target);
      console.log(
        accepted === "accepted"
          ? `✓ ${target} is yours; the current template is recorded as seen.`
          : `✗ No generated file at ${target} in intelligo.manifest.json.`
      );
      return accepted === "accepted" ? 0 : 1;
    }
    const diff = upgradeDiff(upgradeOptions, target);
    if (diff === null) {
      console.error(
        `No generated file at ${target} in intelligo.manifest.json.`
      );
      return 1;
    }
    console.log(diff);
    return 0;
  }
  if (!rest.includes("--check")) {
    console.error("Only `upgrade --check` is implemented.");
    console.error(
      "Applying an upgrade means re-running `intelligo add` for the " +
        "features it reports as outdated — deliberately your call, " +
        "since the files are yours."
    );
    return 1;
  }
  const report = upgradeCheck(upgradeOptions);
  console.log(
    rest.includes("--json")
      ? JSON.stringify(report, null, 2)
      : formatUpgradeReport(report)
  );
  return upgradeCheckExitCode(report);
}

async function runSync(rest: readonly string[]): Promise<number> {
  if (!flagsOk("sync", rest, ["--check", "--force", "--json", "--diff"])) {
    return 2;
  }
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
      `${rest.includes("--force") ? "!" : "✗"} @intelligo-dev/core is ${installed} but this CLI carries the ${FRAMEWORK_VERSION} registry — ` +
        "run the CLI of the same version (`pnpm exec intelligo`), or pages and packages will disagree."
    );
    // Checking reports drift either way; installing pages for
    // another version of the packages needs --force.
    if (!rest.includes("--force") && !rest.includes("--check")) return 1;
  }
  if (rest.includes("--diff")) {
    const target = itemNames(rest)[0];
    const all = selectItems([], context);
    const diff = target && all.ok ? syncDiff(target, all.items, context) : null;
    if (diff === null) {
      console.error(
        "Usage: intelligo sync --diff <path> (a file the registry ships for an installed page)"
      );
      return 2;
    }
    console.log(diff);
    return 0;
  }
  const selection = selectItems(itemNames(rest), context);
  if (!selection.ok) {
    console.error(selection.message);
    return 1;
  }
  if (rest.includes("--check")) {
    const report = syncCheck(selection.items, context);
    console.log(
      rest.includes("--json")
        ? JSON.stringify(report, null, 2)
        : formatSyncReport(report)
    );
    return syncCheckExitCode(report);
  }
  return syncApply(selection.items, context, {
    force: rest.includes("--force"),
  });
}

async function runRemove(rest: readonly string[]): Promise<number> {
  if (!flagsOk("remove", rest, [])) return 2;
  const [name, ...extra] = itemNames(rest);
  const registryDir = resolveRegistryDir(TEMPLATES_DIR);
  if (!name || extra.length > 0 || !registryDir) {
    console.error("Usage: intelligo remove <item>");
    return 2;
  }
  const result = removeItem(name, {
    appRoot: process.cwd(),
    registryDir,
    requires: readRegistryCatalogue(TEMPLATES_DIR).requires,
    frameworkVersion: FRAMEWORK_VERSION,
  });
  console.log(formatRemoveResult(name, result));
  return result.status === "removed" ? 0 : 1;
}

async function main(): Promise<number> {
  const [, , command = "help", ...rest] = process.argv;

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(FRAMEWORK_VERSION);
    return 0;
  }
  if (wantsHelp(rest)) {
    console.log(commandUsage(command));
    return 0;
  }

  // The commands that read the app's configuration see what the app
  // itself would: its .env.local and .env, then the pnpm workspace
  // root's, under anything the shell set.
  if (
    command === "doctor" ||
    command === "migrate" ||
    command === "upgrade" ||
    command === "admin"
  ) {
    loadAppEnv(process.cwd());
  }

  switch (command) {
    case "doctor":
      return runDoctor(rest);
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
    case "upgrade":
      return runUpgrade(rest);
    case "sync":
      return runSync(rest);
    case "remove":
      return runRemove(rest);
    case "admin":
      return runAdmin(rest);
    case "help":
    case "--help":
    case "-h":
      console.log(usage());
      return 0;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(usage());
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
);

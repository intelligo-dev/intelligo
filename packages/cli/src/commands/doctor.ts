/**
 * `intelligo doctor` — report the problems that are invisible until
 * they are an incident.
 *
 * The checks here were each chosen because something in this codebase
 * actually went wrong that way, not because they sounded thorough.
 */

import path from "node:path";
import { existsSync } from "node:fs";

import { inspectMigrationChain, readMigrationChain } from "../migrations.js";
import { readManifest } from "../manifest.js";
import {
  MIGRATION_LOCATIONS,
  resolveMigrationsDir,
} from "../migrations-dir.js";

export type CheckResult = {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

export type DoctorOptions = {
  /** Workspace root; defaults to the current working directory. */
  root?: string;
  /** Environment to validate; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
};

/** Variables the app cannot boot without. */
const REQUIRED_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_APP_URL",
];

export function runChecks(options: DoctorOptions = {}): CheckResult[] {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const results: CheckResult[] = [];

  // 1. Migration chain — the journal/disk drift that made the .sql
  //    files documentation rather than a provisioning mechanism.
  const migrationsDir = resolveMigrationsDir(root);
  if (!migrationsDir) {
    results.push({
      name: "migrations",
      status: "warn",
      detail: `No migrations directory (looked in ${MIGRATION_LOCATIONS.join(", ")}) — run from the workspace root, with @intelligo-dev/core installed?`,
    });
  } else {
    const chain = readMigrationChain(migrationsDir);
    const problems = inspectMigrationChain(chain);
    if (problems.length === 0) {
      results.push({
        name: "migrations",
        status: "ok",
        detail: `${chain.files.length} migrations, all registered in the journal`,
      });
    } else {
      for (const p of problems) {
        results.push({
          name: "migrations",
          status: p.level === "error" ? "error" : "warn",
          detail: p.message,
        });
      }
    }
  }

  // 2. Required environment.
  const missing = REQUIRED_ENV.filter((k) => !env[k]);
  results.push(
    missing.length === 0
      ? {
          name: "env",
          status: "ok",
          detail: `${REQUIRED_ENV.length} required variables present`,
        }
      : {
          name: "env",
          status: "error",
          detail: `Missing: ${missing.join(", ")}`,
        }
  );

  // 3. Billing product. The engine has no built-in default since the
  //    Support catalogue moved out; an unset product means every plan
  //    lookup returns nothing and quotas silently read as zero.
  results.push(
    env.INTELLIGO_BILLING_PRODUCT
      ? {
          name: "billing",
          status: "ok",
          detail: `Product: ${env.INTELLIGO_BILLING_PRODUCT}`,
        }
      : {
          name: "billing",
          status: "warn",
          detail:
            "INTELLIGO_BILLING_PRODUCT unset — the composition root must call " +
            "setDefaultProductSlug(), or plan lookups resolve to nothing",
        }
  );

  // 4. Chat route's scaffold contract. The registry's chat item ships
  //    app/api/chat/route.ts, which imports @/lib/intelligo (the
  //    composition root) and expects @/lib/plans to have registered a
  //    plan catalogue — both are scaffold-provided consumer files, not
  //    registry files. Installing chat into a hand-rolled app without
  //    them is a build error that only shows up at `next build`.
  const chatRoute = path.join(root, "app/api/chat/route.ts");
  if (existsSync(chatRoute)) {
    const missingScaffold = ["lib/intelligo.ts", "lib/plans.ts"].filter(
      (rel) => !existsSync(path.join(root, rel))
    );
    results.push(
      missingScaffold.length === 0
        ? {
            name: "chat",
            status: "ok",
            detail: "app/api/chat/route.ts has lib/intelligo.ts + lib/plans.ts",
          }
        : {
            name: "chat",
            status: "error",
            detail:
              `app/api/chat/route.ts needs ${missingScaffold.join(" and ")} — ` +
              "create them from the CLI's app-scaffold templates " +
              "(packages/cli/templates/app-scaffold)",
          }
    );
  }

  // 5. Generated source. A conflict — template and consumer both
  //    moved — is the one state an upgrade cannot resolve on its own.
  const manifest = readManifest(root);
  if (manifest) {
    const features = Object.keys(manifest.features);
    results.push({
      name: "generated",
      status: "ok",
      detail:
        features.length === 0
          ? "manifest present, no features generated"
          : `${features.length} feature(s): ${features.join(", ")} — run \`intelligo upgrade --check\` for detail`,
    });
  }

  return results;
}

export function formatResults(results: CheckResult[]): string {
  const icon = { ok: "✓", warn: "!", error: "✗" } as const;
  return results
    .map((r) => `${icon[r.status]} ${r.name.padEnd(12)} ${r.detail}`)
    .join("\n");
}

/** Process exit code: non-zero when any check errored. */
export function exitCodeFor(results: CheckResult[]): number {
  return results.some((r) => r.status === "error") ? 1 : 0;
}

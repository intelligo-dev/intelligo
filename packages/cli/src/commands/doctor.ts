/**
 * `intelligo doctor` — report the problems that are invisible until
 * they are an incident.
 *
 * The checks here were each chosen because something in this codebase
 * actually went wrong that way, not because they sounded thorough.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

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

type ItemRequires = {
  marker: string;
  items?: string[];
  files?: string[];
  exports?: Record<string, string[]>;
  features?: string[];
};

export type RegistryRequires = {
  scaffold: string[];
  items: Record<string, ItemRequires>;
};

/**
 * The registry's requirements file ships with the CLI (a verified copy
 * of registry/requires.json) so doctor can check an installed app
 * without a registry checkout. `../../templates` resolves from src/
 * and from dist/commands/ alike.
 */
/**
 * Block and line comments removed, so a check cannot be satisfied — or
 * defeated — by prose. The composition root's own doc comment names
 * `registerModels` in several of the templates.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * templates/registry-requires.json is a build-time copy of
 * packages/registry/requires.json (scripts/sync-registry-requires.mjs),
 * committed so that running from source works too.
 */
function bundledRequires(): RegistryRequires | null {
  const file = path.resolve(
    // fileURLToPath, not `.pathname` — see the note in bin.ts.
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "templates",
    "registry-requires.json"
  );
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as RegistryRequires;
}

export type DoctorOptions = {
  /** Workspace root; defaults to the current working directory. */
  root?: string;
  /** Registry requirements; defaults to the copy bundled with the CLI. */
  requires?: RegistryRequires | null;
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

  // 3. Billing product. The engine has no built-in default catalogue;
  //    an unset product means every plan
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

  // 4. Installed registry items against registry/requires.json: the
  //    sibling items they import from, the scaffold files they import,
  //    the exports the composition root must provide, and the feature
  //    keys they gate on — each a `next build` or a 403 that only shows
  //    up later. An item counts as installed when its marker file is.
  const requires =
    options.requires === undefined ? bundledRequires() : options.requires;
  if (requires) {
    const exists = (rel: string) =>
      [".ts", ".tsx", ".js", ".jsx", ".json", ""].some((ext) =>
        existsSync(path.join(root, rel + ext))
      );
    const plansSource = existsSync(path.join(root, "lib/plans.ts"))
      ? readFileSync(path.join(root, "lib/plans.ts"), "utf8")
      : null;

    for (const [name, item] of Object.entries(requires.items)) {
      if (!existsSync(path.join(root, item.marker))) continue;
      const problems: string[] = [];

      for (const dep of item.items ?? []) {
        const marker = requires.items[dep]?.marker;
        if (marker && !existsSync(path.join(root, marker))) {
          problems.push(`install the ${dep} item first`);
        }
      }
      for (const file of item.files ?? []) {
        if (!exists(file)) problems.push(`create ${file} (scaffold-provided)`);
      }
      for (const [file, names] of Object.entries(item.exports ?? {})) {
        const abs = [".ts", ".tsx"]
          .map((ext) => path.join(root, file + ext))
          .find((p) => existsSync(p));
        if (!abs) continue; // reported above as a missing file
        const source = readFileSync(abs, "utf8");
        const missing = names.filter(
          (n) =>
            !new RegExp(`export\\s+(?:const|function|let|var)\\s+${n}\\b`).test(
              source
            ) && !new RegExp(`export\\s*\\{[^}]*\\b${n}\\b`).test(source)
        );
        if (missing.length) {
          problems.push(`${file} must export ${missing.join(", ")}`);
        }
      }
      for (const feature of item.features ?? []) {
        if (
          plansSource !== null &&
          !new RegExp(`\\b${feature}\\b\\s*:`).test(plansSource)
        ) {
          problems.push(
            `register the "${feature}" feature key in lib/plans.ts — an unregistered key is denied (403)`
          );
        }
      }

      results.push(
        problems.length === 0
          ? { name: `item:${name}`, status: "ok", detail: "requirements met" }
          : {
              name: `item:${name}`,
              status: "error",
              detail: problems.join("; "),
            }
      );
    }
  }

  // 4b. Maintenance route. It refuses to serve without a strong
  //     CRON_SECRET, and a scheduler hitting a 403 every five minutes
  //     is easy to miss.
  if (existsSync(path.join(root, "app/api/cron/maintenance/route.ts"))) {
    const cronSecret = env.CRON_SECRET ?? "";
    results.push(
      cronSecret.length >= 32
        ? { name: "maintenance", status: "ok", detail: "CRON_SECRET set" }
        : {
            name: "maintenance",
            status: "error",
            detail:
              "app/api/cron/maintenance/route.ts exists but CRON_SECRET is " +
              (cronSecret ? "shorter than 32 chars" : "unset") +
              " — the route answers 403 until it is",
          }
    );
  }

  // 4c. Better-Auth's HTTP mount. Every auth item's form posts to
  //     `/api/auth/*` on this origin; without the catch-all route
  //     those requests 404 and the pages look broken for no visible
  //     reason.
  if (existsSync(path.join(root, "app/[locale]/(auth)/layout.tsx"))) {
    results.push(
      existsSync(path.join(root, "app/api/auth/[...all]/route.ts"))
        ? { name: "auth-mount", status: "ok", detail: "/api/auth mounted" }
        : {
            name: "auth-mount",
            status: "error",
            detail:
              "auth pages are installed but app/api/auth/[...all]/route.ts " +
              "is missing — add `export { GET, POST } from " +
              '"@intelligo-dev/next/auth";` there or every sign-in answers 404',
          }
    );
  }

  // 4d. Model prices. The registry is open and nothing self-registers,
  //     so a composition root that never calls `registerModels` leaves
  //     admission with no price to estimate against: every request is
  //     refused with `unknown_model`, at runtime, on a deployment whose
  //     only mistake was omitting one line.
  const compositionRoot = ["lib/intelligo.ts", "lib/intelligo.tsx"]
    .map((rel) => path.join(root, rel))
    .find((file) => existsSync(file));

  if (compositionRoot) {
    const source = readFileSync(compositionRoot, "utf8");
    const registers = /\bregisterModels?\s*\(/.test(stripComments(source));
    results.push(
      registers
        ? {
            name: "models",
            status: "ok",
            detail: "the composition root registers model prices",
          }
        : {
            name: "models",
            status: "error",
            detail:
              "no registerModels() in the composition root — admission cannot " +
              "price any model and refuses every request with `unknown_model`. " +
              "Add `registerModels(DEFAULT_MODELS)` from @intelligo-dev/executions, " +
              "or your own catalogue",
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

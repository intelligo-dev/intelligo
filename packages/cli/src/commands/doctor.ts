/**
 * `intelligo doctor` — report the problems that are invisible until
 * they are an incident.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { inspectMigrationChain, readMigrationChain } from "../migrations.js";
import { readManifest } from "../manifest.js";
import {
  checkExports,
  hasObjectKey,
  reexportedSource,
  stripComments,
} from "../module-exports.js";
import {
  MODEL_CATALOGUE_LOCATIONS,
  readCatalogueModelIds,
} from "../model-catalogue.js";
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
  /** Files an item ships once and the deployment then owns. */
  seams?: Record<string, string>;
  items: Record<string, ItemRequires>;
};

/**
 * templates/registry-requires.json is a build-time copy of
 * packages/registry/requires.json (scripts/sync-registry-requires.mjs),
 * committed so that running from source works too, and shipped so
 * doctor can check an installed app without a registry checkout.
 * `../../templates` resolves from src/ and from dist/commands/ alike.
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

/** The app's `assertEnv` refuses a shorter BETTER_AUTH_SECRET. */
const MIN_AUTH_SECRET_LENGTH = 32;

/** Env files Next.js reads only for a production build or server. */
const PRODUCTION_ENV_FILES = [".env.production.local", ".env.production"];

const LOCAL_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/;

/**
 * Where a production deployment would get a NEXT_PUBLIC_APP_URL that
 * points at this machine: the environment itself when it says
 * production, or a production env file in the app.
 */
function localAppUrlInProduction(
  root: string,
  env: NodeJS.ProcessEnv
): string | null {
  if (
    env.NODE_ENV === "production" &&
    LOCAL_URL.test(env.NEXT_PUBLIC_APP_URL ?? "")
  ) {
    return "NODE_ENV=production";
  }
  for (const name of PRODUCTION_ENV_FILES) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    const url = parseEnv(readFileSync(file, "utf8")).NEXT_PUBLIC_APP_URL;
    if (url && LOCAL_URL.test(url)) return name;
  }
  return null;
}

/** Files of the chat items that name the models a deployment runs on. */
const MODEL_ID_FILES = [
  "lib/chat-model.ts",
  "lib/chat-models.ts",
  "lib/chat-server-config.ts",
];

/** A provider-prefixed model id literal, in any of the three quote styles. */
const MODEL_ID =
  /["'`]((?:openai|anthropic|google|xai|mistral|meta)\/[a-z0-9._-]+)["'`]/g;

/** `id: "provider/model"` — a model registered by a literal. */
const REGISTERED_ID = /\bid:\s*["'`]([a-z0-9-]+\/[a-z0-9._-]+)["'`]/g;

/**
 * Required environment: present, and strong enough that the app's own
 * startup validation will accept it.
 */
function checkEnvironment(
  root: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): CheckResult[] {
  const results: CheckResult[] = [];
  const missing = REQUIRED_ENV.filter((k) => !env[k]);
  const authSecret = env.BETTER_AUTH_SECRET ?? "";
  const weakSecret =
    authSecret.length > 0 && authSecret.length < MIN_AUTH_SECRET_LENGTH;
  if (missing.length > 0) {
    results.push({
      name: "env",
      status: "error",
      detail: `Missing: ${missing.join(", ")}`,
    });
  }
  if (weakSecret) {
    results.push({
      name: "env",
      status: "error",
      detail:
        `BETTER_AUTH_SECRET is ${authSecret.length} chars — the app refuses to ` +
        `boot with fewer than ${MIN_AUTH_SECRET_LENGTH}. Generate one with: ` +
        "openssl rand -base64 32",
    });
  }
  if (missing.length === 0 && !weakSecret) {
    results.push({
      name: "env",
      status: "ok",
      detail: `${REQUIRED_ENV.length} required variables present`,
    });
  }
  const localUrlSource = localAppUrlInProduction(root, env);
  if (localUrlSource) {
    results.push({
      name: "env",
      status: "warn",
      detail:
        `NEXT_PUBLIC_APP_URL points at localhost (${localUrlSource}) — auth ` +
        "callbacks and email links are built from it; production needs the " +
        "public https URL",
    });
  }
  return results;
}

/**
 * Model ids. A registered catalogue still refuses an id it does not
 * hold, so a typo in the chat seam is a refused first turn. Every
 * provider-prefixed literal there must be in DEFAULT_MODELS (when the
 * root registers it) or registered by a literal `id` in the root.
 */
function checkModelIds(root: string, source: string): CheckResult[] {
  const used = new Map<string, string>();
  for (const rel of MODEL_ID_FILES) {
    const file = path.join(root, rel);
    if (!existsSync(file)) continue;
    const text = stripComments(readFileSync(file, "utf8"));
    for (const match of text.matchAll(MODEL_ID)) {
      if (!used.has(match[1]!)) used.set(match[1]!, rel);
    }
  }

  if (used.size === 0) return [];

  const code = stripComments(source);
  const known = new Set([...code.matchAll(REGISTERED_ID)].map((m) => m[1]!));
  const usesCatalogue = /\bDEFAULT_MODELS\b/.test(code);
  const catalogue = usesCatalogue ? readCatalogueModelIds(root) : null;
  for (const id of catalogue ?? []) known.add(id);

  const unknown = [...used].filter(([id]) => !known.has(id));
  const listed = unknown.map(([id, rel]) => `${id} (${rel})`).join(", ");

  if (unknown.length === 0) {
    return [
      {
        name: "model-ids",
        status: "ok",
        detail: `${used.size} model id(s) in the chat seam, all registered`,
      },
    ];
  } else if (usesCatalogue && !catalogue) {
    return [
      {
        name: "model-ids",
        status: "warn",
        detail:
          `cannot read DEFAULT_MODELS (looked in ${MODEL_CATALOGUE_LOCATIONS.join(", ")}) ` +
          `to check ${listed} — is @intelligo-dev/executions installed?`,
      },
    ];
  } else if (OPAQUE_REGISTRATION.test(code)) {
    return [
      {
        name: "model-ids",
        status: "warn",
        detail:
          `${listed} not found in DEFAULT_MODELS or a literal registerModel({ id }) — ` +
          "the composition root registers a catalogue defined elsewhere, " +
          "so confirm it holds them",
      },
    ];
  } else {
    return [
      {
        name: "model-ids",
        status: "error",
        detail:
          `${listed} not registered — admission refuses an unpriced model ` +
          "with `unknown_model`. Fix the id, or add " +
          "`registerModel({ id, … })` to the composition root",
      },
    ];
  }
}

/**
 * A `registerModel(s)` argument that is neither a literal nor
 * `DEFAULT_MODELS`: a catalogue defined in another module, whose ids
 * cannot be read from the composition root.
 */
const OPAQUE_REGISTRATION =
  /\bregisterModels?\s*\(\s*(?![\s[{]|DEFAULT_MODELS\s*[,)])/;

/**
 * A seam's feature keys are the deployment's own choice, so they are
 * not an item requirement; a literal key the app's copy still names but
 * lib/plans.ts does not register is worth a warning.
 */
function checkSeamFeatures(
  root: string,
  seams: Record<string, string> | undefined,
  plans: ReturnType<typeof reexportedSource> | null
): CheckResult[] {
  if (!plans || plans.unresolved.length) return [];
  const results: CheckResult[] = [];
  for (const seam of Object.keys(seams ?? {})) {
    const abs = path.join(root, seam);
    if (!existsSync(abs)) continue;
    const keys = new Set(
      [
        ...readFileSync(abs, "utf8").matchAll(
          /featureKey:\s*["']([^"']+)["']/g
        ),
      ].map((m) => m[1]!)
    );
    const unregistered = [...keys].filter(
      (key) => !hasObjectKey(plans.text, key)
    );
    if (unregistered.length === 0) continue;
    results.push({
      name: `seam:${seam}`,
      status: "warn",
      detail: `${unregistered.map((key) => `"${key}"`).join(", ")} ${unregistered.length === 1 ? "is" : "are"} not registered in lib/plans.ts — a gate on an unregistered key is denied (403)`,
    });
  }
  return results;
}

const VITEST_CONFIGS = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.js",
  "vitest.config.mjs",
];

/** `PRODUCT_SLUG = "acme"` or `setDefaultProductSlug("acme")` in the composition root. */
const PRODUCT_SLUG_LITERAL =
  /(?:\bPRODUCT_SLUG\s*=|\bsetDefaultProductSlug\s*\()\s*["'`]([^"'`]+)["'`]/;

function checkBillingProduct(
  fromEnv: string | undefined,
  rootSource: string | null
): CheckResult {
  const setsDefault =
    rootSource !== null && /\bsetDefaultProductSlug\s*\(/.test(rootSource);
  const inCode = rootSource?.match(PRODUCT_SLUG_LITERAL)?.[1];
  if (fromEnv && inCode && fromEnv !== inCode) {
    return {
      name: "billing",
      status: "warn",
      detail:
        `INTELLIGO_BILLING_PRODUCT is "${fromEnv}" but the composition root sets "${inCode}". ` +
        "At runtime the composition root wins; the variable only misleads tooling that reads it — make them agree",
    };
  }
  if (fromEnv) {
    return { name: "billing", status: "ok", detail: `Product: ${fromEnv}` };
  }
  if (setsDefault) {
    return {
      name: "billing",
      status: "ok",
      detail: `Product: ${inCode ?? "set"} by setDefaultProductSlug() in the composition root`,
    };
  }
  return {
    name: "billing",
    status: "warn",
    detail:
      "no product — set INTELLIGO_BILLING_PRODUCT, or call setDefaultProductSlug() " +
      "in the composition root, or plan lookups resolve to nothing",
  };
}

/**
 * Whether `name` is installed where the app resolves packages from: its
 * own node_modules or any directory above it, a workspace root's
 * included.
 */
function resolvesFrom(root: string, name: string): boolean {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "node_modules", name, "package.json"))) {
      return true;
    }
    if (path.dirname(dir) === dir) return false;
  }
}

export function runChecks(options: DoctorOptions = {}): CheckResult[] {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const results: CheckResult[] = [];

  // 1. Migration chain: drift between the journal and the .sql files.
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
  results.push(...checkEnvironment(root, env));

  // 3. Billing product. The engine has no built-in default catalogue;
  //    an unset product means every plan lookup returns nothing and
  //    quotas silently read as zero. The composition root sets it at
  //    boot; the variable lets tooling see it without booting.
  const compositionRoot = ["lib/intelligo.ts", "lib/intelligo.tsx"]
    .map((rel) => path.join(root, rel))
    .find((file) => existsSync(file));
  const rootSource = compositionRoot
    ? stripComments(readFileSync(compositionRoot, "utf8"))
    : null;
  results.push(checkBillingProduct(env.INTELLIGO_BILLING_PRODUCT, rootSource));

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
    // lib/plans.ts and whatever it re-exports — a catalogue defined in
    // a workspace package counts — comments stripped.
    const plansFile = ["lib/plans.ts", "lib/plans.tsx"]
      .map((rel) => path.join(root, rel))
      .find((file) => existsSync(file));
    const plans = plansFile ? reexportedSource(plansFile, root) : null;

    for (const [name, item] of Object.entries(requires.items)) {
      if (!existsSync(path.join(root, item.marker))) continue;
      const problems: string[] = [];
      const notes: string[] = [];

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
        const { missing, unresolved } = checkExports(abs, names, root);
        if (missing.length) {
          problems.push(`${file} must export ${missing.join(", ")}`);
        } else if (unresolved.length) {
          notes.push(
            `${file}: could not read ${unresolved.map((u) => `\`export * from "${u}"\``).join(", ")} — assumed to provide ${names.join(", ")}`
          );
        }
      }
      for (const feature of item.features ?? []) {
        if (!plans || hasObjectKey(plans.text, feature)) continue;
        if (plans.unresolved.length) {
          notes.push(
            `the "${feature}" feature key is not in lib/plans.ts, and ${plans.unresolved.join(", ")} could not be read to confirm it`
          );
        } else {
          problems.push(
            `register the "${feature}" feature key in lib/plans.ts — an unregistered key is denied (403)`
          );
        }
      }

      results.push(
        problems.length === 0
          ? notes.length === 0
            ? { name: `item:${name}`, status: "ok", detail: "requirements met" }
            : { name: `item:${name}`, status: "warn", detail: notes.join("; ") }
          : {
              name: `item:${name}`,
              status: "error",
              detail: problems.join("; "),
            }
      );
    }

    results.push(...checkSeamFeatures(root, requires.seams, plans));
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

    if (registers) results.push(...checkModelIds(root, source));
  }

  // 4e. A test config whose runner is not installed fails at the first
  //     `vitest run`, with a module error that does not say why.
  const vitestConfig = VITEST_CONFIGS.find((file) =>
    existsSync(path.join(root, file))
  );
  if (vitestConfig) {
    results.push(
      resolvesFrom(root, "vitest")
        ? { name: "tests", status: "ok", detail: "vitest is installed" }
        : {
            name: "tests",
            status: "warn",
            detail:
              `${vitestConfig} is here but vitest does not resolve from the app — ` +
              "`pnpm add -D vitest`",
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

/**
 * Dependency-direction rules (Phase 1, ADR-0006).
 *
 * Enforces the package boundary at two levels:
 *   1. package.json — each package may declare only its allowlisted
 *      @intelligo-dev/* dependencies;
 *   2. source imports — every `from "..."`/dynamic import in a package's
 *      src/ must resolve to an allowlisted @intelligo-dev/* package, and no
 *      package may import app code (`@example/product`, `@intelligo-dev/web`,
 *      `@/...`, or a relative path escaping packages/).
 *
 * The allowlist is the CURRENT accepted graph. Tightening it is done
 * by removing the edge here — never by adding edges to sneak past CI.
 * (`billing → ai` was the worked example; ADR-0008 moved the cost math
 * to `executions` and the edge is gone.)
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { hasIgniteApp, hasPrivateWorkspace } from "./scope";

const ROOT = path.resolve(__dirname, "../..");
const PACKAGES_DIR = path.join(ROOT, "packages");

/** Accepted @intelligo-dev/* dependency edges, by package directory name. */
const ALLOWED_DEPS: Record<string, readonly string[]> = {
  core: [],
  ui: [],
  // The registry and the cost math moved to executions (ADR-0008);
  // what is left re-exports them beside the provider clients.
  ai: ["@intelligo-dev/core", "@intelligo-dev/executions"],
  auth: ["@intelligo-dev/core"],
  audit: ["@intelligo-dev/core"],
  jobs: ["@intelligo-dev/core"],
  "billing-core": ["@intelligo-dev/core"],
  // executions owns the SaaS boundary and must NOT depend on billing —
  // entitlement and settlement arrive through ports bound by the
  // composition root (ADR-0005). Adding @intelligo-dev/billing here would
  // undo the whole point of the package.
  executions: ["@intelligo-dev/core", "@intelligo-dev/audit"],
  // The Mastra bridge is deliberately removable: it depends on the
  // execution boundary and NOTHING else, and reaches @mastra/core only
  // through an optional peer dependency it never imports.
  mastra: ["@intelligo-dev/executions"],
  // The CLI inspects a workspace from the outside — reading files,
  // talking to Postgres — so it deliberately imports no runtime
  // package. Adding one would make `doctor` need the app to boot
  // before it can report why the app cannot boot.
  cli: [],
  // The admin console reads across tenants through the owning
  // packages' APIs. It has no billing dependency on purpose: what it
  // shows about credits comes from executions, so the console cannot
  // drift into a second definition of what a charge is.
  admin: [
    "@intelligo-dev/core",
    "@intelligo-dev/auth",
    "@intelligo-dev/audit",
    "@intelligo-dev/executions",
    "@intelligo-dev/jobs",
    "@intelligo-dev/ui",
  ],
  billing: [
    "@intelligo-dev/core",
    "@intelligo-dev/billing-core",
    "@intelligo-dev/executions",
  ],
  agents: ["@intelligo-dev/core", "@intelligo-dev/ai", "@intelligo-dev/auth"],
  chat: [
    "@intelligo-dev/core",
    "@intelligo-dev/ai",
    "@intelligo-dev/agents",
    "@intelligo-dev/ui",
  ],
};

/**
 * private/* packages are the domain IP and the product app (ADR-0006).
 * They may consume any public package — that is the point — but the
 * vertical must not depend on the product application, or extracting
 * Support for a second product becomes impossible.
 */
const PRIVATE_ALLOWED_DEPS: Record<string, readonly string[]> = {
  support: [
    "@intelligo-dev/core",
    "@intelligo-dev/ai",
    "@intelligo-dev/agents",
    "@intelligo-dev/billing",
    "@intelligo-dev/billing-core",
    "@intelligo-dev/chat",
    "@intelligo-dev/ui",
  ],
  // The product app composes everything, including the vertical.
  acme: null as unknown as readonly string[],
};

/** Packages that must never appear as a dependency of a reusable package. */
const APP_PACKAGES = ["@example/product", "@intelligo-dev/web"];

/** The private vertical: nothing reusable may reference it. */
const PRIVATE_PACKAGES = ["@example/product"];

function listPackages(): string[] {
  return listDir(PACKAGES_DIR);
}

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
]);

/**
 * Walk every source file in a package — not just `src/`.
 *
 * Scoping this to `src/` left scripts/ and root config files
 * unchecked, and that is exactly where the escapes were: a one-time
 * migration script in packages/core/scripts/ imported the support
 * schema by relative path, stayed broken after support moved, and was
 * invisible to both this test and `tsc` (whose include is src-only).
 */
function walkSources(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkSources(full, out);
    } else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Extract module specifiers from static + dynamic imports and requires. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g, // side-effect import
    // Quoted AND backtick specifiers: `await import(\`@example/product\`)`
    // slipped past a quote-only pattern.
    /\bimport\s*\(\s*[`"']([^`"']+)[`"']\s*\)/g,
    /\brequire\s*\(\s*[`"']([^`"']+)[`"']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]!);
  }
  return specs;
}

const PRIVATE_DIR = path.join(ROOT, "private");

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(path.join(dir, name, "package.json")).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

const packages = listPackages();
const privatePackages = listDir(PRIVATE_DIR);

describe("package dependency direction", () => {
  it("covers every package in the allowlist", () => {
    const missing = packages.filter((p) => !(p in ALLOWED_DEPS));
    expect(
      missing,
      `packages without an ALLOWED_DEPS entry (add one deliberately): ${missing.join(", ")}`
    ).toEqual([]);
  });

  describe.each(packages)("%s", (pkg) => {
    const pkgDir = path.join(PACKAGES_DIR, pkg);
    const allowed = ALLOWED_DEPS[pkg] ?? [];

    it("declares only allowlisted @intelligo-dev/* dependencies", () => {
      const manifest = JSON.parse(
        readFileSync(path.join(pkgDir, "package.json"), "utf8")
      ) as Record<string, Record<string, string> | undefined>;
      const declared = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      }).filter((name) => name.startsWith("@intelligo-dev/"));

      const violations = declared.filter((dep) => !allowed.includes(dep));
      expect(
        violations,
        `${pkg}/package.json declares forbidden deps: ${violations.join(", ")}`
      ).toEqual([]);
    });

    it("imports only allowlisted @intelligo-dev/* packages and no app code", () => {
      // Whole package, not just src/: scripts and root config files are
      // where the escapes actually were.
      const files = walkSources(pkgDir);
      const violations: string[] = [];

      for (const file of files) {
        const rel = path.relative(ROOT, file);
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          if (spec.startsWith("@intelligo-dev/")) {
            const dep = spec.split("/").slice(0, 2).join("/");
            const isSelf = dep === `@intelligo-dev/${pkg}`;
            if (!isSelf && !allowed.includes(dep)) {
              violations.push(`${rel} → ${spec}`);
            }
            if (APP_PACKAGES.includes(dep)) {
              violations.push(`${rel} → ${spec} (app package)`);
            }
            if (PRIVATE_PACKAGES.includes(dep)) {
              violations.push(`${rel} → ${spec} (private vertical)`);
            }
          } else if (spec === "@" || spec.startsWith("@/")) {
            violations.push(`${rel} → ${spec} (app alias)`);
          } else if (spec.startsWith(".")) {
            const resolved = path.resolve(path.dirname(file), spec);
            if (
              !resolved.startsWith(pkgDir + path.sep) &&
              resolved !== pkgDir
            ) {
              violations.push(`${rel} → ${spec} (escapes package root)`);
            }
          }
        }
      }

      expect(
        violations,
        `forbidden imports in ${pkg}:\n  ${violations.join("\n  ")}`
      ).toEqual([]);
    });
  });
});

describe.skipIf(!hasPrivateWorkspace)("private package direction", () => {
  it("finds the private workspace", () => {
    // A silent empty list would make every assertion below vacuous.
    expect(privatePackages.length).toBeGreaterThan(0);
  });

  describe.each(privatePackages)("%s", (pkg) => {
    const pkgDir = path.join(PRIVATE_DIR, pkg);

    it("declares only allowlisted @intelligo-dev/* dependencies", () => {
      const allowed = PRIVATE_ALLOWED_DEPS[pkg];
      if (!allowed) return; // acme composes everything

      const manifest = JSON.parse(
        readFileSync(path.join(pkgDir, "package.json"), "utf8")
      ) as Record<string, Record<string, string> | undefined>;
      const declared = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      }).filter((name) => name.startsWith("@intelligo-dev/"));

      const violations = declared.filter((dep) => !allowed.includes(dep));
      expect(
        violations,
        `private/${pkg} declares forbidden deps: ${violations.join(", ")}`
      ).toEqual([]);
    });

    it("imports only allowlisted @intelligo-dev/* packages", () => {
      const allowed = PRIVATE_ALLOWED_DEPS[pkg];
      if (!allowed) return; // acme composes everything

      const violations: string[] = [];
      for (const file of walkSources(pkgDir)) {
        const rel = path.relative(ROOT, file);
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          if (!spec.startsWith("@intelligo-dev/")) continue;
          const dep = spec.split("/").slice(0, 2).join("/");
          if (dep === `@intelligo-dev/${pkg}`) continue;
          if (!allowed.includes(dep)) violations.push(`${rel} → ${spec}`);
        }
      }

      expect(
        violations,
        `forbidden imports in private/${pkg}:\n  ${violations.join("\n  ")}`
      ).toEqual([]);
    });

    it("does not depend on the product application", () => {
      const manifest = JSON.parse(
        readFileSync(path.join(pkgDir, "package.json"), "utf8")
      ) as Record<string, Record<string, string> | undefined>;
      const declared = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
      });

      if (pkg === "acme") return;
      expect(declared).not.toContain("@example/product");
    });
  });
});

// ---------------------------------------------------------------------------
// apps/*
// ---------------------------------------------------------------------------

const APPS_DIR = path.join(ROOT, "apps");
const apps = listDir(APPS_DIR);

/**
 * `apps/*` was never scanned, which mattered once the reference
 * application arrived: its entire purpose is to prove the public
 * packages compose without the private vertical, and nothing was
 * checking that it stayed that way.
 */
describe("apps", () => {
  it("finds the apps directory", () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  describe.each(apps)("%s", (app) => {
    const appDir = path.join(APPS_DIR, app);

    it("does not import a private package", () => {
      const violations: string[] = [];
      for (const file of walkSources(appDir)) {
        const rel = path.relative(ROOT, file);
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          const dep = spec.startsWith("@intelligo-dev/")
            ? spec.split("/").slice(0, 2).join("/")
            : null;
          if (dep && PRIVATE_PACKAGES.includes(dep)) {
            violations.push(`${rel} → ${spec}`);
          }
          if (spec.includes("private/")) {
            violations.push(`${rel} → ${spec} (private path)`);
          }
        }
      }

      expect(
        violations,
        `apps/${app} reaches into private/:\n  ${violations.join("\n  ")}`
      ).toEqual([]);
    });

    it("declares every @intelligo package it imports", () => {
      const manifest = JSON.parse(
        readFileSync(path.join(appDir, "package.json"), "utf8")
      ) as Record<string, Record<string, string> | undefined>;
      const declared = new Set(
        Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
      );

      const undeclared = new Set<string>();
      for (const file of walkSources(appDir)) {
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          if (!spec.startsWith("@intelligo-dev/")) continue;
          const dep = spec.split("/").slice(0, 2).join("/");
          if (!declared.has(dep)) undeclared.add(dep);
        }
      }

      expect(
        [...undeclared],
        `apps/${app} imports packages it does not declare`
      ).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Composition reaches every registry read
// ---------------------------------------------------------------------------

/**
 * Registries are module-scope state, and Next.js may give a page, a
 * route handler and the instrumentation hook separate instances of the
 * module holding them. When that happens the composition root fills one
 * copy and the reader sees an empty one — which surfaced in CI as a
 * page logging "No billing product configured" while instrumentation
 * had run, quota state coming back null and feature checks falling back
 * to defaults. Nothing failed loudly.
 *
 * The rule: a server module that reads a registry imports
 * `@/lib/ensure-composed`, so the composition and the read are
 * guaranteed to be in the same instance.
 */
/** Source with block and line comments removed, for identifier scans. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe.skipIf(!hasIgniteApp)(
  "composition reaches every registry read",
  () => {
    const REGISTRY_READS = [
      "getPlanConfigs",
      "getPlanBySlug",
      "getDefaultProductSlug",
      "getProductFeatures",
      "getUpgradeMessage",
      "getActionLabel",
      "getActionLimitKey",
      "hasFeature",
      "checkFeatureQuota",
      "checkQuota",
    ];

    it("every acme module that reads a registry composes first", () => {
      const roots = [
        "product/app/lib",
        "product/app/actions",
        "product/app/app",
      ];
      const offenders: string[] = [];

      for (const root of roots) {
        for (const file of walkSources(path.join(ROOT, root))) {
          if (file.includes("__tests__") || file.endsWith(".test.ts")) continue;
          const source = readFileSync(file, "utf8");
          if (source.includes("ensure-composed")) continue;

          // Comments name these APIs when they explain the boundary —
          // a doc comment mentioning `hasFeature` is not a read.
          const code = stripComments(source);

          const hit = REGISTRY_READS.find((name) =>
            new RegExp(`\\b${name}\\b`).test(code)
          );
          if (hit) {
            offenders.push(`${path.relative(ROOT, file)} (reads ${hit})`);
          }
        }
      }

      expect(
        offenders,
        `these read a registry without importing @/lib/ensure-composed:\n  ${offenders.join("\n  ")}`
      ).toEqual([]);
    });
  }
);

/**
 * ADR-0008 dissolved `agents`, `ai` and `chat`. They still exist, and
 * Acme and Support still import them, but nothing headed for the
 * public foundation may — otherwise extraction copies a package whose
 * dependency stayed behind, and the break surfaces after the
 * repository is public rather than here.
 *
 * Keyed off the allowlist file rather than a second list, so a package
 * added to `public` is covered without anyone remembering this rule.
 */
describe("public packages do not depend on the dissolved set", () => {
  const allowlist = JSON.parse(
    readFileSync(path.join(ROOT, "config/public-packages.json"), "utf8")
  ) as { public: string[]; deprecated: string[] };

  const dissolved = allowlist.deprecated.map((p) => `@intelligo-dev/${p}`);

  it("has a dissolved set to rule on", () => {
    // Once the moves land and these directories are gone, this rule
    // becomes vacuous — delete it rather than let it pass on nothing.
    expect(dissolved.length).toBeGreaterThan(0);
  });

  describe.each(allowlist.public.filter((p) => packages.includes(p)))(
    "%s",
    (pkg) => {
      it("declares none of them", () => {
        const manifest = JSON.parse(
          readFileSync(path.join(PACKAGES_DIR, pkg, "package.json"), "utf8")
        ) as { dependencies?: Record<string, string> };

        expect(
          Object.keys(manifest.dependencies ?? {}).filter((d) =>
            dissolved.includes(d)
          )
        ).toEqual([]);
      });

      it("imports none of them", () => {
        const offenders: string[] = [];

        for (const file of walkSources(path.join(PACKAGES_DIR, pkg))) {
          for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
            const dep = spec.split("/").slice(0, 2).join("/");
            if (dissolved.includes(dep)) {
              offenders.push(`${path.relative(ROOT, file)} → ${spec}`);
            }
          }
        }

        expect(offenders, offenders.join("\n  ")).toEqual([]);
      });
    }
  );
});

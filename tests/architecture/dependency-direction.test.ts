/**
 * Dependency-direction rules.
 *
 * Enforces the package boundary at two levels:
 *   1. package.json — each package may declare only its allowlisted
 *      @intelligo-dev/* dependencies;
 *   2. source imports — every `from "..."`/dynamic import in a package
 *      must resolve to an allowlisted @intelligo-dev/* package, never to
 *      an application (`@/...`) and never to a relative path escaping
 *      the package.
 *
 * The allowlist is the CURRENT accepted graph. Tightening it is done
 * by removing the edge here — never by adding edges to sneak past CI.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  APPS_DIR,
  TOOLS_DIR,
  DISSOLVED_PACKAGES,
  FOLDED_PACKAGES,
  PACKAGES_DIR,
  ROOT,
  importSpecifiers,
  intelligoPackage,
  listPublishedWorkspaces,
  listWorkspaces,
  walk,
} from "./tree";

/** Accepted @intelligo-dev/* dependency edges, by package directory name. */
const ALLOWED_DEPS: Record<string, readonly string[]> = {
  core: [],
  // auth reads the request's headers through core/request-context, so
  // it resolves a session without importing a web framework.
  auth: ["@intelligo-dev/core"],
  audit: ["@intelligo-dev/core"],
  jobs: ["@intelligo-dev/core"],
  // executions owns the SaaS boundary and must NOT depend on billing —
  // entitlement and settlement arrive through ports bound by the
  // composition root. Adding @intelligo-dev/billing here would
  // undo the whole point of the package.
  executions: ["@intelligo-dev/core", "@intelligo-dev/audit"],
  // The Mastra bridge is deliberately removable: it depends on the
  // execution boundary and NOTHING else, and reaches @mastra/core only
  // through an optional peer dependency it never imports.
  mastra: ["@intelligo-dev/executions"],
  // The Next.js adapter: the only package allowed to import next/*. It
  // sits at the top of the graph — it binds the request context for
  // core and mounts auth's route handlers — so nothing depends on it.
  next: ["@intelligo-dev/core", "@intelligo-dev/auth"],
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
  ],
  // billing audits the credit it grants (who, why) itself: a credit is
  // not an execution, so no execution event records it. audit reaches
  // billing through executions already.
  billing: [
    "@intelligo-dev/core",
    "@intelligo-dev/audit",
    "@intelligo-dev/executions",
  ],
  // The chat transport composes auth, billing, persistence and the
  // execution boundary into one Route Handler. It is an AI SDK adapter
  // at the top of the graph, like admin — not a boundary package — so
  // its edge to billing is the ordinary one a transport has.
  chat: [
    "@intelligo-dev/core",
    "@intelligo-dev/auth",
    "@intelligo-dev/billing",
    "@intelligo-dev/executions",
  ],
};

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx)$/;

/**
 * Walk every source file in a package — not just `src/`.
 *
 * Scripts and root config files are where a relative-path escape
 * hides, and `tsc` (whose include is src-only) never sees them.
 */
const walkSources = (dir: string) =>
  walk(dir, (name) => SOURCE_FILE.test(name));

function declaredIntelligoDeps(manifestPath: string): string[] {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    Record<string, string> | undefined
  >;
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  }).filter((name) => name.startsWith("@intelligo-dev/"));
}

// Published packages only. `packages/registry` is item source that
// imports `@/…` and every package on purpose; its imports are ruled on
// item by item in registry.test.ts, not as a package edge.
const packages = listPublishedWorkspaces(PACKAGES_DIR);
const apps = listWorkspaces(APPS_DIR);
/** Every workspace that consumes the packages: applications and tools. */
const consumers = [
  ...apps.map((a) => ["apps", a] as const),
  ...listWorkspaces(TOOLS_DIR).map((t) => ["tools", t] as const),
];

/** What this repository publishes: the only `@intelligo-dev/*` names that resolve. */
const PUBLISHED = new Set(packages.map((pkg) => `@intelligo-dev/${pkg}`));

describe("package dependency direction", () => {
  it("finds the packages", () => {
    // A silent empty list would make every rule below vacuous.
    expect(packages.length).toBeGreaterThan(5);
  });

  it("covers every package in the allowlist, and nothing else", () => {
    const missing = packages.filter((p) => !(p in ALLOWED_DEPS));
    expect(
      missing,
      `packages without an ALLOWED_DEPS entry (add one deliberately): ${missing.join(", ")}`
    ).toEqual([]);

    // An entry for a package that does not exist is a rule about
    // nothing, and the next package to take that name inherits its
    // edges unreviewed.
    const stale = Object.keys(ALLOWED_DEPS).filter(
      (p) => !packages.includes(p)
    );
    expect(
      stale,
      `ALLOWED_DEPS names packages that do not exist: ${stale.join(", ")}`
    ).toEqual([]);
  });

  describe.each(packages)("%s", (pkg) => {
    const pkgDir = path.join(PACKAGES_DIR, pkg);
    const allowed = ALLOWED_DEPS[pkg] ?? [];

    it("declares only allowlisted @intelligo-dev/* dependencies", () => {
      const declared = declaredIntelligoDeps(path.join(pkgDir, "package.json"));
      const violations = declared.filter((dep) => !allowed.includes(dep));
      expect(
        violations,
        `${pkg}/package.json declares forbidden deps: ${violations.join(", ")}`
      ).toEqual([]);
    });

    it("imports only allowlisted @intelligo-dev/* packages and no app code", () => {
      const violations: string[] = [];

      for (const file of walkSources(pkgDir)) {
        const rel = path.relative(ROOT, file);
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          const dep = intelligoPackage(spec);
          if (dep) {
            const isSelf = dep === `@intelligo-dev/${pkg}`;
            if (!isSelf && !allowed.includes(dep)) {
              violations.push(`${rel} → ${spec}`);
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

// ---------------------------------------------------------------------------
// apps/*
// ---------------------------------------------------------------------------

/**
 * The reference application's entire purpose is to prove the published
 * packages compose on their own. It may import any of them — and only
 * them: an `@intelligo-dev/*` name this repository does not publish
 * resolves nowhere for a consumer.
 */
describe("apps", () => {
  it("finds the apps directory", () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  describe.each(consumers)("%s/%s", (kind, app) => {
    const appDir = path.join(ROOT, kind, app);

    it("imports only packages this repository publishes", () => {
      const violations: string[] = [];
      for (const file of walkSources(appDir)) {
        const rel = path.relative(ROOT, file);
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          const dep = intelligoPackage(spec);
          if (dep && !PUBLISHED.has(dep)) {
            violations.push(`${rel} → ${spec} (not a published package)`);
          }
        }
      }

      expect(
        violations,
        `${kind}/${app} imports what is not published:\n  ${violations.join("\n  ")}`
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
          const dep = intelligoPackage(spec);
          if (dep && !declared.has(dep)) undeclared.add(dep);
        }
      }

      expect(
        [...undeclared],
        `${kind}/${app} imports packages it does not declare`
      ).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// The dissolved set
// ---------------------------------------------------------------------------

/**
 * Names that were never published and have no package (tree.ts). The
 * allowlist above already refuses them as edges; this rule makes a
 * package or app that reaches for one hear that it is dissolved, not
 * merely "not allowlisted".
 */
describe("nothing depends on the dissolved set", () => {
  const dissolved: readonly string[] = DISSOLVED_PACKAGES;

  it("has a dissolved set to rule on", () => {
    expect(dissolved.length).toBeGreaterThan(0);
    for (const name of dissolved) {
      expect(
        PUBLISHED.has(name),
        `${name} exists again — decide, then update the dissolved-packages list`
      ).toBe(false);
    }
  });

  describe.each([
    ...packages.map((p) => ["packages", p] as const),
    ...consumers,
  ])("%s/%s", (kind, name) => {
    const dir = path.join(ROOT, kind, name);

    it("declares none of them", () => {
      const declared = declaredIntelligoDeps(path.join(dir, "package.json"));
      expect(declared.filter((d) => dissolved.includes(d))).toEqual([]);
    });

    it("imports none of them", () => {
      const offenders: string[] = [];
      for (const file of walkSources(dir)) {
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          const dep = intelligoPackage(spec);
          if (dep && dissolved.includes(dep)) {
            offenders.push(`${path.relative(ROOT, file)} → ${spec}`);
          }
        }
      }
      expect(offenders, offenders.join("\n  ")).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// The folded set
// ---------------------------------------------------------------------------

/**
 * `money`, `http` and `billing-core` are subpaths of `core`, `next` and
 * `billing`; their npm names are deprecated. Unlike the dissolved set
 * the code exists, so an import of the old name is told the new one.
 */
describe("nothing depends on the folded set", () => {
  const folded = Object.keys(FOLDED_PACKAGES);

  it("has a folded set to rule on", () => {
    expect(folded.length).toBeGreaterThan(0);
    for (const name of folded) {
      expect(
        PUBLISHED.has(name),
        `${name} exists again — decide, then update the folded-packages list`
      ).toBe(false);
    }
  });

  describe.each([
    ...packages.map((p) => ["packages", p] as const),
    ...consumers,
  ])("%s/%s", (kind, name) => {
    const dir = path.join(ROOT, kind, name);

    it("declares none of them", () => {
      const declared = declaredIntelligoDeps(path.join(dir, "package.json"));
      const offenders = declared
        .filter((d) => folded.includes(d))
        .map((d) => `${d} → use ${FOLDED_PACKAGES[d]}`);
      expect(offenders).toEqual([]);
    });

    it("imports none of them", () => {
      const offenders: string[] = [];
      for (const file of walkSources(dir)) {
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          const dep = intelligoPackage(spec);
          if (dep && folded.includes(dep)) {
            offenders.push(
              `${path.relative(ROOT, file)} → ${spec} (use ${FOLDED_PACKAGES[dep]})`
            );
          }
        }
      }
      expect(offenders, offenders.join("\n  ")).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Subpaths that must stay leaves
// ---------------------------------------------------------------------------

/**
 * Each of these modules is a leaf: it can be reached from a client
 * bundle, an edge runtime or another package's own leaf without
 * dragging Drizzle, Stripe or `server-only` along. That is a property
 * of the files, so it is asserted on the files.
 */
describe("leaf subpaths", () => {
  const coreSrc = path.join(PACKAGES_DIR, "core/src");

  it("core/money imports nothing", () => {
    // `executions/pricing` is a zero-import leaf that reads these
    // types; one import here and it stops being one.
    expect(
      importSpecifiers(readFileSync(path.join(coreSrc, "money.ts"), "utf8"))
    ).toEqual([]);
  });

  it("executions/pricing imports only core's own leaves", () => {
    // The model registry and the cost math are what a client bundle
    // reads to show a model name or a price; Drizzle must stay out.
    const specs = importSpecifiers(
      readFileSync(path.join(PACKAGES_DIR, "executions/src/pricing.ts"), "utf8")
    );
    expect([...new Set(specs)].sort()).toEqual([
      "@intelligo-dev/core/money",
      "@intelligo-dev/core/registry",
    ]);
  });

  it("core/prompt imports nothing", () => {
    // Reached from tools and the chat transport's prepareMessages seam;
    // a dependency here is a dependency of every prompt.
    expect(
      importSpecifiers(readFileSync(path.join(coreSrc, "prompt.ts"), "utf8"))
    ).toEqual([]);
  });

  it("core/request-context imports only core/registry", () => {
    const specs = importSpecifiers(
      readFileSync(path.join(coreSrc, "request-context.ts"), "utf8")
    );
    // `node:async_hooks` is loaded lazily, and only where the runtime
    // provides no global AsyncLocalStorage (a script, a worker, a test);
    // Next.js and edge runtimes never reach it.
    expect(specs.filter((spec) => spec !== "node:async_hooks")).toEqual([
      "./registry",
    ]);
  });

  describe("billing's pure subpaths", () => {
    // What a consumer may reach from a client bundle: plan types, the
    // registries, the payment contract. None may import Stripe or
    // server-only, checked by walking every relative import from each.
    const billingSrc = path.join(PACKAGES_DIR, "billing/src");
    const PURE = ["plans", "plan-registry", "payment", "quota-types"];
    // core's own leaves are allowed because they are themselves
    // import-free: reaching one adds nothing to a client bundle. Both
    // are asserted above, so this list cannot quietly widen.
    const ALLOWED_BARE = new Set([
      "@intelligo-dev/core/registry",
      "@intelligo-dev/core/money",
    ]);

    function reachable(entry: string): { files: string[]; bare: string[] } {
      const files = new Set<string>();
      const bare = new Set<string>();
      const queue = [path.join(billingSrc, `${entry}.ts`)];
      while (queue.length) {
        const file = queue.pop()!;
        if (files.has(file)) continue;
        files.add(file);
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          if (spec.startsWith(".")) {
            const resolved = path.resolve(path.dirname(file), spec);
            queue.push(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`);
          } else {
            bare.add(spec);
          }
        }
      }
      return { files: [...files], bare: [...bare] };
    }

    it.each(PURE)("%s reaches only core's own leaves", (entry) => {
      const { files, bare } = reachable(entry);
      const forbidden = bare.filter((spec) => !ALLOWED_BARE.has(spec));
      expect(
        forbidden,
        `billing/${entry} reaches ${forbidden.join(", ")} — a client bundle importing it would pull that in`
      ).toEqual([]);
      const server = files
        .map((f) => path.relative(billingSrc, f))
        .filter((f) => /stripe|webhook|server-only/.test(f));
      expect(server, `billing/${entry} reaches server-side modules`).toEqual(
        []
      );
    });
  });
});

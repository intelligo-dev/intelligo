import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** The repository root. */
export const ROOT = path.resolve(__dirname, "../..");

export const PACKAGES_DIR = path.join(ROOT, "packages");
export const APPS_DIR = path.join(ROOT, "apps");
/** Production tools that are workspaces but never deployed or published. */
export const TOOLS_DIR = path.join(ROOT, "tools");

/**
 * Packages dissolved into the framework rather than kept as their own
 * package. They exist nowhere, and no package, application or registry
 * item may declare or import one — a consumer would find nothing on npm
 * to resolve it to.
 */
export const DISSOLVED_PACKAGES = [
  "@intelligo-dev/ai",
  "@intelligo-dev/agents",
] as const;

/**
 * Packages folded into a subpath of a package that already existed.
 * The code still exists, so the rule that refuses the old name says
 * where.
 */
export const FOLDED_PACKAGES: Readonly<Record<string, string>> = {
  "@intelligo-dev/money": "@intelligo-dev/core/money",
  "@intelligo-dev/http":
    "@intelligo-dev/core/request-context (the contract) and @intelligo-dev/next (the Next.js binding)",
  "@intelligo-dev/billing-core":
    "@intelligo-dev/billing/{plans,plan-registry,payment,quota-types}",
};

/** Directory names to never descend into: build output and installs. */
export const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  ".astro",
  ".wrangler",
  ".git",
  "coverage",
  // `pnpm test:mutation` copies the whole tree into a sandbox per test
  // runner process and edits the copies. Walking one means reading the
  // repository twice, the second time with deliberately broken source.
  ".stryker-tmp",
  "reports",
  // Remotion's bundle and rendered output (tools/film), gitignored; the
  // minified bundle trips the credential patterns.
  "build",
  "out",
]);

/** Sub-directories of `dir` that carry a package.json. */
export function listWorkspaces(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => {
        try {
          return statSync(path.join(dir, name, "package.json")).isFile();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

/**
 * The workspaces under `dir` that ship to npm: every one not marked
 * `private`. `packages/registry` is the private one — item source the
 * toolchain owns, installed through shadcn rather than resolved from a
 * registry — and no rule about a published package applies to it.
 */
export function listPublishedWorkspaces(dir: string): string[] {
  return listWorkspaces(dir).filter((name) => {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, name, "package.json"), "utf8")
    ) as { private?: boolean };
    return manifest.private !== true;
  });
}

/** Every file under `dir` whose name matches `accept`, skipping build output. */
export function walk(
  dir: string,
  accept: (name: string) => boolean,
  out: string[] = []
): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, accept, out);
    else if (accept(entry)) out.push(full);
  }
  return out;
}

/** Module specifiers from static and dynamic imports, exports and requires. */
export function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g, // side-effect import
    // Quoted AND backtick specifiers, so a template-literal dynamic
    // import is caught too.
    /\bimport\s*\(\s*[`"']([^`"']+)[`"']\s*\)/g,
    /\brequire\s*\(\s*[`"']([^`"']+)[`"']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]!);
  }
  return specs;
}

/** `@intelligo-dev/core/db` → `@intelligo-dev/core`; anything else → null. */
export function intelligoPackage(spec: string): string | null {
  return spec.startsWith("@intelligo-dev/")
    ? spec.split("/").slice(0, 2).join("/")
    : null;
}

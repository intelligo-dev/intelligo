import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** The repository root. */
export const ROOT = path.resolve(__dirname, "../..");

export const PACKAGES_DIR = path.join(ROOT, "packages");
export const APPS_DIR = path.join(ROOT, "apps");

/**
 * Packages ADR-0008 dissolved. They no longer exist anywhere, and no
 * package, application or registry item may declare or import one —
 * a consumer would find nothing on npm to resolve it to.
 */
export const DISSOLVED_PACKAGES = [
  "@intelligo-dev/ai",
  "@intelligo-dev/agents",
  "@intelligo-dev/chat",
] as const;

/**
 * Packages ADR-0011 folded into a subpath of a package that already
 * existed. The code did not go away, it moved — so the rule that
 * refuses the old name says where.
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
    // Quoted AND backtick specifiers: a template-literal dynamic import
    // slipped past a quote-only pattern once.
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

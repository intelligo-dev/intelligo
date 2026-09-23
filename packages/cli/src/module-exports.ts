/**
 * What a TypeScript module exports, read from its text — enough for
 * `doctor` to confirm an app provides the names an installed item
 * imports, without compiling or running the app.
 *
 * It understands declarations (`export const|function|class|type|
 * interface|enum …`), export lists with aliases (`export { a as b }`),
 * re-exports (`export { x } from "…"`, `export * from "…"`) and the
 * imports a bare export list re-exports. Modules are resolved the way
 * the app would: relative paths, the `@/` alias, and packages through
 * node resolution from the app's root (a workspace package included).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Block and line comments removed, so a check cannot be satisfied — or
 * defeated — by prose.
 */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ModuleShape = {
  /** Names exported by this module itself, or re-exported by name. */
  names: Set<string>;
  /** Exported name → the module it is re-exported from, when it is. */
  reexports: Map<string, string>;
  /** `export * from "…"` specifiers. */
  stars: string[];
  /** Local name → the module it was imported from. */
  imports: Map<string, string>;
};

const DECLARATION =
  /\bexport\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\s*\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST =
  /\bexport\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/g;
const EXPORT_STAR =
  /\bexport\s+(?:type\s+)?\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s*["']([^"']+)["']/g;
const IMPORT =
  /\bimport\s+(?:type\s+)?([\w$]+\s*,?\s*)?(?:\{([^}]*)\}|\*\s*as\s+([\w$]+))?\s*from\s*["']([^"']+)["']/g;

/** `a`, `type a`, `a as b` → [local, exported]. */
function specifiers(list: string): Array<[string, string]> {
  return list
    .split(",")
    .map((s) => s.trim().replace(/^type\s+/, ""))
    .filter(Boolean)
    .map((s) => {
      const [local, exported] = s.split(/\s+as\s+/).map((x) => x.trim());
      return [local!, exported ?? local!];
    });
}

/** The shape of a module's text; comments are stripped first. */
export function moduleShape(source: string): ModuleShape {
  const text = stripComments(source);
  const shape: ModuleShape = {
    names: new Set(),
    reexports: new Map(),
    stars: [],
    imports: new Map(),
  };
  for (const m of text.matchAll(IMPORT)) {
    const from = m[4]!;
    const defaultName = m[1]?.replace(/[\s,]/g, "");
    if (defaultName) shape.imports.set(defaultName, from);
    if (m[3]) shape.imports.set(m[3], from);
    for (const [, local] of specifiers(m[2] ?? "")) {
      shape.imports.set(local, from);
    }
  }
  for (const m of text.matchAll(DECLARATION)) shape.names.add(m[1]!);
  for (const m of text.matchAll(EXPORT_LIST)) {
    for (const [local, exported] of specifiers(m[1]!)) {
      shape.names.add(exported);
      const from = m[2] ?? shape.imports.get(local);
      if (from) shape.reexports.set(exported, from);
    }
  }
  for (const m of text.matchAll(EXPORT_STAR)) {
    if (m[1]) shape.names.add(m[1]);
    else shape.stars.push(m[2]!);
  }
  return shape;
}

const EXTENSIONS = [".ts", ".tsx", ".mts", ".d.ts", ".js", ".mjs", ".jsx"];

function resolveFile(base: string): string | null {
  const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
  if (isFile(base)) return base;
  // TypeScript sources import siblings with the `.js` they compile to.
  const stem = base.replace(/\.(?:m?js|jsx)$/, "");
  for (const ext of EXTENSIONS) if (isFile(stem + ext)) return stem + ext;
  for (const ext of EXTENSIONS) {
    const index = path.join(base, `index${ext}`);
    if (isFile(index)) return index;
  }
  return null;
}

/** The first file path an `exports` condition object leads to. */
function pickCondition(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  for (const key of ["import", "default", "node", "require", "types"]) {
    const hit = key in record ? pickCondition(record[key]) : null;
    if (hit) return hit;
  }
  return null;
}

/** A package's module file from its package.json `exports`, `module` or `main`. */
function packageFile(specifier: string, appRoot: string): string | null {
  const parts = specifier.split("/");
  const name = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0]!;
  const subpath = `.${specifier.slice(name.length)}`;
  let dir = path.resolve(appRoot);
  for (;;) {
    const manifestFile = path.join(dir, "node_modules", name, "package.json");
    if (existsSync(manifestFile)) {
      const pkgDir = path.dirname(manifestFile);
      const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
        exports?: unknown;
        module?: string;
        main?: string;
      };
      const exp = manifest.exports;
      let target: string | null = null;
      if (typeof exp === "string") target = subpath === "." ? exp : null;
      else if (exp && typeof exp === "object") {
        const map = exp as Record<string, unknown>;
        const keyed = Object.keys(map).some((k) => k.startsWith("."));
        target = pickCondition(
          keyed ? map[subpath] : subpath === "." ? map : null
        );
      }
      if (!target && subpath === ".")
        target = manifest.module ?? manifest.main ?? "index";
      if (!target && subpath !== ".") target = subpath;
      return target ? resolveFile(path.join(pkgDir, target)) : null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The file a module specifier leads to from `fromFile`, or null when it
 * cannot be found: relative, the `@/` alias, then node resolution from
 * the app's root.
 */
export function resolveModule(
  specifier: string,
  fromFile: string,
  appRoot: string
): string | null {
  if (specifier.startsWith(".")) {
    return resolveFile(path.resolve(path.dirname(fromFile), specifier));
  }
  if (specifier.startsWith("@/")) {
    return resolveFile(path.join(appRoot, specifier.slice(2)));
  }
  const fromPackage = packageFile(specifier, appRoot);
  if (fromPackage) return fromPackage;
  try {
    const resolved = createRequire(path.join(appRoot, "package.json")).resolve(
      specifier
    );
    return existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export type ExportCheck = {
  /** Names the module provably does not export. */
  missing: string[];
  /**
   * `export * from` specifiers that could not be read: the names not
   * found elsewhere are assumed to come from them.
   */
  unresolved: string[];
};

/**
 * Which of `names` the module at `file` does not export, following
 * `export * from` into the modules it can resolve.
 */
export function checkExports(
  file: string,
  names: readonly string[],
  appRoot: string,
  seen: Set<string> = new Set()
): ExportCheck {
  seen.add(file);
  const shape = moduleShape(readFileSync(file, "utf8"));
  let missing = names.filter((n) => !shape.names.has(n));
  const unresolved: string[] = [];
  for (const star of shape.stars) {
    if (missing.length === 0) break;
    const target = resolveModule(star, file, appRoot);
    if (!target) {
      unresolved.push(star);
      continue;
    }
    if (seen.has(target)) continue;
    const inner = checkExports(target, missing, appRoot, seen);
    missing = inner.missing;
    unresolved.push(...inner.unresolved);
  }
  return unresolved.length > 0
    ? { missing: [], unresolved }
    : { missing, unresolved };
}

/**
 * The text of a module and of every module it re-exports from —
 * `export … from`, `export * from`, and imports a bare export list
 * passes on — comments stripped. What a `lib/plans.ts` that re-exports
 * a workspace package's catalogue actually defines.
 */
export function reexportedSource(
  file: string,
  appRoot: string,
  depth = 3
): { text: string; unresolved: string[] } {
  const seen = new Set<string>();
  const unresolved: string[] = [];
  const texts: string[] = [];
  const visit = (current: string, left: number) => {
    if (seen.has(current)) return;
    seen.add(current);
    const source = readFileSync(current, "utf8");
    texts.push(stripComments(source));
    if (left === 0) return;
    const shape = moduleShape(source);
    for (const spec of new Set([...shape.reexports.values(), ...shape.stars])) {
      const target = resolveModule(spec, current, appRoot);
      if (target) visit(target, left - 1);
      else unresolved.push(spec);
    }
  };
  visit(file, depth);
  return { text: texts.join("\n"), unresolved };
}

/** An object key `key:` or `"key":`, not a longer identifier ending in it. */
export function hasObjectKey(text: string, key: string): boolean {
  const k = escapeRegExp(key);
  return new RegExp(`(?:(?<![\\w$-])${k}|["'\`]${k}["'\`])\\s*:`).test(text);
}

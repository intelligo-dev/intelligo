/**
 * The page registry as this CLI ships it.
 *
 * The build copies packages/registry/public/r — the same shadcn-schema
 * JSON intelligo.dev/r serves — into templates/registry, so the items a
 * CLI installs are the ones built with the packages of its own version:
 * `@intelligo-dev/cli@X` syncs the pages of framework X, never whatever
 * the site deployed last. In the framework repository, before a build,
 * the freshly built registry stands in for the bundle.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type RegistryFile = {
  path: string;
  type: string;
  target?: string;
  content?: string;
};

export type RegistryItemJson = {
  name: string;
  type: string;
  files?: RegistryFile[];
  registryDependencies?: string[];
};

/** How items name each other; resolved against this registry. */
export const NAMESPACE = "@intelligo/";

export function resolveRegistryDir(templatesDir: string): string | null {
  const candidates = [
    path.join(templatesDir, "registry"),
    // packages/cli/templates → packages/registry/public/r
    path.resolve(templatesDir, "..", "..", "registry", "public", "r"),
  ];
  return (
    candidates.find((dir) => existsSync(path.join(dir, "intelligo.json"))) ??
    null
  );
}

export function hasRegistryItem(dir: string, name: string): boolean {
  return (
    /^[a-z0-9-]+$/.test(name) && existsSync(path.join(dir, `${name}.json`))
  );
}

export function readRegistryItem(dir: string, name: string): RegistryItemJson {
  if (!hasRegistryItem(dir, name)) {
    throw new Error(`Unknown registry item "${name}".`);
  }
  return JSON.parse(
    readFileSync(path.join(dir, `${name}.json`), "utf8")
  ) as RegistryItemJson;
}

/** Where shadcn writes a file of an item. */
export function installedPath(
  item: Pick<RegistryItemJson, "type">,
  file: RegistryFile
): string | null {
  if (file.target) return file.target;
  if (item.type === "registry:ui") {
    return `components/ui/${path.basename(file.path)}`;
  }
  return null;
}

/**
 * A file as `shadcn add` writes it: the CLI drops the comment block that
 * opens a file, so that header is not part of any comparison.
 */
export function asInstalled(source: string): string {
  return source.replace(/^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*))*\s*/, "");
}

/**
 * The named items and every Intelligo item they pull in through
 * `@intelligo/<name>`, transitively, dependencies first — the set of
 * files one `shadcn add` of each name writes. Dependencies outside the
 * namespace (shadcn's own `utils`, `skeleton`…) are not this registry's
 * to check.
 */
export function registryClosure(
  dir: string,
  names: readonly string[]
): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const item = readRegistryItem(dir, name);
    for (const dep of item.registryDependencies ?? []) {
      if (dep.startsWith(NAMESPACE)) visit(dep.slice(NAMESPACE.length));
    }
    order.push(name);
  };
  for (const name of names) visit(name);
  return order;
}

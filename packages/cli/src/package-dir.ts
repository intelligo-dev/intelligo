import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Where a framework package lives for the app at `root`, found the way
 * Node finds it: the framework repository's own `packages/<dir>` when
 * `root` is that repository, otherwise the nearest `node_modules/<name>`
 * from `root` upward — so a dependency hoisted to a workspace root is
 * found from the app, and an app's own `packages/core` is never taken
 * for the framework's.
 */
export function packageDir(root: string, name: string): string | null {
  const local = path.join(root, "packages", name.split("/").pop()!);
  if (packageNameAt(local) === name) return local;
  let dir = path.resolve(root);
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function packageNameAt(dir: string): string | null {
  const file = path.join(dir, "package.json");
  if (!existsSync(file)) return null;
  try {
    return (
      (JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name ?? null
    );
  } catch {
    return null;
  }
}

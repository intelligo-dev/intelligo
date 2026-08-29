import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where the framework's migration chain lives, relative to the
 * directory the CLI is run from.
 *
 * Two layouts are real: the framework repository itself, where core is
 * a workspace package, and a consumer application, where core arrives
 * from the registry and ships its migrations inside the package (they
 * are in `files`, next to `dist`). The first match wins, so a checkout
 * that has both — the framework repo — reads its own source.
 */
export const MIGRATION_LOCATIONS = [
  "packages/core/src/db/migrations",
  "node_modules/@intelligo/core/src/db/migrations",
] as const;

export function resolveMigrationsDir(root: string): string | null {
  for (const relative of MIGRATION_LOCATIONS) {
    const dir = path.join(root, relative);
    if (existsSync(dir)) return dir;
  }
  return null;
}

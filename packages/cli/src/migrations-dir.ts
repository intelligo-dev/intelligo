import { existsSync } from "node:fs";
import path from "node:path";

import { packageDir } from "./package-dir.js";

/**
 * Where the framework's migration chain lives, relative to the
 * directory the CLI is run from.
 *
 * Two layouts are real: the framework repository itself, where core is
 * a workspace package, and a consumer application, where core arrives
 * from the registry and ships its migrations inside the package (they
 * are in `files`, next to `dist`), found from the app upward, so a
 * workspace that hoists it works too. `MIGRATION_LOCATIONS` names the two
 * layouts for messages.
 */
export const MIGRATION_LOCATIONS = [
  "packages/core/src/db/migrations",
  "node_modules/@intelligo-dev/core/src/db/migrations",
] as const;

export function resolveMigrationsDir(root: string): string | null {
  const core = packageDir(root, "@intelligo-dev/core");
  if (!core) return null;
  const dir = path.join(core, "src", "db", "migrations");
  return existsSync(dir) ? dir : null;
}

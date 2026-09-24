import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import { findWorkspaceRoot } from "./registry-items.js";

/**
 * The env files a Next.js app reads, in the order it reads them: an
 * earlier file wins, and a variable already set in the shell wins over
 * every file.
 *
 * `migrate` and `doctor` run outside Next, so without this a fresh app
 * whose `DATABASE_URL` lives in `.env.local` — exactly what the
 * quickstart says to do — would fail with "DATABASE_URL is required".
 */
export const ENV_FILES = [".env.local", ".env"] as const;

/**
 * Loads the app's env files into `env`, then — when the app is a member
 * of a pnpm workspace — the workspace root's, for an app whose
 * `next.config` falls back to the repository root's `.env`. Precedence,
 * highest first: the shell, the app's `.env.local`, the app's `.env`,
 * the root's `.env.local`, the root's `.env`. A variable already set is
 * never overridden.
 *
 * Returns the files it read, relative to `root` (`.env.local`,
 * `../../.env`).
 */
export function loadAppEnv(
  root: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const dirs = [root];
  const workspaceRoot = findWorkspaceRoot(root);
  if (workspaceRoot && path.resolve(workspaceRoot) !== path.resolve(root)) {
    dirs.push(workspaceRoot);
  }

  const loaded: string[] = [];
  for (const dir of dirs) {
    for (const name of ENV_FILES) {
      const file = path.join(dir, name);
      if (!existsSync(file)) continue;
      const values = parseEnv(readFileSync(file, "utf8"));
      for (const [key, value] of Object.entries(values)) {
        if (env[key] === undefined) env[key] = value;
      }
      loaded.push(path.relative(root, file));
    }
  }
  return loaded;
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

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

export function loadAppEnv(
  root: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const loaded: string[] = [];
  for (const name of ENV_FILES) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    const values = parseEnv(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined) env[key] = value;
    }
    loaded.push(name);
  }
  return loaded;
}

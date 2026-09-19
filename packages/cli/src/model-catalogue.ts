import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Where the shipped model catalogue (`DEFAULT_MODELS`) can be read from,
 * relative to the directory the CLI is run from: the framework
 * repository's own source, then the installed package's source, then
 * its build. The CLI reads the file rather than importing the package,
 * so `doctor` works in an app whose dependencies do not even load.
 */
export const MODEL_CATALOGUE_LOCATIONS = [
  "packages/executions/src/pricing.ts",
  "node_modules/@intelligo-dev/executions/src/pricing.ts",
  "node_modules/@intelligo-dev/executions/dist/pricing.js",
] as const;

/**
 * The ids `DEFAULT_MODELS` prices, or null when no catalogue file is
 * found or the declaration is not in it.
 */
export function readCatalogueModelIds(root: string): Set<string> | null {
  for (const relative of MODEL_CATALOGUE_LOCATIONS) {
    const file = path.join(root, relative);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const start = text.indexOf("export const DEFAULT_MODELS");
    if (start === -1) continue;
    return new Set(
      [
        ...text.slice(start).matchAll(/\bid:\s*"([a-z0-9-]+\/[a-z0-9._-]+)"/g),
      ].map((m) => m[1]!)
    );
  }
  return null;
}

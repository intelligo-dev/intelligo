/**
 * The registry's pages as `intelligo create` offers them: what each one
 * is, what else it needs installed first, and the commands that install
 * a selection into a fresh app.
 *
 * Installing is the shadcn CLI's job, not this package's — the items
 * are shadcn-schema JSON served at intelligo.dev/r, and the scaffold's
 * components.json already names that registry as `@intelligo`. What the
 * CLI adds is the order: an item that imports a sibling's files
 * (requires.json `items`) has to land after it.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RegistryRequires } from "./commands/doctor.js";

export type RegistryItem = { title: string; description: string };
export type RegistryCatalogue = {
  items: Record<string, RegistryItem>;
  requires: RegistryRequires;
};

/** Both files are build-time copies from packages/registry (see scripts/). */
export function readRegistryCatalogue(templatesDir: string): RegistryCatalogue {
  const read = (file: string) =>
    JSON.parse(readFileSync(path.join(templatesDir, file), "utf8"));
  return {
    items: (
      read("registry-items.json") as { items: Record<string, RegistryItem> }
    ).items,
    requires: read("registry-requires.json") as RegistryRequires,
  };
}

/** The description's opening clause — short enough for one picker line. */
export function shortDescription(description: string, max = 64): string {
  const head = description.split(/[:.]\s|\s—\s/)[0]!.trim();
  return head.length <= max ? head : `${head.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The selection plus everything it depends on, dependencies first.
 * Unknown names throw rather than being dropped: a typo in `--items`
 * should not quietly install less than was asked for.
 */
export function withDependencies(
  selected: readonly string[],
  requires: RegistryRequires
): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    const entry = requires.items[name];
    if (!entry) {
      throw new Error(
        `Unknown registry item "${name}". Available: ${Object.keys(requires.items).join(", ")}`
      );
    }
    seen.add(name);
    for (const dependency of entry.items ?? []) visit(dependency);
    order.push(name);
  };
  for (const name of selected) visit(name);
  return order;
}

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

/**
 * Whichever manager ran the CLI (`pnpm dlx`, `npx`, `bunx`… all set
 * npm_config_user_agent), else pnpm — the one the scaffold documents.
 */
export function detectPackageManager(
  userAgent: string | undefined = process.env.npm_config_user_agent
): PackageManager {
  const name = userAgent?.split("/")[0];
  return name === "npm" || name === "yarn" || name === "bun" ? name : "pnpm";
}

export type Command = { command: string; args: string[] };

export function formatCommand(c: Command): string {
  return [c.command, ...c.args].join(" ");
}

const EXEC: Record<PackageManager, string[]> = {
  pnpm: ["pnpm", "exec"],
  npm: ["npx"],
  yarn: ["yarn"],
  bun: ["bunx"],
};

/** Whether the app has its own shadcn binary, i.e. dependencies are installed. */
export function hasLocalShadcn(appRoot: string): boolean {
  return existsSync(path.join(appRoot, "node_modules", ".bin", "shadcn"));
}

/**
 * The commands that put `items` into the app at `appRoot`: install the
 * dependencies when shadcn is not there yet (the scaffold declares it),
 * then the design-system base, then the items in dependency order.
 * `--overwrite` because the base replaces the scaffold's globals.css,
 * and items that share a file agree on it — the same flags the
 * reference app is regenerated with.
 */
export function installPlan(
  items: readonly string[],
  options: { appRoot: string; packageManager: PackageManager }
): Command[] {
  if (items.length === 0) return [];
  const [command, ...exec] = EXEC[options.packageManager];
  const add = (names: string[]): Command => ({
    command: command!,
    args: [
      ...exec,
      "shadcn",
      "add",
      ...names.map((n) => `@intelligo/${n}`),
      "--yes",
      "--overwrite",
    ],
  });
  return [
    ...(hasLocalShadcn(options.appRoot)
      ? []
      : [{ command: options.packageManager, args: ["install"] }]),
    add(["intelligo"]),
    add([...items]),
  ];
}

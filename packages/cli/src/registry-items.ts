/**
 * The registry's pages as `intelligo create` offers them: what each one
 * is, what else it needs installed first, and the commands that install
 * a selection into a fresh app.
 *
 * Installing goes through `intelligo sync` (commands/sync.ts): one
 * `shadcn add` per item from the registry bundled with this CLI, in the
 * order requires.json `items` implies — an item that imports a
 * sibling's files lands after it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

export type Command = {
  command: string;
  args: string[];
  /** Where it runs, when not the app itself (a parent workspace's root). */
  cwd?: string;
};

/**
 * The command as a reader pastes it from `from` (the app's directory):
 * a command that runs elsewhere is wrapped in a `cd`.
 */
export function formatCommand(c: Command, from?: string): string {
  const line = [c.command, ...c.args].join(" ");
  if (!c.cwd || !from || path.resolve(c.cwd) === path.resolve(from)) {
    return line;
  }
  return `(cd ${path.relative(from, c.cwd) || "."} && ${line})`;
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

/** The `packages:` globs of a pnpm-workspace.yaml (`!` exclusions kept). */
export function workspaceGlobs(yaml: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    const key = /^packages\s*:\s*(.*)$/.exec(line);
    if (key) {
      const flow = /^\[(.*)\]$/.exec(key[1]!.trim());
      if (flow) {
        for (const g of flow[1]!.split(",")) {
          const glob = g.trim().replace(/^["']|["']$/g, "");
          if (glob) globs.push(glob);
        }
      } else inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const entry = /^\s+-\s*(.+?)\s*$/.exec(line);
    if (entry) globs.push(entry[1]!.replace(/^["']|["']$/g, ""));
    else if (/^\S/.test(line)) inPackages = false;
  }
  return globs;
}

function globToRegExp(glob: string): RegExp {
  const pattern = glob
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
    .split(/(\*\*|\*|\?)/)
    .map((part) =>
      part === "**"
        ? ".*"
        : part === "*"
          ? "[^/]*"
          : part === "?"
            ? "[^/]"
            : part.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    )
    .join("");
  return new RegExp(`^${pattern}$`);
}

/**
 * The root of the pnpm workspace that has `appRoot` as a member, if
 * any: the nearest pnpm-workspace.yaml above the app, when one of its
 * `packages` globs matches the app's path and no `!` glob excludes it.
 * Installing from there updates the workspace's one lockfile instead of
 * starting a nested one in the app.
 */
export function findWorkspaceRoot(appRoot: string): string | null {
  const app = path.resolve(appRoot);
  let dir = path.dirname(app);
  for (;;) {
    const file = path.join(dir, "pnpm-workspace.yaml");
    if (existsSync(file)) {
      const rel = path.relative(dir, app).split(path.sep).join("/");
      const globs = workspaceGlobs(readFileSync(file, "utf8"));
      const included = globs
        .filter((g) => !g.startsWith("!"))
        .some((g) => globToRegExp(g).test(rel));
      const excluded = globs
        .filter((g) => g.startsWith("!"))
        .some((g) => globToRegExp(g.slice(1)).test(rel));
      return included && !excluded ? dir : null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** `name` from a package.json, or null when it has none or is unreadable. */
function packageName(dir: string): string | null {
  try {
    const { name } = JSON.parse(
      readFileSync(path.join(dir, "package.json"), "utf8")
    ) as { name?: unknown };
    return typeof name === "string" && name ? name : null;
  } catch {
    return null;
  }
}

/** Directories under `root` whose relative path a glob matches. */
function expandGlob(root: string, glob: string): string[] {
  const matcher = globToRegExp(glob);
  const found: string[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > 6) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (matcher.test(relPath)) found.push(full);
      walk(full, relPath, depth + 1);
    }
  };
  walk(root, "", 0);
  return found;
}

/**
 * Every package name in the pnpm workspace rooted at `root`: the root's
 * own and each member's, by absolute directory. Two packages sharing a
 * name break `pnpm --filter` and workspace resolution.
 */
export function workspacePackages(root: string): Map<string, string> {
  const packages = new Map<string, string>();
  const rootName = packageName(root);
  if (rootName) packages.set(path.resolve(root), rootName);

  let yaml = "";
  try {
    yaml = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  } catch {
    return packages;
  }
  const globs = workspaceGlobs(yaml);
  const excludes = globs
    .filter((g) => g.startsWith("!"))
    .map((g) => globToRegExp(g.slice(1)));
  for (const glob of globs.filter((g) => !g.startsWith("!"))) {
    for (const dir of expandGlob(root, glob)) {
      const rel = path.relative(root, dir).split(path.sep).join("/");
      if (excludes.some((re) => re.test(rel))) continue;
      const name = packageName(dir);
      if (name) packages.set(dir, name);
    }
  }
  return packages;
}

/** The design-system base, installed before any page. */
const BASE = "intelligo";

export type InstallPlan = {
  /**
   * The dependency install, when shadcn is not there yet (the scaffold
   * declares it) — run from the parent workspace's root when the app is
   * a member of one.
   */
  install: Command | null;
  /** The items `intelligo sync` installs: the base first, then the pages in dependency order. */
  items: string[];
  /** The same sync as a command, for a reader to run by hand. */
  sync: Command;
};

/**
 * How `items` get into the app at `appRoot`: the dependencies first
 * when shadcn is missing, then `intelligo sync` of the base and every
 * item — one `shadcn add` per item in dependency order, from the
 * registry bundled with this CLI, with `--force` because a fresh
 * scaffold's files (globals.css, the theme provider) are the registry's
 * to replace. Null when nothing was picked.
 */
export function installPlan(
  items: readonly string[],
  options: {
    appRoot: string;
    packageManager: PackageManager;
    workspaceRoot?: string | null;
  }
): InstallPlan | null {
  if (items.length === 0) return null;
  const packageManager = options.workspaceRoot
    ? "pnpm"
    : options.packageManager;
  const [command, ...exec] = EXEC[packageManager];
  const synced = [BASE, ...items.filter((n) => n !== BASE)];
  return {
    install: hasLocalShadcn(options.appRoot)
      ? null
      : {
          command: packageManager,
          args: ["install"],
          cwd: options.workspaceRoot ?? options.appRoot,
        },
    items: synced,
    sync: {
      command: command!,
      args: [...exec, "intelligo", "sync", ...synced, "--force"],
      cwd: options.appRoot,
    },
  };
}

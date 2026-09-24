/**
 * `intelligo create <name>` — a new application on the framework.
 *
 * This is onboarding, not the product boundary: what it writes is the
 * consumer's from the moment it lands, and the enduring relationship is the versioned packages, not this
 * scaffold. So it generates through the same manifest machinery as
 * `add`, which means the very first upgrade already knows which files
 * you have since edited.
 *
 * In a terminal it asks for the project name when none is given, then
 * which registry pages to install (`--items a,b` or `--all` answer that
 * without asking). The pages are installed by `intelligo sync` — one
 * `shadcn add` per item, from the registry this CLI carries — after the
 * dependencies (from the root of a parent pnpm workspace when the app is
 * a member of one), and only once you approve the exact commands, or
 * pass `--yes`. `--no-install` stops after the scaffold and prints them
 * instead.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  addFeature,
  formatAddResult,
  readCatalogue,
  type AddResult,
} from "./add.js";
import {
  findWorkspaceRoot,
  formatCommand,
  type Command,
  type PackageManager,
} from "../registry-items.js";

export type CreateOptions = {
  /** Directory to create the app in; created if absent. */
  target: string;
  templatesDir: string;
  frameworkVersion: string;
  /**
   * Emit `workspace:*` for the @intelligo-dev/* dependencies instead of a
   * version range. Only meaningful when scaffolding inside this
   * monorepo — outside it, pnpm fails the install with "workspace
   * protocol used outside a workspace".
   */
  linkWorkspace?: boolean;
  /** The project name, when it is not the directory's. */
  name?: string;
  /**
   * The package manager that will install the app. Under pnpm, an app
   * outside any workspace also gets `pnpm-standalone`: its own
   * workspace file declining the dependency build scripts pnpm 10+
   * would otherwise stop the install over.
   */
  packageManager?: PackageManager;
};

/** A package name and product slug derived from the directory name. */
export function deriveNames(target: string): {
  appName: string;
  appSlug: string;
} {
  const base = path.basename(path.resolve(target));
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error(`Cannot derive a project name from "${target}".`);
  }
  return { appName: slug, appSlug: slug };
}

/** A fresh repository — `git init`, then `intelligo create .` — is still empty. */
const IGNORED_ENTRIES = new Set([".git"]);

export function isOccupied(target: string): boolean {
  const dir = path.resolve(target);
  return (
    existsSync(dir) &&
    readdirSync(dir).some((entry) => !IGNORED_ENTRIES.has(entry))
  );
}

/** Scaffolding into an occupied directory is how people lose work. */
export function assertNotOccupied(target: string): void {
  if (isOccupied(target)) {
    throw new Error(
      `${path.resolve(target)} is not empty. Create the app in a new directory, ` +
        "or in an empty one (a .git directory may already be there)."
    );
  }
}

export function createApp(options: CreateOptions): AddResult {
  const target = path.resolve(options.target);

  assertNotOccupied(target);
  // Before the directory exists, so a name that slugifies to nothing
  // leaves nothing behind.
  const { appName, appSlug } = deriveNames(options.name || target);
  mkdirSync(target, { recursive: true });
  const workspaceRoot = findWorkspaceRoot(target);

  const scaffold = addFeature("app-scaffold", {
    appRoot: target,
    templatesDir: options.templatesDir,
    frameworkVersion: options.frameworkVersion,
    variables: {
      __APP_NAME__: appName,
      __APP_SLUG__: appSlug,
      __INTELLIGO_DEP__: options.linkWorkspace
        ? "workspace:*"
        : `^${options.frameworkVersion}`,
      ...workspaceRootVariable(target),
    },
  });

  // A member of a parent workspace installs from that root; a workspace
  // file of its own would take it out of it.
  const standalone =
    options.packageManager === "pnpm" &&
    workspaceRoot === null &&
    STANDALONE in readCatalogue(options.templatesDir);
  if (!standalone) return scaffold;

  const pnpm = addFeature(STANDALONE, {
    appRoot: target,
    templatesDir: options.templatesDir,
    frameworkVersion: options.frameworkVersion,
  });
  return { ...scaffold, written: [...scaffold.written, ...pnpm.written] };
}

const STANDALONE = "pnpm-standalone";

/**
 * `__WORKSPACE_ROOT__` for the scaffold's next.config: a JavaScript
 * literal naming the enclosing pnpm workspace's root relative to the
 * app, or null when the app is not a member of one — the rule `doctor`
 * and `migrate` load env files by.
 */
export function workspaceRootVariable(target: string): Record<string, string> {
  const root = findWorkspaceRoot(path.resolve(target));
  return {
    __WORKSPACE_ROOT__: root
      ? JSON.stringify(
          path.relative(path.resolve(target), root).split(path.sep).join("/")
        )
      : "null",
  };
}

export type NextSteps = {
  packageManager: PackageManager;
  /** Whether `create` already installed the dependencies. */
  installed: boolean;
  /** Install commands the developer declined, or that did not get to run. */
  pending?: Command[];
  /** The parent pnpm workspace the app is a member of, installed from its root. */
  workspaceRoot?: string | null;
};

/** A path the reader can paste into a shell, spaces and quotes included. */
function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}

export function formatNextSteps(target: string, next: NextSteps): string {
  const pm = next.packageManager;
  const appRoot = path.resolve(target);
  const install: Command = {
    command: pm,
    args: ["install"],
    cwd: next.workspaceRoot ?? appRoot,
  };
  return [
    `cd ${shellQuote(path.relative(process.cwd(), appRoot) || ".")}`,
    "cp .env.example .env.local   # then fill it in",
    ...(next.pending?.length
      ? next.pending.map((c) => formatCommand(c, appRoot))
      : next.installed
        ? []
        : [formatCommand(install, appRoot)]),
    `${pm === "npm" ? "npm run" : pm} dev`,
  ].join("\n");
}

export function formatCreateResult(
  target: string,
  r: AddResult,
  next: NextSteps = { packageManager: "pnpm", installed: false }
): string {
  return [
    formatAddResult(r),
    "",
    "Next:",
    ...formatNextSteps(target, next)
      .split("\n")
      .map((line) => `  ${line}`),
    "",
    "`intelligo doctor` will tell you what is still missing.",
  ].join("\n");
}

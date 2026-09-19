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
 * without asking). The pages are installed by the shadcn CLI the scaffold
 * declares, after the dependencies — and only once you approve the exact
 * commands, or pass `--yes`. `--no-install` stops after the scaffold and
 * prints them instead.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import { addFeature, formatAddResult, type AddResult } from "./add.js";
import {
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

export function isOccupied(target: string): boolean {
  const dir = path.resolve(target);
  return existsSync(dir) && readdirSync(dir).length > 0;
}

/** Scaffolding into an occupied directory is how people lose work. */
export function assertNotOccupied(target: string): void {
  if (isOccupied(target)) {
    throw new Error(
      `${path.resolve(target)} is not empty. Create the app in a new directory, or use ` +
        `\`intelligo add app-scaffold\` inside an existing one.`
    );
  }
}

export function createApp(options: CreateOptions): AddResult {
  const target = path.resolve(options.target);

  assertNotOccupied(target);
  mkdirSync(target, { recursive: true });

  const { appName, appSlug } = deriveNames(target);

  return addFeature("app-scaffold", {
    appRoot: target,
    templatesDir: options.templatesDir,
    frameworkVersion: options.frameworkVersion,
    variables: {
      __APP_NAME__: appName,
      __APP_SLUG__: appSlug,
      __INTELLIGO_DEP__: options.linkWorkspace
        ? "workspace:*"
        : `^${options.frameworkVersion}`,
    },
  });
}

export type NextSteps = {
  packageManager: PackageManager;
  /** Whether `create` already installed the dependencies. */
  installed: boolean;
  /** Install commands the developer declined, or that did not get to run. */
  pending?: Command[];
};

/** A path the reader can paste into a shell, spaces and quotes included. */
function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}

export function formatNextSteps(target: string, next: NextSteps): string {
  const pm = next.packageManager;
  return [
    `cd ${shellQuote(path.relative(process.cwd(), path.resolve(target)) || ".")}`,
    "cp .env.example .env.local   # then fill it in",
    ...(next.pending?.length
      ? next.pending.map(formatCommand)
      : next.installed
        ? []
        : [`${pm} install`]),
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

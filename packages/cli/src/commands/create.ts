/**
 * `intelligo create <name>` — a new application on the framework.
 *
 * ADR-0001 is explicit that this is onboarding, not the product
 * boundary: what it writes is the consumer's from the moment it lands,
 * and the enduring relationship is the versioned packages, not this
 * scaffold. So it generates through the same manifest machinery as
 * `add`, which means the very first upgrade already knows which files
 * you have since edited.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import { addFeature, formatAddResult, type AddResult } from "./add.js";

export type CreateOptions = {
  /** Directory to create the app in; created if absent. */
  target: string;
  templatesDir: string;
  frameworkVersion: string;
  /**
   * Emit `workspace:*` for the @intelligo/* dependencies instead of a
   * version range. Only meaningful when scaffolding inside this
   * monorepo — outside it, pnpm fails the install with "workspace
   * protocol used outside a workspace", which is the first thing a new
   * user would have seen.
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

export function createApp(options: CreateOptions): AddResult {
  const target = path.resolve(options.target);

  if (existsSync(target) && readdirSync(target).length > 0) {
    // Scaffolding into an occupied directory is how people lose work.
    throw new Error(
      `${target} is not empty. Create the app in a new directory, or use ` +
        `\`intelligo add app-scaffold\` inside an existing one.`
    );
  }
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

export function formatCreateResult(target: string, r: AddResult): string {
  return [
    formatAddResult(r),
    "",
    "Next:",
    `  cd ${path.relative(process.cwd(), path.resolve(target)) || "."}`,
    "  cp .env.example .env.local   # then fill it in",
    "  pnpm install",
    "  pnpm dev",
    "",
    "`intelligo doctor` will tell you what is still missing.",
  ].join("\n");
}

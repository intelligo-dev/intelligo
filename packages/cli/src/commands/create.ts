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
 *
 * `--locales en,mn` routes those locales, the first as the default. The
 * registry ships English and Mongolian copy; another locale renders in
 * English until the app translates it.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  addFeature,
  formatAddResult,
  readCatalogue,
  type AddResult,
} from "./add.js";
import {
  findWorkspaceRoot,
  workspacePackages,
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
  /**
   * The app's locales, the default first — `["en", "mn"]`. The registry
   * ships English and Mongolian; another locale renders in English until
   * the app translates it. English alone when unset.
   */
  locales?: string[];
};

/** A package name and product slug derived from the directory name. */
export function deriveNames(target: string): {
  appName: string;
  appSlug: string;
} {
  const slug = slugify(path.basename(path.resolve(target)));
  if (!slug) {
    throw new Error(`Cannot derive a project name from "${target}".`);
  }
  return { appName: slug, appSlug: slug };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The app's package name. Outside a workspace, and inside one where it is
 * free, it is `appName`. A workspace member whose name another package
 * already has (the root is usually named after the product, as `--name`
 * is) is `@<scope>/<directory>` instead, the scope taken from the root's
 * own scope or name — `apps/app` in workspace `acme` is `@acme/app`.
 */
export function packageNameFor(
  target: string,
  appName: string,
  workspaceRoot: string | null
): string {
  if (!workspaceRoot) return appName;
  const app = path.resolve(target);
  const taken = new Set(
    [...workspacePackages(workspaceRoot)]
      .filter(([dir]) => dir !== app)
      .map(([, name]) => name)
  );
  if (!taken.has(appName)) return appName;

  const rootName = workspacePackages(workspaceRoot).get(
    path.resolve(workspaceRoot)
  );
  const scope =
    rootName?.match(/^@([^/]+)\//)?.[1] ??
    (slugify(rootName ?? "") || slugify(path.basename(workspaceRoot)));
  const dir = slugify(path.basename(app)) || "app";
  for (const candidate of [`@${scope}/${dir}`, `@${scope}/${dir}-app`]) {
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(
    `Every package name for ${app} is taken in the workspace at ${workspaceRoot} ` +
      `(${appName}, @${scope}/${dir}, @${scope}/${dir}-app). Pass another --name.`
  );
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
      __PACKAGE_NAME__: packageNameFor(target, appName, workspaceRoot),
      __APP_SLUG__: appSlug,
      __INTELLIGO_DEP__: options.linkWorkspace
        ? "workspace:*"
        : `^${options.frameworkVersion}`,
      ...workspaceRootVariable(target),
      ...registryVariable(options.frameworkVersion, options.linkWorkspace),
      ...localeVariables(options.locales),
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

/** A BCP 47 tag of the shape next-intl routes on: `en`, `mn`, `pt-BR`. */
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

/**
 * `__LOCALES__` and `__DEFAULT_LOCALE__` for i18n/routing.ts: the first
 * locale is the default. None given leaves the template's English.
 */
export function localeVariables(
  locales: readonly string[] | undefined
): Record<string, string> {
  if (!locales || locales.length === 0) return {};
  const bad = locales.filter((locale) => !LOCALE.test(locale));
  if (bad.length > 0) {
    throw new Error(
      `--locales takes language tags such as en,mn — not ${bad.join(", ")}.`
    );
  }
  const unique = [...new Set(locales)];
  return {
    __LOCALES__: JSON.stringify(unique),
    __DEFAULT_LOCALE__: JSON.stringify(unique[0]),
  };
}

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

/**
 * `__INTELLIGO_REGISTRY__` for the scaffold's components.json: where the
 * `@intelligo` namespace installs pages from. /r serves the release npm
 * tags `latest`, so a prerelease's pages are its own copy at
 * /r/<version>/. An app linked to the workspace builds against the tree
 * and keeps the unversioned URL.
 */
export function registryVariable(
  frameworkVersion: string,
  linkWorkspace = false
): Record<string, string> {
  const release =
    frameworkVersion.includes("-") && !linkWorkspace
      ? `${frameworkVersion}/`
      : "";
  return {
    __INTELLIGO_REGISTRY__: `https://intelligo.dev/r/${release}{name}.json`,
  };
}

/** Whether the app at `appRoot` takes @intelligo-dev/* from a workspace. */
export function linksWorkspace(appRoot: string): boolean {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(appRoot, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    return Object.entries(manifest.dependencies ?? {}).some(
      ([name, spec]) =>
        name.startsWith("@intelligo-dev/") && spec.startsWith("workspace:")
    );
  } catch {
    return false;
  }
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
    "cp .env.example .env.local   # then set DATABASE_URL and BETTER_AUTH_SECRET",
    ...(next.pending?.length
      ? next.pending.map((c) => formatCommand(c, appRoot))
      : next.installed
        ? []
        : [formatCommand(install, appRoot)]),
    `${pm === "npm" ? "npm run" : pm} db:migrate   # the framework's tables, then yours`,
    `${pm === "npm" ? "npm run" : pm} dev`,
    "# sign up, then make yourself a platform admin:",
    `${pm === "npm" ? "npx" : `${pm} exec`} intelligo admin grant <your email>`,
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

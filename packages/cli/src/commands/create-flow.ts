/**
 * The conversation around `createApp`: ask what the flags did not say,
 * scaffold, and install the chosen registry items once the developer
 * has approved the commands that do it. The items go in through
 * `intelligo sync` — one `shadcn add` per item from the registry this
 * CLI carries, recorded in the manifest — exactly as a later sync
 * would put them back.
 *
 * Nothing runs on the developer's machine without their say-so. In a
 * terminal the commands are shown and confirmed; without one (CI, a
 * pipe) they run only under `--yes`, and are otherwise printed.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

import * as p from "@clack/prompts";

import {
  assertNotOccupied,
  createApp,
  deriveNames,
  formatCreateResult,
  formatNextSteps,
  isOccupied,
} from "./create.js";
import { syncApply, type SyncContext } from "./sync.js";
import { resolveRegistryDir } from "../registry-bundle.js";
import {
  detectPackageManager,
  findWorkspaceRoot,
  formatCommand,
  installPlan,
  readRegistryCatalogue,
  shortDescription,
  withDependencies,
  type Command,
  type InstallPlan,
} from "../registry-items.js";

export type CreateFlags = {
  target?: string;
  /** `--items a,b` — install these without asking. */
  items?: string[];
  /** `--all` — every page item. */
  all: boolean;
  /** `--yes` — approve the install commands without asking. */
  yes: boolean;
  /** `--no-install` — scaffold only; print the install commands. */
  install: boolean;
  /**
   * `--link-workspace` — for scaffolding inside the Intelligo monorepo,
   * where the packages are workspace members. The default is a version
   * range, because that is what works everywhere else.
   */
  linkWorkspace: boolean;
};

export function parseCreateFlags(args: readonly string[]): CreateFlags {
  let target: string | undefined;
  let items: string[] | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--items" || arg.startsWith("--items=")) {
      const list = arg === "--items" ? (args[++i] ?? "") : arg.slice(8);
      items = list
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (!arg.startsWith("-") && target === undefined) {
      target = arg;
    }
  }
  return {
    target,
    items,
    all: args.includes("--all"),
    yes: args.includes("--yes") || args.includes("-y"),
    install: !args.includes("--no-install"),
    linkWorkspace: args.includes("--link-workspace"),
  };
}

/** The pages a first app most likely wants; the picker starts with them ticked. */
const SUGGESTED = ["app-shell", "auth-login", "auth-signup", "dashboard"];

function bail(
  value: unknown,
  message = "Nothing was created."
): value is symbol {
  if (!p.isCancel(value)) return false;
  p.cancel(message);
  return true;
}

function run(c: Command, cwd: string): boolean {
  const result = spawnSync(c.command, c.args, {
    cwd,
    stdio: "inherit",
    // pnpm, npx and friends are .cmd shims on Windows.
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

/**
 * Run the plan: the dependency install, then the sync. Returns the
 * commands still to run by hand — none when both succeeded.
 */
async function installPages(
  plan: InstallPlan,
  options: {
    appRoot: string;
    interactive: boolean;
    show: (c: Command) => string;
    syncContext: SyncContext;
  }
): Promise<Command[]> {
  const { appRoot, interactive, show } = options;
  const say = (line: string) =>
    interactive ? p.log.step(line) : console.log(line);
  const fail = (message: string) =>
    interactive ? p.log.error(message) : console.error(message);
  if (plan.install) {
    say(`› ${show(plan.install)}`);
    if (!run(plan.install, plan.install.cwd ?? appRoot)) {
      fail(
        `\`${show(plan.install)}\` failed — the scaffold is in place; run the rest by hand.`
      );
      return [plan.install, plan.sync];
    }
  }
  say(`› ${show(plan.sync)}`);
  const code = await syncApply(plan.items, options.syncContext, {
    force: true,
    log: say,
  });
  if (code !== 0) {
    fail(
      "The pages did not all install — the scaffold is in place; re-run the sync by hand."
    );
    return [plan.sync];
  }
  return [];
}

export async function runCreate(
  flags: CreateFlags,
  context: {
    templatesDir: string;
    frameworkVersion: string;
    /** stdin and stdout are a terminal: prompts are allowed. */
    interactive: boolean;
  }
): Promise<number> {
  const { interactive } = context;
  const catalogue = readRegistryCatalogue(context.templatesDir);
  const packageManager = detectPackageManager();

  if (interactive) p.intro("intelligo create");

  // 1. Where.
  let target = flags.target;
  if (!target) {
    if (!interactive) {
      console.error(
        "Usage: intelligo create <directory> [--items a,b | --all] [--yes] [--no-install]"
      );
      return 1;
    }
    const answer = await p.text({
      message: "Project name",
      placeholder: "my-app",
      validate: (v) => {
        if (!v) return "A name is required.";
        try {
          deriveNames(v);
        } catch (error) {
          return (error as Error).message;
        }
        return isOccupied(v) ? `${v} is not empty.` : undefined;
      },
    });
    if (bail(answer)) return 1;
    target = answer;
  }
  // Before any question about items, so nobody chooses pages for an
  // app that is then refused.
  assertNotOccupied(target);

  // 2. What.
  let selected: string[] = [];
  if (flags.all) selected = Object.keys(catalogue.items);
  else if (flags.items) selected = flags.items;
  else if (interactive) {
    const answer = await p.multiselect({
      message: "Which pages should be installed? (space to toggle)",
      options: Object.entries(catalogue.items).map(([name, item]) => ({
        value: name,
        label: item.title,
        hint: shortDescription(item.description),
      })),
      initialValues: SUGGESTED.filter((n) => n in catalogue.items),
      required: false,
    });
    if (bail(answer)) return 1;
    selected = answer;
  }
  const items = withDependencies(selected, catalogue.requires);
  const added = items.filter((n) => !selected.includes(n));
  if (interactive && added.length > 0) {
    p.log.info(`Also installing what they build on: ${added.join(", ")}`);
  }

  // 3. The scaffold.
  const result = createApp({
    target,
    templatesDir: context.templatesDir,
    frameworkVersion: context.frameworkVersion,
    linkWorkspace: flags.linkWorkspace,
  });
  const appRoot = path.resolve(target);
  if (interactive) {
    p.log.success(`Scaffolded ${result.written.length} files in ${target}`);
  }

  // 4. The pages — only with approval.
  const workspaceRoot = findWorkspaceRoot(appRoot);
  const plan = installPlan(items, { appRoot, packageManager, workspaceRoot });
  const commands: Command[] = plan
    ? [...(plan.install ? [plan.install] : []), plan.sync]
    : [];
  const show = (c: Command) => formatCommand(c, appRoot);
  const registryDir = resolveRegistryDir(context.templatesDir);
  if (plan && flags.install && !registryDir) {
    console.error(
      "This CLI has no bundled registry to install pages from — in the framework repository, run `pnpm registry:build` first."
    );
  }
  let approved = plan !== null && flags.install && flags.yes && !!registryDir;
  if (plan && flags.install && registryDir && !flags.yes && interactive) {
    p.note(commands.map(show).join("\n"), "Commands to run in " + target);
    const answer = await p.confirm({
      message: plan.install
        ? `shadcn is not installed yet — install the dependencies (shadcn included) with ${plan.install.command}${workspaceRoot ? " from the workspace root" : ""} and add ${items.length} page(s)?`
        : `Add ${items.length} page(s) with shadcn?`,
    });
    if (bail(answer, `The scaffold is in ${target}; nothing was installed.`))
      return 1;
    approved = answer;
  }

  const pending =
    approved && plan && registryDir
      ? await installPages(plan, {
          appRoot,
          interactive,
          show,
          syncContext: {
            appRoot,
            registryDir,
            requires: catalogue.requires,
            frameworkVersion: context.frameworkVersion,
          },
        })
      : commands;

  const next = {
    packageManager: workspaceRoot ? ("pnpm" as const) : packageManager,
    installed: approved && pending.length === 0,
    pending,
    workspaceRoot,
  };
  if (interactive) {
    p.note(formatNextSteps(target, next), "Next");
    p.outro(
      next.installed ? `${items.length} page(s) installed.` : "Scaffold ready."
    );
  } else {
    console.log(formatCreateResult(target, result, next));
  }
  // A failed install is a failure; a declined one is a choice.
  return approved && pending.length > 0 ? 1 : 0;
}

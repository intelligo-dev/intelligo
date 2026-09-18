/**
 * The conversation around `createApp`: ask what the flags did not say,
 * scaffold, and install the chosen registry items once the developer
 * has approved the commands that do it.
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
import {
  detectPackageManager,
  formatCommand,
  hasLocalShadcn,
  installPlan,
  readRegistryCatalogue,
  shortDescription,
  withDependencies,
  type Command,
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
  const plan = installPlan(items, { appRoot, packageManager });
  let approved = plan.length > 0 && flags.install && flags.yes;
  if (plan.length > 0 && flags.install && !flags.yes && interactive) {
    const needsInstall = !hasLocalShadcn(appRoot);
    p.note(plan.map(formatCommand).join("\n"), "Commands to run in " + target);
    const answer = await p.confirm({
      message: needsInstall
        ? `shadcn is not installed yet — install the dependencies (shadcn included) with ${packageManager} and add ${items.length} page(s)?`
        : `Add ${items.length} page(s) with shadcn?`,
    });
    if (bail(answer, `The scaffold is in ${target}; nothing was installed.`))
      return 1;
    approved = answer;
  }

  let pending: Command[] = [];
  if (approved) {
    for (const [i, command] of plan.entries()) {
      if (interactive) p.log.step(formatCommand(command));
      else console.log(`› ${formatCommand(command)}`);
      if (!run(command, appRoot)) {
        pending = plan.slice(i);
        const message = `\`${formatCommand(command)}\` failed — the scaffold is in place; run the rest by hand.`;
        if (interactive) p.log.error(message);
        else console.error(message);
        break;
      }
    }
  } else {
    pending = plan;
  }

  const next = {
    packageManager,
    installed: approved && pending.length === 0,
    pending,
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

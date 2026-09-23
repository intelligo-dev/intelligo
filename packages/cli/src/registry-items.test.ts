/**
 * What `create` installs is decided here, so the behaviours worth
 * pinning are the ones a developer would otherwise discover as a broken
 * app: a sibling item missing or installed too late, a typo installing
 * less than was asked for, shadcn run before it exists, a nested
 * install in a workspace member.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  detectPackageManager,
  findWorkspaceRoot,
  formatCommand,
  installPlan,
  readRegistryCatalogue,
  shortDescription,
  withDependencies,
  workspaceGlobs,
} from "./registry-items.js";
import type { RegistryRequires } from "./commands/doctor.js";

const requires: RegistryRequires = {
  scaffold: [],
  items: {
    "route-error": { marker: "a" },
    pricing: { marker: "b" },
    usage: { marker: "c", items: ["pricing", "route-error"] },
    chat: { marker: "d", items: ["route-error"] },
    "chat-panel": { marker: "e", items: ["chat"] },
  } as RegistryRequires["items"],
};

describe("withDependencies", () => {
  it("puts what an item imports before it", () => {
    expect(withDependencies(["chat-panel"], requires)).toEqual([
      "route-error",
      "chat",
      "chat-panel",
    ]);
  });

  it("installs a shared dependency once", () => {
    expect(withDependencies(["usage", "chat"], requires)).toEqual([
      "pricing",
      "route-error",
      "usage",
      "chat",
    ]);
  });

  it("refuses a name it does not know rather than installing less", () => {
    expect(() => withDependencies(["chta"], requires)).toThrow(
      /Unknown registry item "chta"/
    );
  });
});

describe("detectPackageManager", () => {
  it("uses whichever manager ran the CLI", () => {
    expect(detectPackageManager("npm/10.9.0 node/v22.14.0 darwin arm64")).toBe(
      "npm"
    );
    expect(detectPackageManager("bun/1.2.0")).toBe("bun");
    expect(detectPackageManager("yarn/4.5.0 npm/? node/v22")).toBe("yarn");
  });

  it("falls back to pnpm, the manager the scaffold documents", () => {
    expect(detectPackageManager(undefined)).toBe("pnpm");
    expect(detectPackageManager("deno/2.0")).toBe("pnpm");
  });
});

describe("installPlan", () => {
  let appRoot: string;
  beforeEach(() => {
    appRoot = mkdtempSync(path.join(tmpdir(), "intelligo-plan-"));
  });
  afterEach(() => rmSync(appRoot, { recursive: true, force: true }));

  it("is empty when nothing was picked", () => {
    expect(installPlan([], { appRoot, packageManager: "pnpm" })).toBeNull();
  });

  it("installs the dependencies first when shadcn is not there yet, then syncs the base and every item", () => {
    const plan = installPlan(["route-error", "chat"], {
      appRoot,
      packageManager: "pnpm",
    })!;

    expect(plan.install && formatCommand(plan.install, appRoot)).toBe(
      "pnpm install"
    );
    expect(plan.items).toEqual(["intelligo", "route-error", "chat"]);
    expect(formatCommand(plan.sync, appRoot)).toBe(
      "pnpm exec intelligo sync intelligo route-error chat --force"
    );
  });

  it("skips the install when the app already has shadcn", () => {
    mkdirSync(path.join(appRoot, "node_modules", ".bin"), { recursive: true });
    writeFileSync(path.join(appRoot, "node_modules", ".bin", "shadcn"), "");

    const plan = installPlan(["chat"], { appRoot, packageManager: "npm" })!;

    expect(plan.install).toBeNull();
    expect(formatCommand(plan.sync)).toBe(
      "npx intelligo sync intelligo chat --force"
    );
  });

  it("installs from a parent workspace's root, with pnpm", () => {
    const root = path.dirname(appRoot);
    const plan = installPlan(["chat"], {
      appRoot,
      packageManager: "npm",
      workspaceRoot: root,
    })!;

    expect(plan.install?.cwd).toBe(root);
    expect(formatCommand(plan.install!, appRoot)).toBe(
      "(cd .. && pnpm install)"
    );
    expect(formatCommand(plan.sync, appRoot)).toMatch(/^pnpm exec intelligo sync/);
  });
});

describe("findWorkspaceRoot", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "intelligo-ws-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const workspace = (yaml: string) =>
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), yaml);

  it("finds the workspace whose packages globs include the app", () => {
    workspace('packages:\n  - "apps/*"\n  - packages/**\n');
    expect(findWorkspaceRoot(path.join(root, "apps", "web"))).toBe(root);
    expect(findWorkspaceRoot(path.join(root, "packages", "a", "b"))).toBe(root);
  });

  it("is null when the nearest workspace does not include the app", () => {
    workspace("packages:\n  - apps/*\n  - '!apps/legacy'\n");
    expect(findWorkspaceRoot(path.join(root, "tools", "x"))).toBeNull();
    expect(findWorkspaceRoot(path.join(root, "apps", "legacy"))).toBeNull();
  });

  it("reads the flow-style list too", () => {
    workspace('packages: ["apps/*"]\n');
    expect(findWorkspaceRoot(path.join(root, "apps", "web"))).toBe(root);
  });

  it("is null outside any workspace", () => {
    expect(findWorkspaceRoot(path.join(root, "app"))).toBeNull();
  });
});

describe("workspaceGlobs", () => {
  it("stops at the next top-level key and drops comments", () => {
    expect(
      workspaceGlobs(
        "packages:\n  - apps/* # the apps\n  - packages/*\ncatalog:\n  - nope\n"
      )
    ).toEqual(["apps/*", "packages/*"]);
  });
});

describe("shortDescription", () => {
  it("keeps the opening clause", () => {
    expect(
      shortDescription(
        "Workspace team management: invite members, change roles."
      )
    ).toBe("Workspace team management");
  });

  it("truncates what does not fit on one line", () => {
    const short = shortDescription("x".repeat(100), 20);
    expect(short).toHaveLength(20);
    expect(short.endsWith("…")).toBe(true);
  });
});

describe("the bundled catalogue", () => {
  it("offers every requirement-listed page except the canary", () => {
    const templatesDir = path.resolve(import.meta.dirname, "..", "templates");
    const { items, requires } = readRegistryCatalogue(templatesDir);

    expect(Object.keys(items).sort()).toEqual(
      Object.keys(requires.items)
        .filter((n) => n !== "smoke")
        .sort()
    );
  });
});

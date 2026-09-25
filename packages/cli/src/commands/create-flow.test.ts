import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseCreateFlags, runCreate } from "./create-flow.js";
import { selectItems, syncCheck } from "./sync.js";

describe("parseCreateFlags", () => {
  it("asks for everything when given nothing", () => {
    expect(parseCreateFlags([])).toEqual({
      target: undefined,
      items: undefined,
      all: false,
      yes: false,
      install: true,
      linkWorkspace: false,
      name: undefined,
      unknown: [],
    });
  });

  it("reads --name, and collects what it does not know", () => {
    expect(
      parseCreateFlags([".", "--name", "Acme Audit", "--al", "extra"])
    ).toMatchObject({
      target: ".",
      name: "Acme Audit",
      unknown: ["--al", "extra"],
    });
    expect(parseCreateFlags(["acme", "--name"]).unknown).toEqual(["--name"]);
    expect(parseCreateFlags(["acme", "--name", ""]).unknown).toEqual([
      "--name",
    ]);
    expect(parseCreateFlags(["acme", "--name="]).unknown).toEqual(["--name="]);
  });

  it("reads --items in either spelling without taking the list for the target", () => {
    expect(parseCreateFlags(["--items", "chat, usage", "acme"])).toMatchObject({
      target: "acme",
      items: ["chat", "usage"],
    });
    expect(parseCreateFlags(["acme", "--items=chat"])).toMatchObject({
      target: "acme",
      items: ["chat"],
    });
  });

  it("reads approval and scaffold-only as separate decisions", () => {
    expect(parseCreateFlags(["acme", "-y", "--no-install"])).toMatchObject({
      yes: true,
      install: false,
    });
  });
});

describe("runCreate --no-install", () => {
  const templatesDir = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "templates"
  );
  let root: string;
  let out: string[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "intelligo-create-flow-"));
    out = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      out.push(String(line));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const create = (target: string) =>
    runCreate(parseCreateFlags([target, "--items", "usage", "--no-install"]), {
      templatesDir,
      frameworkVersion: "1.2.3",
      interactive: false,
    });

  it("prints the install, then one sync of the base and every item", async () => {
    expect(await create(path.join(root, "acme"))).toBe(0);
    const printed = out.join("\n");
    expect(printed).toMatch(/^ {2}pnpm install$/m);
    expect(printed).toMatch(
      /pnpm exec intelligo sync intelligo pricing route-error usage --force/
    );
  });

  it("records the chosen items, so a bare sync installs them later", async () => {
    await create(path.join(root, "acme"));
    const manifest = JSON.parse(
      readFileSync(path.join(root, "acme", "intelligo.manifest.json"), "utf8")
    ) as { registry: { items: string[]; files: object } };
    expect(manifest.registry.items).toEqual([
      "intelligo",
      "pricing",
      "route-error",
      "usage",
    ]);
    expect(manifest.registry.files).toEqual({});
  });

  it("leaves a later bare sync nothing to refuse: the scaffold's files are the registry's to replace", async () => {
    const appRoot = path.join(root, "acme");
    await create(appRoot);
    // A registry whose base ships its own lib/utils.ts, as the real one does.
    const registryDir = path.join(root, "r");
    mkdirSync(registryDir);
    writeFileSync(
      path.join(registryDir, "intelligo.json"),
      JSON.stringify({
        name: "intelligo",
        type: "registry:base",
        registryDependencies: [],
        files: [
          {
            path: "base/lib/utils.ts",
            type: "registry:lib",
            target: "lib/utils.ts",
            content: "export const cn = () => '';\n",
          },
        ],
      })
    );
    const context = {
      appRoot,
      registryDir,
      requires: { items: {}, scaffold: [] },
      frameworkVersion: "1.2.3",
    } as unknown as Parameters<typeof syncCheck>[1];

    const selection = selectItems([], { ...context });
    expect(selection).toMatchObject({ ok: true });
    const utils = syncCheck(["intelligo"], context).entries.find(
      (e) => e.path === "lib/utils.ts"
    );
    expect(utils?.state).toBe("outdated");
  });

  it("installs from the root of a parent pnpm workspace that includes the app", async () => {
    writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*\n"
    );
    mkdirSync(path.join(root, "apps"));
    expect(await create(path.join(root, "apps", "acme"))).toBe(0);
    expect(out.join("\n")).toContain("(cd ../.. && pnpm install)");
  });
});

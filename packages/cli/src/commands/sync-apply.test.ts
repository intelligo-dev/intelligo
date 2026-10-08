/**
 * syncApply around the install: a stand-in `shadcn` replaces the seam
 * and a file of shadcn's own, the way `shadcn add --overwrite` does,
 * and the app's copies must survive.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncApply, type SyncContext } from "./sync.js";
import { RESTORE_DIR, onInterrupt } from "./sync-guard.js";

let root: string;
let context: SyncContext;
const lines: string[] = [];
const log = (line: string) => lines.push(line);

const write = (base: string, rel: string, content: string) => {
  mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  writeFileSync(path.join(base, rel), content);
};
const read = (rel: string) =>
  readFileSync(path.join(context.appRoot, rel), "utf8");

/** A `shadcn` that writes each file given, whatever it is asked to add. */
function fakeShadcn(files: Record<string, string>, exitCode = 0) {
  const writes = Object.entries(files)
    .map(
      ([file, content]) =>
        `mkdir -p "$(dirname '${file}')" && printf '%s' '${content}' > '${file}'`
    )
    .join("\n");
  write(
    context.appRoot,
    "node_modules/.bin/shadcn",
    `#!/bin/sh\n${writes}\nexit ${exitCode}\n`
  );
  chmodSync(path.join(context.appRoot, "node_modules/.bin/shadcn"), 0o755);
}

beforeEach(() => {
  lines.length = 0;
  root = mkdtempSync(path.join(tmpdir(), "intelligo-sync-apply-"));
  const registryDir = path.join(root, "r");
  const appRoot = path.join(root, "app");
  write(
    registryDir,
    "usage.json",
    JSON.stringify({
      name: "usage",
      type: "registry:block",
      registryDependencies: ["card"],
      files: [
        {
          path: "base/app/usage/page.tsx",
          type: "registry:block",
          target: "app/usage/page.tsx",
          content: "export default 1;\n",
        },
        {
          path: "base/lib/usage-config.ts",
          type: "registry:block",
          target: "lib/usage-config.ts",
          content: "export const shipped = 1;\n",
        },
      ],
    })
  );
  mkdirSync(appRoot, { recursive: true });
  write(appRoot, "components.json", JSON.stringify({ aliases: {} }));
  write(appRoot, "lib/usage-config.ts", "export const mine = 1;\n");
  write(appRoot, "components/ui/card.tsx", "export const MyCard = 1;\n");
  context = {
    appRoot,
    registryDir,
    frameworkVersion: "1.0.0-test",
    requires: {
      scaffold: [],
      seams: { "lib/usage-config.ts": "usage copy" },
      items: { usage: { marker: "app/usage/page.tsx" } },
    },
  };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(process.platform === "win32")("syncApply", () => {
  it("backs up a file of shadcn's own the install replaced, and keeps the seam", async () => {
    fakeShadcn({
      "app/usage/page.tsx": "export default 1;\n",
      "lib/usage-config.ts": "export const shipped = 1;\n",
      "components/ui/card.tsx": "export const Card = 1;\n",
    });

    await syncApply(["usage"], context, { log });

    expect(read("lib/usage-config.ts")).toBe("export const mine = 1;\n");
    expect(read("components/ui/card.tsx")).toBe("export const Card = 1;\n");
    const backups = path.join(context.appRoot, ".intelligo/backup");
    const [stamp] = readdirSync(backups);
    expect(
      readFileSync(path.join(backups, stamp!, "components/ui/card.tsx"), "utf8")
    ).toBe("export const MyCard = 1;\n");
    expect(lines.join("\n")).toContain("components/ui/card.tsx");
    expect(existsSync(path.join(context.appRoot, RESTORE_DIR))).toBe(false);
  });

  it("puts the seam back when the install fails part-way", async () => {
    fakeShadcn({ "lib/usage-config.ts": "export const shipped = 1;\n" }, 1);

    expect(await syncApply(["usage"], context, { log })).toBe(1);

    expect(read("lib/usage-config.ts")).toBe("export const mine = 1;\n");
    expect(existsSync(path.join(context.appRoot, RESTORE_DIR))).toBe(false);
  });

  it("refuses to run over what an unfinished sync left behind", async () => {
    fakeShadcn({ "lib/usage-config.ts": "export const shipped = 1;\n" });
    write(
      context.appRoot,
      path.join(RESTORE_DIR, "lib/usage-config.ts"),
      "export const mine = 1;\n"
    );

    expect(await syncApply(["usage"], context, { log })).toBe(1);

    expect(lines.join("\n")).toContain("lib/usage-config.ts");
    expect(existsSync(path.join(context.appRoot, "app/usage/page.tsx"))).toBe(
      false
    );
  });
});

describe("onInterrupt", () => {
  it("restores and exits on SIGINT, and stops listening once disposed", () => {
    const restore = vi.fn();
    const exit = vi.fn();
    const before = process.listenerCount("SIGINT");

    const dispose = onInterrupt(restore, exit);
    process.emit("SIGINT", "SIGINT");

    expect(restore).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(130);
    expect(process.listenerCount("SIGINT")).toBe(before);
    dispose();
  });
});

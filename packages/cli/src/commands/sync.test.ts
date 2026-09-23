/**
 * sync tests — selection, order, the message merge and the check's
 * states, over a registry and an app built in a temporary directory.
 * Installing is shadcn's job and is exercised by the reference app's
 * regeneration, not here.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashContents, writeManifest } from "../manifest.js";
import {
  installOrder,
  mergeMessages,
  missingMessageKeys,
  selectItems,
  syncCheck,
  syncCheckExitCode,
  type SyncContext,
} from "./sync.js";

let root: string;
let context: SyncContext;

const write = (base: string, rel: string, content: string) => {
  mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  writeFileSync(path.join(base, rel), content);
};

const item = (
  name: string,
  type: string,
  files: { target: string; content: string }[],
  deps: string[] = []
) =>
  JSON.stringify({
    name,
    type,
    registryDependencies: deps,
    files: files.map((f) => ({ path: `base/${f.target}`, type, ...f })),
  });

const PAGE = "/** A page. */\nexport default function Page() {}\n";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "intelligo-sync-"));
  const registryDir = path.join(root, "r");
  const appRoot = path.join(root, "app");
  write(registryDir, "intelligo.json", item("intelligo", "registry:base", []));
  write(
    registryDir,
    "button.json",
    item("button", "registry:ui", [
      { target: "components/ui/button.tsx", content: "export const Button = 1;\n" },
    ])
  );
  write(
    registryDir,
    "route-error.json",
    item("route-error", "registry:block", [
      { target: "app/error.tsx", content: "export default 1;\n" },
    ])
  );
  write(
    registryDir,
    "usage.json",
    item(
      "usage",
      "registry:block",
      [
        { target: "app/usage/page.tsx", content: PAGE },
        { target: "lib/usage-config.ts", content: "export const x = 1;\n" },
        {
          target: "messages/en/usage.json",
          content: JSON.stringify({ title: "Usage", empty: { title: "None" } }),
        },
      ],
      ["@intelligo/button", "skeleton"]
    )
  );
  mkdirSync(appRoot, { recursive: true });
  context = {
    appRoot,
    registryDir,
    frameworkVersion: "1.0.0-test",
    requires: {
      scaffold: [],
      seams: { "lib/usage-config.ts": "usage copy" },
      items: {
        "route-error": { marker: "app/error.tsx" },
        usage: { marker: "app/usage/page.tsx", items: ["route-error"] },
      },
    },
  };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("selectItems", () => {
  it("takes named items, and refuses unknown ones", () => {
    expect(selectItems(["usage"], context)).toEqual({ ok: true, items: ["usage"] });
    const bad = selectItems(["usage", "nope"], context);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.message).toContain("nope");
  });

  it("falls back to the manifest, and never guesses from marker files", () => {
    write(context.appRoot, "app/usage/page.tsx", PAGE);
    const none = selectItems([], context);
    expect(none.ok).toBe(false);
    expect(!none.ok && none.message).toContain("intelligo sync intelligo usage");

    writeManifest(context.appRoot, {
      schemaVersion: 1,
      frameworkVersion: "1.0.0-test",
      features: {},
      registry: { version: "1.0.0-test", items: ["usage"], files: {} },
    });
    expect(selectItems([], context)).toEqual({ ok: true, items: ["usage"] });
  });
});

describe("installOrder", () => {
  it("puts the base first and each block after the blocks it imports", () => {
    expect(installOrder(["usage", "intelligo"], context.requires)).toEqual([
      "intelligo",
      "route-error",
      "usage",
    ]);
  });
});

describe("messages", () => {
  it("lists the registry keys an app's copy lacks", () => {
    expect(
      missingMessageKeys(
        { a: "A", b: { c: "C", d: "D" } },
        { a: "mine", b: { c: "mine" } }
      )
    ).toEqual(["b.d"]);
  });

  it("merges the registry's keys under the app's values and keeps the app's extras", () => {
    expect(
      mergeMessages(
        { a: "A", b: { c: "C", d: "D" } },
        { a: "mine", b: { c: "mine" }, own: "kept" }
      )
    ).toEqual({ a: "mine", b: { c: "mine", d: "D" }, own: "kept" });
  });
});

describe("syncCheck", () => {
  const states = () =>
    Object.fromEntries(
      syncCheck(["usage"], context).entries.map((e) => [e.path, e.state])
    );

  it("covers the item's Intelligo components, not shadcn's own", () => {
    const report = syncCheck(["usage"], context);
    expect(report.items).toEqual(["button", "usage"]);
    expect(report.entries.map((e) => e.path)).toContain("components/ui/button.tsx");
  });

  it("reports missing files, and passes once everything is the registry's", () => {
    expect(states()["app/usage/page.tsx"]).toBe("missing");
    expect(syncCheckExitCode(syncCheck(["usage"], context))).toBe(1);

    // shadcn drops a file's opening comment; that is not drift.
    write(context.appRoot, "app/usage/page.tsx", "export default function Page() {}\n");
    write(context.appRoot, "components/ui/button.tsx", "export const Button = 1;\n");
    write(context.appRoot, "lib/usage-config.ts", "export const x = 'mine';\n");
    write(
      context.appRoot,
      "messages/en/usage.json",
      JSON.stringify({ title: "Mine", empty: { title: "Mine" }, extra: "x" })
    );
    expect(states()).toEqual({
      "app/usage/page.tsx": "current",
      "components/ui/button.tsx": "current",
      "lib/usage-config.ts": "seam",
      "messages/en/usage.json": "current",
    });
    expect(syncCheckExitCode(syncCheck(["usage"], context))).toBe(0);
  });

  it("tells an edit from a newer registry by the recorded hash", () => {
    const old = "export const Button = 0;\n";
    write(context.appRoot, "components/ui/button.tsx", old);
    expect(states()["components/ui/button.tsx"]).toBe("differs");

    writeManifest(context.appRoot, {
      schemaVersion: 1,
      frameworkVersion: "1.0.0-test",
      features: {},
      registry: {
        version: "1.0.0-old",
        items: ["usage"],
        files: { "components/ui/button.tsx": hashContents(old) },
      },
    });
    expect(states()["components/ui/button.tsx"]).toBe("outdated");

    write(context.appRoot, "components/ui/button.tsx", "export const Button = 2;\n");
    expect(states()["components/ui/button.tsx"]).toBe("edited");
  });

  it("reports a message file missing registry keys", () => {
    write(context.appRoot, "messages/en/usage.json", JSON.stringify({ title: "Mine" }));
    const entry = syncCheck(["usage"], context).entries.find(
      (e) => e.path === "messages/en/usage.json"
    )!;
    expect(entry.state).toBe("messages-behind");
    expect(entry.missingKeys).toEqual(["empty"]);
  });
});

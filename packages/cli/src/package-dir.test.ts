import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { packageDir } from "./package-dir.js";

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

function file(rel: string, body: string) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), body);
}

describe("packageDir", () => {
  it("finds a package hoisted to a workspace root from the app", () => {
    root = mkdtempSync(path.join(tmpdir(), "pkgdir-"));
    file(
      "node_modules/@intelligo-dev/core/package.json",
      '{"name":"@intelligo-dev/core"}'
    );
    mkdirSync(path.join(root, "apps", "web"), { recursive: true });
    expect(
      packageDir(path.join(root, "apps", "web"), "@intelligo-dev/core")
    ).toBe(path.join(root, "node_modules", "@intelligo-dev", "core"));
  });

  it("does not take an app's own packages/core for the framework's", () => {
    root = mkdtempSync(path.join(tmpdir(), "pkgdir-"));
    file("packages/core/package.json", '{"name":"@acme/core"}');
    file(
      "node_modules/@intelligo-dev/core/package.json",
      '{"name":"@intelligo-dev/core"}'
    );
    expect(packageDir(root, "@intelligo-dev/core")).toBe(
      path.join(root, "node_modules", "@intelligo-dev", "core")
    );
  });

  it("reads the framework repository's own workspace package", () => {
    root = mkdtempSync(path.join(tmpdir(), "pkgdir-"));
    file("packages/core/package.json", '{"name":"@intelligo-dev/core"}');
    expect(packageDir(root, "@intelligo-dev/core")).toBe(
      path.join(root, "packages", "core")
    );
  });
});

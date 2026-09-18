/**
 * The scaffold is onboarding, not a boundary, so the behaviours worth
 * pinning are the ones that protect the developer: it never writes into an occupied directory, and what it writes is
 * recorded in the manifest from the first moment so the very first
 * upgrade already knows what they have edited.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createApp, deriveNames } from "./create.js";
import { hashContents, readManifest } from "../manifest.js";

let workdir: string;
let templatesDir: string;

function writeScaffoldTemplate() {
  mkdirSync(path.join(templatesDir, "app-scaffold"), { recursive: true });
  writeFileSync(
    path.join(templatesDir, "app-scaffold", "pkg.tpl"),
    '{ "name": "__APP_NAME__", "dependencies": { "@intelligo-dev/core": "__INTELLIGO_DEP__" } }\n'
  );
  writeFileSync(
    path.join(templatesDir, "app-scaffold", "slug.tpl"),
    'export const PRODUCT_SLUG = "__APP_SLUG__";\n'
  );
  writeFileSync(
    path.join(templatesDir, "manifest.json"),
    JSON.stringify({
      "app-scaffold": {
        templateVersion: "1.0.0",
        description: "scaffold",
        files: [
          { template: "app-scaffold/pkg.tpl", target: "package.json" },
          { template: "app-scaffold/slug.tpl", target: "lib/intelligo.ts" },
        ],
      },
    })
  );
}

const create = (target: string, linkWorkspace = false) =>
  createApp({ target, templatesDir, frameworkVersion: "1.2.3", linkWorkspace });

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "intelligo-create-"));
  templatesDir = mkdtempSync(path.join(tmpdir(), "intelligo-tpl-"));
  writeScaffoldTemplate();
});
afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  rmSync(templatesDir, { recursive: true, force: true });
});

describe("deriveNames", () => {
  it("slugifies the directory name", () => {
    expect(deriveNames("/tmp/My Cool App")).toEqual({
      appName: "my-cool-app",
      appSlug: "my-cool-app",
    });
  });

  it("rejects a name with nothing slugifiable in it", () => {
    expect(() => deriveNames("/tmp/---")).toThrow(/Cannot derive/);
  });
});

describe("createApp", () => {
  it("writes the scaffold with the project name substituted", () => {
    const target = path.join(workdir, "acme");

    const result = create(target);

    expect(result.written).toContain("package.json");
    expect(readFileSync(path.join(target, "package.json"), "utf8")).toContain(
      '"acme"'
    );
    expect(
      readFileSync(path.join(target, "lib/intelligo.ts"), "utf8")
    ).toContain('"acme"');
  });

  it("records the substituted contents in the manifest, not the template", () => {
    // Otherwise every generated file would look customized on the
    // first upgrade check.
    const target = path.join(workdir, "acme");
    create(target);

    const manifest = readManifest(target)!;
    const recorded = manifest.features["app-scaffold"]!.files.find(
      (f) => f.path === "package.json"
    )!;
    expect(recorded.hash).toBe(
      hashContents(readFileSync(path.join(target, "package.json"), "utf8"))
    );
  });

  it("creates the directory when it does not exist", () => {
    const target = path.join(workdir, "nested", "acme");

    create(target);

    expect(existsSync(path.join(target, "package.json"))).toBe(true);
  });

  it("refuses a directory that already has files in it", () => {
    const target = path.join(workdir, "occupied");
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "README.md"), "someone's work\n");

    expect(() => create(target)).toThrow(/not empty/);
    expect(readFileSync(path.join(target, "README.md"), "utf8")).toBe(
      "someone's work\n"
    );
  });

  it("accepts an existing but empty directory", () => {
    const target = path.join(workdir, "empty");
    mkdirSync(target, { recursive: true });

    expect(() => create(target)).not.toThrow();
  });

  it("depends on published versions, not the workspace protocol", () => {
    // `workspace:*` outside a workspace fails the install with
    // "workspace protocol used outside a workspace".
    const target = path.join(workdir, "acme");
    create(target);

    expect(readFileSync(path.join(target, "package.json"), "utf8")).toContain(
      '"@intelligo-dev/core": "^1.2.3"'
    );
  });

  it("links the workspace when asked, for scaffolding inside the monorepo", () => {
    const target = path.join(workdir, "acme");
    create(target, true);

    expect(readFileSync(path.join(target, "package.json"), "utf8")).toContain(
      '"@intelligo-dev/core": "workspace:*"'
    );
  });
});

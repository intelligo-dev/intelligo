/**
 * Generator tests — the ownership promise, not the file copying.
 *
 * An upgrade never overwrites consumer source. That is
 * only meaningful if "the consumer edited this" is detectable, so
 * these tests are mostly about the states around a customized file.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { addExitCode, addFeature, formatAddResult } from "./add.js";
import { upgradeCheck, upgradeCheckExitCode } from "./upgrade-check.js";
import { handOver, readManifest, writeManifest } from "../manifest.js";

let appRoot: string;
let templatesDir: string;

const TEMPLATE_BODY = "export default function Page() { return null; }\n";

function writeTemplates(version = "1.0.0", body = TEMPLATE_BODY) {
  mkdirSync(path.join(templatesDir, "demo"), { recursive: true });
  writeFileSync(path.join(templatesDir, "demo", "page.tsx.tpl"), body);
  writeFileSync(
    path.join(templatesDir, "manifest.json"),
    JSON.stringify({
      demo: {
        templateVersion: version,
        description: "demo",
        files: [{ template: "demo/page.tsx.tpl", target: "app/demo/page.tsx" }],
      },
    })
  );
}

const add = (force = false) =>
  addFeature("demo", {
    appRoot,
    templatesDir,
    frameworkVersion: "0.0.0",
    force,
  });

const target = () => path.join(appRoot, "app/demo/page.tsx");

beforeEach(() => {
  appRoot = mkdtempSync(path.join(tmpdir(), "intelligo-app-"));
  templatesDir = mkdtempSync(path.join(tmpdir(), "intelligo-tpl-"));
  writeTemplates();
});
afterEach(() => {
  rmSync(appRoot, { recursive: true, force: true });
  rmSync(templatesDir, { recursive: true, force: true });
});

describe("addFeature", () => {
  it("writes the file and records it in the manifest", () => {
    const result = add();

    expect(result.written).toEqual(["app/demo/page.tsx"]);
    expect(readFileSync(target(), "utf8")).toBe(TEMPLATE_BODY);

    const manifest = readManifest(appRoot)!;
    expect(manifest.features.demo!.templateVersion).toBe("1.0.0");
    expect(manifest.features.demo!.files).toHaveLength(1);
  });

  it("re-generating an untouched file is a no-op the consumer can trust", () => {
    add();
    const second = add();

    expect(second.written).toEqual(["app/demo/page.tsx"]);
    expect(second.skippedCustomized).toEqual([]);
  });

  it("never overwrites a file the consumer edited", () => {
    add();
    writeFileSync(target(), "// mine\n");

    const result = add();

    expect(result.skippedCustomized).toEqual(["app/demo/page.tsx"]);
    expect(readFileSync(target(), "utf8")).toBe("// mine\n");
  });

  it("keeps the original hash for a customized file", () => {
    // Otherwise the next add() would compare against the consumer's own
    // content and quietly re-adopt their file as generated.
    add();
    const before = readManifest(appRoot)!.features.demo!.files[0]!.hash;
    writeFileSync(target(), "// mine\n");
    add();

    expect(readManifest(appRoot)!.features.demo!.files[0]!.hash).toBe(before);
  });

  it("overwrites a customized file only with force", () => {
    add();
    writeFileSync(target(), "// mine\n");

    const result = add(true);

    expect(result.written).toEqual(["app/demo/page.tsx"]);
    expect(readFileSync(target(), "utf8")).toBe(TEMPLATE_BODY);
  });

  it("refuses a path occupied by a file it never generated", () => {
    mkdirSync(path.dirname(target()), { recursive: true });
    writeFileSync(target(), "// pre-existing, not ours\n");

    const result = add();

    expect(result.skippedUnknown).toEqual(["app/demo/page.tsx"]);
    expect(readFileSync(target(), "utf8")).toBe("// pre-existing, not ours\n");
    // The feature is not installed, so the command does not succeed, and
    // the output does not also claim there was nothing to do.
    expect(addExitCode(result)).toBe(1);
    expect(formatAddResult(result)).not.toContain("nothing to do");
  });

  it("rejects an unknown feature by name", () => {
    expect(() =>
      addFeature("nope", {
        appRoot,
        templatesDir,
        frameworkVersion: "0.0.0",
      })
    ).toThrow(/Unknown feature/);
  });
});

describe("addFeature with placeholders", () => {
  it("refuses, writing nothing, when a placeholder has no value", () => {
    writeTemplates("1.0.0", 'export const NAME = "__APP_NAME__";\n');

    expect(add).toThrow(/__APP_NAME__.*intelligo create/);
    expect(readManifest(appRoot)).toBeNull();
  });

  it("re-generates with the values the feature was first generated with", () => {
    writeTemplates("1.0.0", 'export const NAME = "__APP_NAME__";\n');
    addFeature("demo", {
      appRoot,
      templatesDir,
      frameworkVersion: "0.0.0",
      variables: { __APP_NAME__: "acme" },
    });
    writeTemplates("1.1.0", 'export const NAME = "__APP_NAME__"; // v2\n');

    add();

    expect(readFileSync(target(), "utf8")).toContain('"acme"; // v2');
  });
});

describe("addFeature with a cron", () => {
  const CRON = { path: "/api/cron/demo", schedule: "0-59/5 * * * *" };
  const vercelJson = () => path.join(appRoot, "vercel.json");

  beforeEach(() => {
    const file = path.join(templatesDir, "manifest.json");
    const catalogue = JSON.parse(readFileSync(file, "utf8"));
    catalogue.demo.cron = CRON;
    writeFileSync(file, JSON.stringify(catalogue));
  });

  it("schedules it in a new vercel.json the manifest does not claim", () => {
    const result = add();

    expect(result.cron?.status).toBe("written");
    expect(JSON.parse(readFileSync(vercelJson(), "utf8")).crons).toEqual([
      CRON,
    ]);
    expect(
      readManifest(appRoot)!.features.demo!.files.map((f) => f.path)
    ).toEqual(["app/demo/page.tsx"]);
    expect(formatAddResult(result)).toContain("Hobby");
    expect(formatAddResult(result)).toContain("curl");
  });

  it("never touches an existing vercel.json, and prints the entry to add", () => {
    const mine = JSON.stringify({ buildCommand: "pnpm build" });
    writeFileSync(vercelJson(), mine);

    const result = add(true);

    expect(result.cron?.status).toBe("manual");
    expect(readFileSync(vercelJson(), "utf8")).toBe(mine);
    expect(formatAddResult(result)).toContain(JSON.stringify(CRON));
  });

  it("recognises a path that is already scheduled", () => {
    writeFileSync(
      vercelJson(),
      JSON.stringify({ crons: [{ path: CRON.path, schedule: "0 3 * * *" }] })
    );

    const result = add();

    expect(result.cron?.status).toBe("present");
    expect(formatAddResult(result)).not.toContain('Add to its "crons"');
  });
});

describe("upgradeCheck", () => {
  const check = () => upgradeCheck({ appRoot, templatesDir });

  it("reports nothing when no manifest exists", () => {
    expect(check().items).toEqual([]);
  });

  it("reports an untouched, current file as current", () => {
    add();
    expect(check().items[0]!.state).toBe("current");
  });

  it("reports a consumer edit as customized while the template is unchanged", () => {
    add();
    writeFileSync(target(), "// mine\n");

    expect(check().items[0]!.state).toBe("customized");
  });

  it("reports an upstream change to an untouched file as outdated", () => {
    add();
    writeTemplates("1.1.0", "// new upstream\n");

    const report = check();

    expect(report.items[0]!.state).toBe("outdated");
    expect(report.installedVersion.demo).toBe("1.0.0");
    expect(report.templateVersion.demo).toBe("1.1.0");
    expect(upgradeCheckExitCode(report)).toBe(0);
  });

  it("reports a file the template gained since the app was generated", () => {
    add();
    mkdirSync(path.join(templatesDir, "demo"), { recursive: true });
    writeFileSync(path.join(templatesDir, "demo", "extra.ts.tpl"), "// new\n");
    writeFileSync(
      path.join(templatesDir, "manifest.json"),
      JSON.stringify({
        demo: {
          templateVersion: "1.1.0",
          description: "demo",
          files: [
            { template: "demo/page.tsx.tpl", target: "app/demo/page.tsx" },
            { template: "demo/extra.ts.tpl", target: "lib/extra.ts" },
          ],
        },
      })
    );

    expect(check().items).toContainEqual({
      feature: "demo",
      path: "lib/extra.ts",
      state: "new",
    });
  });

  it("reports a change on both sides as a conflict, and exits non-zero", () => {
    // The only state that needs a human: an upgrade cannot silently
    // resolve it without discarding one side.
    add();
    writeFileSync(target(), "// mine\n");
    writeTemplates("1.1.0", "// new upstream\n");

    const report = check();

    expect(report.items[0]!.state).toBe("conflict");
    expect(upgradeCheckExitCode(report)).toBe(1);
  });

  it("compares substituted templates against the substituted file, not the raw template", () => {
    // `create` writes files with placeholders replaced. Hashing the raw
    // template on the upgrade side would make every such file read as
    // outdated forever, and conflict the moment the consumer edits it.
    writeTemplates("1.0.0", 'export const NAME = "__APP_NAME__";\n');
    addFeature("demo", {
      appRoot,
      templatesDir,
      frameworkVersion: "0.0.0",
      variables: { __APP_NAME__: "acme" },
    });

    expect(check().items[0]!.state).toBe("current");

    writeFileSync(target(), 'export const NAME = "acme"; // mine\n');
    expect(check().items[0]!.state).toBe("customized");
  });

  it("reports a file the consumer deleted", () => {
    add();
    rmSync(target());

    expect(check().items[0]!.state).toBe("deleted");
  });
});

describe("a file handed over to the registry", () => {
  const handOverDemo = () => {
    const manifest = readManifest(appRoot)!;
    writeManifest(appRoot, handOver(manifest, "demo", ["app/demo/page.tsx"]));
  };

  it("leaves upgrade --check: neither customized nor new", () => {
    add();
    writeFileSync(target(), "// the registry's now\n");
    handOverDemo();

    const report = upgradeCheck({ appRoot, templatesDir });
    expect(report.items).toEqual([]);
  });

  it("is not written back by add, and stays handed over when add re-records", () => {
    add();
    writeFileSync(target(), "// the registry's now\n");
    handOverDemo();

    const r = add(true);
    expect(r.written).toEqual([]);
    expect(readFileSync(target(), "utf8")).toBe("// the registry's now\n");
    expect(readManifest(appRoot)!.features.demo!.handedOver).toEqual([
      "app/demo/page.tsx",
    ]);
  });
});

describe("addFeature vitest", () => {
  const TEMPLATES = path.resolve(import.meta.dirname, "..", "..", "templates");

  it("writes the config and the stub, and says what is left to do", () => {
    const r = addFeature("vitest", {
      appRoot,
      templatesDir: TEMPLATES,
      frameworkVersion: "0.0.0",
    });

    expect(r.written).toEqual([
      "vitest.config.ts",
      "tests/stubs/server-only.ts",
    ]);
    expect(
      readFileSync(path.join(appRoot, "tests/stubs/server-only.ts"), "utf8")
    ).toContain("export {};");
    const printed = formatAddResult(r);
    expect(printed).toContain("pnpm add -D vitest");
    expect(printed).toContain('"test": "vitest run"');
    expect(readManifest(appRoot)!.features.vitest!.files).toHaveLength(2);
  });
});

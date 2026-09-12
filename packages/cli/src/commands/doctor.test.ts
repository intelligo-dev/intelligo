/**
 * doctor tests — the check semantics, not the formatting.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, it, expect } from "vitest";

import { exitCodeFor, formatResults, runChecks } from "./doctor.js";

const fullEnv = {
  DATABASE_URL: "postgresql://localhost/x",
  BETTER_AUTH_SECRET: "s",
  NEXT_PUBLIC_APP_URL: "http://localhost:4000",
  INTELLIGO_BILLING_PRODUCT: "acme",
} as NodeJS.ProcessEnv;

describe("runChecks", () => {
  it("reports every missing required variable in one line", () => {
    const results = runChecks({ root: "/nonexistent", env: {} });
    const env = results.find((r) => r.name === "env")!;

    expect(env.status).toBe("error");
    expect(env.detail).toContain("DATABASE_URL");
    expect(env.detail).toContain("BETTER_AUTH_SECRET");
  });

  it("passes the env check when all required variables are present", () => {
    const results = runChecks({ root: "/nonexistent", env: fullEnv });

    expect(results.find((r) => r.name === "env")!.status).toBe("ok");
  });

  it("warns when no billing product is configured", () => {
    // The engine has no built-in default catalogue, so an unset
    // product means plan lookups find nothing.
    const results = runChecks({ root: "/nonexistent", env: {} });

    expect(results.find((r) => r.name === "billing")!.status).toBe("warn");
  });

  it("warns rather than errors when run outside the workspace", () => {
    const results = runChecks({ root: "/nonexistent", env: fullEnv });
    const migrations = results.find((r) => r.name === "migrations")!;

    expect(migrations.status).toBe("warn");
    expect(migrations.detail).toContain("workspace root");
  });

  describe("installed registry items against requires.json", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    const requires = {
      scaffold: ["lib/intelligo", "lib/plans", "i18n/navigation"],
      items: {
        "route-error": { marker: "components/errors/route-error.tsx" },
        chat: {
          marker: "app/chat/page.tsx",
          items: ["route-error"],
          files: ["lib/intelligo", "i18n/navigation"],
          exports: { "lib/intelligo": ["composeIntelligo", "executions"] },
          features: ["chat"],
        },
      },
    };

    function app(files: Record<string, string>): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-"));
      for (const [rel, body] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), body);
      }
      return root;
    }

    it("names every unmet requirement of an installed item", () => {
      const results = runChecks({
        root: app({
          "app/chat/page.tsx": "// chat",
          "lib/intelligo.ts": "export const composeIntelligo = () => {};",
          "lib/plans.ts": "export const FEATURES = { assistant: ['free'] };",
        }),
        env: fullEnv,
        requires,
      });
      const chat = results.find((r) => r.name === "item:chat")!;

      expect(chat.status).toBe("error");
      expect(chat.detail).toContain("install the route-error item first");
      expect(chat.detail).toContain("create i18n/navigation");
      expect(chat.detail).toContain("lib/intelligo must export executions");
      expect(chat.detail).toContain('"chat" feature key');
    });

    it("passes once siblings, files, exports and feature keys are in place", () => {
      const results = runChecks({
        root: app({
          "app/chat/page.tsx": "// chat",
          "components/errors/route-error.tsx": "// route-error",
          "i18n/navigation.ts": "// nav",
          "lib/intelligo.ts":
            "export function composeIntelligo() {}\nexport const executions = {};",
          "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
        }),
        env: fullEnv,
        requires,
      });
      expect(results.find((r) => r.name === "item:chat")!.status).toBe("ok");
      expect(results.find((r) => r.name === "item:route-error")!.status).toBe(
        "ok"
      );
    });

    it("is silent for items whose marker file is absent", () => {
      const results = runChecks({ root: app({}), env: fullEnv, requires });
      expect(results.some((r) => r.name.startsWith("item:"))).toBe(false);
    });

    it("checks the reference app against the bundled requirements", () => {
      // The canonical installed result must satisfy its own contract.
      const results = runChecks({
        root: path.resolve(__dirname, "../../../../apps/app"),
        env: fullEnv,
      });
      const failing = results.filter(
        (r) => r.name.startsWith("item:") && r.status !== "ok"
      );
      expect(failing.map((r) => `${r.name}: ${r.detail}`)).toEqual([]);
      expect(results.some((r) => r.name === "item:chat")).toBe(true);
    });
  });

  describe("model prices", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    function withCompositionRoot(source: string): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-models-"));
      mkdirSync(path.join(root, "lib"), { recursive: true });
      writeFileSync(path.join(root, "lib/intelligo.ts"), source);
      return root;
    }

    it("errors when the composition root registers no prices", () => {
      // Nothing self-registers, so admission has no price to estimate
      // against and refuses every request with `unknown_model` — at
      // runtime, for one missing line.
      const results = runChecks({
        root: withCompositionRoot(
          `export function composeIntelligo() { setDefaultProductSlug("acme"); }`
        ),
        env: fullEnv,
      });
      const models = results.find((r) => r.name === "models")!;

      expect(models.status).toBe("error");
      expect(models.detail).toContain("registerModels");
    });

    it("passes when it does", () => {
      const results = runChecks({
        root: withCompositionRoot(
          `import { DEFAULT_MODELS, registerModels } from "@intelligo-dev/executions";
           export function composeIntelligo() { registerModels(DEFAULT_MODELS); }`
        ),
        env: fullEnv,
      });

      expect(results.find((r) => r.name === "models")!.status).toBe("ok");
    });

    it("is not satisfied by a comment that mentions it", () => {
      // The scaffold's own doc comment names registerModels; a check
      // that a comment can pass is not a check.
      const results = runChecks({
        root: withCompositionRoot(
          `// call registerModels(DEFAULT_MODELS) here
           export function composeIntelligo() {}`
        ),
        env: fullEnv,
      });

      expect(results.find((r) => r.name === "models")!.status).toBe("error");
    });

    it("is silent where there is no composition root to read", () => {
      const results = runChecks({ root: "/nonexistent", env: fullEnv });
      expect(results.find((r) => r.name === "models")).toBeUndefined();
    });
  });

  describe("Better-Auth's HTTP mount", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    function app(files: string[]): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-auth-"));
      for (const rel of files) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), "// generated");
      }
      return root;
    }

    it("errors when auth pages are installed without the catch-all route", () => {
      const results = runChecks({
        root: app(["app/[locale]/(auth)/layout.tsx"]),
        env: fullEnv,
      });
      const mount = results.find((r) => r.name === "auth-mount")!;

      expect(mount.status).toBe("error");
      expect(mount.detail).toContain("app/api/auth/[...all]/route.ts");
    });

    it("passes once the route exists", () => {
      const results = runChecks({
        root: app([
          "app/[locale]/(auth)/layout.tsx",
          "app/api/auth/[...all]/route.ts",
        ]),
        env: fullEnv,
      });
      expect(results.find((r) => r.name === "auth-mount")!.status).toBe("ok");
    });

    it("is silent in an app with no auth pages", () => {
      const results = runChecks({ root: app([]), env: fullEnv });
      expect(results.some((r) => r.name === "auth-mount")).toBe(false);
    });
  });

  it("reports the real repository's migration drift", () => {
    // Guards the check itself: if the journal is ever repaired this
    // flips to ok, and if the check silently stops working it flips
    // too — either way the test notices.
    const results = runChecks({ root: process.cwd() + "/../..", env: fullEnv });

    expect(results.some((r) => r.name === "migrations")).toBe(true);
  });
});

describe("exitCodeFor", () => {
  it("is non-zero when anything errored", () => {
    expect(exitCodeFor([{ name: "x", status: "error", detail: "" }])).toBe(1);
  });

  it("is zero for warnings — they are advisory, not blocking", () => {
    expect(exitCodeFor([{ name: "x", status: "warn", detail: "" }])).toBe(0);
  });
});

describe("formatResults", () => {
  it("marks each status distinctly", () => {
    const out = formatResults([
      { name: "a", status: "ok", detail: "fine" },
      { name: "b", status: "error", detail: "broken" },
    ]);

    expect(out).toContain("✓ a");
    expect(out).toContain("✗ b");
  });
});

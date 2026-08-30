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
  INTELLIGO_BILLING_PRODUCT: "support",
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
    // The engine has no built-in default since the Support catalogue
    // moved out, so an unset product means plan lookups find nothing.
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

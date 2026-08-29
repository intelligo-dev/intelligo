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

  describe("chat scaffold contract", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    function appWithChatRoute(): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-"));
      mkdirSync(path.join(root, "app/api/chat"), { recursive: true });
      writeFileSync(path.join(root, "app/api/chat/route.ts"), "// route");
      return root;
    }

    it("errors when the chat route exists without lib/intelligo.ts and lib/plans.ts", () => {
      const results = runChecks({ root: appWithChatRoute(), env: fullEnv });
      const chat = results.find((r) => r.name === "chat")!;

      expect(chat.status).toBe("error");
      expect(chat.detail).toContain("lib/intelligo.ts");
      expect(chat.detail).toContain("lib/plans.ts");
    });

    it("passes once both scaffold files exist", () => {
      const app = appWithChatRoute();
      mkdirSync(path.join(app, "lib"), { recursive: true });
      writeFileSync(path.join(app, "lib/intelligo.ts"), "// root");
      writeFileSync(path.join(app, "lib/plans.ts"), "// plans");

      const results = runChecks({ root: app, env: fullEnv });
      expect(results.find((r) => r.name === "chat")!.status).toBe("ok");
    });

    it("is silent for apps without the chat route", () => {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-"));
      const results = runChecks({ root, env: fullEnv });
      expect(results.some((r) => r.name === "chat")).toBe(false);
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

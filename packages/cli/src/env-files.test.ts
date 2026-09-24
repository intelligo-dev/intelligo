import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadAppEnv } from "./env-files.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "intelligo-env-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("loadAppEnv", () => {
  it("reads .env.local before .env, the way Next.js does", () => {
    writeFileSync(path.join(dir, ".env.local"), "DATABASE_URL=local\n");
    writeFileSync(path.join(dir, ".env"), "DATABASE_URL=shared\nOTHER=x\n");
    const env: NodeJS.ProcessEnv = {};
    expect(loadAppEnv(dir, env)).toEqual([".env.local", ".env"]);
    expect(env).toEqual({ DATABASE_URL: "local", OTHER: "x" });
  });

  it("never overrides a variable the shell set", () => {
    writeFileSync(path.join(dir, ".env.local"), "DATABASE_URL=file\n");
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "shell" };
    loadAppEnv(dir, env);
    expect(env.DATABASE_URL).toBe("shell");
  });

  it("is a no-op without env files", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadAppEnv(dir, env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("is unchanged outside a workspace: only the app's own files", () => {
    writeFileSync(path.join(dir, ".env"), "DATABASE_URL=app\n");
    const env: NodeJS.ProcessEnv = {};
    expect(loadAppEnv(dir, env)).toEqual([".env"]);
    expect(env).toEqual({ DATABASE_URL: "app" });
  });
});

describe("loadAppEnv inside a pnpm workspace", () => {
  let app: string;
  beforeEach(() => {
    writeFileSync(
      path.join(dir, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*\n"
    );
    app = path.join(dir, "apps", "web");
    mkdirSync(app, { recursive: true });
  });

  it("falls back to the workspace root's .env.local, then .env", () => {
    writeFileSync(path.join(dir, ".env.local"), "DATABASE_URL=root-local\n");
    writeFileSync(
      path.join(dir, ".env"),
      "DATABASE_URL=root\nBETTER_AUTH_SECRET=s\n"
    );
    const env: NodeJS.ProcessEnv = {};
    expect(loadAppEnv(app, env)).toEqual([
      path.join("..", "..", ".env.local"),
      path.join("..", "..", ".env"),
    ]);
    expect(env).toEqual({
      DATABASE_URL: "root-local",
      BETTER_AUTH_SECRET: "s",
    });
  });

  it("lets the app's files win over the root's", () => {
    writeFileSync(path.join(app, ".env"), "DATABASE_URL=app\n");
    writeFileSync(path.join(dir, ".env.local"), "DATABASE_URL=root-local\n");
    writeFileSync(path.join(dir, ".env"), "DATABASE_URL=root\nOTHER=x\n");
    const env: NodeJS.ProcessEnv = {};
    loadAppEnv(app, env);
    expect(env).toEqual({ DATABASE_URL: "app", OTHER: "x" });
  });

  it("lets the shell win over the app and the root", () => {
    writeFileSync(path.join(app, ".env.local"), "DATABASE_URL=app\n");
    writeFileSync(path.join(dir, ".env"), "DATABASE_URL=root\n");
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "shell" };
    loadAppEnv(app, env);
    expect(env.DATABASE_URL).toBe("shell");
  });

  it("ignores the root when the workspace does not include the app", () => {
    const outside = path.join(dir, "tools", "x");
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(dir, ".env"), "DATABASE_URL=root\n");
    const env: NodeJS.ProcessEnv = {};
    expect(loadAppEnv(outside, env)).toEqual([]);
    expect(env).toEqual({});
  });
});

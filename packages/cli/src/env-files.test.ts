import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});

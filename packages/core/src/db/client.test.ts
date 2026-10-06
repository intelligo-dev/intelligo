/**
 * Neon's HTTP driver cannot run a transaction, and admission and settlement
 * are transactions: a Neon URL must never get it, an explicit override wins,
 * and an unknown override is refused rather than silently defaulted.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { pgTable, text } from "drizzle-orm/pg-core";
import { poolOptions, selectDriver } from "./client";

describe("selectDriver", () => {
  it("gives Neon hosts the WebSocket driver", () => {
    expect(
      selectDriver(
        "postgres://ep-example-123456.ap-southeast-1.aws.neon.tech/neondb"
      )
    ).toBe("neon-serverless");
  });

  it("recognises a Neon endpoint id without the neon.tech host", () => {
    expect(selectDriver("postgres://host@ep-abc-123.example.internal/db")).toBe(
      "neon-serverless"
    );
  });

  it("gives ordinary Postgres node-postgres", () => {
    expect(selectDriver("postgresql://localhost:5432/ci_build")).toBe("pg");
  });

  it("lets INTELLIGO_DB_DRIVER override the URL rule", () => {
    expect(selectDriver("postgres://ep-abc.neon.tech/db", "pg")).toBe("pg");
    expect(selectDriver("postgresql://localhost/db", "neon-serverless")).toBe(
      "neon-serverless"
    );
  });

  it("refuses an unknown driver, naming neon-http as unsupported", () => {
    expect(() =>
      selectDriver("postgresql://localhost/db", "neon-http")
    ).toThrow(/neon-http is not supported/);
  });
});

describe("db", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("maps a column declared without a name to snake_case, as drizzle-kit generates it", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/casing_check");
    vi.stubEnv("INTELLIGO_DB_DRIVER", "pg");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { db } = await import("./client");
    const notes = pgTable("notes", { workspaceId: text().notNull() });

    const { sql } = db
      .select({ workspaceId: notes.workspaceId })
      .from(notes)
      .toSQL();

    expect(sql).toBe('select "workspace_id" from "notes"');
  });
});

describe("poolOptions", () => {
  it("bounds the wait for a connection and sizes the pool from the env", () => {
    expect(poolOptions({})).toEqual({
      max: 10,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 10_000,
    });
    expect(poolOptions({ DATABASE_POOL_MAX: "25" }).max).toBe(25);
  });

  it("keeps the default for a size that is not a positive integer", () => {
    for (const value of ["0", "-3", "2.5", "many", ""]) {
      expect(poolOptions({ DATABASE_POOL_MAX: value }).max, value).toBe(10);
    }
  });
});

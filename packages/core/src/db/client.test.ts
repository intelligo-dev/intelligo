/**
 * Driver selection.
 *
 * The rule is small but the wrong answer is total: Neon's HTTP driver
 * cannot run a transaction, and admission and settlement are
 * transactions. These pin that a Neon URL never gets it, that an
 * explicit override wins, and that an unknown override is refused
 * rather than silently defaulted.
 */

import { describe, it, expect } from "vitest";
import { selectDriver } from "./client";

describe("selectDriver", () => {
  it("gives Neon hosts the WebSocket driver", () => {
    expect(
      selectDriver(
        "postgres://ep-example-123456-pooler.ap-southeast-1.aws.neon.tech/neondb"
      )
    ).toBe("neon-serverless");
  });

  it("recognises a Neon endpoint id without the neon.tech host", () => {
    expect(selectDriver("postgres://host@ep-abc-123.example.internal/db")).toBe(
      "neon-serverless"
    );
  });

  it("gives ordinary Postgres node-postgres", () => {
    expect(selectDriver("postgresql://localhost:5432/ci_build")).toBe(
      "pg"
    );
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
